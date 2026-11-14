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

[[ -n "${ALERT_WEBHOOK_URL:-}" ]] || { echo "ALERT_WEBHOOK_URL is not configured"; exit 2; }
kind="${ALERT_WEBHOOK_KIND:-generic}"
message="[WeCraft Training] TEST $(date -Iseconds): 告警通道已接入；这是一条人工触发测试消息。"
payload="$(jq -n --arg text "$message" --arg kind "$kind" 'if $kind == "feishu" then {msg_type:"text",content:{text:$text}} elif $kind == "slack" then {text:$text} else {source:"wecraft-training",text:$text} end')"
response="$(curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL")"
if [[ "$kind" == "feishu" ]] && ! jq -e '.code == 0 or .StatusCode == 0' >/dev/null 2>&1 <<<"$response"; then
  echo "ALERT_TEST_FAILED reason=feishu_rejected"
  exit 1
fi
STATE_DIR="${WECRAFT_TRAINING_STATE_DIR:-/var/lib/wecraft-training}"
install -d -m 700 "$STATE_DIR"
printf 'timestamp=%s\nkind=%s\nresult=ok\n' "$(date -Iseconds)" "$kind" > "$STATE_DIR/last-alert-test"
chmod 600 "$STATE_DIR/last-alert-test"
echo "ALERT_TEST_OK kind=$kind"
