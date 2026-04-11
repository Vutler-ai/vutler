# Snipara Usage ADR V1
> **Type:** Architecture Decision Record
> **Status:** Accepted
> **Date:** 2026-04-11

## Decision

Vutler will use Snipara as:
- the workspace-backed context and memory substrate
- the shared-context and remote coordination substrate
- the remote swarm and hierarchical task substrate
- an optional specialized execution backend for technical agents through RLM Runtime

Vutler will not use Snipara as:
- the primary durable orchestration runtime for the product
- the source of truth for approvals, task projection, workspace policy, or user-facing audit

## Why

Vutler already has durable runtime ownership:
- `TaskExecutor` remains the task execution entry point
- `llmRouter` remains the turn-level LLM execution surface
- `orchestration_runs` and the run engine own retries, wake/sleep, verification, approvals, and resumability
- task `metadata` remains the local inspection and downstream automation record

Snipara already adds strong value in a different layer:
- memory and recall
- shared context
- planning and decomposition
- swarm state and distributed tasking
- hierarchical task governance and webhook signals

Trying to replace Vutler's orchestration runtime with Snipara RLM Runtime would create duplicate authority for:
- run status
- approval state
- retry logic
- step progression
- user-facing audit

That would reduce clarity and increase failure modes.

## Current Assessment

### Are We Using Snipara Correctly In Vutler?

Short answer:
- yes for the core substrate
- no if the bar is “using all of Snipara well”

### Correct Today

Vutler is using Snipara correctly for:
- workspace-scoped memory and recall
- shared context retrieval
- planning and decomposition helpers
- swarm task and htask synchronization
- webhook-driven lifecycle updates
- provisioning and workspace configuration

This is consistent with the current architecture in `AGENTS.md`.

### Underused Today

Vutler is not yet using several high-value Snipara capabilities that fit the product well:
- Memory V2 lifecycle controls
- index health and search analytics
- richer htask policy and metrics
- GitHub/doc freshness visibility
- group memory as a governed product primitive
- multi-query and multi-project retrieval for complex planning
- RLM Runtime as a bounded executor for technical autonomy

### Not Required To “Use All Snipara Correctly”

Some documented Snipara surfaces are not product priorities for Vutler and should not be treated as mandatory integration:
- every client-specific integration page
- full Integrator API lifecycle if Vutler is not acting as a reseller/operator over many external Snipara tenants
- Snipara bootstrap ergonomics beyond what is needed for `@vutler/mcp`

## Consequences

### What We Should Do

Prioritize:
1. Snipara index health and search analytics
2. Memory V2 lifecycle controls
3. deeper htask policy and metrics support
4. GitHub/doc freshness sync visibility
5. optional RLM Runtime executor for technical agents

### What We Should Not Do

Do not:
- replace the Vutler run engine with Snipara RLM Runtime
- move task/run source of truth out of PostgreSQL and Vutler runtime state
- expose every Snipara tool directly to prompts without governance and product intent

## Resulting Product Rule

The correct use of Snipara in Vutler is:
- broad where Snipara improves context, memory, and coordination
- selective where Snipara would duplicate runtime ownership

In practical terms:
- Snipara should keep expanding inside Vutler
- but only below the product runtime boundary, not across it
