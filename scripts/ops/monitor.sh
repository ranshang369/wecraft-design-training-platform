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
EXPECTED_REVISION_FILE="${EXPECTED_REVISION_FILE:-/var/lib/wecraft-training/last-release}"
MAX_DISK_PERCENT="${MAX_DISK_PERCENT:-85}"
MAX_BACKUP_AGE_MINUTES="${MAX_BACKUP_AGE_MINUTES:-1560}"
STATE_FILE="${STATE_FILE:-/run/wecraft-training-monitor.state}"
CADDYFILE="${CADDYFILE:-/opt/wecraft/deploy/Caddyfile}"

failures=()
join_failures() {
  local IFS=,
  printf '%s' "${failures[*]}"
}

send_webhook() {
  local text="$1" kind="${ALERT_WEBHOOK_KIND:-generic}" payload response
  if [[ -z "${ALERT_WEBHOOK_URL:-}" ]]; then
    echo "alert_delivery=skipped reason=ALERT_WEBHOOK_URL_not_configured"
    return 2
  fi
  payload="$(jq -n --arg text "$text" --arg kind "$kind" 'if $kind == "feishu" then {msg_type:"text",content:{text:$text}} elif $kind == "slack" then {text:$text} else {source:"wecraft-training",text:$text} end')"
  if ! response="$(curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" 2>/dev/null)"; then
    echo "alert_delivery=failed reason=http_request_failed"
    return 1
  fi
  if [[ "$kind" == "feishu" ]] && ! jq -e '.code == 0 or .StatusCode == 0' >/dev/null 2>&1 <<<"$response"; then
    echo "alert_delivery=failed reason=feishu_rejected"
    return 1
  fi
  echo "alert_delivery=sent"
  return 0
}

health="$(curl -fsS --max-time 10 "$HEALTH_URL" 2>/dev/null || true)"
if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$health" || ! grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' <<<"$health"; then
  failures+=("healthcheck_failed")
fi

expected_revision="$(tr -d '[:space:]' < "$EXPECTED_REVISION_FILE" 2>/dev/null || true)"
if [[ -n "$expected_revision" ]] && ! grep -Fq "\"revision\":\"$expected_revision\"" <<<"$health"; then
  failures+=("revision_mismatch")
fi

disk_used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ -z "$disk_used" || "$disk_used" -ge "$MAX_DISK_PERCENT" ]]; then
  failures+=("disk_${disk_used:-unknown}_percent")
fi

latest_backup="$(readlink -f "$BACKUP_DIR/latest.dump" 2>/dev/null || true)"
if [[ -z "$latest_backup" || ! -s "$latest_backup" ]] || ! find "$latest_backup" -mmin -"$MAX_BACKUP_AGE_MINUTES" -print -quit | grep -q .; then
  failures+=("backup_stale")
elif [[ ! -r "$latest_backup.sha256" ]]; then
  failures+=("backup_checksum_missing")
elif ! sha256sum -c "$latest_backup.sha256" >/dev/null 2>&1; then
  failures+=("backup_checksum_failed")
fi

app_health="$(docker inspect "$APP_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
db_health="$(docker inspect "$DB_CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
[[ "$app_health" == "healthy" ]] || failures+=("app_${app_health}")
[[ "$db_health" == "healthy" ]] || failures+=("db_${db_health}")
if [[ ! -r "$CADDYFILE" ]] || ! grep -q 'wecraft-training.zer-go.cn' "$CADDYFILE"; then
  failures+=("caddy_route_missing")
fi

previous="$(cat "$STATE_FILE" 2>/dev/null || true)"
if ((${#failures[@]})); then
  message="[WeCraft Training] ALERT $(date -Iseconds): $(join_failures) health=${health:-unreachable} disk=${disk_used}% app=${app_health} db=${db_health} expected_revision=${expected_revision:-unknown}"
  echo "$message"
  state="alert"
  if [[ "${previous:-}" != alert && "${previous:-}" != alert_local && "${previous:-}" != alert_pending ]]; then
    if send_webhook "$message"; then
      state="alert"
    else
      delivery_status=$?
      state=$([[ "$delivery_status" == 2 ]] && echo "alert_local" || echo "alert_pending")
    fi
  elif [[ "${previous:-}" == alert_pending ]]; then
    if send_webhook "$message"; then state="alert"; else state="alert_pending"; fi
  fi
  printf '%s\n' "$state" > "$STATE_FILE"
  exit 1
fi

if [[ "${previous:-}" == alert || "${previous:-}" == alert_local || "${previous:-}" == alert_pending ]]; then
  message="[WeCraft Training] RECOVERED $(date -Iseconds): health ok, disk=${disk_used}%, app=${app_health}, db=${db_health}, revision=${expected_revision:-unknown}"
  echo "$message"
  if send_webhook "$message"; then
    printf 'ok\n' > "$STATE_FILE"
  else
    delivery_status=$?
    if [[ "$delivery_status" == 2 ]]; then
      printf 'ok\n' > "$STATE_FILE"
      exit 0
    fi
    printf 'alert_pending\n' > "$STATE_FILE"
    exit 1
  fi
fi
printf 'ok\n' > "$STATE_FILE"
echo "[WeCraft Training] OK $(date -Iseconds): health, revision=${expected_revision:-unknown}, disk=${disk_used}%, backup+sha256, app=${app_health}, db=${db_health}"
