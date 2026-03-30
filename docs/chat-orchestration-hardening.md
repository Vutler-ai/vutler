# Chat and Task Orchestration Hardening

## Goal

Wave 1 hardens the Vutler chat and task orchestration path so that:

- chat messages do not disappear after transient failures
- task-orchestrated requests return visible output to the same chat
- realtime delivery works without manual refresh
- workspace scoping is preserved across chat, tasks, swarm, and provider auth
- task execution is safe in multi-process deployments
- Snipara task state and PostgreSQL task state stay aligned

This document describes the shipped behavior, the schema changes, and the operational expectations.

## Problems Addressed

Before this hardening, the main failure modes were:

- a routed chat request could create tasks but never return a result to chat
- a transient provider or Snipara error could mark a message as handled too early
- persisted replies were not always published to the websocket layer
- several orchestration paths still relied on the default workspace
- task polling allowed duplicate claims in multi-worker setups
- a Snipara-linked task could be completed locally without completing the upstream Snipara task

## Shipped Changes

### 1. Chat processing state machine

User messages are now stored with explicit processing state fields in `tenant_vutler.chat_messages`.

- `processing_state`: `pending`, `processing`, `processed`, `failed`
- `processing_attempts`
- `processing_started_at`
- `next_retry_at`
- `last_error`
- `reply_to_message_id`

`app/custom/api/chat.js` inserts new user messages as `pending` and returns HTTP immediately.  
`app/custom/services/chatRuntime.js` then processes them in fire-and-forget mode or through the poller.

`claimMessage(messageId, workspaceId)` uses an atomic `UPDATE ... RETURNING` and only claims rows where:

- the row belongs to the expected workspace
- the state is `pending` or `failed`
- `next_retry_at` is due

Failures are retried with backoff:

- attempt 1: 5 seconds
- attempt 2: 15 seconds
- attempt 3: 60 seconds
- attempt 4+: 300 seconds

Automatic retries stop after 5 attempts.

### 2. External timeout policy

`services/fetchWithTimeout.js` wraps outbound fetch calls with `AbortController`.

- default timeout: `15000ms`
- timeout errors are normalized as `ETIMEDOUT`

Current Snipara-facing callers use this helper:

- `app/custom/services/chatRuntime.js`
- `app/custom/services/swarmCoordinator.js`

This prevents a stalled upstream request from silently consuming a chat message forever.

### 3. Realtime chat publishing on every persisted message

Two helpers now centralize message persistence and websocket publication:

- `services/chatMessages.js`
- `services/chatRealtime.js`

Every persisted chat message is normalized and published as `message:new`, including:

- the original user message
- the orchestration acknowledgement
- direct agent replies
- task success messages
- task failure messages

The frontend websocket contract did not change.

### 4. Chat -> task -> chat round-trip

When a chat message is routed into tasks, `app/custom/services/swarmCoordinator.js` stores chat origin metadata inside `tasks.metadata`:

- `origin`
- `origin_chat_channel_id`
- `origin_chat_message_id`
- `origin_chat_user_id`
- `origin_chat_user_name`
- `workspace_id`

`app/custom/services/taskExecutor.js` uses that metadata to write the result back into the original chat channel after execution. The inserted message uses `reply_to_message_id` so the UI can preserve the causal link.

Wave 1 returns one result message per task. It does not aggregate multiple subtasks into a single summary message.

### 5. Workspace-aware orchestration

The critical orchestration paths were adjusted to stop implicitly falling back to the default workspace in normal operation.

Key areas:

- `app/custom/api/chat.js`
- `app/custom/api/tasks-v2.js`
- `app/custom/services/chatRuntime.js`
- `app/custom/services/taskExecutor.js`
- `app/custom/services/swarmCoordinator.js`
- `services/swarmCoordinator.js`

The intended rule is:

- use the message, task, or request workspace whenever it exists
- only use the default workspace as a compatibility fallback
- always pass a database pool into `llmRouter` when provider credentials must be resolved from the database

This is especially important for Codex OAuth-backed provider auth.

### 6. Snipara and PostgreSQL state consistency

Tasks can now carry `snipara_task_id` locally. When present:

- the task executor claims the upstream Snipara task before local execution
- the task executor completes the upstream Snipara task before marking the local task as completed
- a failed local execution sets `metadata.snipara_sync_status = 'not_completed'`

This closes the previous drift where PostgreSQL could say `completed` while the upstream Snipara task was still open.

### 7. Atomic task claim in multi-worker deployments

`app/custom/services/taskExecutor.js` now claims tasks with `FOR UPDATE SKIP LOCKED`.

Task rows now track:

- `locked_at`
- `locked_by`
- `execution_attempts`

`locked_by` is built from `hostname:pid`, which makes claim attribution visible during debugging.

This removes the old race where two workers could read the same `pending` task before either updated it.

### 8. Frontend chat resilience

`frontend/src/app/(app)/chat/page.tsx` now refetches the selected channel:

- when the websocket reconnects
- after the client joins a channel
- after a successful send if websocket delivery is unavailable

This is a safety net around the live websocket feed. It is not a replacement for websocket publication.

## Database Changes

These migrations are part of the hardening:

- [20260330_chat_orchestration_hardening.sql](../scripts/migrations/20260330_chat_orchestration_hardening.sql)
- [20260330_tasks_snipara_task_id.sql](../scripts/migrations/20260330_tasks_snipara_task_id.sql)

The code is written to degrade gracefully if the new optional columns are still missing during rollout, but the intended deployment order is still:

1. apply migrations
2. deploy backend
3. deploy frontend
4. run smoke and e2e validation

## Runtime Flow

### Direct chat reply

1. `POST /api/v1/chat/channels/:id/messages`
2. insert user message as `pending`
3. publish user message to websocket
4. `chatRuntime` claims the message
5. the target agent responds directly
6. reply is inserted as `processed` with `reply_to_message_id`
7. reply is published to websocket
8. original message is marked `processed`

### Routed task reply

1. `POST /api/v1/chat/channels/:id/messages`
2. insert user message as `pending`
3. `chatRuntime` decides that work should be routed to tasks
4. an acknowledgement message is inserted and published
5. the task is created with chat origin metadata
6. `taskExecutor` claims the task atomically
7. if applicable, Snipara claim happens before local execution
8. task output is inserted into the original chat channel as a reply
9. if applicable, Snipara completion happens before local task completion

## Tests Added

Orchestrator regression coverage now includes:

- `tests/orchestrator/chat-runtime.retry.test.js`
- `tests/orchestrator/chat-runtime-routing.test.js`
- `tests/orchestrator/chat-realtime.test.js`
- `tests/orchestrator/task-executor.locking.test.js`
- `tests/orchestrator/task-executor-snipara.test.js`

End-to-end coverage was also extended:

- `tests/e2e/chat.test.js`
- `tests/e2e/tasks.test.js`

## Operational Expectations

- `scripts/smoke-test.sh` should pass in `Auth mode: api_key`
- `scripts/deploy-api.sh` now refuses to deploy if `JWT_SECRET` or `VUTLER_API_KEY` is missing
- runtime `VUTLER_API_KEY` rotation is documented in [vutler-api-key-rotation.md](runbooks/vutler-api-key-rotation.md)
- staging deploy and verification is documented in [staging-deploy-validation.md](runbooks/staging-deploy-validation.md)
