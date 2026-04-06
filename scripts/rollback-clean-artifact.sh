#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_USER="${VUTLER_DEPLOY_USER:-ubuntu}"
REMOTE_HOST="${VUTLER_DEPLOY_HOST:-83.228.222.180}"
SSH_KEY="${VUTLER_DEPLOY_SSH_KEY:-$HOME/.ssh/vps-ssh-key.pem}"
ROLLBACK_NOTE=""
API_ONLY=0
SKIP_SMOKE=0

usage() {
  cat <<'EOF'
Usage: ./scripts/rollback-clean-artifact.sh [options]

Options:
  --rollback-note <path>  Explicit rollback.env path on the VPS.
  --api-only              Roll back only vutler-api.
  --skip-smoke            Skip post-rollback smoke test.
  --host <host>           Override VPS host. Default: 83.228.222.180
  --user <user>           Override SSH user. Default: ubuntu
  --key <path>            Override SSH private key path.
  -h, --help              Show this help.
EOF
}

log() {
  printf '==> %s\n' "$*"
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --rollback-note)
      [ $# -ge 2 ] || fail "--rollback-note requires a value"
      ROLLBACK_NOTE="$2"
      shift 2
      ;;
    --api-only)
      API_ONLY=1
      shift
      ;;
    --skip-smoke)
      SKIP_SMOKE=1
      shift
      ;;
    --host)
      [ $# -ge 2 ] || fail "--host requires a value"
      REMOTE_HOST="$2"
      shift 2
      ;;
    --user)
      [ $# -ge 2 ] || fail "--user requires a value"
      REMOTE_USER="$2"
      shift 2
      ;;
    --key)
      [ $# -ge 2 ] || fail "--key requires a value"
      SSH_KEY="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

require_cmd ssh
[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=no)
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

if [ -z "$ROLLBACK_NOTE" ]; then
  log "Resolving latest rollback note on $SSH_TARGET"
  ROLLBACK_NOTE="$(ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "ls -1dt /tmp/vutler-deploy-*/rollback.env 2>/dev/null | head -1")"
fi

[ -n "$ROLLBACK_NOTE" ] || fail "No rollback note found on $SSH_TARGET"

log "Rolling back using $ROLLBACK_NOTE"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s -- "$ROLLBACK_NOTE" "$API_ONLY" "$SKIP_SMOKE" <<'EOF'
set -euo pipefail

ROLLBACK_NOTE="$1"
API_ONLY="$2"
SKIP_SMOKE="$3"

API_ENV_FILE=/tmp/vutler-api-runtime.env
FRONTEND_ENV_FILE=/tmp/vutler-frontend-runtime.env
ROLLBACK_RECORD="/tmp/vutler-rollback-$(date +%Y%m%d-%H%M%S).env"
RELEASES_DIR=/home/ubuntu/vutler-deploy/releases
CURRENT_RELEASE_FILE=/home/ubuntu/vutler-deploy/current-release.env
ROLLED_BACK_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOY_METHOD="rollback"

log() {
  printf 'REMOTE ==> %s\n' "$*"
}

fail() {
  printf 'REMOTE ERROR: %s\n' "$*" >&2
  exit 1
}

require_env_var() {
  local file_path=$1
  local var_name=$2
  local value
  value=$(sed -n "s/^${var_name}=//p" "$file_path" | head -1)
  if [ -z "$value" ]; then
    fail "${var_name} is missing from ${file_path}"
  fi
}

strip_release_env_vars() {
  local file_path=$1
  local sanitized_file="${file_path}.sanitized"
  grep -v '^VUTLER_RELEASE_' "$file_path" > "$sanitized_file" || true
  mv "$sanitized_file" "$file_path"
}

wait_for_health() {
  local container_name=$1
  local attempts=$2
  local sleep_seconds=$3
  local state
  for _ in $(seq 1 "$attempts"); do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_name" 2>/dev/null || echo unknown)
    if [ "$state" = "healthy" ] || [ "$state" = "running" ]; then
      return 0
    fi
    sleep "$sleep_seconds"
  done
  return 1
}

write_release_record() {
  local smoke_status=$1
  local api_image_id worker_image_id frontend_image_id release_file
  mkdir -p "$RELEASES_DIR"
  api_image_id="$(docker inspect -f '{{.Image}}' vutler-api 2>/dev/null || true)"
  worker_image_id="$(docker inspect -f '{{.Image}}' vutler-sandbox-worker 2>/dev/null || true)"
  frontend_image_id="$(docker inspect -f '{{.Image}}' vutler-frontend 2>/dev/null || true)"
  release_file="${RELEASES_DIR}/${ROLLED_BACK_AT//:/-}-${ROLLBACK_REVISION}.env"

  cat > "$release_file" <<RELEASE
DEPLOY_METHOD=$DEPLOY_METHOD
DEPLOYED_AT=$ROLLED_BACK_AT
DEPLOY_COMMIT=$ROLLBACK_REVISION
SOURCE_ROLLBACK_NOTE=$ROLLBACK_NOTE
SMOKE_STATUS=$smoke_status
API_IMAGE_ID=$api_image_id
WORKER_IMAGE_ID=$worker_image_id
FRONTEND_IMAGE_ID=$frontend_image_id
RELEASE

  cp "$release_file" "$CURRENT_RELEASE_FILE"
}

upsert_env_var() {
  local file_path=$1
  local var_name=$2
  local value=$3
  if grep -q "^${var_name}=" "$file_path" 2>/dev/null; then
    sed -i "s|^${var_name}=.*|${var_name}=${value}|" "$file_path"
  else
    printf '%s=%s\n' "$var_name" "$value" >> "$file_path"
  fi
}

normalize_postal_env() {
  local file_path=$1
  local postal_api_url
  postal_api_url="$(sed -n 's/^POSTAL_API_URL=//p' "$file_path" | head -1)"

  case "$postal_api_url" in
    ""|"http://localhost:8082"|"http://127.0.0.1:8082")
      upsert_env_var "$file_path" "POSTAL_API_URL" "http://postal-web:5000"
      ;;
  esac

  if ! grep -q '^POSTAL_INTERNAL_API_URL=' "$file_path" 2>/dev/null; then
    printf '%s=%s\n' "POSTAL_INTERNAL_API_URL" "http://postal-web:5000" >> "$file_path"
  fi
}

[ -f "$ROLLBACK_NOTE" ] || fail "Rollback note not found: $ROLLBACK_NOTE"
# shellcheck disable=SC1090
. "$ROLLBACK_NOTE"

[ -n "${API_PREVIOUS_IMAGE:-}" ] || fail "API_PREVIOUS_IMAGE is missing from $ROLLBACK_NOTE"
ROLLBACK_REVISION="${DEPLOY_COMMIT:-rollback-unknown}"
docker image inspect "$API_PREVIOUS_IMAGE" >/dev/null 2>&1 || fail "Previous API image not found locally: $API_PREVIOUS_IMAGE"

CURRENT_API_IMAGE="$(docker inspect -f '{{.Image}}' vutler-api 2>/dev/null || true)"
CURRENT_FRONTEND_IMAGE="$(docker inspect -f '{{.Image}}' vutler-frontend 2>/dev/null || true)"

if docker ps -aqf name='^vutler-api$' | grep -q .; then
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api > "$API_ENV_FILE"
elif [ -f /home/ubuntu/vutler/.env ]; then
  cp /home/ubuntu/vutler/.env "$API_ENV_FILE"
else
  fail "Cannot resolve API env from running container or /home/ubuntu/vutler/.env"
fi

strip_release_env_vars "$API_ENV_FILE"
require_env_var "$API_ENV_FILE" "JWT_SECRET"
require_env_var "$API_ENV_FILE" "VUTLER_API_KEY"
normalize_postal_env "$API_ENV_FILE"

log "Restarting vutler-api on previous image"
docker rm -f vutler-api >/dev/null 2>&1 || true
docker run -d \
  --name vutler-api \
  --restart unless-stopped \
  --network vutler_vutler-network \
  -p 127.0.0.1:3001:3001 \
  --env-file "$API_ENV_FILE" \
  -e "VUTLER_RELEASE_METHOD=$DEPLOY_METHOD" \
  -e "VUTLER_RELEASE_REVISION=$ROLLBACK_REVISION" \
  -e "VUTLER_RELEASE_SHORT_SHA=${ROLLBACK_REVISION:0:12}" \
  -e "VUTLER_RELEASE_TAG=$API_PREVIOUS_IMAGE" \
  -e "VUTLER_RELEASE_DEPLOYED_AT=$ROLLED_BACK_AT" \
  --health-cmd 'curl -f http://localhost:3001/api/v1/health || exit 1' \
  --health-interval 30s \
  --health-timeout 10s \
  --health-start-period 20s \
  --health-retries 3 \
  "$API_PREVIOUS_IMAGE" \
  node index.js >/dev/null

docker network connect postal2_postal-net vutler-api >/dev/null 2>&1 || true

docker rm -f vutler-sandbox-worker >/dev/null 2>&1 || true
docker run -d \
  --name vutler-sandbox-worker \
  --restart unless-stopped \
  --network vutler_vutler-network \
  --no-healthcheck \
  --env-file "$API_ENV_FILE" \
  -e "VUTLER_RELEASE_METHOD=$DEPLOY_METHOD" \
  -e "VUTLER_RELEASE_REVISION=$ROLLBACK_REVISION" \
  -e "VUTLER_RELEASE_SHORT_SHA=${ROLLBACK_REVISION:0:12}" \
  -e "VUTLER_RELEASE_TAG=$API_PREVIOUS_IMAGE" \
  -e "VUTLER_RELEASE_DEPLOYED_AT=$ROLLED_BACK_AT" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  "$API_PREVIOUS_IMAGE" \
  node workers/sandbox-worker.js >/dev/null

docker network connect postal2_postal-net vutler-sandbox-worker >/dev/null 2>&1 || true

if ! wait_for_health vutler-api 30 2; then
  fail "vutler-api did not become healthy after rollback"
fi

curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null

if [ "$API_ONLY" != "1" ] && [ -n "${FRONTEND_PREVIOUS_IMAGE:-}" ]; then
  docker image inspect "$FRONTEND_PREVIOUS_IMAGE" >/dev/null 2>&1 || fail "Previous frontend image not found locally: $FRONTEND_PREVIOUS_IMAGE"
  : > "$FRONTEND_ENV_FILE"
  if docker ps -aqf name='^vutler-frontend$' | grep -q .; then
    docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-frontend \
      | sed -n '/^\(API_URL\|WS_URL\|PORT\|HOSTNAME\|NEXT_PUBLIC_[A-Z0-9_]*\)=/p' > "$FRONTEND_ENV_FILE"
  fi
  strip_release_env_vars "$FRONTEND_ENV_FILE"
  grep -q '^API_URL=' "$FRONTEND_ENV_FILE" 2>/dev/null || printf 'API_URL=http://localhost:3001\n' >> "$FRONTEND_ENV_FILE"
  grep -q '^WS_URL=' "$FRONTEND_ENV_FILE" 2>/dev/null || printf 'WS_URL=http://localhost:3001\n' >> "$FRONTEND_ENV_FILE"
  grep -q '^PORT=' "$FRONTEND_ENV_FILE" 2>/dev/null || printf 'PORT=3002\n' >> "$FRONTEND_ENV_FILE"
  grep -q '^HOSTNAME=' "$FRONTEND_ENV_FILE" 2>/dev/null || printf 'HOSTNAME=0.0.0.0\n' >> "$FRONTEND_ENV_FILE"

  log "Restarting vutler-frontend on previous image"
  docker rm -f vutler-frontend >/dev/null 2>&1 || true
  docker run -d \
    --name vutler-frontend \
    --restart unless-stopped \
    --network host \
    --env-file "$FRONTEND_ENV_FILE" \
    -e "VUTLER_RELEASE_METHOD=$DEPLOY_METHOD" \
    -e "VUTLER_RELEASE_REVISION=$ROLLBACK_REVISION" \
    -e "VUTLER_RELEASE_SHORT_SHA=${ROLLBACK_REVISION:0:12}" \
    -e "VUTLER_RELEASE_DEPLOYED_AT=$ROLLED_BACK_AT" \
    "$FRONTEND_PREVIOUS_IMAGE" >/dev/null

  if ! wait_for_health vutler-frontend 40 3; then
    fail "vutler-frontend did not become healthy after rollback"
  fi
fi

cat > "$ROLLBACK_RECORD" <<ROLLBACK
ROLLED_BACK_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
SOURCE_ROLLBACK_NOTE=$ROLLBACK_NOTE
ROLLED_BACK_FROM_API_IMAGE=$CURRENT_API_IMAGE
ROLLED_BACK_TO_API_IMAGE=$API_PREVIOUS_IMAGE
ROLLED_BACK_FROM_FRONTEND_IMAGE=$CURRENT_FRONTEND_IMAGE
ROLLED_BACK_TO_FRONTEND_IMAGE=${FRONTEND_PREVIOUS_IMAGE:-}
ROLLBACK

if [ "$SKIP_SMOKE" != "1" ] && [ -n "${DEPLOY_DIR:-}" ] && [ -x "${DEPLOY_DIR:-}/scripts/smoke-test.sh" ]; then
  log "Running smoke test"
  cd "$DEPLOY_DIR"
  ./scripts/smoke-test.sh
  write_release_record "passed"
else
  write_release_record "skipped"
fi

log "Rollback complete"
printf 'ROLLBACK_RECORD=%s\n' "$ROLLBACK_RECORD"
EOF

log "Remote rollback finished"
