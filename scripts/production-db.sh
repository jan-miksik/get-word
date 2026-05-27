#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  pnpm run db:prod:migrate
  pnpm run db:prod -- migrate
  pnpm run db:prod -- sql <path-to-file.sql>
  pnpm run db:prod -- shell
  pnpm run db:prod -- compact [--apply]

Actions:
  migrate          Apply canonical Drizzle migrations from drizzle/migrations/.
  sql <file>       Run a reviewed SQL file with psql.
  shell            Open an emergency interactive psql session without history.
  compact          Preview old sync/review rows eligible for deletion.
  compact --apply  Delete eligible old sync/review rows.

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
compact_apply=false

case "$action" in
  migrate)
    [[ "$#" -eq 1 ]] || die "migrate does not accept arguments."
    description="apply canonical Drizzle migrations from drizzle/migrations/"
    confirmation_phrase="MIGRATE_PRODUCTION"
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
    printf '%s\n' "For migrations and psql operations, prefer Session Pooler on port 5432."
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
  migrate)
    pnpm run db:migrate
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
esac

printf '\nDone. DATABASE_URL will now be removed from this script environment.\n'
