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

echo "[1/4] Seed Drive docs"
VUTLER_DRIVE_ROOT="$DRIVE_ROOT" node app/custom/scripts/seed-drive-docs.js >/tmp/vutler-seed.json || fail "Drive seed script failed"

for p in \
  "$DRIVE_ROOT/projects/Vutler/BMAD/BMAD_MASTER.md" \
  "$DRIVE_ROOT/projects/Vutler/chunks/chunk-001-drive.md" \
  "$DRIVE_ROOT/projects/Vutler/chunks/chunk-003-blockers-triage.md"
do
  [[ -f "$p" ]] || fail "Missing seeded file: $p"
done
pass "Drive files present in live root"

echo "[2/4] Verify Drive API listing"
DRIVE_JSON=$(curl -sS -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/drive/files?path=/projects/Vutler" )
echo "$DRIVE_JSON" | grep -q '"success":true' || fail "Drive API did not return success"
pass "Drive API path /projects/Vutler reachable"

echo "[3/4] Restart service (compose)"
docker compose -f app/custom/docker-compose.yml restart custom-api || fail "Failed to restart custom-api"
pass "custom-api restarted"

echo "[4/4] Summary"
echo "Drive: visible at /projects/Vutler/..."
echo "Mirror: WhatsApp mirror feature retired; no mirror room to verify anymore"
