# Bootstrap Test Hardening - April 2026

## Goal

Reduce noisy asynchronous bootstrap side effects in tests so post-suite warnings do not hide real regressions.

## Scope

This hardening pass targeted modules that were mutating or checking schema state during import:
- `services/pushService.js`
- `services/sandbox.js`

## Changes Applied

### `services/pushService.js`

- removed implicit schema bootstrap on module import
- moved push schema initialization to first real usage
- cached the initialization promise so repeated writes do not re-run DDL

Operational effect:
- importing `pushService` no longer triggers background `push_subscriptions` work
- `saveSubscription`, `removeSubscription`, and `sendPushToUser` now ensure readiness lazily

### `services/sandbox.js`

- removed implicit `ensureSandboxSchema()` call on module import
- kept explicit schema readiness checks on runtime entry points

Operational effect:
- importing `sandbox` no longer triggers background schema creation or assertion work
- queueing and execution paths still ensure schema readiness explicitly

## Tests Added

- [tests/push-service.test.js](/Users/alopez/Devs/Vutler/tests/push-service.test.js)
  - import does not bootstrap push schema
  - first write bootstraps lazily and caches the bootstrap
- [tests/sandbox.service.test.js](/Users/alopez/Devs/Vutler/tests/sandbox.service.test.js)
  - import does not bootstrap sandbox schema

## Validation

Executed:

```bash
npx jest tests/push-service.test.js tests/sandbox.service.test.js --runInBand
npx jest tests/legacy-surface-audit.test.js tests/websocket-pg.test.js tests/provider-secrets.test.js tests/managed-provider-service.test.js --runInBand
git diff --check
```

Result:
- all targeted suites passed
- previous `Cannot log after tests are done` warning from `pushService` disappeared in this run

## Residual Notes

- Jest still reports `Force exiting Jest` in this repo after suites complete
- that remaining behavior is separate from the removed import-time schema bootstrap noise
- next hardening pass should inspect remaining open handles if we want fully quiet test shutdown
