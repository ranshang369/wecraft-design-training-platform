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

RCLONE_REMOTE="${RCLONE_REMOTE:-}"
STATE_DIR="${WECRAFT_TRAINING_STATE_DIR:-/var/lib/wecraft-training}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

[[ -n "$RCLONE_REMOTE" ]] || { echo "RCLONE_REMOTE is not configured"; exit 2; }
command -v rclone >/dev/null 2>&1 || { echo "rclone is not installed"; exit 2; }

umask 077
tmp_dir="$(mktemp -d /var/tmp/wecraft-offsite-restore.XXXXXX)"
cleanup() { rm -rf -- "$tmp_dir"; }
trap cleanup EXIT

echo "offsite_restore_start=$(date -Iseconds)"
listing="$(rclone lsf "$RCLONE_REMOTE" --files-only)"
remote_dump=""
while IFS= read -r candidate; do
  [[ "$candidate" =~ ^wecraft-training-[0-9]{8}T[0-9]{6}\+[0-9]{4}\.dump$ ]] || continue
  if grep -Fxq "${candidate}.sha256" <<<"$listing"; then
    remote_dump="$candidate"
    break
  fi
done < <(printf '%s\n' "$listing" | sort -r || true)

[[ -n "$remote_dump" ]] || { echo "no complete dump and sha256 pair found at $RCLONE_REMOTE"; exit 1; }

local_dump="$tmp_dir/$remote_dump"
local_manifest="$local_dump.sha256"
remote_base="${RCLONE_REMOTE%/}/$remote_dump"
rclone copyto "$remote_base" "$local_dump"
rclone copyto "$remote_base.sha256" "$local_manifest"

[[ -s "$local_dump" ]] || { echo "downloaded dump is empty"; exit 1; }
expected_hash="$(awk 'NR == 1 { print $1 }' "$local_manifest")"
actual_hash="$(sha256sum "$local_dump" | awk '{ print $1 }')"
[[ "$expected_hash" =~ ^[0-9a-f]{64}$ && "$actual_hash" == "$expected_hash" ]] || {
  echo "offsite checksum mismatch: remote=$remote_base"
  exit 1
}
echo "offsite_download=ok file=$remote_dump sha256=$actual_hash"

mkdir -p "$tmp_dir/state"
chmod 700 "$tmp_dir/state"
WECRAFT_TRAINING_STATE_DIR="$tmp_dir/state" bash "$SCRIPT_DIR/restore-drill.sh" "$local_dump"

install -d -m 700 "$STATE_DIR"
printf 'timestamp=%s\nsource=offsite:%s\nsha256=%s\nresult=ok\n' \
  "$(date -Iseconds)" "$remote_base" "$actual_hash" > "$STATE_DIR/last-restore-drill"
chmod 600 "$STATE_DIR/last-restore-drill"
echo "OFFSITE_RESTORE_DRILL_OK source=offsite:$remote_base"
