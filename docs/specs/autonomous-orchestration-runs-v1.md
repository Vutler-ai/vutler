# Autonomous Orchestration Runs v1

## Goal

Add a production-ready autonomous orchestration layer to Vutler so that:

- long-running agent work is represented as a durable runtime, not a single LLM turn
- orchestration can survive process restarts and scheduler wake-ups
- multi-agent delegation, verification, retries, approvals, and escalation all happen inside one state machine
- chat, tasks, schedules, email-driven work, and future webhook triggers can all enter the same execution model

This spec is intentionally aligned with the current Vutler stack:

- `tenant_vutler` remains the primary product schema
- `assigned_agent` remains the execution handoff field for task work
- `llmRouter` remains the turn-level LLM execution entry point
- `TaskExecutor` remains the worker that claims pending tasks
- Snipara remains the persistent memory and remote coordination layer

Deployment note:

- apply the full SQL migration on Vaultbrix at the end of the implementation slice
- use the repo migration runner (`npm run migrate`, `npm run migrate:status`) instead of manual SQL drift

## Implementation Status

### Shipped slice: entrypoint unification (2026-04-13)

The first runtime slice now treats durable orchestration runs as the primary execution backend for autonomous work instead of letting each entrypoint fan out independently.

Current behavior in code:

- chat-routed multi-step work creates one visible root task and seeds one orchestration run immediately when the orchestration schema is available
- `TaskExecutor` uses the same bootstrap helper to attach a claimed task to a durable run instead of open-coding run creation
- scheduler `run_template` execution uses the same bootstrap path, so recurring work enters the same runtime contract as chat and task-triggered work
- the root task projection stores stable orchestration metadata such as `orchestration_run_id`, `orchestration_step_id`, `workflow_mode`, `requested_agent_id`, and `display_agent_id`
- chat acknowledgements now point to the durable run contract instead of implying a direct task fanout-only execution path

Compatibility behavior remains intentional:

- if the orchestration schema is missing during rollout, chat and task execution fall back to the pre-existing task executor path instead of failing closed
- direct single-agent chat execution still bypasses swarm orchestration when the request is explicitly addressed to one agent and does not require multi-agent routing

This means Vutler now has one bootstrap contract for autonomous work across:

- chat
- claimed tasks
- recurring schedules that materialize into run templates

## Why This Is Needed

Current Vutler orchestration is strong at synchronous guarded tool execution, but weak at persistent autonomy:

- `services/llmRouter.js` can orchestrate tool calls, but only within one turn
- `services/orchestration/actionRouter.js` already models `async` and `approval_required`, but deferred execution is still an acknowledgement, not a durable run
- `app/custom/services/taskExecutor.js` still treats most work as one claimed task -> one prompt -> one final answer
- `services/watchdog.js` and `services/verificationEngine.js` are corrective side loops, not phases of one orchestration runtime
- `services/scheduler.js` creates recurring tasks, but does not wake a durable autonomous run

The result is a gap between:

- "tool orchestration"
- "task routing"
- "autonomous multi-step execution"

This spec closes that gap.

## Core Decision

Separate:

- turn execution
- durable orchestration execution

### Turn execution

Turn execution remains the responsibility of `llmRouter`.

It is responsible for:

- model/provider selection
- Codex/Anthropic/OpenRouter execution
- tool-call parsing
- sync tool execution
- memory/tool prompt injection
- immediate response formatting

### Durable orchestration execution

Durable orchestration becomes a new runtime above `llmRouter`.

It is responsible for:

- creating and resuming long-lived runs
- holding a durable plan and progress state
- delegating work to tasks or direct tool actions
- waiting on child tasks, approvals, or time-based wakeups
- retrying, escalating, or resuming after failure
- emitting checkpoints into chat/tasks/audit streams

`llmRouter` executes a step.
The orchestration runtime decides which step happens next.

## Runtime Model

### Actors

#### Requested agent

The agent the user asked to work through.

Examples:

- the agent visible in a chat thread
- the agent assigned to a root task
- the agent selected by a schedule definition

This is the facade identity.

#### Orchestrator agent

The coordinator of record for the autonomous run.

Default:

- `jarvis` for cross-agent and multi-step work

Possible future extension:

- allow specialized orchestrators when governance permits

#### Worker agents

Agents that execute delegated work units.

Examples:

- implementation worker
- research worker
- verifier worker
- remediation worker

#### System services

Non-agent executors:

- scheduler
- watchdog
- verification engine
- approval handler
- memory recorder

### Run entry points

All of the following should be able to create an orchestration run:

- chat message
- claimed task
- recurring schedule fire
- inbound webhook/event trigger
- internal escalation/retry path

### Run modes

#### Direct

Single-step answer or sync tool execution.

No durable run required unless explicitly requested.

#### Assisted autonomous

The runtime may continue after the initial user turn, but still checkpoints visibly and stops for approvals when required.

#### Full autonomous

The runtime is expected to:

- plan
- delegate
- verify
- retry or escalate
- resume after sleep/wakeup

This should be the default path for `workflow_mode = FULL`.

## Source Of Truth Rules

### `orchestration_runs` owns

- durable orchestration lifecycle
- plan state
- step state
- wait conditions
- approval state
- scheduler wake intent
- escalation state

### `tasks` owns

- user-facing task projection
- assignee visibility
- inbox style work browsing
- external sync with Snipara task primitives

### `chat_action_runs` owns

- per-action audit for chat-triggered tool execution

It remains useful and should not be removed.

### Snipara owns

- persistent memory recall and writes
- remote task/htask execution when configured
- swarm/webhook event ingress

## Data Model

### New table: `tenant_vutler.orchestration_runs`

Purpose:

- durable root execution record for one autonomous run

Suggested DDL:

```sql
CREATE TABLE IF NOT EXISTS tenant_vutler.orchestration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  source TEXT NOT NULL,
  source_ref JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  mode TEXT NOT NULL DEFAULT 'autonomous',
  requested_agent_id UUID NULL,
  requested_agent_username TEXT NULL,
  display_agent_id UUID NULL,
  display_agent_username TEXT NULL,
  orchestrated_by TEXT NOT NULL DEFAULT 'jarvis',
  coordinator_agent_id UUID NULL,
  coordinator_agent_username TEXT NULL,
  root_task_id UUID NULL,
  current_step_id UUID NULL,
  lock_token UUID NULL,
  locked_by TEXT NULL,
  locked_at TIMESTAMPTZ NULL,
  lease_expires_at TIMESTAMPTZ NULL,
  next_wake_at TIMESTAMPTZ NULL,
  last_progress_at TIMESTAMPTZ NULL,
  summary TEXT NULL,
  plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NULL,
  error_json JSONB NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  cancelled_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orchestration_runs_status_chk CHECK (
    status IN (
      'queued',
      'planning',
      'running',
      'waiting_on_tasks',
      'awaiting_approval',
      'sleeping',
      'blocked',
      'completed',
      'failed',
      'cancelled',
      'timed_out'
    )
  ),
  CONSTRAINT orchestration_runs_mode_chk CHECK (
    mode IN ('direct', 'assisted', 'autonomous')
  )
);

CREATE INDEX IF NOT EXISTS idx_orch_runs_workspace_status
  ON tenant_vutler.orchestration_runs (workspace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orch_runs_next_wake
  ON tenant_vutler.orchestration_runs (status, next_wake_at)
  WHERE next_wake_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orch_runs_root_task
  ON tenant_vutler.orchestration_runs (root_task_id)
  WHERE root_task_id IS NOT NULL;
```

### New table: `tenant_vutler.orchestration_run_steps`

Purpose:

- durable sequence of planned and executed steps

Suggested DDL:

```sql
CREATE TABLE IF NOT EXISTS tenant_vutler.orchestration_run_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES tenant_vutler.orchestration_runs(id) ON DELETE CASCADE,
  parent_step_id UUID NULL REFERENCES tenant_vutler.orchestration_run_steps(id) ON DELETE SET NULL,
  sequence_no INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  executor TEXT NOT NULL,
  selected_agent_id UUID NULL,
  selected_agent_username TEXT NULL,
  spawned_task_id UUID NULL,
  tool_name TEXT NULL,
  skill_key TEXT NULL,
  policy_bundle TEXT NULL,
  approval_mode TEXT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NULL,
  error_json JSONB NULL,
  wait_json JSONB NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orchestration_run_steps_status_chk CHECK (
    status IN (
      'queued',
      'running',
      'waiting',
      'awaiting_approval',
      'completed',
      'failed',
      'cancelled',
      'skipped'
    )
  ),
  CONSTRAINT orchestration_run_steps_type_chk CHECK (
    step_type IN (
      'plan',
      'direct_answer',
      'tool',
      'delegate_task',
      'verify',
      'approval_gate',
      'wait',
      'checkpoint',
      'memory_write',
      'sleep',
      'finalize'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orch_steps_run_sequence
  ON tenant_vutler.orchestration_run_steps (run_id, sequence_no);

CREATE INDEX IF NOT EXISTS idx_orch_steps_run_status
  ON tenant_vutler.orchestration_run_steps (run_id, status, sequence_no);

CREATE INDEX IF NOT EXISTS idx_orch_steps_spawned_task
  ON tenant_vutler.orchestration_run_steps (spawned_task_id)
  WHERE spawned_task_id IS NOT NULL;
```

### New table: `tenant_vutler.orchestration_run_events`

Purpose:

- append-only event log for debugging, UI timelines, and replay-safe recovery

Suggested DDL:

```sql
CREATE TABLE IF NOT EXISTS tenant_vutler.orchestration_run_events (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES tenant_vutler.orchestration_runs(id) ON DELETE CASCADE,
  step_id UUID NULL REFERENCES tenant_vutler.orchestration_run_steps(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orch_events_run_created
  ON tenant_vutler.orchestration_run_events (run_id, created_at DESC);
```

## State Machine

### Run states

#### `queued`

Created but not yet claimed by the run engine.

#### `planning`

The coordinator is building or refreshing the execution plan.

#### `running`

A step is actively executing and the run lease is held.

#### `waiting_on_tasks`

One or more delegated tasks are in progress.

#### `awaiting_approval`

The next step requires approval before execution may continue.

#### `sleeping`

The run is intentionally waiting for a future wake-up time.

#### `blocked`

The run cannot continue without new input, capability recovery, or escalation.

#### `completed`

The run finished successfully and has a final result.

#### `failed`

The run terminated with an unrecoverable error.

#### `cancelled`

The user or system explicitly stopped the run.

#### `timed_out`

The run exceeded lease, policy, or wall-clock limits.

### Step types

#### `plan`

Create or refresh the next work graph.

#### `tool`

Run one governed tool action through existing orchestration logic.

#### `delegate_task`

Create a child task for an execution agent or verifier.

#### `verify`

Run post-execution verification and interpret the result.

#### `approval_gate`

Pause until user or governance approval arrives.

#### `wait`

Pause on an external condition such as child task completion.

#### `sleep`

Pause until `next_wake_at`.

#### `checkpoint`

Emit a visible progress update into chat or another channel.

#### `finalize`

Store final output, emit final message, close linked task(s).

## Execution Rules

### Rule 1

Only one worker may hold a run lease at a time.

Use:

- atomic claim
- `lock_token`
- `lease_expires_at`
- heartbeat renewal

This should reuse the anti-double-run approach already captured in `docs/orchestrator-anti-double-run.md`.

### Rule 2

Every durable external side effect must be represented by a step row before it starts.

Examples:

- child task creation
- approval wait
- scheduler sleep
- verification cycle

### Rule 3

Task retries, verification retries, and redispatch must stay inside the same run when a run exists.

Do not create orphan remediation loops outside the run.

### Rule 4

Capabilities are gated at runtime by the existing capability matrix.

A run step may only execute a capability when it is `effective`:

- `workspace_available`
- `agent_allowed`
- `provisioned`

### Rule 5

Sandbox autonomy must continue to respect the existing sandbox eligibility rule for technical agent types only.

## Integration Plan By File

### `services/llmRouter.js`

Keep `llmRouter.chat()` as the turn executor.

Required changes:

1. Accept an optional `executionContext` object:
   - `orchestrationRunId`
   - `orchestrationStepId`
   - `requestedAgentId`
   - `displayAgentId`
   - `orchestratedBy`
   - `mode`
2. When tool calls are executed, persist the orchestration context into:
   - tool observation metadata
   - `chat_action_runs`
   - final chat message metadata
3. Do not convert `async` or `approval_required` into a dead-end acknowledgement when called from a durable run.
4. Always pass the DB pool through, especially for Codex OAuth-backed provider resolution.

### `services/orchestration/policy.js`

Keep governance logic centralized here.

Required changes:

1. Preserve existing sync behavior for direct chat/tool calls.
2. Add a durable branch for autonomous runs:
   - `approval_required` must create an `approval_gate` step
   - `async` must create a `wait` or `delegate_task` step
3. Return explicit durable execution instructions, not just `execution_mode`.

### `services/orchestration/actionRouter.js`

Required changes:

1. Keep sync dispatch for existing paths.
2. Add a durable dispatcher path that writes step state before execution.
3. When `decisionMode !== sync`, persist the deferred work into `orchestration_run_steps` instead of returning a placeholder only.
4. Emit `orchestration_run_events` for:
   - scheduled
   - started
   - completed
   - failed
   - awaiting_approval

### `app/custom/services/taskExecutor.js`

This is the main behavior change.

Required changes:

1. Continue the current fast path for:
   - `workflow_mode = LITE`
   - simple single-turn work
2. For `workflow_mode = FULL` or explicit autonomous metadata:
   - create or resume an `orchestration_run`
   - do not directly treat the claimed task as one prompt -> one answer
3. Use the root task as the visible inbox artifact, but let the run drive execution.
4. When the run creates delegated child tasks, write:
   - `metadata.orchestration_run_id`
   - `metadata.orchestration_step_id`
   - `metadata.orchestrated_by`
   - `metadata.requested_agent_id`
5. On final run completion:
   - write final result back to the root task metadata
   - mark root task completed
   - post any origin chat reply if needed

### `app/custom/services/swarmCoordinator.js`

Required changes:

1. Add helper methods for orchestration-aware task creation:
   - `createDelegatedTaskFromRunStep()`
   - `completeDelegatedTaskForRun()`
   - `postRunCheckpoint()`
2. When `createTask()` is called from a run:
   - preserve parent run metadata
   - preserve root task linkage
   - preserve requested/display/orchestrator identity
3. For Snipara-backed complex work, prefer hierarchical task creation for multi-agent branches.
4. Team coordination channel messages should be derived from run events, not free-form side effects.

### `services/workflowMode.js`

This file already contains the right decision point.

Required changes:

1. Keep `score()` as the complexity classifier.
2. Reuse `gatherFullContext()` as part of the `plan` step builder.
3. Reuse `persistFullModeResult()` at run finalization time.
4. Stop treating `FULL` as prompt enrichment only.
5. Treat `FULL` as "create durable orchestration run unless caller explicitly disables it".

### `services/scheduler.js`

Required changes:

1. Extend schedule targets so a schedule can wake:
   - a task template
   - an orchestration run
   - a run template for a requested agent
2. On fire:
   - if target is task template, keep current behavior
   - if target is orchestration run, resume that run
   - if target is run template, create a fresh run
3. Add missed-run handling and idempotent wake semantics.
4. Add small deterministic jitter to avoid fleet spikes on exact minute boundaries.

### `services/watchdog.js`

Required changes:

1. When a stalled task belongs to an orchestration run:
   - update the corresponding run step
   - redispatch inside the same run
   - do not create a floating replacement task without run linkage
2. When nudging:
   - emit a run event
   - optionally emit a visible checkpoint

### `services/verificationEngine.js`

Required changes:

1. If the verified task belongs to an orchestration run:
   - success completes the `verify` step
   - failure creates a remediation substep in the same run
   - escalation marks the run `blocked` or creates an escalation branch
2. Keep current scoring logic, but move lifecycle control into the run engine.

### `frontend/src/lib/api/types.ts`

Required additions:

- `OrchestrationRun`
- `OrchestrationRunStep`
- `OrchestrationRunEvent`
- chat/task payload fields:
  - `orchestration_run_id`
  - `orchestration_step_id`
  - `orchestration_status`
  - `orchestration_mode`

### New backend modules

Recommended additions:

- `services/orchestration/runStore.js`
- `services/orchestration/runEngine.js`
- `services/orchestration/runPlanner.js`
- `services/orchestration/runStepRouter.js`
- `api/orchestration.js`

## API Surface

### Internal-first endpoints

These should exist even if the first caller is only the backend/UI:

#### `POST /api/v1/orchestration/runs`

Create a new run.

Accepts:

- `source`
- `source_ref`
- `requested_agent_id`
- `display_agent_id`
- `root_task_id`
- `mode`
- `input`

#### `GET /api/v1/orchestration/runs/:id`

Return:

- run state
- latest steps
- latest events
- current blockers

#### `POST /api/v1/orchestration/runs/:id/resume`

Force immediate resume if the run is resumable.

#### `POST /api/v1/orchestration/runs/:id/approve`

Approve a waiting approval gate.

#### `POST /api/v1/orchestration/runs/:id/cancel`

Cancel the run and any active delegated work.

## Chat Metadata Contract

Every user-visible message produced by a run should be able to carry:

```json
{
  "orchestration_run_id": "uuid",
  "orchestration_step_id": "uuid",
  "orchestration_status": "running|waiting_on_tasks|awaiting_approval|completed|blocked|failed",
  "orchestration_mode": "assisted|autonomous",
  "requested_agent_id": "uuid",
  "display_agent_id": "uuid",
  "orchestrated_by": "jarvis",
  "delegated_agents": [
    { "agent_id": "uuid", "username": "mike", "role": "implementation" }
  ]
}
```

This extends the current chat orchestration metadata rather than replacing it.

## Task Metadata Contract

Every task created by or attached to a run should carry:

```json
{
  "origin": "chat|task|schedule|webhook|orchestration",
  "orchestration_run_id": "uuid",
  "orchestration_step_id": "uuid",
  "orchestrated_by": "jarvis",
  "requested_agent_id": "uuid",
  "display_agent_id": "uuid",
  "root_task_id": "uuid",
  "workflow_mode": "LITE|FULL",
  "verification_required": true
}
```

## Planner Behavior

The planner should not be a giant free-form black box.

Minimum planning output:

```json
{
  "goal": "string",
  "strategy": "string",
  "steps": [
    {
      "type": "delegate_task",
      "title": "Implement the fix",
      "selected_agent_username": "mike",
      "acceptance_criteria": ["..."]
    },
    {
      "type": "verify",
      "title": "Verify the fix independently",
      "selected_agent_username": "oscar"
    }
  ],
  "checkpoint_policy": {
    "emit_on_phase_change": true,
    "emit_on_blocker": true
  }
}
```

This keeps the coordinator auditable and replayable.

## Approval Model

Approval must become a first-class state, not a dead-end text response.

### Approval triggers

- sandbox execution above sync policy
- high-risk social/email sends
- policy-bounded destructive actions
- user-configured governance thresholds

### Approval behavior

1. persist `approval_gate` step
2. set run status `awaiting_approval`
3. emit a visible message or task note with exact action summary
4. resume only through explicit approval endpoint or approved UI action

## Scheduling Model

Autonomy needs two schedule shapes:

### Run template schedule

"Every weekday at 9am, Andrea should check legal email and create follow-up tasks."

Each fire creates a fresh run.

### Run resume schedule

"Wake this run again in 2 hours and continue checking status."

Each fire resumes an existing run.

In addition to time-based wake-ups, the runtime should also support event-driven resumes.

Examples:

- delegated child task changes to `completed`, `failed`, or `blocked`
- Snipara webhook projects a terminal child-task event into the local task row
- local task execution finishes before the next polling window

This gives Vutler the reactive part of the Kairos model without depending only on periodic polling.

This is the closest Vutler equivalent to the useful parts of the Kairos scheduler model, but backed by DB state instead of local files.

## Rollout Plan

### Phase 1

- add schema
- add `runStore`
- add `runEngine`
- route `workflow_mode = FULL` task execution into durable runs
- keep UI minimal

### Phase 2

- add approvals API and UI
- make scheduler wake runs
- integrate watchdog and verification as native run phases

### Phase 3

- add timeline UI in chat/tasks
- add richer branch planning
- add hierarchical Snipara `htask` support for multi-agent run branches

## Test Matrix

Required tests:

1. run claim is atomic across multiple workers
2. run heartbeat extends lease safely
3. expired lease can be reclaimed without double execution
4. FULL task creates durable run instead of direct one-shot prompt execution
5. delegated child task completion resumes the correct run step
6. verification failure stays inside the same run
7. approval gate pauses and resumes correctly
8. scheduled wake resumes exactly one run once
9. chat metadata preserves requested/display/orchestrator identities
10. capability matrix blocks non-effective actions

## Recommended First Implementation Slice

If the goal is to ship autonomy with the least churn, implement in this order:

1. schema + store
2. run engine with `plan -> delegate_task -> verify -> finalize`
3. `TaskExecutor` FULL-mode branch
4. `SwarmCoordinator` orchestration-aware task creation
5. watchdog + verification integration
6. scheduler wake/resume support

This gives Vutler the equivalent of the useful Kairos/coordinator behavior without importing the CLI-specific parts that do not fit the platform architecture.
