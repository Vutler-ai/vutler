#!/usr/bin/env bash
set -euo pipefail
cd /home/ubuntu/vutler
TAG="vutler-api:$(date +%Y%m%d-%H%M%S)"
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
  cp /home/ubuntu/vutler/.env "$ENV_FILE"
fi

require_env_var "JWT_SECRET"
require_env_var "VUTLER_API_KEY"

if docker ps -aqf name='^vutler-api$' | grep -q .; then
  docker commit vutler-api "vutler-api:pre-deploy-$(date +%Y%m%d-%H%M%S)" >/dev/null || true
fi

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

for i in $(seq 1 25); do
  s=$(docker inspect -f '{{.State.Health.Status}}' vutler-api 2>/dev/null || echo unknown)
  echo "$i $s"
  [ "$s" = "healthy" ] && break
  sleep 2
done

curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null
echo "DEPLOY_OK tag=$TAG"
echo "Next: ./scripts/smoke-test.sh"
