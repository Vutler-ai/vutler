#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_REF="origin/main"
REMOTE_USER="${VUTLER_DEPLOY_USER:-ubuntu}"
REMOTE_HOST="${VUTLER_DEPLOY_HOST:-83.228.222.180}"
SSH_KEY="${VUTLER_DEPLOY_SSH_KEY:-$HOME/.ssh/vps-ssh-key.pem}"
DEPLOY_FRONTEND=0
SKIP_SMOKE=0
AUDIT_ONLY=0
SKIP_AUDIT=0
KEEP_TMP=0

usage() {
  cat <<'EOF'
Usage: ./scripts/deploy-clean-artifact.sh [options]

Options:
  --commit <ref>      Git ref to deploy. Must already be contained in origin/main.
  --frontend          Rebuild and restart vutler-frontend too.
  --skip-smoke        Skip post-deploy smoke test.
  --audit-only        Run live-container parity audit only, then exit.
  --skip-audit        Skip parity audit before deploy.
  --host <host>       Override VPS host. Default: 83.228.222.180
  --user <user>       Override SSH user. Default: ubuntu
  --key <path>        Override SSH private key path.
  --keep-tmp          Keep local temporary files after exit.
  -h, --help          Show this help.
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

cleanup() {
  if [ "${KEEP_TMP}" = "1" ] && [ -n "${TMP_DIR:-}" ] && [ -d "${TMP_DIR:-}" ]; then
    log "Keeping temporary files in $TMP_DIR"
    return
  fi
  rm -rf "${TMP_DIR:-}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --commit)
      [ $# -ge 2 ] || fail "--commit requires a value"
      TARGET_REF="$2"
      shift 2
      ;;
    --frontend)
      DEPLOY_FRONTEND=1
      shift
      ;;
    --skip-smoke)
      SKIP_SMOKE=1
      shift
      ;;
    --audit-only)
      AUDIT_ONLY=1
      shift
      ;;
    --skip-audit)
      SKIP_AUDIT=1
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
    --keep-tmp)
      KEEP_TMP=1
      shift
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

require_cmd git
require_cmd ssh
require_cmd scp
require_cmd python3
require_cmd tar

[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY"

trap cleanup EXIT
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/vutler-deploy.XXXXXX")"
MAIN_DIR="$TMP_DIR/main"
LIVE_DIR="$TMP_DIR/live"
PARITY_REPORT="$TMP_DIR/parity-report.txt"
mkdir -p "$MAIN_DIR" "$LIVE_DIR"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=no)
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

log "Fetching origin/main"
git -C "$ROOT_DIR" fetch origin --prune >/dev/null

TARGET_COMMIT="$(git -C "$ROOT_DIR" rev-parse "$TARGET_REF")"
SHORT_COMMIT="${TARGET_COMMIT:0:12}"
if ! git -C "$ROOT_DIR" merge-base --is-ancestor "$TARGET_COMMIT" origin/main; then
  fail "Refusing to deploy $TARGET_REF ($TARGET_COMMIT): commit is not contained in origin/main"
fi

log "Preparing clean artifact for $TARGET_COMMIT"
git -C "$ROOT_DIR" archive "$TARGET_COMMIT" | tar -xf - -C "$MAIN_DIR"

if [ "$SKIP_AUDIT" = "0" ]; then
  REMOTE_LIVE_DIR="/tmp/vutler-api-live-audit-$SHORT_COMMIT"
  REMOTE_LIVE_TAR="/tmp/vutler-api-live-audit-$SHORT_COMMIT.tar"

  log "Auditing live container parity against $TARGET_COMMIT"
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "rm -rf '$REMOTE_LIVE_DIR' '$REMOTE_LIVE_TAR' && mkdir -p '$REMOTE_LIVE_DIR' && docker cp vutler-api:/app/. '$REMOTE_LIVE_DIR' && tar -C '$REMOTE_LIVE_DIR' -cf '$REMOTE_LIVE_TAR' ."
  scp "${SSH_OPTS[@]}" "$SSH_TARGET:$REMOTE_LIVE_TAR" "$TMP_DIR/live.tar" >/dev/null
  tar -xf "$TMP_DIR/live.tar" -C "$LIVE_DIR"

  python3 - "$ROOT_DIR" "$MAIN_DIR" "$LIVE_DIR" > "$PARITY_REPORT" <<'PY'
import hashlib
import os
import subprocess
import sys

repo, main_dir, live_dir = sys.argv[1:4]
tracked = subprocess.check_output(['git', '-C', repo, 'ls-files'], text=True).splitlines()
missing = []
different = []
compared = 0

def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

for rel_path in tracked:
    main_path = os.path.join(main_dir, rel_path)
    live_path = os.path.join(live_dir, rel_path)
    if not os.path.isfile(main_path):
        continue
    compared += 1
    if not os.path.isfile(live_path):
        missing.append(rel_path)
        continue
    if sha256(main_path) != sha256(live_path):
        different.append(rel_path)

print(f'Compared tracked files: {compared}')
print(f'Missing in live container: {len(missing)}')
for item in missing:
    print(f'MISSING {item}')
print(f'Different from target commit: {len(different)}')
for item in different:
    print(f'DIFF {item}')
PY

  cat "$PARITY_REPORT"
  if [ "$AUDIT_ONLY" = "1" ]; then
    log "Audit-only mode complete"
    exit 0
  fi
fi

LOCAL_TAR="$TMP_DIR/vutler-deploy-$TARGET_COMMIT.tar"
REMOTE_TAR="/tmp/vutler-deploy-$TARGET_COMMIT.tar"
REMOTE_DIR="/tmp/vutler-deploy-$TARGET_COMMIT"

log "Exporting artifact tarball"
git -C "$ROOT_DIR" archive --format=tar "$TARGET_COMMIT" -o "$LOCAL_TAR"

log "Uploading artifact to $SSH_TARGET"
scp "${SSH_OPTS[@]}" "$LOCAL_TAR" "$SSH_TARGET:$REMOTE_TAR" >/dev/null

DEPLOY_LABEL="API"
if [ "$DEPLOY_FRONTEND" = "1" ]; then
  DEPLOY_LABEL="API and frontend"
fi

log "Deploying $DEPLOY_LABEL on $SSH_TARGET"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s -- "$TARGET_COMMIT" "$REMOTE_TAR" "$REMOTE_DIR" "$DEPLOY_FRONTEND" "$SKIP_SMOKE" <<'EOF'
set -euo pipefail

COMMIT="$1"
REMOTE_TAR="$2"
DEPLOY_DIR="$3"
DEPLOY_FRONTEND="$4"
SKIP_SMOKE="$5"

API_ENV_FILE=/tmp/vutler-api-runtime.env
FRONTEND_ENV_FILE=/tmp/vutler-frontend-runtime.env
ROLLBACK_FILE="$DEPLOY_DIR/rollback.env"

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

ensure_frontend_var() {
  local var_name=$1
  local default_value=$2
  if ! grep -q "^${var_name}=" "$FRONTEND_ENV_FILE" 2>/dev/null; then
    printf '%s=%s\n' "$var_name" "$default_value" >> "$FRONTEND_ENV_FILE"
  fi
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

PREV_API_IMAGE="$(docker inspect -f '{{.Image}}' vutler-api 2>/dev/null || true)"
PREV_FRONTEND_IMAGE="$(docker inspect -f '{{.Image}}' vutler-frontend 2>/dev/null || true)"

log "Extracting release to $DEPLOY_DIR"
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"
tar -xf "$REMOTE_TAR" -C "$DEPLOY_DIR"

if docker ps -aqf name='^vutler-api$' | grep -q .; then
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api > "$API_ENV_FILE"
elif [ -f /home/ubuntu/vutler/.env ]; then
  cp /home/ubuntu/vutler/.env "$API_ENV_FILE"
else
  fail "Cannot resolve API env from running container or /home/ubuntu/vutler/.env"
fi

require_env_var "$API_ENV_FILE" "JWT_SECRET"
require_env_var "$API_ENV_FILE" "VUTLER_API_KEY"

log "Building API image"
docker build -t "vutler-api:$COMMIT" -t vutler-api:latest "$DEPLOY_DIR"

log "Restarting vutler-api"
docker rm -f vutler-api >/dev/null 2>&1 || true
docker run -d \
  --name vutler-api \
  --restart unless-stopped \
  --network vutler_vutler-network \
  -p 127.0.0.1:3001:3001 \
  --env-file "$API_ENV_FILE" \
  --health-cmd 'curl -f http://localhost:3001/api/v1/health || exit 1' \
  --health-interval 30s \
  --health-timeout 10s \
  --health-start-period 20s \
  --health-retries 3 \
  vutler-api:latest \
  node index.js >/dev/null

docker network connect postal2_postal-net vutler-api >/dev/null 2>&1 || true

log "Restarting vutler-sandbox-worker"
docker rm -f vutler-sandbox-worker >/dev/null 2>&1 || true
docker run -d \
  --name vutler-sandbox-worker \
  --restart unless-stopped \
  --network vutler_vutler-network \
  --env-file "$API_ENV_FILE" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  vutler-api:latest \
  node workers/sandbox-worker.js >/dev/null

docker network connect postal2_postal-net vutler-sandbox-worker >/dev/null 2>&1 || true

if ! wait_for_health vutler-api 30 2; then
  fail "vutler-api did not become healthy"
fi

curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null

if [ "$DEPLOY_FRONTEND" = "1" ]; then
  : > "$FRONTEND_ENV_FILE"
  if docker ps -aqf name='^vutler-frontend$' | grep -q .; then
    docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-frontend \
      | sed -n '/^\(API_URL\|WS_URL\|PORT\|HOSTNAME\|NEXT_PUBLIC_[A-Z0-9_]*\)=/p' > "$FRONTEND_ENV_FILE"
  fi

  ensure_frontend_var "API_URL" "http://localhost:3001"
  ensure_frontend_var "WS_URL" "http://localhost:3001"
  ensure_frontend_var "PORT" "3002"
  ensure_frontend_var "HOSTNAME" "0.0.0.0"

  log "Building frontend image"
  docker build --no-cache -t "vutler-frontend:$COMMIT" -t vutler-frontend:latest "$DEPLOY_DIR/frontend"

  log "Restarting vutler-frontend"
  docker rm -f vutler-frontend >/dev/null 2>&1 || true
  docker run -d \
    --name vutler-frontend \
    --restart unless-stopped \
    --network host \
    --env-file "$FRONTEND_ENV_FILE" \
    vutler-frontend:latest >/dev/null

  if ! wait_for_health vutler-frontend 40 3; then
    fail "vutler-frontend did not become healthy"
  fi
fi

cat > "$ROLLBACK_FILE" <<ROLLBACK
DEPLOY_COMMIT=$COMMIT
DEPLOY_DIR=$DEPLOY_DIR
DEPLOY_TAR=$REMOTE_TAR
API_PREVIOUS_IMAGE=$PREV_API_IMAGE
FRONTEND_PREVIOUS_IMAGE=$PREV_FRONTEND_IMAGE
ROLLBACK

if [ "$SKIP_SMOKE" != "1" ]; then
  log "Running smoke test"
  cd "$DEPLOY_DIR"
  ./scripts/smoke-test.sh
fi

log "Deploy complete"
printf 'ROLLBACK_NOTE=%s\n' "$ROLLBACK_FILE"
EOF

log "Remote deploy finished for $TARGET_COMMIT"
