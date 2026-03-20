# Autonomous Anti-Double-Run Orchestrator (MVP)

## Scope
This MVP provides a production-ready core to avoid duplicate task execution in Vutler/Snipara style workflows:

1. Atomic claim (`claim(taskId, workerId)`)
2. Lock TTL + heartbeat renew (`renew(taskId, workerId)`)
3. Reclaim after expiry
4. Idempotent resume across restart (checkpoint-backed)
5. Budget/timeout policy gate in `tick()`
6. Escalation after 2 consecutive zero-closure cycles

## Files
- `runtime/orchestrator/lock-store.js`
- `runtime/orchestrator/checkpoint-store.js`
- `runtime/orchestrator/atomic-orchestrator.js`
- `tests/orchestrator/atomic-orchestrator.test.js`

## Core behavior

### Claim
- Succeeds only when lock is unclaimed or expired.
- Fails with:
  - `LOCK_HELD` when active lock exists
  - `ALREADY_COMPLETED` when task finalized

### Renew
- Only current owner can renew.
- Extends `expiresAt` by configured lock TTL.
- Fails with `NOT_OWNER`, `NOT_FOUND`, or `ALREADY_COMPLETED`.

### Complete
- Only current owner can complete.
- Expired lock cannot complete (`EXPIRED`).
- Repeated complete calls on same finalized task are idempotent (`idempotent: true`).

### Tick loop
For each task in order:
1. Skip already-completed task IDs.
2. Skip policy-excluded tasks (`scope`/`tags` containing `LiveKit`).
3. Apply timeout gate (`timeoutAt` < now).
4. Apply budget gate (`maxBudgetPerTick`, with per-task `cost`, default `1`).
5. Claim and execute task.
6. If execute result has `{ closed: true }`, finalize via `complete()`.

### Escalation
- Tracks `zeroClosureStreak`.
- If `closedCount === 0` for `escalationThreshold` consecutive ticks (default `2`), returns:
  - `escalate: true`
  - reason message with current streak

## Checkpointing and restart safety
- Snapshot persists:
  - all lock records
  - metrics
  - completed task IDs
- `init()` restores snapshot.
- With file checkpoint backend, restart does not re-execute completed tasks.

## Runbook
1. Create orchestrator with lock/checkpoint backends and policy config.
2. Call `await orchestrator.init()` once at process startup.
3. Use `tick(tasks, { workerId, execute })` in your scheduler loop.
4. Use `renew()` as heartbeat during long-running execution.

## Failure modes
- **Crash before checkpoint write**: latest in-memory progress may be lost for the current operation.
- **Filesystem write failure**: checkpoint save throws; caller should catch and retry/fail safe.
- **Clock skew**: TTL correctness assumes monotonic/consistent wall clock source.
- **High contention**: frequent `LOCK_HELD` is expected; consider sharding task queues.
