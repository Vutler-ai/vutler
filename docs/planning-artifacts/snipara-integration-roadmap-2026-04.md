# Snipara Integration Roadmap
_Updated: 2026-04-11_

## Scope

This roadmap reviews the Snipara documentation requested on 2026-04-11 and maps it against the current Vutler implementation.

Reviewed documentation:
- [Getting Started](https://snipara.com/docs/getting-started)
- [API Reference](https://snipara.com/docs/api)
- [Integrator API](https://snipara.com/docs/integrator)
- [MCP Tools](https://snipara.com/docs/mcp-tools)
- [Features](https://snipara.com/docs/features)
- [Agents](https://snipara.com/docs/agents)
- [Integration Guide](https://snipara.com/docs/integration)

Reviewed visible submenus relevant to product integration:
- Features: RELP, Shared Context, Automation Hooks, Workflows, GitHub Sync, RLM Runtime, Index Health & Analytics
- Agents: Agent Memory, Memory Tiers, Group Memory, Multi-Agent Coordination, Swarm Project Management
- Integration Guide: NPX setup, Claude Code, Claude Code plugin, Cursor, ChatGPT / OpenAI, Continue.dev, VS Code, Python SDK, OpenClaw, RLM Runtime, Orchestrator

This document does two things:
- decide what Snipara capability Vutler should actually integrate
- avoid integrating client-specific or duplicate runtime layers that would reduce architectural clarity

## Architectural Position

Keep the current split:
- Vutler owns the durable product runtime, approvals, task projection, agent capability gating, and user-facing audit.
- Snipara owns contextual retrieval, memory, shared context, remote swarm/task primitives, and selected runtime accelerators.
- RLM Runtime should be treated as an optional specialized execution backend for technical agents, not as Vutler's primary orchestration runtime.

This matches the current codebase:
- durable orchestration runtime in [docs/specs/autonomous-orchestration-runs-v1.md](../specs/autonomous-orchestration-runs-v1.md)
- task execution contract in [AGENTS.md](/Users/alopez/Devs/Vutler/AGENTS.md)
- Snipara gateway in [services/snipara/gateway.js](/Users/alopez/Devs/Vutler/services/snipara/gateway.js:36)
- memory runtime service in [services/memory/runtime.js](/Users/alopez/Devs/Vutler/services/memory/runtime.js:9)
- sandbox executor in [services/executors/sandboxExecutor.js](/Users/alopez/Devs/Vutler/services/executors/sandboxExecutor.js:1)
- orchestration runtime in [services/orchestration/runEngine.js](/Users/alopez/Devs/Vutler/services/orchestration/runEngine.js:1)

## Current State Summary

### Already Integrated Well

- Snipara memory read/write path
  - `rlm_remember`, `rlm_recall`, `rlm_memories`, `rlm_forget`
- contextual retrieval path
  - `rlm_context_query`, `rlm_search`, `rlm_ask`, `rlm_load_document`, `rlm_load_project`, `rlm_shared_context`
- planning primitives
  - `rlm_plan`, `rlm_decompose`
- summary storage
  - `rlm_store_summary`, `rlm_get_summaries`, `rlm_delete_summary`
- swarm/task primitives
  - `rlm_swarm_create`, `rlm_swarm_join`, `rlm_claim`, `rlm_release`, `rlm_state_get`, `rlm_state_set`, `rlm_state_poll`, `rlm_broadcast`
  - `rlm_task_create`, `rlm_task_claim`, `rlm_task_complete`, `rlm_tasks`
- hierarchical task primitives
  - `rlm_htask_create`, `rlm_htask_block`, `rlm_htask_unblock`, `rlm_htask_complete`, `rlm_htask_verify_closure`, `rlm_htask_close`
- webhook ingestion for task and htask lifecycle events

### Partially Integrated

- shared memory runtime
  - present, but still centered on Vutler's own memory shaping rather than full Snipara Memory V2 lifecycle semantics
- swarm PM
  - core htask flow exists, but not the full documented policy and metrics surface
- automation / continuity
  - repo hooks exist for sync and persistence, but productized workspace-level automation coverage is still limited
- RLM Runtime
  - historical usage and helper scripts exist, but there is no active production integration as a runtime backend

### Not Yet Integrated In Product Runtime

- Memory V2 lifecycle controls from Snipara docs
  - evidence attachment, verification, invalidation, superseding stale memory
- memory tiers / session memory / journal style primitives
- advanced shared-context and RELP helper tools
  - template and shared collection management
  - multi-query / multi-project retrieval helpers
  - REPL inject/extract helpers
- index health and search analytics tools
- full GitHub push-triggered sync as a first-class workspace product surface
- RLM Runtime as an optional executor for technical autonomous phases
- integrator workspace/client lifecycle APIs
- client bootstrap ergonomics comparable to Snipara's `create-snipara`

## Gap Matrix

### 1. Agent Memory V2

Snipara docs emphasize more than semantic storage and recall:
- evidence links
- verification
- invalidation
- superseding stale knowledge
- safer memory lifecycle controls

Vutler today exposes only the simpler memory path in the shared gateway:
- [services/snipara/gateway.js](/Users/alopez/Devs/Vutler/services/snipara/gateway.js:42)

What is missing:
- gateway wrappers for documented Memory V2 controls
- runtime policy on when an agent may verify, invalidate, or supersede a memory
- operator UI showing memory lifecycle state and provenance

Recommendation:
- high priority
- add these primitives to the gateway first, then expose them to internal runtime services, not directly to every prompt by default

### 2. Memory Tiers, Session Continuity, and Compaction

Snipara docs highlight:
- memory tiers
- session continuity
- compaction-safe recall
- structured persistence across resets

Vutler already has:
- scoped memory bundles
- summary storage
- local extraction pipelines
- maintenance and consolidation work in progress

Relevant local references:
- [docs/planning-artifacts/memory-roadmap.md](memory-roadmap.md)
- [services/memory/runtime.js](/Users/alopez/Devs/Vutler/services/memory/runtime.js:15)
- [services/memory/writePipeline.js](/Users/alopez/Devs/Vutler/services/memory/writePipeline.js:9)

What is missing:
- explicit session-memory concept mapped to chat/task/runtime episodes
- first-class tiering aligned with Snipara's documented model
- journal/profile style primitives if they become product-relevant

Recommendation:
- medium priority
- align Vutler memory roadmap with Snipara's tiered model instead of inventing a parallel taxonomy

### 3. Group Memory and Multi-Agent Coordination

Snipara docs position shared memory as a first-class layer across agents and teammates.

Vutler today has:
- shared context retrieval
- swarm state primitives
- orchestration-driven delegation
- task and htask projection

What is missing:
- explicit group memory product surface in Vutler
- promoted discoveries that become shared operational knowledge across agent cohorts
- governance around who can write shared memory and who can consume it

Recommendation:
- medium priority
- implement group memory as a governed workspace layer above current shared-context usage

### 4. Swarm Project Management Depth

Snipara Swarm PM docs add more than basic `htask` CRUD:
- `rlm_htask_create_feature`
- `rlm_htask_policy_get`
- metrics / observability around htasks
- stronger policy-driven governance
- configurable closure and evidence rules

Vutler today has the core lifecycle and webhook loop:
- [services/sniparaTaskAdapter.js](/Users/alopez/Devs/Vutler/services/sniparaTaskAdapter.js:149)
- [api/sniparaWebhook.js](/Users/alopez/Devs/Vutler/api/sniparaWebhook.js:48)

What is missing:
- feature scaffolding helper usage
- policy read/write awareness in product logic
- htask metrics surfaced to operators
- swarm timeout tuning surfaced from docs such as `rlm_swarm_update`

Recommendation:
- high priority
- this is one of the clearest product wins because Vutler already depends on task projection and delegation

### 5. RELP and Advanced Retrieval Helpers

Snipara features and MCP docs describe a broader retrieval surface:
- RELP recursive context
- `rlm_multi_query`
- `rlm_multi_project_query`
- template and shared collection helpers
- REPL injection / extraction helpers

Vutler today mostly uses:
- `rlm_context_query`
- `rlm_search`
- `rlm_ask`
- `rlm_load_document`
- `rlm_load_project`
- `rlm_shared_context`

What is missing:
- recursive retrieval patterns surfaced in runtime heuristics
- multi-source retrieval for complex research/planning tasks
- shared template management if Vutler wants reusable workspace instructions
- `rlm_upload_shared_document` if shared collections become a product primitive

Recommendation:
- medium priority
- prioritize multi-query and shared collection/template flows before REPL-specific helper tools

### 6. Automation Hooks and GitHub Sync

Snipara features docs highlight:
- compaction/session hooks
- GitHub push-driven re-indexing
- automation continuity as a product behavior

Vutler today has:
- repo hooks and sync scripts
- custom memory sync handlers
- manual and script-driven document sync

What is missing:
- a first-class workspace feature for repository sync status, last successful sync, and failure handling
- explicit runtime/session hook model in product settings
- operator visibility for source freshness

Recommendation:
- high priority for Git-backed workspaces
- medium priority for generic hook management

### 7. Index Health and Search Analytics

Snipara docs expose:
- health scores
- coverage
- freshness
- latency percentiles
- tool usage breakdown
- actionable recommendations
- MCP tools like `rlm_index_health` and `rlm_search_analytics`

Vutler today does not appear to surface Snipara index quality as an operator-facing product capability.

What is missing:
- workspace admin dashboard for index health
- runtime observability tied to context quality, stale docs, and recall quality
- alerts or upgrade recommendations when documentation quality blocks autonomous runs

Recommendation:
- high priority
- this is a strong leverage area because bad context quality degrades both chat and task autonomy

### 8. RLM Runtime

Snipara docs describe:
- autonomous observe-think-act loops
- sub-LLM orchestration
- sandboxed code execution
- trajectory logging
- MCP server integration

Vutler already has:
- a durable run engine
- its own governed sandbox
- task retries, approvals, verification, and wake/sleep logic

What is missing:
- optional `rlm-executor` style backend for technical agents
- bounded technical inner loops where sandbox alone is too shallow

Recommendation:
- high priority, but strictly as an optional technical executor
- not recommended as a replacement for Vutler's orchestration runtime

### 9. Integrator API

Snipara integrator docs describe:
- workspace lifecycle
- client lifecycle
- bundle enforcement
- webhook event logs
- retry/test endpoints
- client API keys for downstream consumers

This is relevant only if Vutler wants to operate Snipara as a managed substrate across many external client workspaces or automate client provisioning deeply.

What is missing:
- no strong product evidence yet that Vutler needs the full integrator model

Recommendation:
- deferred unless Vutler explicitly productizes third-party project provisioning or reseller-style tenant management

### 10. Client Integration and Distribution Ergonomics

Snipara's integration guide is not only about MCP connectivity. It also shows a polished distribution model:
- one-command bootstrap with `create-snipara`
- explicit config examples per client
- Python SDK
- OpenAI / ChatGPT positioning

For Vutler this matters mainly for the public MCP package:
- [packages/mcp/](../../packages/mcp)
- [packages/mcp-server/README.md](/Users/alopez/Devs/Vutler/packages/mcp-server/README.md:1)

What is missing:
- a comparable quick-start path for `@vutler/mcp`
- stronger cross-client setup docs
- possible installer/bootstrap helper for `@vutler/mcp`

Recommendation:
- medium priority
- important for external adoption, but not a runtime blocker

## Prioritized Roadmap

### Phase 1 - Tighten The Existing Snipara Core

Target: next 2-4 weeks

Deliver:
- add gateway support for Memory V2 lifecycle controls
- expose Snipara index health and search analytics in workspace admin surfaces
- add htask policy and metrics awareness to orchestration and operator tooling
- formalize GitHub / document freshness sync status in workspace settings

Done when:
- operators can explain whether autonomy failures came from missing capability, stale context, or blocked task policy
- Snipara-backed workspaces show health, freshness, and task policy state without reading logs

Status update 2026-04-11:
- implemented in Vutler branch `codex/vrifier-intgration-sandbox`
- shipped backend lifecycle/admin endpoints plus operator UI in memory, settings, and task autonomy surfaces
- RLM Runtime remains intentionally deferred to Phase 2

### Phase 2 - Add Specialized Technical Autonomy

Target: after Phase 1

Deliver:
- add an optional `rlm-executor` for technical agents
- route only bounded technical phases to RLM Runtime
- keep Vutler run engine as the source of truth for run lifecycle and approvals

Done when:
- technical agents can iteratively solve code/data problems with stronger inner loops
- no duplicate run-state authority is introduced

### Phase 3 - Deepen Shared Context And Team Memory

Target: after Phase 2

Deliver:
- group memory product surface
- shared templates / shared collections support where relevant
- multi-query retrieval for complex planning and investigation flows
- memory tier alignment between Vutler and Snipara models

Done when:
- one agent's durable discovery can be reused safely by other agents
- workspace-wide instructions and standards are inspectable, governed, and reusable

### Phase 4 - Improve Distribution and External Adoption

Target: after runtime gaps are closed

Deliver:
- `@vutler/mcp` bootstrap docs and config matrix
- optional installer or `npx` bootstrap flow
- stronger public setup docs mirroring the best parts of Snipara's integration guide

Done when:
- external users can connect Vutler MCP with one short setup path and clear client-specific docs

### Deferred

Do not prioritize unless strategy changes:
- full Integrator API adoption for reseller-style client/project lifecycle
- cloning every Snipara client integration page into Vutler docs
- replacing Vutler's orchestration runtime with RLM Runtime

## Recommended Build Order

1. Snipara analytics and index health inside Vutler admin
2. Memory V2 lifecycle support in gateway plus admin visibility
3. htask policy/metrics support and watchdog alignment
4. GitHub/doc freshness productization
5. optional RLM Runtime executor for technical agents
6. group memory and shared-template layer
7. `@vutler/mcp` bootstrap ergonomics

## Decision Summary

What Vutler should integrate next from Snipara:
- index health and search analytics
- Memory V2 lifecycle controls
- deeper htask policy and metrics support
- GitHub/doc freshness sync visibility
- optional RLM Runtime executor for technical agents
- group memory and shared collections/templates where product-relevant

What Vutler should not do next:
- replace its durable run engine with Snipara RLM Runtime
- integrate every Snipara client-specific distribution page as if it were a product-runtime requirement
- adopt the full Integrator API before a clear multi-project business need exists
