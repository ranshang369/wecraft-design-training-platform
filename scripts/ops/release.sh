#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

# Run on the training host. The lock is shared with the main WeCraft release
# script because both stacks build against the same Docker daemon.
ROOT="${WECRAFT_TRAINING_ROOT:-/opt/wecraft-training}"
REVISION="${1:-}"
shift || true
SKIP_BACKUP=0
for argument in "$@"; do
  case "$argument" in
    --skip-backup) SKIP_BACKUP=1 ;;
    *) printf 'unknown argument: %s\n' "$argument" >&2; exit 2 ;;
  esac
done

[[ "$REVISION" =~ ^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$ ]] || {
  printf 'usage: %s <revision-tag> [--skip-backup]\n' "$0" >&2
  exit 2
}
[[ "$REVISION" != latest && "$REVISION" != unknown ]] || {
  printf 'revision must be immutable, not %s\n' "$REVISION" >&2
  exit 2
}

cd "$ROOT"
ENV_FILE="$ROOT/deploy/training/.env"
COMPOSE_FILE="$ROOT/deploy/training/docker-compose.yml"
[[ -r "$ENV_FILE" ]] || { printf 'missing env file: %s\n' "$ENV_FILE" >&2; exit 2; }
[[ -r "$COMPOSE_FILE" ]] || { printf 'missing compose file: %s\n' "$COMPOSE_FILE" >&2; exit 2; }
[[ "$(stat -c '%a' "$ENV_FILE")" == 600 ]] || {
  printf 'refusing release: %s must have mode 600\n' "$ENV_FILE" >&2
  exit 2
}

exec 9>/run/wecraft-release.lock
if ! flock -n 9; then
  printf 'another WeCraft build/deploy holds /run/wecraft-release.lock\n' >&2
  exit 75
fi

APP_URL="$(sed -n 's/^APP_URL=//p' "$ENV_FILE" | head -n 1)"
[[ "$APP_URL" == https://* ]] || { printf 'APP_URL must be an HTTPS URL\n' >&2; exit 2; }
DEMO_SEED_IF_EMPTY="$(sed -n 's/^DEMO_SEED_IF_EMPTY=//p' "$ENV_FILE" | head -n 1)"
[[ "$DEMO_SEED_IF_EMPTY" == 0 ]] || {
  printf 'refusing production release: DEMO_SEED_IF_EMPTY must be 0\n' >&2
  exit 2
}

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
IMAGE="wecraft-design-training-app:$REVISION"
STATE_DIR=/var/lib/wecraft-training
install -d -m 700 "$STATE_DIR"

PREVIOUS_REVISION="$(docker inspect wecraft-design-training-app-1 \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
printf '%s\n' "$REVISION" > "$STATE_DIR/release.in-progress"
printf 'release=%s previous=%s\n' "$REVISION" "${PREVIOUS_REVISION:-none}"

if ((SKIP_BACKUP == 0)); then
  bash "$ROOT/scripts/ops/backup-postgres.sh"
fi

APP_REVISION="$REVISION" nice -n 19 ionice -c 2 -n 7 \
  "${COMPOSE[@]}" --progress plain build app

BUILT_REVISION="$(docker image inspect "$IMAGE" \
  --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
[[ "$BUILT_REVISION" == "$REVISION" ]] || {
  printf 'image revision mismatch: expected=%s actual=%s\n' "$REVISION" "$BUILT_REVISION" >&2
  exit 1
}

APP_REVISION="$REVISION" "${COMPOSE[@]}" up -d --no-build db

db_health=starting
for _ in $(seq 1 40); do
  db_health="$(docker inspect wecraft-design-training-db-1 \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
  [[ "$db_health" == healthy ]] && break
  sleep 3
done
if [[ "$db_health" != healthy ]]; then
  docker logs --tail 120 wecraft-design-training-db-1 >&2 || true
  printf 'database did not become healthy: %s\n' "$db_health" >&2
  exit 1
fi

APP_REVISION="$REVISION" "${COMPOSE[@]}" up -d --no-build app

app_health=starting
for _ in $(seq 1 60); do
  app_health="$(docker inspect wecraft-design-training-app-1 \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' 2>/dev/null || echo missing)"
  [[ "$app_health" == healthy ]] && break
  sleep 3
done
if [[ "$app_health" != healthy ]]; then
  docker logs --tail 120 wecraft-design-training-app-1 >&2 || true
  printf 'application did not become healthy: %s\n' "$app_health" >&2
  exit 1
fi

health="$(curl -fsS --max-time 15 "$APP_URL/api/v1/health")"
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' <<<"$health" || {
  printf 'public health is not ok: %s\n' "$health" >&2
  exit 1
}
grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' <<<"$health" || {
  printf 'public database health is not ok: %s\n' "$health" >&2
  exit 1
}
grep -Fq "\"revision\":\"$REVISION\"" <<<"$health" || {
  printf 'public revision mismatch: %s\n' "$health" >&2
  exit 1
}

login_status="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$APP_URL/login")"
[[ "$login_status" == 200 ]] || {
  printf 'login page check failed: HTTP %s\n' "$login_status" >&2
  exit 1
}

if [[ -r /opt/wecraft/deploy/Caddyfile ]] && ! grep -q 'wecraft-training.zer-go.cn' /opt/wecraft/deploy/Caddyfile; then
  printf 'training Caddy route is missing; restore deploy/training/Caddyfile.snippet before traffic is routed\n' >&2
  exit 1
fi

printf '%s\n' "$REVISION" > "$STATE_DIR/last-release"
printf 'RELEASE_OK revision=%s image=%s health=%s\n' "$REVISION" "$IMAGE" "$health"
if ! bash "$ROOT/scripts/ops/preflight.sh"; then
  printf 'POST_RELEASE_PREFLIGHT_BLOCKED see output above\n' >&2
  exit 1
fi
