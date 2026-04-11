# Snipara Phase 2 Governance V1
> **Type:** Technical Spec
> **Status:** Implemented
> **Date:** 2026-04-11

## Goal

Close the main Memory Tier / Graveyard / Contradiction-Resolution gap identified during the Snipara documentation audit.

Phase 2 covers:
- first-class memory tier projection in Vutler
- graveyard handling for invalidated and superseded memories
- contradiction, resolution, and canonical-memory operator visibility

It explicitly does not cover:
- session/journal memory primitives from Snipara docs
- automatic agent-side policy for lifecycle actions
- RLM Runtime execution

## Product Outcome

After this slice:
- runtime retrieval excludes graveyard memory by default
- operators can switch between active, graveyard, and all personal memories
- superseding a memory produces a canonical replacement signal instead of only a text update
- invalidated and superseded memories stay inspectable for audit

## Implementation Notes

Implemented in:
- `cb8e6c4` `feat: add snipara memory governance rules`
- `9241869` `feat: surface snipara memory governance states`

Delivered:
- policy-layer tier derivation and graveyard eligibility in [services/memoryPolicy.js](/Users/alopez/Devs/Vutler/services/memoryPolicy.js:1)
- lifecycle projection for `tier`, `graveyard_reason`, `canonical_memory`, `contradiction_state`, and `resolution_state` in [services/sniparaMemoryService.js](/Users/alopez/Devs/Vutler/services/sniparaMemoryService.js:1)
- list filtering with `view=active|graveyard|all` in [api/memory.js](/Users/alopez/Devs/Vutler/api/memory.js:1)
- frontend badges and graveyard toggle on [frontend/src/app/(app)/agents/[id]/memory/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/agents/[id]/memory/page.tsx:1)
- targeted Jest coverage for tiering and canonical/superseded projection

## Rules Added

### Tiering

Projected tiers:
- `hot`
- `warm`
- `cold`
- `graveyard`

Current behavior:
- invalidated, superseded, and deleted memories resolve to `graveyard`
- expired or low-value non-injectable memory resolves to `cold`
- highly reused, canonical, or strongly promoted memory resolves to `hot`
- the remaining durable reviewable set resolves to `warm`

### Graveyard

Current behavior:
- graveyard memory is kept for operator audit
- graveyard memory is excluded from runtime injection by default
- the memory UI exposes a dedicated graveyard view instead of mixing stale and active records

### Contradiction / Resolution

Projected states:
- `contradiction_state`: `none`, `review_pending`, `contradicted`, `superseded`, `canonical`
- `resolution_state`: `none`, `open`, `redirected`, `resolved`

Current behavior:
- invalidated memories become contradicted and unresolved unless redirected
- superseded memories become graveyarded and resolved
- replacement memories created by supersede are marked canonical

## Validation

Validated locally on 2026-04-11:
- `npx jest tests/memory-policy.test.js tests/snipara-memory-service.test.js --runInBand`
- `pnpm exec tsc --noEmit` in `frontend/`

Lint status:
- targeted backend and frontend ESLint runs completed with no blocking errors
- existing style warnings remain on some long lines in backend memory services

## Remaining Follow-Ups

- add explicit archive semantics distinct from graveyard
- add session continuity and journal-style memory lanes where product-relevant
- add lifecycle-policy automation so agents can propose or perform safe governance actions under rules
- surface the same governance filters for shared/template memory if operators need cross-scope review
