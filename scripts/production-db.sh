#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  pnpm run db:prod:backup
  pnpm run db:prod -- backup [output-file]
  pnpm run db:prod:migrate
  pnpm run db:prod -- migrate
  pnpm run db:prod -- restore <path-to-dev-public-data-backup.sql>
  pnpm run db:prod -- sql <path-to-file.sql>
  pnpm run db:prod -- shell
  pnpm run db:prod -- compact [--apply]
  pnpm run db:prod -- backfill-content-keys [--apply]
  pnpm run db:prod -- backfill-object [--apply] [--probe-head] [--provider b2] [--limit N] [--batch-size N] [--concurrency N] [--checkpoint path]
  pnpm run db:prod -- repair-object-to-arweave [--apply] [--limit N] [--batch-size N]
  pnpm run db:prod -- demo-generate-audio [--apply] [--repair-quiet] [--force] [--langs=cs,vi]
  pnpm run db:prod -- demo-bundle-audio [--apply] [--force] [--langs=cs,vi]
  pnpm run db:prod -- school-access <school-access-command> [args...]

Actions:
  backup [file]    Dump the database with pg_dump to a local file (defaults to
                   backups/prod_<timestamp>.dump). Run this before migrate.
  migrate          Apply canonical Drizzle migrations from drizzle/migrations/.
  restore <file>   Restore public application data into a new, migrated database.
  sql <file>       Run a reviewed SQL file with psql.
  shell            Open an emergency interactive psql session without history.
  compact          Preview old sync/review rows eligible for deletion.
  compact --apply  Delete eligible old sync/review rows.
  backfill-content-keys           Preview user_progress.content_key backfill.
  backfill-content-keys --apply   Write content keys + archive duplicate losers.
  backfill-object                 Preview mirroring production Arweave audio to the object store.
  backfill-object --apply         Mirror production Arweave audio to the object store.
  repair-object-to-arweave        Preview promoting temporary object-store audio rows to Arweave.
  repair-object-to-arweave --apply Promote temporary object-store audio rows back to Arweave.
  demo-generate-audio             Preview generating missing landing-demo audio in production.
  demo-generate-audio --apply      Generate missing/forced landing-demo audio in production.
  demo-bundle-audio               Preview production-backed public/audio/demo bundle changes.
  demo-bundle-audio --apply        Download production-backed audio into public/audio/demo.
  school-access                    Run scripts/school-access.ts against production with hidden DATABASE_URL.

The production DATABASE_URL is read with hidden input, exported only for the
selected action, and unset when the action exits. Do not put the URL in action
arguments or in the SQL file.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  unset DATABASE_URL || true
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "${1:-}" == "--" ]]; then
  shift
fi

action="${1:-}"
description=""
confirmation_phrase=""
sql_file=""
restore_file=""
backup_file=""
compact_apply=false
backfill_apply=false
audio_apply=false
audio_args=()
demo_apply=false
demo_args=()
school_access_args=()

parse_audio_flags() {
  local command_name="$1"
  local value
  shift

  audio_apply=false
  audio_args=()

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --apply)
        audio_apply=true
        shift
        ;;
      --probe-head)
        audio_args+=("$1")
        shift
        ;;
      --provider)
        [[ "$#" -ge 2 ]] || die "$command_name --provider requires a value."
        [[ -n "$2" ]] || die "$command_name --provider value must not be empty."
        audio_args+=("$1" "$2")
        shift 2
        ;;
      --provider=*)
        value="${1#*=}"
        [[ -n "$value" ]] || die "$command_name --provider value must not be empty."
        audio_args+=("$1")
        shift
        ;;
      --limit|--batch-size|--concurrency)
        [[ "$#" -ge 2 ]] || die "$command_name $1 requires a value."
        [[ "$2" =~ ^[0-9]+$ ]] || die "$command_name $1 value must be a positive integer."
        audio_args+=("$1" "$2")
        shift 2
        ;;
      --limit=*|--batch-size=*|--concurrency=*)
        value="${1#*=}"
        [[ "$value" =~ ^[0-9]+$ ]] || die "$command_name ${1%%=*} value must be a positive integer."
        audio_args+=("$1")
        shift
        ;;
      --checkpoint)
        [[ "$#" -ge 2 ]] || die "$command_name --checkpoint requires a path."
        [[ -n "$2" ]] || die "$command_name --checkpoint path must not be empty."
        audio_args+=("$1" "$2")
        shift 2
        ;;
      --checkpoint=*)
        value="${1#*=}"
        [[ -n "$value" ]] || die "$command_name --checkpoint path must not be empty."
        audio_args+=("$1")
        shift
        ;;
      *)
        die "$command_name accepts only --apply, --probe-head, --provider, --limit, --batch-size, --concurrency, and --checkpoint."
        ;;
    esac
  done
}

parse_demo_flags() {
  local command_name="$1"
  local value
  shift

  demo_apply=false
  demo_args=()

  while [[ "$#" -gt 0 ]]; do
    case "$1" in
      --apply)
        demo_apply=true
        shift
        ;;
      --repair-quiet|--force)
        demo_args+=("$1")
        shift
        ;;
      --langs)
        [[ "$#" -ge 2 ]] || die "$command_name --langs requires a value."
        [[ -n "$2" ]] || die "$command_name --langs value must not be empty."
        demo_args+=("$1" "$2")
        shift 2
        ;;
      --langs=*)
        value="${1#*=}"
        [[ -n "$value" ]] || die "$command_name --langs value must not be empty."
        demo_args+=("$1")
        shift
        ;;
      *)
        die "$command_name accepts only --apply, --repair-quiet, --force, and --langs."
        ;;
    esac
  done
}

case "$action" in
  backup)
    if [[ "$#" -eq 2 ]]; then
      backup_file="$2"
    elif [[ "$#" -ne 1 ]]; then
      die "backup accepts only an optional output file path."
    fi
    description="dump the production database with pg_dump to a local backup file"
    confirmation_phrase="BACKUP_PRODUCTION"
    ;;
  migrate)
    [[ "$#" -eq 1 ]] || die "migrate does not accept arguments."
    description="apply canonical Drizzle migrations from drizzle/migrations/"
    confirmation_phrase="MIGRATE_PRODUCTION"
    ;;
  restore)
    [[ "$#" -eq 2 ]] || die "restore requires exactly one SQL backup file path."
    restore_file="$2"
    [[ -f "$restore_file" ]] || die "Backup file not found: $restore_file"
    description="restore public application data from $restore_file into a new, migrated production database"
    confirmation_phrase="RESTORE_PRODUCTION_DATA"
    ;;
  sql)
    [[ "$#" -eq 2 ]] || die "sql requires exactly one SQL file path."
    sql_file="$2"
    [[ -f "$sql_file" ]] || die "SQL file not found: $sql_file"
    description="execute reviewed SQL file: $sql_file"
    confirmation_phrase="RUN_PRODUCTION_SQL"
    ;;
  shell)
    [[ "$#" -eq 1 ]] || die "shell does not accept arguments."
    description="open an emergency interactive production psql session"
    confirmation_phrase="OPEN_PRODUCTION_SHELL"
    ;;
  compact)
    if [[ "$#" -eq 2 && "$2" == "--apply" ]]; then
      compact_apply=true
      description="delete old production sync/review operation rows"
      confirmation_phrase="DELETE_PRODUCTION_ROWS"
    elif [[ "$#" -eq 1 ]]; then
      description="preview old production sync/review operation rows"
      confirmation_phrase="PREVIEW_PRODUCTION_ROWS"
    else
      die "compact accepts only the optional --apply flag."
    fi
    ;;
  backfill-content-keys)
    if [[ "$#" -eq 2 && "$2" == "--apply" ]]; then
      backfill_apply=true
      description="backfill user_progress.content_key and archive duplicate losers in production"
      confirmation_phrase="BACKFILL_PRODUCTION_CONTENT_KEYS"
    elif [[ "$#" -eq 1 ]]; then
      description="preview the production user_progress.content_key backfill"
      confirmation_phrase="PREVIEW_PRODUCTION_CONTENT_KEYS"
    else
      die "backfill-content-keys accepts only the optional --apply flag."
    fi
    ;;
  backfill-object)
    parse_audio_flags "$action" "${@:2}"
    if [[ "$audio_apply" == true ]]; then
      description="mirror production Arweave audio into the object store"
      confirmation_phrase="BACKFILL_PRODUCTION_OBJECT_AUDIO"
    else
      description="preview mirroring production Arweave audio into the object store"
      confirmation_phrase="PREVIEW_PRODUCTION_OBJECT_AUDIO"
    fi
    ;;
  repair-object-to-arweave)
    parse_audio_flags "$action" "${@:2}"
    if [[ "$audio_apply" == true ]]; then
      description="promote temporary production object-store audio rows back to Arweave"
      confirmation_phrase="REPAIR_PRODUCTION_OBJECT_AUDIO"
    else
      description="preview promoting temporary production object-store audio rows back to Arweave"
      confirmation_phrase="PREVIEW_PRODUCTION_OBJECT_AUDIO_REPAIR"
    fi
    ;;
  demo-generate-audio)
    parse_demo_flags "$action" "${@:2}"
    if [[ "$demo_apply" == true ]]; then
      description="generate or repair production landing-demo audio"
      confirmation_phrase="GENERATE_PRODUCTION_DEMO_AUDIO"
    else
      description="preview production landing-demo audio generation"
      confirmation_phrase="PREVIEW_PRODUCTION_DEMO_AUDIO"
    fi
    ;;
  demo-bundle-audio)
    parse_demo_flags "$action" "${@:2}"
    if [[ "$demo_apply" == true ]]; then
      description="download production landing-demo audio into public/audio/demo"
      confirmation_phrase="BUNDLE_PRODUCTION_DEMO_AUDIO"
    else
      description="preview production-backed landing-demo audio bundle changes"
      confirmation_phrase="PREVIEW_PRODUCTION_DEMO_BUNDLE"
    fi
    ;;
  school-access)
    [[ "$#" -ge 2 ]] || die "school-access requires a subcommand, e.g. create-school."
    school_access_args=("${@:2}")
    description="run school access operator command in production: ${school_access_args[*]}"
    confirmation_phrase="RUN_PRODUCTION_SCHOOL_ACCESS"
    ;;
  -h|--help|help|"")
    usage
    exit 0
    ;;
  *)
    usage >&2
    die "unknown action: $action"
    ;;
esac

printf '%s\n' "PRODUCTION DATABASE ACTION"
printf 'About to %s.\n' "$description"
printf '%s\n' "Paste a Supabase Direct URL only if this computer has IPv6 connectivity."
printf '%s\n' "Otherwise use the Session Pooler URL (pooler host, port 5432) from Connect."

printf '\n%s' "Paste production DATABASE_URL (input hidden): "
IFS= read -r -s DATABASE_URL
printf '\n'

[[ -n "$DATABASE_URL" ]] || die "DATABASE_URL is empty. Cancelled."

case "$DATABASE_URL" in
  postgresql://*|postgres://*)
    ;;
  *)
    die "DATABASE_URL does not look like a PostgreSQL connection string."
    ;;
esac

database_host="${DATABASE_URL#*://}"
database_host="${database_host##*@}"
database_host="${database_host%%/*}"
database_host="${database_host%%\?*}"

[[ -n "$database_host" ]] || die "Could not determine the database host from DATABASE_URL."

case "$database_host" in
  localhost|localhost:*|127.0.0.1|127.0.0.1:*|\[::1\]|\[::1\]:*)
    die "DATABASE_URL points to a local database, not production: $database_host"
    ;;
esac

printf 'Target database host: %s\n' "$database_host"

case "$database_host" in
  db.*.supabase.co|db.*.supabase.co:*)
    printf '%s\n' "Note: Supabase Direct database hosts use IPv6 by default."
    printf '%s\n' "If this fails with ENOTFOUND or no route to host, rerun with the Session Pooler URL."
    ;;
  *.pooler.supabase.com:6543)
    printf '%s\n' "Warning: this looks like a Transaction Pooler URL (port 6543)."
    printf '%s\n' "For migrations, backups (pg_dump), and psql operations, prefer Session Pooler on port 5432."
    ;;
esac

read -r -p "Type ${confirmation_phrase} to continue: " confirmation

if [[ "$confirmation" != "$confirmation_phrase" ]]; then
  printf '%s\n' "Cancelled."
  exit 1
fi

export DATABASE_URL

printf '\nRunning action...\n'

case "$action" in
  backup)
    command -v pg_dump >/dev/null 2>&1 || die "pg_dump is required for the backup action."
    if [[ -z "$backup_file" ]]; then
      script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      backup_dir="$script_dir/../backups"
      mkdir -p "$backup_dir"
      backup_file="$backup_dir/prod_$(date +%Y%m%d_%H%M%S).dump"
    else
      mkdir -p "$(dirname "$backup_file")"
    fi
    printf 'Writing compressed pg_dump to: %s\n' "$backup_file"
    pg_dump "$DATABASE_URL" --no-owner --no-acl -Fc -f "$backup_file"
    backup_size=$(wc -c < "$backup_file" | tr -d ' ')
    printf 'Backup complete: %s (%s bytes)\n' "$backup_file" "$backup_size"
    printf '%s\n' "Restore later with: pg_restore --no-owner --no-acl -d <target-url> '$backup_file'"
    ;;
  migrate)
    pnpm run db:migrate
    ;;
  restore)
    command -v psql >/dev/null 2>&1 || die "psql is required for the restore action."
    printf '%s\n' "This restore assumes the target is new, has migrations applied, and has no application data."
    psql "$DATABASE_URL" --set ON_ERROR_STOP=on --single-transaction --file "$restore_file"
    ;;
  sql)
    command -v psql >/dev/null 2>&1 || die "psql is required for the sql action."
    psql "$DATABASE_URL" --set ON_ERROR_STOP=on --file "$sql_file"
    ;;
  shell)
    command -v psql >/dev/null 2>&1 || die "psql is required for the shell action."
    PSQL_HISTORY=/dev/null psql "$DATABASE_URL"
    ;;
  compact)
    if [[ "$compact_apply" == true ]]; then
      pnpm exec tsx scripts/compact-review-events.ts --apply
    else
      pnpm exec tsx scripts/compact-review-events.ts
    fi
    ;;
  backfill-content-keys)
    if [[ "$backfill_apply" == true ]]; then
      pnpm exec tsx scripts/backfill-content-keys.ts --apply
    else
      pnpm exec tsx scripts/backfill-content-keys.ts
    fi
    ;;
  backfill-object)
    if [[ "$audio_apply" == true ]]; then
      pnpm exec tsx scripts/backfill-object-audio.ts ${audio_args[@]+"${audio_args[@]}"}
    else
      pnpm exec tsx scripts/backfill-object-audio.ts --dry-run ${audio_args[@]+"${audio_args[@]}"}
    fi
    ;;
  repair-object-to-arweave)
    if [[ "$audio_apply" == true ]]; then
      pnpm exec tsx scripts/repair-object-to-arweave.ts ${audio_args[@]+"${audio_args[@]}"}
    else
      pnpm exec tsx scripts/repair-object-to-arweave.ts --dry-run ${audio_args[@]+"${audio_args[@]}"}
    fi
    ;;
  demo-generate-audio)
    if [[ "$demo_apply" == true ]]; then
      pnpm exec tsx scripts/generate-demo-audio.ts ${demo_args[@]+"${demo_args[@]}"}
    else
      pnpm exec tsx scripts/generate-demo-audio.ts --dry-run ${demo_args[@]+"${demo_args[@]}"}
    fi
    ;;
  demo-bundle-audio)
    if [[ "$demo_apply" == true ]]; then
      pnpm exec tsx scripts/generate-bundled-demo-audio.ts ${demo_args[@]+"${demo_args[@]}"}
    else
      pnpm exec tsx scripts/generate-bundled-demo-audio.ts --dry-run ${demo_args[@]+"${demo_args[@]}"}
    fi
    ;;
  school-access)
    pnpm exec tsx scripts/school-access.ts "${school_access_args[@]}"
    ;;
esac

printf '\nDone. DATABASE_URL will now be removed from this script environment.\n'
