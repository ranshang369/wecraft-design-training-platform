#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

MODE="runtime"
if [[ "${1:-}" == "--pilot" ]]; then MODE="pilot"; fi
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "usage: $0 [--pilot]"
  echo "  runtime  仅检查公网、容器、备份、监控和发布一致性"
  echo "  --pilot  额外检查告警送达、异地备份、演示开关、真实账号、数据量、恢复演练和 Holdout pair"
  exit 0
fi
if [[ "$MODE" != "runtime" && "$MODE" != "pilot" ]]; then
  echo "unknown mode: $MODE" >&2
  exit 2
fi

MONITOR_ENV_FILE="${WECRAFT_TRAINING_MONITOR_ENV:-/etc/wecraft-training/monitor.env}"
BACKUP_ENV_FILE="${WECRAFT_TRAINING_BACKUP_ENV:-/etc/wecraft-training/backup.env}"
APP_ENV_FILE="${WECRAFT_TRAINING_APP_ENV:-/opt/wecraft-training/deploy/training/.env}"
if [[ -r "$MONITOR_ENV_FILE" ]]; then set -a; source "$MONITOR_ENV_FILE"; set +a; fi
if [[ -r "$BACKUP_ENV_FILE" ]]; then set -a; source "$BACKUP_ENV_FILE"; set +a; fi

HEALTH_URL="${HEALTH_URL:-https://wecraft-training.zer-go.cn/api/v1/health}"
APP_CONTAINER="${APP_CONTAINER:-wecraft-design-training-app-1}"
DB_CONTAINER="${DB_CONTAINER:-wecraft-design-training-db-1}"
POSTGRES_USER="${POSTGRES_USER:-wecraft_training}"
POSTGRES_DB="${POSTGRES_DB:-wecraft_dt}"
PILOT_WORKSPACE_SLUG="${PILOT_WORKSPACE_SLUG:-wecraft-pilot}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/wecraft-training}"
CADDYFILE="${CADDYFILE:-/opt/wecraft/deploy/Caddyfile}"
STATE_DIR="${WECRAFT_TRAINING_STATE_DIR:-/var/lib/wecraft-training}"
EXPECTED_REVISION_FILE="$STATE_DIR/last-release"

blockers=0
warnings=0
report() {
  local status="$1" id="$2" detail="$3"
  printf '%-6s %-34s %s\n' "$status" "$id" "$detail"
}
block() { report "BLOCK" "$1" "$2"; blockers=$((blockers + 1)); }
warn() { report "WARN" "$1" "$2"; warnings=$((warnings + 1)); }
pass() { report "PASS" "$1" "$2"; }

health="$(curl -fsS --max-time 15 "$HEALTH_URL" 2>/dev/null || true)"
if grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$health" && grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' <<<"$health"; then
  pass "public_health" "$HEALTH_URL"
else
  block "public_health" "健康接口不可用或数据库不健康"
fi

expected_revision="$({ tr -d '[:space:]' < "$EXPECTED_REVISION_FILE"; } 2>/dev/null || true)"
actual_revision="$(sed -n 's/.*"revision":"\([^"]*\)".*/\1/p' <<<"$health" | head -n 1)"
if [[ -z "$expected_revision" ]]; then
  warn "release_revision" "last-release 不存在：$EXPECTED_REVISION_FILE"
elif grep -Fq "\"revision\":\"$expected_revision\"" <<<"$health"; then
  pass "release_revision" "$expected_revision"
else
  block "release_revision" "expected=$expected_revision actual=${actual_revision:-unknown}"
fi

for pair in "$APP_CONTAINER:app" "$DB_CONTAINER:db"; do
  container="${pair%:*}"; label="${pair##*:}"
  health_status="$(docker inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
  if [[ "$health_status" == "healthy" ]]; then pass "container_$label" "$container healthy"; else block "container_$label" "$container=$health_status"; fi
done

if [[ -r "$CADDYFILE" ]] && grep -q 'wecraft-training.zer-go.cn' "$CADDYFILE"; then
  pass "caddy_route" "wecraft-training.zer-go.cn"
else
  block "caddy_route" "训练平台 Caddy 路由缺失或不可读"
fi

disk_used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ -n "$disk_used" && "$disk_used" -lt 85 ]]; then pass "disk" "${disk_used}% used"; else block "disk" "${disk_used:-unknown}% used"; fi

for timer in wecraft-training-backup.timer wecraft-training-monitor.timer; do
  if systemctl is-active --quiet "$timer"; then pass "timer_$timer" "active"; else block "timer_$timer" "inactive"; fi
done

latest_backup="$(readlink -f "$BACKUP_DIR/latest.dump" 2>/dev/null || true)"
if [[ -n "$latest_backup" && -s "$latest_backup" ]] && find "$latest_backup" -mmin -1560 -print -quit | grep -q .; then
  if [[ -r "$latest_backup.sha256" ]] && sha256sum -c "$latest_backup.sha256" >/dev/null 2>&1; then
    pass "backup" "$latest_backup"
  else
    block "backup" "最近备份校验和缺失或不匹配"
  fi
else
  block "backup" "最近 26 小时内没有有效备份"
fi

if [[ "$MODE" == "pilot" ]]; then
  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]]; then pass "alert_config" "ALERT_WEBHOOK_URL configured"; else block "alert_config" "ALERT_WEBHOOK_URL 未配置"; fi
  if [[ -r "$STATE_DIR/last-alert-test" ]] && find "$STATE_DIR/last-alert-test" -mmin -10080 -print -quit | grep -q . && grep -q 'result=ok' "$STATE_DIR/last-alert-test"; then
    pass "alert_delivery_test" "$(head -n 1 "$STATE_DIR/last-alert-test")"
  else
    block "alert_delivery_test" "7 天内没有成功的 test-alert 记录"
  fi

  if [[ -n "${RCLONE_REMOTE:-}" ]]; then pass "offsite_config" "RCLONE_REMOTE configured"; else block "offsite_config" "RCLONE_REMOTE 未配置"; fi
  if [[ -r "$STATE_DIR/last-offsite-copy" ]] && find "$STATE_DIR/last-offsite-copy" -mmin -1560 -print -quit | grep -q . && grep -q 'result=ok' "$STATE_DIR/last-offsite-copy"; then
    pass "offsite_copy" "$(head -n 1 "$STATE_DIR/last-offsite-copy")"
  else
    block "offsite_copy" "26 小时内没有成功异地复制记录"
  fi

  if [[ -r "$STATE_DIR/last-restore-drill" ]] && find "$STATE_DIR/last-restore-drill" -mmin -10080 -print -quit | grep -q . && grep -q 'result=ok' "$STATE_DIR/last-restore-drill" && grep -Eq '^source=offsite:' "$STATE_DIR/last-restore-drill"; then
    pass "restore_drill" "$(head -n 1 "$STATE_DIR/last-restore-drill")"
  else
    block "restore_drill" "7 天内没有从异地副本完成的成功恢复演练"
  fi

  demo_seed="$(sed -n 's/^DEMO_SEED_IF_EMPTY=//p' "$APP_ENV_FILE" 2>/dev/null | head -n 1)"
  if [[ "$demo_seed" == "0" ]]; then pass "demo_seed" "disabled"; else block "demo_seed" "DEMO_SEED_IF_EMPTY=$demo_seed (expected 0)"; fi

  pilot_workspace="$(docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select id||'|'||name from \"Workspace\" where slug='$PILOT_WORKSPACE_SLUG' and status='ACTIVE' limit 1;" 2>/dev/null || true)"
  if [[ -n "$pilot_workspace" ]]; then pass "pilot_workspace" "$PILOT_WORKSPACE_SLUG"; else block "pilot_workspace" "active workspace $PILOT_WORKSPACE_SLUG not found"; fi
  counts_sql="with ws as (select id from \"Workspace\" where slug='$PILOT_WORKSPACE_SLUG' and status='ACTIVE'), pilot as (select (select id from ws) as id) select (select count(*) from \"User\" where \"isActive\"=true and email like '%@example.test'), (select count(distinct u.id) from \"User\" u join \"Membership\" m on m.\"userId\"=u.id join pilot on pilot.id=m.\"workspaceId\" where u.\"isActive\"=true and m.status='ACTIVE' and u.email not like '%@example.test'), (select count(*) from \"Case\" where status='ELIGIBLE' and \"deletedAt\" is null and \"workspaceId\"=(select id from pilot)), (select count(*) from \"Counterexample\" where status='APPROVED' and \"deletedAt\" is null and \"workspaceId\"=(select id from pilot)), (select count(*) from \"Brief\" where purpose<>'CASE_SOURCE' and status='READY' and \"deletedAt\" is null and \"workspaceId\"=(select id from pilot)), (select count(*) from (select archetype from \"Case\" where status='ELIGIBLE' and \"deletedAt\" is null and \"workspaceId\"=(select id from pilot) group by archetype having count(*)>=3) covered), (select count(*) from \"Case\" c join \"AuthorizationGrant\" g on g.\"subjectType\"='CASE' and g.\"subjectId\"=c.id where c.status='ELIGIBLE' and c.\"deletedAt\" is null and c.\"workspaceId\"=(select id from pilot) and g.\"evidenceStatus\"='VERIFIED' and g.\"canUseForTraining\"=true and (g.\"expiresAt\" is null or g.\"expiresAt\">now())), (select count(*) from \"Case\" where \"deletedAt\" is null and \"workspaceId\"=(select id from pilot)), (select count(*) from \"Case\" c join \"CaseVersion\" v on v.\"caseId\"=c.id and v.version=c.\"currentVersion\" where c.\"deletedAt\" is null and c.\"workspaceId\"=(select id from pilot) and (select count(distinct r.\"reviewerId\") from \"CaseReview\" r where r.\"caseVersionId\"=v.id and r.status='SUBMITTED')>=2), (select count(distinct p.id) from \"ExperimentPair\" p join \"Experiment\" e on e.id=p.\"experimentId\" join \"ExperimentBrief\" eb on eb.\"experimentId\"=e.id join \"Brief\" b on b.id=eb.\"briefId\" where e.\"workspaceId\"=(select id from pilot) and e.status='CLOSED' and b.split='HOLDOUT' and p.status='COMPLETED' and (select count(distinct pc.\"reviewerId\") from \"PairwiseComparison\" pc where pc.\"experimentPairId\"=p.id and pc.status='SUBMITTED')>=3);"
  counts="$(docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c "$counts_sql" 2>/dev/null || true)"
  if [[ -z "$counts" ]]; then
    block "database_query" "无法读取 Pilot 数据门禁"
  else
    IFS='|' read -r demo_users real_users eligible_cases approved_counterexamples golden_briefs covered_archetypes authorization_complete total_cases reviewed_cases holdout_pairs <<<"$counts"
    [[ "$demo_users" == "0" ]] && pass "demo_accounts" "no active demo accounts" || block "demo_accounts" "$demo_users active demo account(s)"
    [[ "$real_users" -gt 0 ]] && pass "real_accounts" "$real_users active real account(s)" || block "real_accounts" "no active non-demo account"
    [[ "$eligible_cases" -ge 30 ]] && pass "data_cases" "$eligible_cases / 30" || block "data_cases" "$eligible_cases / 30"
    [[ "$approved_counterexamples" -ge 10 ]] && pass "data_counterexamples" "$approved_counterexamples / 10" || block "data_counterexamples" "$approved_counterexamples / 10"
    [[ "$golden_briefs" -ge 60 ]] && pass "data_golden_briefs" "$golden_briefs / 60" || block "data_golden_briefs" "$golden_briefs / 60"
    [[ "$covered_archetypes" -ge 9 ]] && pass "data_archetypes" "$covered_archetypes / 9" || block "data_archetypes" "$covered_archetypes / 9"
    [[ "$eligible_cases" -gt 0 && "$authorization_complete" -ge "$eligible_cases" ]] && pass "data_authorization" "$authorization_complete / $eligible_cases" || block "data_authorization" "$authorization_complete / $eligible_cases"
    [[ "$total_cases" -gt 0 && "$reviewed_cases" -ge "$total_cases" ]] && pass "data_reviews" "$reviewed_cases / $total_cases" || block "data_reviews" "$reviewed_cases / $total_cases"
    [[ "$holdout_pairs" -ge 30 ]] && pass "holdout_pairs" "$holdout_pairs / 30 (3 reviewers)" || block "holdout_pairs" "$holdout_pairs / 30 (3 reviewers)"
  fi

  roles_sql="with pilot as (select id from \"Workspace\" where slug='$PILOT_WORKSPACE_SLUG' and status='ACTIVE'), active_users as (select distinct u.id, r.code from \"User\" u join \"Membership\" m on m.\"userId\"=u.id and m.\"workspaceId\"=(select id from pilot) and m.status='ACTIVE' join \"MemberRole\" mr on mr.\"membershipId\"=m.id join \"Role\" r on r.id=mr.\"roleId\" where u.\"isActive\"=true and u.email not like '%@example.test') select (select count(distinct id) from active_users where code='DESIGN_LEAD'), (select count(distinct id) from active_users where code='ANNOTATOR'), (select count(distinct id) from active_users where code='AI_ENGINEER'), (select count(distinct id) from active_users where code='CONTENT_LEAD');"
  role_counts="$(docker exec "$DB_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F '|' -c "$roles_sql" 2>/dev/null || true)"
  if [[ -z "$role_counts" ]]; then
    block "role_coverage" "无法读取 Pilot 角色覆盖"
  else
    IFS='|' read -r design_leads annotators ai_engineers content_leads <<<"$role_counts"
    if [[ "$design_leads" -ge 1 && "$annotators" -ge 2 && "$ai_engineers" -ge 1 && "$content_leads" -ge 1 ]]; then
      pass "role_coverage" "design_lead=$design_leads annotators=$annotators ai_engineer=$ai_engineers content_lead=$content_leads"
    else
      block "role_coverage" "design_lead=$design_leads/1 annotators=$annotators/2 ai_engineer=$ai_engineers/1 content_lead=$content_leads/1"
    fi
  fi
fi

if exec 8>/run/wecraft-release.lock && flock -n 8; then
  pass "release_lock" "free"
else
  warn "release_lock" "held by another release/build"
fi

echo "SUMMARY mode=$MODE blockers=$blockers warnings=$warnings"
if ((blockers > 0)); then exit 1; fi
