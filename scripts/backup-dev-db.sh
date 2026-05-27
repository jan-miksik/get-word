#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${ENV_FILE:-$project_root/.env.local}"
backup_dir="$project_root/backups"
timestamp="$(date +"%Y%m%d_%H%M%S")"
backup_file="$backup_dir/dev_public_data_${timestamp}.sql"
temporary_file="${backup_file}.partial"

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

read_database_url_from_env_file() {
  local line
  local value

  [[ -f "$env_file" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      DATABASE_URL=*)
        value="${line#DATABASE_URL=}"
        value="${value%$'\r'}"
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi
        printf '%s' "$value"
        return 0
        ;;
    esac
  done < "$env_file"

  return 1
}

cleanup() {
  rm -f "$temporary_file"
  unset source_database_url
}

trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

command -v pg_dump >/dev/null 2>&1 || die "pg_dump is required."

source_database_url="${DEV_DATABASE_URL:-${DATABASE_URL:-}}"
if [[ -z "$source_database_url" ]]; then
  source_database_url="$(read_database_url_from_env_file)" ||
    die "Set DEV_DATABASE_URL or DATABASE_URL, or add DATABASE_URL to $env_file."
fi

case "$source_database_url" in
  postgresql://*|postgres://*)
    ;;
  *)
    die "The development database URL does not look like a PostgreSQL connection string."
    ;;
esac

database_host="${source_database_url#*://}"
database_host="${database_host##*@}"
database_host="${database_host%%/*}"
database_host="${database_host%%\?*}"

[[ -n "$database_host" ]] || die "Could not determine the development database host."

umask 077
mkdir -p "$backup_dir"

printf '%s\n' "DEVELOPMENT DATABASE BACKUP"
printf 'Source database host: %s\n' "$database_host"
printf 'Backing up application data from the public schema to: %s\n' "$backup_file"

case "$database_host" in
  *.pooler.supabase.com:6543)
    printf '%s\n' "Warning: this is a Transaction Pooler URL (port 6543)."
    printf '%s\n' "If pg_dump fails, rerun with DEV_DATABASE_URL set to a Session Pooler URL on port 5432."
    ;;
esac

pg_dump "$source_database_url" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-acl \
  --file="$temporary_file"

[[ -s "$temporary_file" ]] || die "pg_dump created an empty backup file."
mv "$temporary_file" "$backup_file"

backup_size="$(wc -c < "$backup_file" | tr -d ' ')"
backup_sha="$(shasum -a 256 "$backup_file" | awk '{print $1}')"

printf 'Backup complete: %s bytes\n' "$backup_size"
printf 'SHA-256: %s\n' "$backup_sha"
printf '%s\n' "The backup contains public application data only; restore it after running production migrations."
