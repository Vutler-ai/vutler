#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=/home/ubuntu/vutler
DEPLOY_ROOT=/home/ubuntu/vutler-deploy
REVISION="${1:-HEAD}"
SHORT_SHA="$(cd "$REPO_ROOT" && git rev-parse --short "$REVISION")"
TAG="vutler-api:${SHORT_SHA}-$(date +%Y%m%d-%H%M%S)"
ENV_FILE=/tmp/vutler-api-runtime.env
RUNBOOK_PATH="docs/runbooks/vutler-api-key-rotation.md"

require_env_var() {
  local var_name=$1
  local value
  value=$(sed -n "s/^${var_name}=//p" "$ENV_FILE" | head -1)
  if [ -z "$value" ]; then
    echo "FATAL: ${var_name} is missing from ${ENV_FILE}. Refusing deploy."
    echo "See ${RUNBOOK_PATH} before retrying."
    exit 1
  fi
}

if docker ps -aqf name='^vutler-api$' | grep -q .; then
  docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api > "$ENV_FILE"
else
  cp "$REPO_ROOT/.env" "$ENV_FILE"
fi

require_env_var "JWT_SECRET"
require_env_var "VUTLER_API_KEY"

if docker ps -aqf name='^vutler-api$' | grep -q .; then
  docker commit vutler-api "vutler-api:pre-deploy-$(date +%Y%m%d-%H%M%S)" >/dev/null || true
fi

cd "$REPO_ROOT"
git rev-parse --verify "$REVISION" >/dev/null
git worktree remove --force "$DEPLOY_ROOT" >/dev/null 2>&1 || true
git worktree add --force --detach "$DEPLOY_ROOT" "$REVISION" >/dev/null

cp "$ENV_FILE" "$DEPLOY_ROOT/.env"
rm -rf "$DEPLOY_ROOT/uploads"
ln -s "$REPO_ROOT/uploads" "$DEPLOY_ROOT/uploads"

cd "$DEPLOY_ROOT"
docker build -t "$TAG" -t vutler-api:latest .

docker rm -f vutler-api >/dev/null 2>&1 || true
docker run -d \
  --name vutler-api \
  --restart unless-stopped \
  --network vutler_vutler-network \
  -p 127.0.0.1:3001:3001 \
  --env-file "$ENV_FILE" \
  --health-cmd 'curl -f http://localhost:3001/api/v1/health || exit 1' \
  --health-interval 30s \
  --health-timeout 10s \
  --health-start-period 20s \
  --health-retries 3 \
  vutler-api:latest \
  node index.js >/dev/null

docker network connect postal2_postal-net vutler-api >/dev/null 2>&1 || true

docker rm -f vutler-sandbox-worker >/dev/null 2>&1 || true
docker run -d \
  --name vutler-sandbox-worker \
  --restart unless-stopped \
  --network vutler_vutler-network \
  --no-healthcheck \
  --env-file "$ENV_FILE" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  vutler-api:latest \
  node workers/sandbox-worker.js >/dev/null

docker network connect postal2_postal-net vutler-sandbox-worker >/dev/null 2>&1 || true

for i in $(seq 1 25); do
  s=$(docker inspect -f '{{.State.Health.Status}}' vutler-api 2>/dev/null || echo unknown)
  echo "$i $s"
  [ "$s" = "healthy" ] && break
  sleep 2
done

curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null
echo "DEPLOY_OK tag=$TAG"
echo "DEPLOY_REVISION=$(cd "$DEPLOY_ROOT" && git rev-parse HEAD)"
echo "Next: ./scripts/smoke-test.sh"
