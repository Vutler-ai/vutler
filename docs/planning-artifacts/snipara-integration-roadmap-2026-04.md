# Snipara Integration Roadmap
_Updated: 2026-04-13_

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
  - workspace session briefs and agent profile/session briefs are now productized and injected into runtime as targeted continuity summaries
  - journal append/summarize primitives from Snipara docs are still not surfaced as operator tooling
- swarm PM
  - core htask flow exists, but not the full documented policy and metrics surface
- automation / continuity
  - repo hooks exist for sync and persistence, but productized workspace-level automation coverage is still limited
- RLM Runtime
  - active optional runtime backend exists for technical Python sandbox runs
  - workspace and agent policy now decide whether it is allowed, inherited, or forced
  - operator telemetry, fallback analytics, and critical workspace alerts now exist
  - alert delivery now covers Vutler notifications plus workspace notification email
  - realtime/paging fan-out beyond that is still pending

### Not Yet Integrated In Product Runtime

- journal style primitives from Snipara docs
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
- explicit journal-style append/summarize flows mapped to chat/task/runtime episodes
- deeper tier automation beyond the current `hot/warm/cold/graveyard` projection
- richer compaction hooks beyond the current governed brief model

Recommendation:
- medium priority
- Vutler is now aligned on first-class tier projection and graveyard handling
- session continuity is now wired through governed workspace/agent briefs plus runtime injection
- daily journal capture and summarize-to-brief compaction are now productized
- next step is deeper journal automation and compaction hooks, not another parallel taxonomy

Status update 2026-04-13:
- Vutler now exposes governed journal automation policy per workspace:
  - workspace journals can auto-refresh the workspace session brief on save
  - agent journals can auto-refresh the agent session brief on save
  - each policy has `manual` or `on_save` mode plus a minimum content threshold
  - each policy can now also enable scheduled sweep automation
- manual summarize actions remain available as an explicit operator override
- journal saves no longer depend on manual compaction to keep continuity briefs current
- workspace memory now exposes a `Run Sweep Now` action and last sweep status
- a cron-friendly repository script now exists for external scheduling:
  - `npm run memory:journal:sweep`
- chat and task prompt preparation now trigger a targeted runtime refresh when the current workspace or agent journal is newer than the injected brief
- workspace memory now exposes the last runtime-triggered refresh status separately from the manual sweep status
- remaining work is now around richer episode-bound journal capture, not the basic runtime refresh layer

### 3. Group Memory and Multi-Agent Coordination

Snipara docs position shared memory as a first-class layer across agents and teammates.

Vutler today has:
- shared context retrieval
- swarm state primitives
- orchestration-driven delegation
- task and htask projection

What is missing:
- automatic promotion flows that move verified discoveries into group memory spaces
- richer cohort targeting than workspace-wide or role-scoped spaces
- stronger reporting on which group spaces are most reused at runtime

Recommendation:
- medium priority
- implement group memory as a governed workspace layer above current shared-context usage

Status update 2026-04-13:
- Vutler now exposes first-class governed group memory spaces on the workspace memory page
- each space has:
  - workspace or role-scoped audience
  - explicit read/write governance
  - runtime enable/disable control
  - Snipara-backed document sync
- agent memory pages now show which governed group spaces apply to the current agent
- runtime prompt injection now includes matching runtime-enabled group memory spaces for eligible agents
- verified promotable memories can now auto-promote into eligible governed group spaces when admins enable it
- auto-promoted discoveries stay separate from the operator-authored body and are merged into the runtime/synced document automatically
- runtime injection now records per-space reuse analytics:
  - total injections
  - chat vs task usage split
  - last injected agent/runtime
  - promotion counts and last promoted agent
- remaining work is now mainly finer cohort targeting beyond workspace/role and more advanced reuse reporting, not the basic promotion + analytics layer

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
- bounded technical inner loops where sandbox alone is too shallow across more technical workflows
- optional runtime-env selection if operators need different trusted execution targets per workspace
- stronger operator paging channels beyond notifications plus workspace email when runtime health turns critical

Recommendation:
- high priority, but strictly as an optional technical executor
- not recommended as a replacement for Vutler's orchestration runtime

Status update 2026-04-13:
- Vutler now has stronger operator paging for critical sandbox runtime degradation:
  - critical health alerts still create deduplicated in-app workspace notifications
  - the workspace notification email still receives the same alert when configured
  - subscribed workspace admins now also receive a web-push alert that deep-links to `/sandbox`
- this keeps the model multitenant and workspace-scoped:
  - recipient resolution is limited to `tenant_vutler.users_auth` rows in the same `workspace_id`
  - only users with the `admin` role are targeted for push paging
- remaining work is now mostly channel policy and escalation tuning, not the core paging path

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

Status update 2026-04-13:
- Vutler now uses the Integrator layer more deliberately for provisioning reliability without cloning the whole partner surface:
  - workspace admin exposes Snipara provisioning diagnostics
  - partial provisioning states now produce actionable repair guidance
  - repairs can reuse an existing `client_id` to mint a replacement workspace API key instead of recreating a client/project blindly
  - remote client swarm visibility is surfaced when integrator access is available
- Vutler now also exposes operator-facing integrator operations tooling per workspace:
  - manual `Run Live Probe` checks current integrator reachability and stores the result in a workspace-scoped operations log
  - manual provision/repair actions now append a local operations trail with actor, outcome, and reconciliation details
  - retained webhook event logs now surface operationally relevant Snipara deliveries such as lifecycle, blocked, timeout, closure, and `test.ping` events
- this is the right current cut for Vutler:
  - it industrializes provisioning and repair
  - it adds operator visibility without productizing reseller/client CRUD that Vutler does not yet need as a tenant-facing surface
  - it still avoids wiring session-auth dashboard routes such as full webhook replay/test-send until Vutler has a justified auth model for them

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
- current minimum bar should be: CLI help, config templates, and public quick-start docs before building a heavier installer

Status update 2026-04-12:
- `@vutler/mcp` now ships a built-in bootstrap aid:
  - `--help`
  - `--print-env`
  - `--print-config claude-desktop|cursor|continue`
- package-level quick-start documentation now exists in `packages/mcp/README.md`
- a fuller `create-snipara`-style installer is still not implemented

Status update 2026-04-13:
- `@vutler/mcp` now goes beyond static config templates:
  - `--list-clients`
  - `--setup` / `--write-config` with path resolution, merge into existing `mcpServers`, dry-run support, and invalid-JSON backup on `--force`
  - `--doctor` with connectivity, auth, and plan-gated tool visibility checks
- `@vutler/mcp` now also has a short operational bootstrap path:
  - `--bootstrap` writes the selected client config and immediately runs doctor against that exact file
  - `--doctor --client ...` now validates the resolved config path, checks `mcpServers.vutler`, confirms it launches `@vutler/mcp`, and flags placeholder API keys
- supported bootstrap targets now include:
  - Claude Code
  - Claude Desktop
  - Cursor
  - VS Code
  - Continue.dev
- bootstrap is safer by default:
  - config writing uses a placeholder API key unless `--embed-key` is passed explicitly
- Vutler product surfaces now point operators toward the bootstrap/doctor flow instead of only pasting raw JSON
- remaining work is now mostly packaging/publishing polish and broader external distribution, not the bootstrap/doctor core

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
- aggregate sandbox analytics now expose workspace-scoped `RLM` usage, effective backend split, fallback rate, and top fallback reasons
- workspace-scoped `Sandbox Runtime Alerts` now emit a deduplicated critical notification, fan out to the workspace notification email, and can be disabled per tenant
- fallback remains the native governed sandbox, and runtime authority remains in Vutler
- broader production rollout controls and stronger alert routing still remain to be finished

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

Status update 2026-04-12:
- Vutler now exposes shared Snipara collections and prompt templates in workspace admin surfaces
- Vutler now exposes governed continuity briefs backed by Snipara docs and summaries:
  - workspace session brief on the global memory page
  - agent profile brief and agent session brief on the agent memory page
  - targeted runtime injection for workspace + agent continuity instead of broad untargeted summaries
- the Snipara gateway now wires:
  - `rlm_list_collections`
  - `rlm_list_templates`
  - `rlm_get_template`
  - `rlm_upload_shared_document`
  - `rlm_inject`
  - `rlm_context`
  - `rlm_clear_context`
  - `rlm_multi_query`
  - `rlm_multi_project_query`
  - `rlm_repl_context`
- FULL workflow mode now uses Snipara recursive decomposition plus `rlm_multi_query` before falling back to a single `rlm_context_query`
- group-memory governance is still not fully productized beyond shared instructions, shared uploads, and continuity briefs
Status update 2026-04-13:
- group-memory governance is now productized as governed workspace/role spaces with runtime injection
- remaining work is now around automatic promotion into group spaces and deeper analytics, not the basic product surface

Remaining productizable Snipara work after the 2026-04-12 continuity tranche:
- first-class GitHub/source freshness surfaces
  - last successful sync
  - failed sync visibility
  - operator-facing source freshness health for autonomous runs
- automatic promotion/reporting around group memory
- deeper session-bound journal hooks and scheduled sweep automation beyond the new on-save policy
- session continuity and journal/profile semantics where they improve task/chat continuity
- stronger paging channels for critical `RLM Runtime` incidents beyond in-app notifications plus workspace email
- broader public distribution around `@vutler/mcp`
  - packaging/publishing polish
  - public docs examples beyond the package README
- deeper integrator operations if strategy shifts toward reseller-style external provisioning
  - client lifecycle CRUD
  - client API key rotation/revocation surfaces
  - webhook event log/test tooling

Roadmap execution update 2026-04-12:
- started the first remaining operator-facing freshness tranche
- Vutler now persists workspace-scoped Snipara sync telemetry for:
  - task reconcile success/failure
  - event reconcile success/failure
- workspace admin now exposes a `Source Freshness` surface with:
  - last successful sync
  - recent failure visibility
  - stale/fresh/failed status for operator review
- this remains multitenant-compatible because the telemetry stays workspace-scoped and does not widen retrieval scope across tenants
- started governed shared-document authoring for Snipara shared collections
  - admin-only uploads from Vutler settings
  - local workspace audit trail of writes
  - public collections kept read-only from Vutler
- started governed group-memory policy for workspace shared instructions
  - `workspace-knowledge` is now editable through Vutler
  - writes sync to Snipara via `rlm_upload_document`
  - read/write policy is workspace-scoped with admin or workspace-member modes

Intentionally not exposed as tenant-facing product surfaces:
- unrestricted `rlm_multi_project_query` across unrelated customer workspaces
  - keep this confined to explicitly governed scopes so multitenant isolation stays intact
- full Snipara Integrator API lifecycle mirroring
  - defer until Vutler needs reseller-style external workspace/client provisioning
- replacing Vutler's run engine with `RLM Runtime`
  - `RLM Runtime` remains an optional bounded executor for technical agents only

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
