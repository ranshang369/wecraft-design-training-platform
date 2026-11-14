#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ENV_FILE="${WECRAFT_TRAINING_BACKUP_ENV:-/etc/wecraft-training/backup.env}"
if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

DB_CONTAINER="${DB_CONTAINER:-wecraft-design-training-db-1}"
POSTGRES_USER="${POSTGRES_USER:-wecraft_training}"
POSTGRES_DB="${POSTGRES_DB:-wecraft_dt}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wecraft-training}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

umask 077
install -d -m 700 "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || { echo "backup already running"; exit 75; }

timestamp="$(date +%Y%m%dT%H%M%S%z)"
base="$BACKUP_DIR/wecraft-training-$timestamp.dump"
tmp="$base.tmp"
cleanup() { rm -f "$tmp" "$base.sha256.tmp"; }
trap cleanup EXIT

echo "backup_start=$timestamp database=$POSTGRES_DB"
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 9 --no-owner --no-acl > "$tmp"
[[ -s "$tmp" ]] || { echo "pg_dump produced an empty archive"; exit 1; }
docker exec -i "$DB_CONTAINER" pg_restore -l < "$tmp" >/dev/null

hash="$(sha256sum "$tmp" | awk '{print $1}')"
printf '%s  %s\n' "$hash" "$base" > "$base.sha256.tmp"
mv "$tmp" "$base"
mv "$base.sha256.tmp" "$base.sha256"
chmod 600 "$base" "$base.sha256"
ln -sfn "$base" "$BACKUP_DIR/latest.dump"
ln -sfn "$base.sha256" "$BACKUP_DIR/latest.dump.sha256"
sha256sum -c "$base.sha256"

if [[ -n "${RCLONE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null 2>&1 || { echo "RCLONE_REMOTE is set but rclone is not installed"; exit 1; }
  rclone copyto --immutable "$base" "${RCLONE_REMOTE%/}/$(basename "$base")"
  rclone copyto --immutable "$base.sha256" "${RCLONE_REMOTE%/}/$(basename "$base.sha256")"
  echo "offsite_copy=ok remote=$RCLONE_REMOTE"
else
  echo "offsite_copy=skipped reason=RCLONE_REMOTE_not_configured"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wecraft-training-*.dump' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wecraft-training-*.dump.sha256' -mtime +"$RETENTION_DAYS" -delete

echo "backup_ok file=$base bytes=$(stat -c '%s' "$base") sha256=$hash"
