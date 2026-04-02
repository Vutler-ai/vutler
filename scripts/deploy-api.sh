#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=/home/ubuntu/vutler
DEPLOY_ROOT=/home/ubuntu/vutler-deploy
REVISION="${1:-HEAD}"
SHORT_SHA="$(cd "$REPO_ROOT" && git rev-parse --short "$REVISION")"
TAG="vutler-api:${SHORT_SHA}-$(date +%Y%m%d-%H%M%S)"
ENV_FILE=/tmp/vutler-api-runtime.env
RUNBOOK_PATH="docs/runbooks/vutler-api-key-rotation.md"
RELEASES_DIR="$DEPLOY_ROOT/releases"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DEPLOY_METHOD="deploy-api"
SMOKE_STATUS="health-only"

write_release_record() {
  local api_image_id worker_image_id release_file

  mkdir -p "$RELEASES_DIR"
  api_image_id="$(docker inspect -f '{{.Image}}' vutler-api 2>/dev/null || true)"
  worker_image_id="$(docker inspect -f '{{.Image}}' vutler-sandbox-worker 2>/dev/null || true)"
  release_file="${RELEASES_DIR}/${DEPLOYED_AT//:/-}-${SHORT_SHA}.env"

  cat > "$release_file" <<EOF
DEPLOY_METHOD=$DEPLOY_METHOD
DEPLOYED_AT=$DEPLOYED_AT
DEPLOY_REVISION=$(cd "$DEPLOY_ROOT" && git rev-parse HEAD)
DEPLOY_SHORT_SHA=$SHORT_SHA
DEPLOY_TAG=$TAG
SMOKE_STATUS=$SMOKE_STATUS
API_IMAGE_ID=$api_image_id
WORKER_IMAGE_ID=$worker_image_id
EOF

  cp "$release_file" "$DEPLOY_ROOT/current-release.env"
}

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
  -e "VUTLER_RELEASE_METHOD=$DEPLOY_METHOD" \
  -e "VUTLER_RELEASE_REVISION=$(cd "$DEPLOY_ROOT" && git rev-parse HEAD)" \
  -e "VUTLER_RELEASE_SHORT_SHA=$SHORT_SHA" \
  -e "VUTLER_RELEASE_TAG=$TAG" \
  -e "VUTLER_RELEASE_DEPLOYED_AT=$DEPLOYED_AT" \
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
  -e "VUTLER_RELEASE_METHOD=$DEPLOY_METHOD" \
  -e "VUTLER_RELEASE_REVISION=$(cd "$DEPLOY_ROOT" && git rev-parse HEAD)" \
  -e "VUTLER_RELEASE_SHORT_SHA=$SHORT_SHA" \
  -e "VUTLER_RELEASE_TAG=$TAG" \
  -e "VUTLER_RELEASE_DEPLOYED_AT=$DEPLOYED_AT" \
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
write_release_record
echo "DEPLOY_OK tag=$TAG"
echo "DEPLOY_REVISION=$(cd "$DEPLOY_ROOT" && git rev-parse HEAD)"
echo "Next: ./scripts/smoke-test.sh"
