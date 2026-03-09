#!/bin/bash
# Post-deploy smoke test — mandatory after every deploy
set -euo pipefail

API_KEY="${VUTLER_API_KEY:-$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api 2>/dev/null | grep '^VUTLER_API_KEY=' | cut -d= -f2-)}"
BASE="http://127.0.0.1:3001"
PASS=0; FAIL=0; TOTAL=0

check() {
  local name=$1 url=$2 expected=$3
  TOTAL=$((TOTAL+1))
  code=$(curl -sS -o /dev/null -w '%{http_code}' -H "X-API-Key: $API_KEY" "$BASE$url" 2>/dev/null || echo 000)
  if [ "$code" = "$expected" ]; then
    echo "✅ $name ($code)"
    PASS=$((PASS+1))
  else
    echo "❌ $name (got $code, expected $expected)"
    FAIL=$((FAIL+1))
  fi
}

echo "🔍 Vutler Post-Deploy Smoke Test"
echo "================================"
check "health"        "/api/v1/health"           200
check "tasks"         "/api/v1/tasks"            200
check "sandbox"       "/api/v1/sandbox"          200
check "clients"       "/api/v1/clients"          200
check "notifications" "/api/v1/notifications"    200
check "deployments"   "/api/v1/deployments"      200
check "nexus/status"  "/api/v1/nexus/status"     200
check "nexus/routing" "/api/v1/nexus/routing"    200
check "routing/smoke" "/api/v1/nexus/routing/smoke" 200

echo "================================"
echo "Results: $PASS/$TOTAL passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && echo "🎉 ALL PASS" || echo "⚠️  FAILURES DETECTED"
exit $FAIL
