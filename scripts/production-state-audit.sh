#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_USER="${VUTLER_DEPLOY_USER:-ubuntu}"
REMOTE_HOST="${VUTLER_DEPLOY_HOST:-83.228.222.180}"
SSH_KEY="${VUTLER_DEPLOY_SSH_KEY:-$HOME/.ssh/vps-ssh-key.pem}"
RUN_SMOKE=0
STRICT=0

usage() {
  cat <<'EOF'
Usage: ./scripts/production-state-audit.sh [options]

Options:
  --host <host>   Override VPS host. Default: 83.228.222.180
  --user <user>   Override SSH user. Default: ubuntu
  --key <path>    Override SSH private key path.
  --smoke         Run smoke test on the VPS after the state audit
  --strict        Exit non-zero on unhealthy API, pending migrations, or mixed owners
  -h, --help      Show this help
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
    --smoke)
      RUN_SMOKE=1
      shift
      ;;
    --strict)
      STRICT=1
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

require_cmd ssh
[ -f "$SSH_KEY" ] || fail "SSH key not found: $SSH_KEY"

SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=no)
SSH_TARGET="${REMOTE_USER}@${REMOTE_HOST}"

log "Auditing production state on $SSH_TARGET"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" bash -s -- "$RUN_SMOKE" "$STRICT" <<'EOF'
set -euo pipefail

RUN_SMOKE="$1"
STRICT="$2"
RELEASE_FILE=/home/ubuntu/vutler-deploy/current-release.env
REPO_ROOT=/home/ubuntu/vutler
WARNINGS=0
FAILURES=0

section() {
  printf '\n[%s]\n' "$1"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
  WARNINGS=$((WARNINGS + 1))
}

strict_fail() {
  printf 'FAIL: %s\n' "$*" >&2
  FAILURES=$((FAILURES + 1))
}

container_exists() {
  docker ps -aqf "name=^$1$" | grep -q .
}

container_health() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$1" 2>/dev/null || echo missing
}

container_image() {
  docker inspect -f '{{.Config.Image}}' "$1" 2>/dev/null || echo missing
}

container_image_id() {
  docker inspect -f '{{.Image}}' "$1" 2>/dev/null || echo missing
}

container_env_value() {
  local container_name=$1
  local env_name=$2
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container_name" 2>/dev/null \
    | sed -n "s/^${env_name}=//p" | head -1
}

section "release"
if [ -f "$RELEASE_FILE" ]; then
  cat "$RELEASE_FILE"
  # shellcheck disable=SC1090
  . "$RELEASE_FILE"
else
  echo "current_release_file=missing"
  warn "Current release file is missing: $RELEASE_FILE"
fi

section "containers"
for name in vutler-api vutler-sandbox-worker vutler-frontend; do
  if container_exists "$name"; then
    printf '%s_health=%s\n' "$name" "$(container_health "$name")"
    printf '%s_image=%s\n' "$name" "$(container_image "$name")"
    printf '%s_image_id=%s\n' "$name" "$(container_image_id "$name")"
    printf '%s_revision=%s\n' "$name" "$(container_env_value "$name" VUTLER_RELEASE_REVISION)"
    printf '%s_method=%s\n' "$name" "$(container_env_value "$name" VUTLER_RELEASE_METHOD)"
    printf '%s_deployed_at=%s\n' "$name" "$(container_env_value "$name" VUTLER_RELEASE_DEPLOYED_AT)"
  else
    printf '%s=missing\n' "$name"
    [ "$name" = "vutler-frontend" ] || warn "Container missing: $name"
  fi
done

API_HEALTH="$(container_health vutler-api)"
API_REVISION="$(container_env_value vutler-api VUTLER_RELEASE_REVISION)"
WORKER_REVISION="$(container_env_value vutler-sandbox-worker VUTLER_RELEASE_REVISION)"
if [ -n "${DEPLOY_COMMIT:-}" ] && [ -n "$API_REVISION" ] && [ "$DEPLOY_COMMIT" != "$API_REVISION" ]; then
  warn "current-release commit ($DEPLOY_COMMIT) differs from live API revision ($API_REVISION)"
fi
if [ -n "$API_REVISION" ] && [ -n "$WORKER_REVISION" ] && [ "$API_REVISION" != "$WORKER_REVISION" ]; then
  warn "API and sandbox worker revisions differ"
fi

section "repo"
if [ -d "$REPO_ROOT/.git" ]; then
  printf 'repo_head=%s\n' "$(git -C "$REPO_ROOT" rev-parse HEAD)"
  printf 'repo_branch=%s\n' "$(git -C "$REPO_ROOT" branch --show-current)"
  printf 'repo_dirty_entries=%s\n' "$(git -C "$REPO_ROOT" status --porcelain | wc -l | tr -d ' ')"
else
  echo "repo_state=missing"
  warn "Repo root missing: $REPO_ROOT"
fi

section "migrations"
MIGRATIONS_OUTPUT="$(docker exec vutler-api node scripts/run-migrations.js --status 2>&1 || true)"
printf '%s\n' "$MIGRATIONS_OUTPUT"
PENDING_MIGRATIONS="$(printf '%s\n' "$MIGRATIONS_OUTPUT" | sed -n 's/^\[MIGRATIONS\] Pending: //p' | head -1)"
PENDING_MIGRATIONS="${PENDING_MIGRATIONS:-unknown}"

section "owners"
OWNER_JSON="$(docker exec vutler-api node scripts/audit-schema-owners.js --json 2>/dev/null || true)"
if [ -n "$OWNER_JSON" ]; then
  OWNER_SUMMARY="$(node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      const parts = (parsed.summary || []).map((entry) => `${entry.owner}:${entry.objects}/${entry.functions}`);
      process.stdout.write(parts.join(","));
    });
  ' <<<"$OWNER_JSON")"
  OWNER_COUNT="$(node -e '
    let input = "";
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      const parsed = JSON.parse(input);
      process.stdout.write(String((parsed.summary || []).length));
    });
  ' <<<"$OWNER_JSON")"
  printf 'owner_summary=%s\n' "$OWNER_SUMMARY"
  printf 'owner_count=%s\n' "$OWNER_COUNT"
else
  echo "owner_summary=unavailable"
  warn "Could not fetch owner audit from live container"
  OWNER_COUNT=unknown
fi

if [ "$RUN_SMOKE" = "1" ]; then
  section "smoke"
  if [ -x "$REPO_ROOT/scripts/smoke-test.sh" ]; then
    (cd "$REPO_ROOT" && ./scripts/smoke-test.sh)
  else
    warn "Smoke test script is missing at $REPO_ROOT/scripts/smoke-test.sh"
  fi
fi

if [ "$STRICT" = "1" ]; then
  [ "$API_HEALTH" = "healthy" ] || strict_fail "vutler-api health is $API_HEALTH"
  case "$PENDING_MIGRATIONS" in
    ''|unknown)
      strict_fail "Unable to determine pending migration count"
      ;;
    0)
      ;;
    *)
      strict_fail "Pending migrations detected: $PENDING_MIGRATIONS"
      ;;
  esac
  case "$OWNER_COUNT" in
    ''|unknown)
      strict_fail "Unable to determine schema owner count"
      ;;
    1)
      ;;
    *)
      strict_fail "Mixed schema owners detected: $OWNER_COUNT"
      ;;
  esac
fi

section "summary"
printf 'warnings=%s\n' "$WARNINGS"
printf 'failures=%s\n' "$FAILURES"

if [ "$FAILURES" -gt 0 ]; then
  exit 1
fi
EOF
