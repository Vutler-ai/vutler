# Jest Open Handle Hardening - April 2026

## Goal

Remove the default reliance on Jest `forceExit` and make targeted test suites terminate cleanly on their own.

## Changes Applied

### Removed forced Jest shutdown

Updated [package.json](/Users/alopez/Devs/Vutler/package.json):
- removed `forceExit` from Jest config
- removed `--forceExit` from the main Jest scripts

### Unref-ed module-scope housekeeping timers

Updated these modules so background cleanup intervals no longer keep the Node.js process alive:
- [services/llmRouter.js](/Users/alopez/Devs/Vutler/services/llmRouter.js)
- [api/admin.js](/Users/alopez/Devs/Vutler/api/admin.js)
- [app/custom/api/admin.js](/Users/alopez/Devs/Vutler/app/custom/api/admin.js)
- [api/middleware/auth.js](/Users/alopez/Devs/Vutler/api/middleware/auth.js)
- [api/integrations.js](/Users/alopez/Devs/Vutler/api/integrations.js)

Each module still keeps its cleanup interval, but the timer now uses `unref()` so passive imports do not pin Jest.

## Validation

Executed without `forceExit`:

```bash
npx jest tests/llm-router.managed-runtime.test.js tests/integrations.jira-connect.test.js tests/push-service.test.js tests/sandbox.service.test.js --runInBand --detectOpenHandles --forceExit=false
npx jest tests/websocket-pg.test.js tests/provider-secrets.test.js --runInBand --detectOpenHandles --forceExit=false
```

Result:
- both runs passed
- no `Jest has detected the following open handles` report
- no `Force exiting Jest` message on these runs

## Residual Notes

- This does not prove every suite in the repo is clean yet.
- It does remove the default forced shutdown from the standard Jest path and validates it on representative backend suites that import the previously noisy modules.
- If another open handle remains elsewhere, `--detectOpenHandles` should now surface it instead of being masked by `forceExit`.
