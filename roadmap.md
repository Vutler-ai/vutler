# Roadmap — Vutler Platform
Last update: 2026-03-31

## Recently Delivered
Items shipped in the last ~50 commits:

- Codex provider: ChatGPT OAuth, Responses API, SSE streaming
- MCP Nexus Bridge + Claude Code integration
- Post for Me social media + Stripe addon packs
- Security hardening: audit P0/P1/P2 + sandbox auth
- Domain split: `vutler.ai` / `app.vutler.ai`
- Agent type wizard + skill limits
- GPT-5.4 model lineup
- Documentation rewrite P0
- Nexus enterprise runtime: live command queue, progress streaming, real e2e runtime validation
- Nexus enterprise adapters: Google Workspace + Microsoft 365 provider routing and source visibility
- Nexus billing visibility: plan quotas and remaining local/enterprise capacity surfaced in the Nexus UI
- Nexus runtime observability: command health, retries, timings, and per-node command history
- Nexus command channel hardening: leases, requeue on stale claim, command expiry, attempt tracking, e2e validation

## Active — Current Sprint
Current focus, in active delivery flow:

- Documentation P1/P2 completion
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
