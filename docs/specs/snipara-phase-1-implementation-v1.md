# Snipara Phase 1 Implementation V1
> **Type:** Technical Spec
> **Status:** Implemented
> **Date:** 2026-04-11

## Goal

Ship the first high-value Snipara expansion slice without changing Vutler's runtime ownership model.

Phase 1 covers:
- Snipara index health and search analytics
- Memory V2 lifecycle controls
- htask policy and metrics visibility where supported

It explicitly does not cover:
- replacing orchestration with RLM Runtime
- client bootstrap tooling for `@vutler/mcp`
- full Integrator API adoption

## Product Outcome

After this slice:
- operators can see whether low autonomy comes from bad context quality or blocked capability
- agent memory can be reviewed with evidence and lifecycle controls instead of only create/delete/promote
- Snipara hierarchical task policy becomes visible enough to debug governance mismatches

## Implementation Notes

Implemented in:
- `d819f13` `feat: add snipara memory lifecycle and health endpoints`
- `4744fdb` `feat: surface snipara lifecycle and autonomy signals`

Delivered:
- Snipara gateway wrappers for memory lifecycle, analytics, and htask visibility
- service-layer lifecycle helpers with degraded fallback when lifecycle tools are unavailable remotely
- memory API endpoints for attach source, verify, invalidate, and supersede
- admin endpoints for index health, search analytics, htask policy, and htask metrics
- frontend lifecycle actions and status badges on the agent memory page
- workspace settings diagnostics for Snipara runtime health
- task drawer signal distinguishing context-quality degradation from missing capability

Validation notes:
- targeted Jest coverage was extended for gateway argument shaping and lifecycle degradation behavior
- local Node-based test execution was blocked in this workstation tool environment because Node processes did not exit cleanly, so final verification relied on code review plus the added tests in Git

## Exact Patch Plan

### 1. Extend The Snipara Gateway

Files:
- [services/snipara/gateway.js](/Users/alopez/Devs/Vutler/services/snipara/gateway.js:36)

Add confirmed tool wrappers from Snipara MCP docs:
- memory lifecycle
  - `rlm_memory_attach_source`
  - `rlm_memory_verify`
  - `rlm_memory_invalidate`
  - `rlm_memory_supersede`
- analytics
  - `rlm_index_health`
  - `rlm_search_analytics`

Add conditional wrappers after live verification against the workspace plan/tool list:
- `rlm_htask_policy_get`
- `rlm_htask_metrics`
- `rlm_htask_create_feature`

Implementation notes:
- keep the same grouped structure used today
- add `memory.attachSource`, `memory.verify`, `memory.invalidate`, `memory.supersede`
- add `analytics.indexHealth`, `analytics.searchAnalytics`
- add `coordination.htaskPolicyGet`, `coordination.htaskMetrics`, `coordination.htaskCreateFeature` only if confirmed in active workspace tooling

### 2. Add Service-Layer Helpers For Memory Lifecycle

Files:
- [services/sniparaMemoryService.js](/Users/alopez/Devs/Vutler/services/sniparaMemoryService.js:1)

Add service functions:
- `attachMemorySource`
- `verifyAgentMemory`
- `invalidateAgentMemory`
- `supersedeAgentMemory`

Responsibilities:
- resolve workspace and agent bindings
- normalize payloads before calling Snipara tools
- write structured governance metadata into local memory records when relevant
- return a normalized payload to the API layer

Do not:
- expose raw Snipara payloads directly to the frontend
- let the frontend decide memory governance semantics

### 3. Expand The Memory API

Files:
- [api/memory.js](/Users/alopez/Devs/Vutler/api/memory.js:1)

Add endpoints:
- `POST /api/v1/agents/:agentId/memories/:memoryId/attach-source`
- `POST /api/v1/agents/:agentId/memories/:memoryId/verify`
- `POST /api/v1/agents/:agentId/memories/:memoryId/invalidate`
- `POST /api/v1/agents/:agentId/memories/:memoryId/supersede`

Expected payload direction:
- attach source: source reference, optional evidence note
- verify: optional evidence probe parameters
- invalidate: reason, optional replacement hint
- supersede: new text plus replacement reason

Also add admin or workspace endpoints for analytics:
- `GET /api/v1/admin/snipara/index-health`
- `GET /api/v1/admin/snipara/search-analytics?days=30`
- `GET /api/v1/admin/snipara/htask-policy`
- `GET /api/v1/admin/snipara/htask-metrics`

### 4. Expand Snipara Admin Endpoints

Files:
- [api/sniparaAdmin.js](/Users/alopez/Devs/Vutler/api/sniparaAdmin.js:1)

Add:
- index health probe endpoint
- search analytics endpoint
- optional htask policy and metrics endpoints if the workspace plan exposes those tools

Design rule:
- this router remains admin-only
- return normalized Vutler response shapes
- include `success`, `data`, and clear degraded-mode error messaging

### 5. Add Frontend API Bindings

Files:
- [frontend/src/lib/api/endpoints/memory.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/endpoints/memory.ts:1)
- [frontend/src/lib/api/types.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/types.ts)

Add:
- memory lifecycle endpoint clients
- Snipara admin analytics clients
- typed response models for:
  - memory verification result
  - invalidation result
  - supersede result
  - index health
  - search analytics
  - htask policy
  - htask metrics

### 6. Add Operator UI In Existing Surfaces

Files:
- [frontend/src/app/(app)/agents/[id]/memory/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/agents/[id]/memory/page.tsx:1)
- [frontend/src/app/(app)/settings/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/settings/page.tsx:1)

Agent memory page changes:
- add lifecycle actions beside each memory
  - verify
  - invalidate
  - supersede
  - attach source
- add status badges
  - active
  - invalidated
  - superseded
  - needs verification
- show evidence/provenance summary if available

Settings page changes:
- add a Snipara admin card showing:
  - configured state
  - transport health
  - index health score
  - stale docs count
  - recent latency/error summary
  - optional htask policy summary

Keep this slice inside existing pages. Do not create a new navigation branch yet.

### 7. Thread Analytics Into Task And Autonomy Surfaces

Files:
- [frontend/src/app/(app)/tasks/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/tasks/page.tsx:1)
- [services/executionOverlayService.js](/Users/alopez/Devs/Vutler/services/executionOverlayService.js:1)

Add lightweight integration:
- when Snipara index health is below threshold, surface that as an autonomy degradation signal
- distinguish:
  - missing capability
  - blocked provider
  - stale or weak documentation context

Do not fully redesign the tasks page in this slice.
Only add enough signal to explain runtime degradation.

### 8. Tests

Files:
- [tests/snipara-gateway-workspace.test.js](/Users/alopez/Devs/Vutler/tests/snipara-gateway-workspace.test.js)
- [tests/snipara-memory-diagnostics.test.js](/Users/alopez/Devs/Vutler/tests/snipara-memory-diagnostics.test.js)
- add targeted API tests for memory lifecycle endpoints

Add tests for:
- gateway wrapper argument shaping
- API response normalization
- frontend endpoint contracts where the repo already uses this pattern
- degraded behavior when tools are unavailable or plan-gated

## Acceptance Criteria

### Operator Acceptance

- an admin can see if Snipara is configured, reachable, and healthy
- an admin can identify whether the workspace documentation index is healthy or stale
- an admin can inspect htask policy and metrics if the workspace exposes them

### Memory Acceptance

- a reviewer can verify or invalidate a memory from the agent memory page
- a reviewer can attach supporting evidence to a memory
- a reviewer can supersede outdated memory with a new canonical version

### Runtime Acceptance

- autonomy dashboards can distinguish context-quality degradation from capability blocking
- no durable run ownership moves out of Vutler

## Sequencing

Recommended order:
1. gateway wrappers
2. service-layer memory lifecycle helpers
3. admin and memory API endpoints
4. frontend API bindings
5. settings and memory UI
6. task/autonomy signal integration
7. tests

## Risks

- tool names or availability may differ by Snipara plan
- some htask tools appear in product docs but must be re-verified against the current MCP tool surface before coding
- memory lifecycle actions may require careful UI wording so operators do not confuse local visibility state with Snipara evidence state

## Non-Goals

- no RLM Runtime execution path in this phase
- no integrator workspace/client automation in this phase
- no new standalone Snipara admin area in this phase
