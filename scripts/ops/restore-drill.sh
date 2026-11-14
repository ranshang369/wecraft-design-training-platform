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
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wecraft-training}"
backup_file="${1:-$BACKUP_DIR/latest.dump}"
[[ -r "$backup_file" ]] || { echo "backup not readable: $backup_file"; exit 2; }

if [[ -r "$backup_file.sha256" ]]; then
  sha256sum -c "$backup_file.sha256"
fi
docker exec -i "$DB_CONTAINER" pg_restore -l < "$backup_file" >/dev/null

restore_db="wecraft_restore_$(date +%Y%m%d_%H%M%S)"
STATE_DIR="${WECRAFT_TRAINING_STATE_DIR:-/var/lib/wecraft-training}"
case "$restore_db" in
  wecraft_restore_[0-9]*) ;;
  *) echo "refusing unsafe restore database name"; exit 2 ;;
esac

cleanup() {
  docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$restore_db\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker exec "$DB_CONTAINER" createdb -U "$POSTGRES_USER" --template=template0 "$restore_db"
docker exec -i "$DB_CONTAINER" pg_restore -U "$POSTGRES_USER" -d "$restore_db" --no-owner --no-acl < "$backup_file"
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$restore_db" -v ON_ERROR_STOP=1 -c 'DO $check$ BEGIN IF (SELECT count(*) FROM "Workspace") = 0 THEN RAISE EXCEPTION $message$restored database has no workspace$message$; END IF; END $check$;'
docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$restore_db" -v ON_ERROR_STOP=1 -Atc 'select $label$workspaces=$label$||count(*) from "Workspace" union all select $label$cases=$label$||count(*) from "Case" union all select $label$candidates=$label$||count(*) from "Candidate" union all select $label$audit_logs=$label$||count(*) from "AuditLog";'

trap - EXIT
cleanup
install -d -m 700 "$STATE_DIR"
printf 'timestamp=%s\nsource=%s\nresult=ok\n' "$(date -Iseconds)" "$backup_file" > "$STATE_DIR/last-restore-drill"
chmod 600 "$STATE_DIR/last-restore-drill"
echo "RESTORE_DRILL_OK source=$backup_file"
