#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ENV_FILE="${WECRAFT_TRAINING_MONITOR_ENV:-/etc/wecraft-training/monitor.env}"
if [[ -r "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HEALTH_URL="${HEALTH_URL:-https://wecraft-training.zer-go.cn/api/v1/health}"
DB_CONTAINER="${DB_CONTAINER:-wecraft-design-training-db-1}"
APP_CONTAINER="${APP_CONTAINER:-wecraft-design-training-app-1}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wecraft-training}"
MAX_DISK_PERCENT="${MAX_DISK_PERCENT:-85}"
MAX_BACKUP_AGE_MINUTES="${MAX_BACKUP_AGE_MINUTES:-1560}"
STATE_FILE="${STATE_FILE:-/run/wecraft-training-monitor.state}"
CADDYFILE="${CADDYFILE:-/opt/wecraft/deploy/Caddyfile}"

failures=()
health="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$health" || ! grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' <<<"$health"; then
  failures+=("healthcheck_failed")
fi

disk_used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ -z "$disk_used" || "$disk_used" -ge "$MAX_DISK_PERCENT" ]]; then
  failures+=("disk_${disk_used:-unknown}_percent")
fi

latest_backup="$(readlink -f "$BACKUP_DIR/latest.dump" 2>/dev/null || true)"
if [[ -z "$latest_backup" || ! -s "$latest_backup" ]] || ! find "$latest_backup" -mmin -"$MAX_BACKUP_AGE_MINUTES" -print -quit | grep -q .; then
  failures+=("backup_stale")
fi

app_health="$(docker inspect "$APP_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
db_health="$(docker inspect "$DB_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
[[ "$app_health" == "healthy" ]] || failures+=("app_${app_health}")
[[ "$db_health" == "healthy" ]] || failures+=("db_${db_health}")
if [[ -r "$CADDYFILE" ]] && ! grep -q 'wecraft-training.zer-go.cn' "$CADDYFILE"; then
  failures+=("caddy_route_missing")
fi

previous="$(cat "$STATE_FILE" 2>/dev/null || true)"
if ((${#failures[@]})); then
  message="[WeCraft Training] ALERT $(date -Iseconds): ${failures[*]} health=${health:-unreachable} disk=${disk_used}% app=${app_health} db=${db_health}"
  echo "$message"
  if [[ "${previous:-}" != alert ]]; then
    if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
      kind="${ALERT_WEBHOOK_KIND:-generic}"
      payload="$(jq -n --arg text "$message" --arg kind "$kind" 'if $kind == "feishu" then {msg_type:"text",content:{text:$text}} elif $kind == "slack" then {text:$text} else {source:"wecraft-training",text:$text} end')"
      curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || echo "alert_delivery=failed"
    else
      echo "alert_delivery=skipped reason=ALERT_WEBHOOK_URL_not_configured"
    fi
  fi
  printf 'alert\n' > "$STATE_FILE"
  exit 1
fi

if [[ "${previous:-}" == alert ]]; then
  message="[WeCraft Training] RECOVERED $(date -Iseconds): health ok, disk=${disk_used}%, app=${app_health}, db=${db_health}"
  echo "$message"
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then
    kind="${ALERT_WEBHOOK_KIND:-generic}"
    payload="$(jq -n --arg text "$message" --arg kind "$kind" 'if $kind == "feishu" then {msg_type:"text",content:{text:$text}} elif $kind == "slack" then {text:$text} else {source:"wecraft-training",text:$text} end')"
    curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || echo "alert_delivery=failed"
  fi
fi
printf 'ok\n' > "$STATE_FILE"
echo "[WeCraft Training] OK $(date -Iseconds): health, disk=${disk_used}%, backup, app=${app_health}, db=${db_health}"
