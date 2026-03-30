#!/bin/bash
# Post-deploy smoke test — mandatory after every deploy
set -euo pipefail

BASE="${VUTLER_SMOKE_BASE:-http://127.0.0.1:3001}"
DEFAULT_WORKSPACE_ID="${VUTLER_SMOKE_WORKSPACE_ID:-00000000-0000-0000-0000-000000000001}"
PASS=0; FAIL=0; TOTAL=0

API_ENV="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api 2>/dev/null || true)"
API_KEY="${VUTLER_API_KEY:-$(printf '%s\n' "$API_ENV" | sed -n 's/^VUTLER_API_KEY=//p' | head -1)}"
JWT_SECRET="${VUTLER_SMOKE_JWT_SECRET:-$(printf '%s\n' "$API_ENV" | sed -n 's/^JWT_SECRET=//p' | head -1)}"

AUTH_MODE=""
AUTH_HEADER=""
EXTRA_HEADER=""
CURL_HEADERS=()

if [ -n "${API_KEY:-}" ]; then
  AUTH_MODE="api_key"
  AUTH_HEADER="Authorization: Bearer $API_KEY"
  EXTRA_HEADER="X-API-Key: $API_KEY"
elif [ -n "${JWT_SECRET:-}" ]; then
  AUTH_MODE="jwt"
  TOKEN="$(
    JWT_SECRET="$JWT_SECRET" DEFAULT_WORKSPACE_ID="$DEFAULT_WORKSPACE_ID" node <<'NODE'
const crypto = require('crypto');
const secret = process.env.JWT_SECRET;
const workspaceId = process.env.DEFAULT_WORKSPACE_ID;
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  userId: 'smoke-test',
  email: 'smoke@local.test',
  role: 'admin',
  workspaceId,
  exp: Math.floor(Date.now() / 1000) + 3600
})).toString('base64url');
const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
process.stdout.write(`${header}.${payload}.${sig}`);
NODE
  )"
  AUTH_HEADER="Authorization: Bearer $TOKEN"
else
  echo "❌ Missing authentication material: neither VUTLER_API_KEY nor JWT_SECRET is available from env or vutler-api container"
  exit 1
fi

CURL_HEADERS=(-H "$AUTH_HEADER")
if [ -n "${EXTRA_HEADER:-}" ]; then
  CURL_HEADERS+=(-H "$EXTRA_HEADER")
fi

check() {
  local name=$1 url=$2 expected=$3
  local body_file
  body_file=$(mktemp)
  TOTAL=$((TOTAL+1))
  code=$(curl -sS -o "$body_file" -w '%{http_code}' "${CURL_HEADERS[@]}" "$BASE$url" 2>/dev/null || echo 000)
  if [ "$code" = "$expected" ]; then
    echo "✅ $name ($code)"
    PASS=$((PASS+1))
  else
    local body
    body=$(tr '\n' ' ' < "$body_file" | cut -c1-180)
    echo "❌ $name (got $code, expected $expected)"
    [ -n "$body" ] && echo "   body: $body"
    FAIL=$((FAIL+1))
  fi
  rm -f "$body_file"
}

echo "🔍 Vutler Post-Deploy Smoke Test"
echo "================================"
echo "Auth mode: $AUTH_MODE"
check "health"        "/api/v1/health"           200
check "tasks"         "/api/v1/tasks"            200
check "tasks-v2"      "/api/v1/tasks-v2"         200
check "sandbox"       "/api/v1/sandbox/executions" 200
check "chat"          "/api/v1/chat/channels"    200
check "clients"       "/api/v1/clients"          200
check "notifications" "/api/v1/notifications"    200
check "deployments"   "/api/v1/deployments"      200
check "nexus/status"  "/api/v1/nexus/status"     200
check "nexus/routing" "/api/v1/nexus/routing"    200

echo "================================"
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "🎉 ALL PASS" || echo "⚠️  FAILURES DETECTED"
exit $FAIL
