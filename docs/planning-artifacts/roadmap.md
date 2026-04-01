# Roadmap — Vutler Platform
Last update: 2026-03-31

## Recently Delivered
Items shipped in the last ~50 commits:

- Drive Pro overhaul: richer metadata, rename/move flows, backend folder semantics, previews/fullscreen, and shared drive indexing tuned for workspaces
- Workspace gating & sessions: server-set auth/features cookies, route guards, upgrade flows, and plan-aware snapshotting keep features aligned with the UI
- Billing & providers: normalized limits, new workspace `llm_providers` table, trial/credit packs, social post quotas, and recommended plan flows from upgrade/billing pages
- Snipara & workspace context: provisioning automation, workspace drive defaults, task links, memory view clarifications, resilient knowledge fallbacks, and `soul` doc fixes
- Agent runtime hygiene: capability-aware runtime payloads, internal tool quota exemptions, and avatar path normalization/migrations for templates and workspaces
- Nexus enterprise runtime, adapters, billing observability, command health, and hardened leases/expiry tracking remain in place with Claude/Nexus integration
- Documentation extend: chat resource links roadmap + new product briefs (see docs index)

## Active — Current Sprint
Current focus, in active delivery flow:

- Documentation P1/P2 completion (SECURITY, `frontend/README`, `TOOLS`, and this roadmap) now includes actionable production readiness callouts for runtime, usage, LLM providers, and SSE observability.
- `@vutler/local-daemon` (WebSocket git-sync client)
- Provider stability monitoring
- Microsoft 365 tenant validation for Nexus enterprise OAuth
- Microsoft 365 live tenant e2e for Nexus enterprise connectors

## Planned — Next
Queued after current sprint, unless priorities change:

- Enterprise nexus webhook dispatch + async callback
- Observability dashboard: streaming SSE + provider health
- Provider compatibility matrix
- Public API documentation
- Drive pro phase 4
  - Bulk selection and batch actions
  - Server-side search and richer file metadata (`owner`, `added_by`)
  - Bulk move/delete workflows and stronger file-management ergonomics
- Memory quality program for Snipara-backed agents
  - Evaluation suite for recall precision, false recalls, and prompt pollution
  - Better promotion and summary quality across instance/template/workspace scopes
  - Runtime memory observability for mode, retrieval quality, token budget, and fallback rate

## Deferred — Not in Active Flow
Explicitly not in the current execution lane:

- LiveKit integration  
  Re-entry only with explicit go from Alex
- CLI exploratory scope
- Agent self-evolution (OpenSpace-style)  
  Revisit when runtime is mature

## Re-entry Criteria
A deferred item can return to active planning only if:

- Explicit go/no-go from Alex
- Clear owner (`*-local`) and measurable acceptance criteria
- No dependency conflict with active priorities

## Removed
No longer planned:

- Rocket.Chat integration
- MongoDB stack
- MiniMax provider
```

Si tu veux, je peux aussi te faire une version un peu plus “produit/executive”, ou une version plus “engineering roadmap” avec statuts visuels (`Delivered / Active / Planned / Deferred / Removed`).
