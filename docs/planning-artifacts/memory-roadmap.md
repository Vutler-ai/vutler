# Memory Roadmap
_Updated: 2026-04-11_

## Current State

The Snipara memory layer now has a shared backend source of truth and a consistent runtime path across chat and task execution.

Implemented:
- workspace-aware memory service
- scoped memories: `instance`, `template`, `global`
- typed memories with visibility and TTL policies
- first-class tier projection: `hot`, `warm`, `cold`, `graveyard`
- ranked retrieval for runtime prompt injection
- duplicate filtering and threshold-based promotion
- lifecycle-backed graveyard handling for invalidated and superseded memories
- contradiction / resolution / canonical-memory projection in dashboard/API surfaces
- periodic maintenance for short-lived memory cleanup and local compaction
- dashboard/API counts for visible, hidden, expired, and graveyard memories
- telemetry logs for extraction, promotion, retrieval bundle, and maintenance
- unit and targeted integration coverage
- product-like memory scenarios on a mocked Snipara store

## What Remains

### 1. Admin Visibility And Controls
Goal: make memory operations inspectable and operable without touching code.

Needed:
- admin page for maintenance runs and latest maintenance summaries
- memory telemetry dashboard by workspace, agent, scope, and type
- filters for active, expired, deleted, promoted, and internal memories
- manual actions for promote, archive, compact, and re-run maintenance

Done when:
- an operator can explain why a memory was injected, hidden, promoted, or deleted
- maintenance results are visible without reading server logs

### 2. Stronger Compaction
Goal: move from text-level dedupe to semantic consolidation.

Needed:
- merge close `user_profile` entries into a single canonical memory
- collapse repeated `decision` variants into one durable statement
- summarize old `task_episode` chains into a compact reusable lesson
- keep provenance metadata when compaction creates a canonical memory

Done when:
- repeated similar memories stop accumulating as separate entries
- the runtime bundle becomes smaller over time instead of noisier

### 3. Retention And Archive Strategy
Goal: distinguish active memory, graveyard memory, archived memory, and deleted memory.

Needed:
- keep the new graveyard tier for invalidated and superseded memory as the default audit lane
- add a separate archive lane when a memory should be retained for audit without being contradicted
- physical purge strategy when Snipara exposes a safe delete path
- retention windows by type and workspace policy override
- optional dry-run mode before aggressive cleanup

Done when:
- operators can say whether a memory is active, graveyarded, archived, or deleted
- cleanup no longer depends only on tombstones

### 4. Retrieval Feedback Loop
Goal: learn from actual usage instead of static heuristics only.

Needed:
- increment `usage_count` / `last_used_at` when a memory is injected
- mark which memories were selected but not useful when applicable
- tune ranking with retrieval outcomes and downstream success signals
- separate budgets for chat, task, and tool follow-up contexts

Done when:
- retrieval ranking improves with usage instead of staying fixed
- the highest-ranked memories are measurably the most reused

### 5. Workspace Policy Overrides
Goal: let workspaces shape memory behavior explicitly.

Needed:
- workspace settings for TTL overrides, promotion thresholds, and visibility policy
- per-role retrieval budgets
- per-workspace enable/disable of promotion and maintenance
- safe defaults when no workspace override exists

Done when:
- different workspaces can run stricter or looser memory policies safely

### 6. Full Product Evals
Goal: validate that the product behaves correctly across sessions and agents.

Needed:
- multi-session scenarios on chat + tasks + tool runs
- UI verification for counts and visibility boundaries
- regression scenarios for promotion leakage and hidden/internal exposure
- smoke scenarios after production deploy

Core scenarios:
- user preference remembered across sessions
- team decision promoted from one agent and reused by another
- internal memory hidden from user UI but still available to runtime
- maintenance removes expired short-lived memories without harming durable ones

Done when:
- memory behavior is verifiable through realistic end-to-end flows, not only unit logic

## Recommended Order

1. Admin visibility and telemetry surfaces
2. Usage feedback loop in retrieval
3. Stronger semantic compaction
4. Archive and purge strategy
5. Workspace policy overrides
6. Full product eval suite and post-deploy smoke checks

## Release Notes For This Phase

This phase delivered the memory core:
- policy-driven governance
- tiered projection and graveyard exclusion from runtime retrieval
- contradiction / resolution / canonical memory state for lifecycle-driven review
- ranked retrieval
- promotion thresholds
- periodic maintenance
- scenario-based test coverage

This means the system now stores, recalls, promotes, and cleans memory in a coherent way, but still needs operational tooling and richer long-horizon behavior tuning.
