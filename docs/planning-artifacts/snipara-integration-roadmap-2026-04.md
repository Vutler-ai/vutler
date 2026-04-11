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
  - present, with Memory V2 lifecycle plus first-class tiering/graveyard/contradiction projection in Vutler
  - still centered on Vutler's runtime shaping rather than full session/journal semantics from Snipara docs
- swarm PM
  - core htask flow exists, but not the full documented policy and metrics surface
- automation / continuity
  - repo hooks exist for sync and persistence, but productized workspace-level automation coverage is still limited
- RLM Runtime
  - active optional runtime backend exists for technical Python sandbox runs
  - workspace and agent policy now decide whether it is allowed, inherited, or forced
  - operator telemetry is still thinner than the Snipara docs surface

### Not Yet Integrated In Product Runtime

- session memory / journal style primitives from Snipara docs
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

Vutler now exposes these controls through the shared gateway, service layer, API, and operator UI:
- [services/snipara/gateway.js](/Users/alopez/Devs/Vutler/services/snipara/gateway.js:42)
- [services/sniparaMemoryService.js](/Users/alopez/Devs/Vutler/services/sniparaMemoryService.js:1)
- [api/memory.js](/Users/alopez/Devs/Vutler/api/memory.js:1)
- [frontend/src/app/(app)/agents/[id]/memory/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/agents/[id]/memory/page.tsx:1)

What is missing:
- automatic policy deciding when an agent may verify, invalidate, or supersede without operator review
- deeper provenance linking such as explicit replacement-memory ids returned by remote storage when available
- workspace-level audit and reporting for lifecycle actions over time

Recommendation:
- delivered in Phase 1 and governance-follow-up work on 2026-04-11
- keep future work focused on policy automation, not on redoing the UI/API surface

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
- deeper tier automation beyond the current `hot/warm/cold/graveyard` projection
- journal/profile style primitives if they become product-relevant

Recommendation:
- medium priority
- Vutler is now aligned on first-class tier projection and graveyard handling
- next step is session continuity and compaction semantics, not another parallel taxonomy

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
- richer backend telemetry, explicit usage metrics, and fallback analytics
- bounded technical inner loops where sandbox alone is too shallow across more technical workflows
- optional runtime-env selection if operators need different trusted execution targets per workspace

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
- implemented via commits `d819f13`, `4744fdb`, and `19bbb8e`

### Phase 2 - Align Memory Governance With Snipara

Target: after Phase 1

Deliver:
- add first-class memory tier projection in Vutler
- add graveyard visibility for invalidated and superseded memory
- expose contradiction / resolution / canonical memory state to operators
- keep graveyard memory out of runtime retrieval by default

Done when:
- operators can tell which memory is active, graveyarded, contradicted, or canonical
- runtime retrieval excludes graveyard memory without custom prompt logic

Status update 2026-04-11:
- implemented in Vutler branch `codex/vrifier-intgration-sandbox`
- shipped via commits `cb8e6c4` and `9241869`

### Phase 3 - Add Specialized Technical Autonomy

Target: after Phase 2

Deliver:
- add an optional `rlm-executor` for technical agents
- route only bounded technical phases to RLM Runtime
- keep Vutler run engine as the source of truth for run lifecycle and approvals

Done when:
- technical agents can iteratively solve code/data problems with stronger inner loops
- no duplicate run-state authority is introduced

Status update 2026-04-11:
- implemented as a multitenant-compatible foundation
- Vutler now has an optional `RLM Runtime` backend inside the sandbox executor for Python technical runs
- backend selection is tenant-aware:
  - workspace settings gate whether `RLM Runtime` is allowed and whether it is the default sandbox backend
  - agent governance can inherit, force native sandbox, or force `RLM Runtime`
- per-execution backend telemetry is now visible in sandbox audit/history and carried in orchestration sandbox payloads
- fallback remains the native governed sandbox, and runtime authority remains in Vutler
- broader production rollout controls and aggregate backend analytics still remain to be finished

### Phase 4 - Deepen Shared Context And Team Memory

Target: after Phase 3

Deliver:
- group memory product surface
- shared templates / shared collections support where relevant
- multi-query retrieval for complex planning and investigation flows
- memory tier alignment between Vutler and Snipara models

Done when:
- one agent's durable discovery can be reused safely by other agents
- workspace-wide instructions and standards are inspectable, governed, and reusable

### Phase 5 - Improve Distribution and External Adoption

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
5. memory tiering, graveyard, and contradiction-resolution operator surface
6. optional RLM Runtime executor for technical agents
7. group memory and shared-template layer
8. `@vutler/mcp` bootstrap ergonomics

## Decision Summary

What Vutler should integrate next from Snipara:
- deeper htask policy and metrics support
- GitHub/doc freshness sync visibility
- optional RLM Runtime executor for technical agents
- group memory and shared collections/templates where product-relevant
- session continuity and journal-style memory semantics where product-relevant

What Vutler should not do next:
- replace its durable run engine with Snipara RLM Runtime
- integrate every Snipara client-specific distribution page as if it were a product-runtime requirement
- adopt the full Integrator API before a clear multi-project business need exists
