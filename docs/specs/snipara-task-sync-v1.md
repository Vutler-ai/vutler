# Snipara Task Sync v1

## Goal

Align Vutler task management with Snipara so that:

- Snipara is the canonical coordination runtime for task execution.
- `tenant_vutler.tasks` is the canonical product projection for UI, reporting, chat, email, and audit.
- Synchronization is bidirectional.
- Simple mono-agent work uses Snipara `task` primitives.
- Complex multi-agent work uses Snipara `htask` primitives.

## Core model

### Simple task

Use Snipara `task` when all of the following are true:

- exactly one assigned agent is expected to execute the work
- no hierarchical decomposition is required
- there is no need for cross-agent closure verification

Lifecycle:

1. `rlm_task_create`
2. `rlm_task_claim`
3. `rlm_task_complete`
4. webhook + reconciliation update Vutler local projection

### Hierarchical task

Use Snipara `htask` when any of the following are true:

- the work spans multiple agents
- the work needs a feature/workstream/task hierarchy
- the work has blocking dependencies across streams
- closure should be gated on evidence or downstream completion

Hierarchy:

- `N0` visible root for product-facing tracking
- `N1_FEATURE`
- `N2_WORKSTREAM`
- `N3_TASK`

Projection rule:

- `N0` is the only level that must be shown by default in Vutler kanban and agenda views
- `N1+` stays internal to orchestration unless the user opens task details

Lifecycle:

1. `rlm_htask_create`
2. child `rlm_htask_create` for decomposition
3. optional `rlm_htask_block` / `rlm_htask_unblock`
4. `rlm_htask_complete`
5. `rlm_htask_verify_closure`
6. `rlm_htask_close`
7. webhook + reconciliation update Vutler local projection

## Source of truth rules

### Snipara owns

- coordination state
- claims and assignment transitions
- remote dependency graph
- swarm events
- remote htask hierarchy

### Vutler owns

- application UI state
- chat/email/task origin linkage
- business metadata
- audit history
- reporting and filtering
- user-facing task browsing and editing flows

## Bidirectional sync contract

### Snipara -> Vutler

Events and polling must upsert the local projection.

Primary mechanisms:

- webhook receiver on `/api/v1/webhooks/snipara`
- periodic reconciliation through `syncFromSnipara()`

At minimum, project these remote events:

- `task.created`
- `task.claimed`
- `task.completed`
- `task.failed`
- `task.blocked`
- `task.timeout`
- `htask.completed`
- `htask.blocked`
- `htask.closure_ready`

### Vutler -> Snipara

All task creation from the app must route through the swarm coordinator.

Rules:

- create local-only tasks only in explicit degraded mode
- create simple tasks through Snipara first, then upsert locally
- create complex tasks through `htask` first, then upsert locally
- local task status changes must not bypass the coordinator in primary mode

## Local metadata contract

Every local task row should carry a normalized metadata envelope.

```json
{
  "execution_backend": "snipara|local",
  "execution_mode": "simple_task|hierarchical_htask",
  "sync_mode": "primary|fallback",
  "sync_status": "synced|pending_push|pending_pull|conflict|error",
  "snipara_task_kind": "task|htask",
  "snipara_swarm_id": "cmmfe0cq90008o1cohufkls68",
  "snipara_project_id": "cmmfdy2up0002o1colc66rxs2",
  "snipara_hierarchy_level": "N0|N1_FEATURE|N2_WORKSTREAM|N3_TASK",
  "snipara_hierarchy_root_id": "remote-root-id",
  "snipara_remote_parent_id": "remote-parent-id",
  "snipara_last_event": "task.completed",
  "snipara_last_event_at": "2026-04-01T00:00:00Z",
  "origin": "app|chat|email|api|snipara_webhook",
  "origin_ref": {},
  "acceptance_criteria": []
}
```

## API expectations

### `POST /tasks-v2`

Accepts:

- default simple task creation
- `hierarchical=true` or `execution_mode=hierarchical_htask` for root htask creation
- root htask creation defaults to `N0` unless the caller explicitly requests a deeper level

### `POST /tasks-v2/:id/subtasks`

- creates child `task` by default when parent is simple
- creates child `htask` when parent already belongs to a hierarchy or caller explicitly requests hierarchical execution
- when the parent is hierarchical and no explicit level is provided, child defaults follow the parent:
  - `N0 -> N1_FEATURE`
  - `N1_FEATURE -> N2_WORKSTREAM`
  - `N2_WORKSTREAM -> N3_TASK`

### `PATCH /tasks-v2/:id`

- in primary mode, status transitions must route through Snipara first
- local metadata patches must merge with the existing projection
- htask completion must trigger verify/close flow when eligible

## Cleanup rules for the historical swarm

Keep:

- all `P0` and `P1` tasks
- all dependencies of `P0` and `P1`
- all active htask parents/ancestors for those branches

Archive or cancel:

- stale roadmap `P2` tasks not linked to active blockers
- failed watchdog/remediation tasks without current business value
- unassigned stale tasks outside protected dependency chains

## Failure modes

### Degraded mode

If Snipara is unavailable:

- create a local task with `sync_mode=fallback`
- mark `sync_status=pending_push`
- retry push asynchronously
- do not pretend remote state is canonical until recovery succeeds

### Conflict handling

Remote wins for:

- status
- remote owner
- remote hierarchy
- dependency links

Local wins for:

- UI-only annotations
- origin references
- presentation metadata

## Current implementation targets

Priority work in the repo:

1. centralize Snipara -> Vutler projection
2. remove duplicate `claim/complete` sync paths
3. make hierarchical root creation first-class in `tasks-v2`
4. update webhook handling to upsert projection, not just log events
5. run cleanup on the historical swarm while preserving protected branches
