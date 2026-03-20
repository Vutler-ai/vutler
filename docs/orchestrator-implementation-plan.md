# Orchestrator Anti-Double-Run — Implementation Plan (v1)

## Scope
Implement and validate a minimal production-ready autonomous orchestration core for Vutler/Snipara with anti-double-run guarantees.

## Guarantees
1. Atomic task claim
2. Lock TTL + heartbeat renew
3. Reclaim on TTL expiry
4. Idempotent resume after restart
5. Budget/timeout policy gates
6. Escalation after 2 zero-closure cycles

## Architecture
- `LockStore`: in-memory deterministic lock owner + expiry + completion registry
- `CheckpointStore`: in-memory and file-backed checkpoint persistence
- `AtomicOrchestrator`: tick loop, policy filters, metrics, escalation logic

## Policy
- Exclude LiveKit tasks (`scope=LiveKit` or `tags[] includes livekit`)
- Enforce timeout gate (`timeoutAt`)
- Enforce per-tick budget gate (`maxBudgetPerTick` + task `cost`)

## Test Matrix
- Double-claim prevention
- Expiry reclaim
- Stale worker renew/complete rejection
- Restart resume without duplicate execution
- Budget gate behavior
- Escalation threshold exactness
- LiveKit exclusion

## Deliverables
- `runtime/orchestrator/lock-store.js`
- `runtime/orchestrator/checkpoint-store.js`
- `runtime/orchestrator/atomic-orchestrator.js`
- `tests/orchestrator/atomic-orchestrator.test.js`
- `docs/orchestrator-anti-double-run.md`
