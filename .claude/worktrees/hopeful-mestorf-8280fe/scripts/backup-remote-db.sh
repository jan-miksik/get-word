#!/usr/bin/env bash
set -euo pipefail

# Load DATABASE_URL from .env.local
ENV_FILE="$(dirname "$0")/../.env.local"
if [ -f "$ENV_FILE" ]; then
  export $(grep -v '^#' "$ENV_FILE" | grep 'DATABASE_URL' | xargs)
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set. Check .env.local" >&2
  exit 1
fi

BACKUP_DIR="$(dirname "$0")/../backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql"

echo "Backing up remote DB to $BACKUP_FILE ..."
pg_dump "$DATABASE_URL" --no-owner --no-acl > "$BACKUP_FILE"

SIZE=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
echo "Backup complete: $BACKUP_FILE ($SIZE bytes)"
