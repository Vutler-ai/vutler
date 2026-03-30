# Memory Delivery Status
_Updated: 2026-03-30_

## Scope Delivered

The Snipara memory integration is no longer only a storage layer. It now behaves as a governed runtime memory system.

Delivered:
- shared workspace-aware memory source of truth
- canonical scopes: `instance`, `template`, `global`
- governed types, visibility, TTL, and retrieval budgets
- ranked runtime retrieval for chat and task execution
- duplicate filtering and threshold-based promotion
- periodic maintenance for short-lived cleanup and local compaction
- telemetry for extraction, promotion, retrieval bundles, and maintenance
- UI/API counts for visible, hidden, and expired memories
- unit, integration, and scenario-style memory coverage

Main implementation files:
- [sniparaMemoryService.js](/Users/alopez/Devs/Vutler/services/sniparaMemoryService.js)
- [memoryPolicy.js](/Users/alopez/Devs/Vutler/services/memoryPolicy.js)
- [memoryExtractionService.js](/Users/alopez/Devs/Vutler/services/memoryExtractionService.js)
- [memoryConsolidationService.js](/Users/alopez/Devs/Vutler/services/memoryConsolidationService.js)
- [memoryPromotionService.js](/Users/alopez/Devs/Vutler/services/memoryPromotionService.js)
- [memoryMaintenanceService.js](/Users/alopez/Devs/Vutler/services/memoryMaintenanceService.js)
- [memoryTelemetryService.js](/Users/alopez/Devs/Vutler/services/memoryTelemetryService.js)

## Production Hotfixes Found During Deploy

The production deploy surfaced pre-existing runtime issues not specific to memory logic, but blocking the API boot.

### Hotfix chain

- `ed09960` — `Fix missing cookie-parser dependency`
- `4a891eb` — `Fix API Docker install from lockfile`
- `428c51c` — `Guard optional push routes at boot`
- `d105835` — `Fix chat runtime boot export`

## What These Hotfixes Mean

### 1. Dependency declaration drift existed

Observed:
- runtime modules required by the app were missing from `package.json`
- the old API Docker build copied only `package.json`
- this allowed lockfile drift to go unnoticed until a clean rebuild

Corrective action:
- API Dockerfile now installs from `package-lock.json` with `npm ci --omit=dev`

### 2. Optional legacy features could crash the full API

Observed:
- missing `web-push` caused push routes to crash server boot

Corrective action:
- optional route mount is guarded and skipped cleanly if the dependency is absent

### 3. Refactor residue can break boot, even if tests pass locally

Observed:
- `chatRuntime.js` still exported a removed symbol

Corrective action:
- dead export removed

## Production Validation Result

Final production recovery completed from commit:
- `d105835`

Smoke result:
- `10/10 passed`

Validated endpoints:
- health
- tasks
- tasks-v2
- sandbox
- chat
- clients
- notifications
- deployments
- nexus/status
- nexus/routing

## Remaining Work

The next memory-specific items are tracked in:
- [memory-roadmap.md](/Users/alopez/Devs/Vutler/docs/planning-artifacts/memory-roadmap.md)

Most important remaining items:
- admin/ops visibility for maintenance and telemetry
- semantic compaction beyond text dedupe
- archive and purge strategy
- usage-feedback loop for retrieval ranking
- full product eval suite across longer-lived sessions

## Operational Rule Going Forward

For production:
- deploy from a clean artifact of the pushed commit
- do not rebuild from a dirty VPS checkout

Reference:
- [production-deploy-clean-artifact.md](/Users/alopez/Devs/Vutler/docs/runbooks/production-deploy-clean-artifact.md)
