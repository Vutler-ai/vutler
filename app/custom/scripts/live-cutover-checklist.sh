#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   BASE_URL=https://app.vutler.ai API_KEY=... ./app/custom/scripts/live-cutover-checklist.sh
# Optional:
#   DRIVE_ROOT=/data/drive/Workspace
#   LOCAL_REPO=/home/ubuntu/vutler

: "${BASE_URL:?BASE_URL is required}"
: "${API_KEY:?API_KEY is required}"

DRIVE_ROOT="${DRIVE_ROOT:-/data/drive/Workspace}"
LOCAL_REPO="${LOCAL_REPO:-/home/ubuntu/vutler}"

pass() { echo "PASS: $*"; }
fail() { echo "FAIL: $*"; exit 1; }

cd "$LOCAL_REPO"

echo "[1/5] Seed Drive docs"
VUTLER_DRIVE_ROOT="$DRIVE_ROOT" node app/custom/scripts/seed-drive-docs.js >/tmp/vutler-seed.json || fail "Drive seed script failed"

for p in \
  "$DRIVE_ROOT/projects/Vutler/BMAD/BMAD_MASTER.md" \
  "$DRIVE_ROOT/projects/Vutler/chunks/chunk-001-drive.md" \
  "$DRIVE_ROOT/projects/Vutler/chunks/chunk-002-whatsapp-mirror.md" \
  "$DRIVE_ROOT/projects/Vutler/chunks/chunk-003-blockers-triage.md"
do
  [[ -f "$p" ]] || fail "Missing seeded file: $p"
done
pass "Drive files present in live root"

echo "[2/5] Verify Drive API listing"
DRIVE_JSON=$(curl -sS -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/drive/files?path=/projects/Vutler" )
echo "$DRIVE_JSON" | grep -q '"success":true' || fail "Drive API did not return success"
pass "Drive API path /projects/Vutler reachable"

echo "[3/5] Enable WhatsApp mirror flag"
if grep -q '^VUTLER_WHATSAPP_MIRROR_ENABLED=' app/custom/.env; then
  sed -i.bak 's/^VUTLER_WHATSAPP_MIRROR_ENABLED=.*/VUTLER_WHATSAPP_MIRROR_ENABLED=true/' app/custom/.env
else
  echo 'VUTLER_WHATSAPP_MIRROR_ENABLED=true' >> app/custom/.env
fi
pass "Mirror flag set in app/custom/.env"

echo "[4/5] Restart service (compose)"
docker compose -f app/custom/docker-compose.yml restart custom-api || fail "Failed to restart custom-api"
pass "custom-api restarted"

echo "[5/5] Live mirror inbound+outbound checks"
INBOUND=$(curl -sS -X POST "$BASE_URL/api/v1/whatsapp/mirror" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"direction":"inbound","text":"Live check inbound","conversation_label":"Alex <-> Jarvis","message_id":"live-in-'"$(date +%s)'""}')

echo "$INBOUND" | grep -q '"success":true' || fail "Inbound mirror failed"

echo "$INBOUND" | grep -q '"mirrored":true' || fail "Inbound not mirrored"

OUTBOUND=$(curl -sS -X POST "$BASE_URL/api/v1/whatsapp/mirror" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"direction":"outbound","text":"Live check outbound","conversation_label":"Alex <-> Jarvis","message_id":"live-out-'"$(date +%s)'""}')

echo "$OUTBOUND" | grep -q '"success":true' || fail "Outbound mirror failed"

echo "$OUTBOUND" | grep -q '"mirrored":true' || fail "Outbound not mirrored"

pass "Live inbound/outbound mirror API checks passed"

echo "=== SUMMARY ==="
echo "Drive: visible at /projects/Vutler/..."
echo "Mirror: enabled and API verified for inbound/outbound"
echo "Next: open room 'Jarvis WhatsApp Mirror' in UI and confirm last two messages"
