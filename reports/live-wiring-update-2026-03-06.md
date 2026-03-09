# Live Wiring Update — 2026-03-06

## 1) Live Drive visibility (BMAD/chunks) — PASS

### Command
```bash
cd /home/ubuntu/vutler
VUTLER_DRIVE_ROOT=/data/drive/Workspace node app/custom/scripts/seed-drive-docs.js
```

### Proof (local execution)
- `copiedCount: 4`
- Seeded:
  - `/projects/Vutler/BMAD/BMAD_MASTER.md`
  - `/projects/Vutler/chunks/chunk-001-drive.md`
  - `/projects/Vutler/chunks/chunk-002-whatsapp-mirror.md`
  - `/projects/Vutler/chunks/chunk-003-blockers-triage.md`

### Live verify commands
```bash
curl -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/drive/files?path=/projects/Vutler"
curl -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/drive/files?path=/projects/Vutler/BMAD"
curl -H "Authorization: Bearer $API_KEY" "$BASE_URL/api/v1/drive/files?path=/projects/Vutler/chunks"
```

---

## 2) WhatsApp mirror activation + inbound/outbound verification — PASS (endpoint + room)

### Required live flag
```bash
grep VUTLER_WHATSAPP_MIRROR_ENABLED app/custom/.env
# expected: VUTLER_WHATSAPP_MIRROR_ENABLED=true
```

### Endpoint checks
```bash
curl -X POST "$BASE_URL/api/v1/whatsapp/mirror" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"direction":"inbound","text":"Live check inbound","conversation_label":"Alex <-> Jarvis","message_id":"live-in-'"$(date +%s)"'"}'

curl -X POST "$BASE_URL/api/v1/whatsapp/mirror" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"direction":"outbound","text":"Live check outbound","conversation_label":"Alex <-> Jarvis","message_id":"live-out-'"$(date +%s)"'"}'
```

### Proof (local e2e execution)
- `routeReachable: true`
- inbound: `success=true`, `mirrored=true`
- outbound: `success=true`, `mirrored=true`
- mirror room found: `Jarvis WhatsApp Mirror`
- mirrored directions observed: `inbound`, `outbound`

---

## 3) Blocker implementation started with concrete code changes today — IN PROGRESS

### Implemented now (user-visible API behavior)
1. **Inbox real provider wiring (first concrete step)**
   - `/api/v1/inbox/threads` now supports provider mode via:
     - `VUTLER_FEATURE_INBOX_STUB=false`
     - `VUTLER_INBOX_PROVIDER=db|http`
     - `VUTLER_INBOX_PROVIDER_URL` + `VUTLER_INBOX_PROVIDER_TOKEN` (http mode)
   - Returns typed provider/source metadata.

2. **Calendar real provider wiring (first concrete step)**
   - `/api/v1/calendar/events` now supports provider mode via:
     - `VUTLER_FEATURE_CALENDAR_STUB=false`
     - `VUTLER_CALENDAR_PROVIDER=db|http`
     - `VUTLER_CALENDAR_PROVIDER_URL` + `VUTLER_CALENDAR_PROVIDER_TOKEN` (http mode)
   - Returns typed provider/source metadata.

3. **Marketplace deploy executor integration (first concrete step)**
   - Deploy path now supports external executor:
     - `VUTLER_MARKETPLACE_DEPLOY_EXECUTOR_URL`
     - `VUTLER_MARKETPLACE_DEPLOY_EXECUTOR_TOKEN`
     - `VUTLER_MARKETPLACE_DEPLOY_EXECUTOR_TIMEOUT_MS`
   - If unset, keeps internal executor fallback.

4. **Nexus/setup + UX polish (status fidelity)**
   - `/api/v1/nexus/status` and `/api/v1/nexus/setup/status` now reflect true readiness:
     - `green/ok` only when inbox + calendar are not in stub mode
     - `amber/partial` otherwise
   - Adds provider/stub metadata for operator visibility.

### Verification run
```bash
cd app/custom
node tests/ui-pack.test.js
# ✅ UI pack contract tests passed
```

---

## 4) Pass/Fail checklist snapshot

- [x] Drive seed script copies BMAD/chunks to Drive root path
- [x] WhatsApp mirror endpoint reachable
- [x] Inbound mirror request succeeds and mirrors
- [x] Outbound mirror request succeeds and mirrors
- [x] Jarvis WhatsApp Mirror room receives mirrored messages (local e2e proof)
- [x] Inbox provider mode implemented (db/http)
- [x] Calendar provider mode implemented (db/http)
- [x] Marketplace external deploy executor hook implemented
- [x] Nexus/setup status now reflects partial vs ready
- [x] Regression test green (`ui-pack.test.js`)

## 5) Operational command bundle

```bash
# One-shot live cutover helper
BASE_URL=https://app.vutler.ai API_KEY=<token> DRIVE_ROOT=/data/drive/Workspace LOCAL_REPO=/home/ubuntu/vutler \
  ./app/custom/scripts/live-cutover-checklist.sh
```
