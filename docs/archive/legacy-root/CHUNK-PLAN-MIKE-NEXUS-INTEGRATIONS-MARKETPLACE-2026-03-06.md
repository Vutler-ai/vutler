# Chunk Plan — Mike (Nexus + Integrations + Marketplace/Templates)

**Date:** 2026-03-06
**Reference BMAD:** `projects/vutler/docs/BMAD-NEXUS-INTEGRATIONS-MARKETPLACE-TEMPLATES-2026-03-06.md`

## Chunk 1 — Runtime status contract (P0)
- Verify/normalize payload contract for:
  - `GET /api/v1/nexus/status`
  - `GET /api/v1/setup/status`
- Add contract-level tests + docs examples
- Ensure backward compatibility for frontend consumers

**Done when**
- Contract is stable and documented
- Tests green for success + degraded + not configured states

---

## Chunk 2 — Routing determinism + observability (P0)
- Finalize route decision matrix (`local` vs `cloud`)
- Persist minimal metadata for diagnostics (reason/score/provider/model)
- Add explicit override behavior tests

**Done when**
- Same input/context yields same route
- Logs/metadata sufficient for UI hint + debugging

---

## Chunk 3 — Integration execution hardening (P0)
- Wire `executeIntegration(...)` into all critical providers/actions in scope
- Enforce taxonomy mapping everywhere
- Add retry guardrails (transient-only, bounded)
- Add failure-path tests (auth, rate-limit, provider error)

**Done when**
- No raw provider errors leak to API responses
- Retry behavior deterministic and test-covered

---

## Chunk 4 — Template deploy integrity (P0)
- Enforce schema validation on create/update/deploy paths
- Ensure deploy transaction integrity:
  - clone template to concrete agent config
  - write deployment record
- Add rollback behavior test on partial failure

**Done when**
- Invalid schema returns `422` with actionable details
- Deploy always produces consistent data or no data (atomic behavior)

---

## Chunk 5 — Integration test path (P1 prep)
- Add integration tests for full lifecycle:
  - marketplace template -> deploy -> runtime start -> integration execution
- Add seed fixtures for deterministic CI runs

**Done when**
- One end-to-end test covers full value path
- CI can run this suite without manual stack tweaks

---

## Reporting format expected from Mike
1. Chunk completed
2. Files changed
3. Tests added/updated
4. Remaining risk/blocker
5. Next chunk recommendation
