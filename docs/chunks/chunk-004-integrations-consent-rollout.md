# Chunk 004 — Integrations Consent Rollout Blocks

## Runner Contract

- Execute blocks in the exact order below.
- One block = one bounded implementation commit.
- Do not start the next block until the current block has:
  - completed implementation inside its declared write scope
  - added or updated the declared tests
  - passed every command in `verify`
  - created the declared commit
- If any verify command fails:
  - stop immediately
  - report the failing command, error, and diff summary
  - do not start the next block
- Do not modify files outside the declared write scope unless the block says so.
- Do not rewrite or revert unrelated user changes.

## Codex Runner Prompt

```text
Execute the blocks in docs/chunks/chunk-004-integrations-consent-rollout.md sequentially.

Rules:
1. Start with the first block whose status is not done.
2. Restrict edits to that block's write_scope.
3. Add or update tests in that block's test_scope.
4. Run every command in verify.
5. If verify passes, create one commit with the exact commit message.
6. Mark the block done in your working notes and continue automatically to next.
7. If verify fails, stop and report the blocker. Do not continue.
8. Never skip a block. Never squash blocks together.
```

## Block INT-B01

```yaml
id: INT-B01
title: Canonicalize workspace OAuth callback flow
goal: Make Google, Microsoft 365, and GitHub OAuth callbacks stable and safe for authenticated web usage.
write_scope:
  - api/middleware/auth.js
  - api/integrations.js
  - tests/integrations.oauth-callbacks.test.js
test_scope:
  - tests/integrations.oauth-callbacks.test.js
deliverables:
  - Integration callback routes are explicitly supported by the auth middleware.
  - OAuth callback behavior is consistent across google, github, and microsoft365.
  - No hidden dependency on a browser Authorization header at callback time.
out_of_scope:
  - UI redesign
  - provider health checks
verify:
  - npx jest tests/integrations.oauth-callbacks.test.js --runInBand --forceExit
commit: fix(integrations): stabilize workspace oauth callbacks
next: INT-B02
```

## Block INT-B02

```yaml
id: INT-B02
title: Add Vutler pre-consent modal for cloud connectors
goal: Show an internal consent summary before redirecting admins to provider OAuth.
write_scope:
  - frontend/src/app/(app)/integrations/page.tsx
  - frontend/src/app/(app)/settings/integrations/page.tsx
  - frontend/src/lib/integrations/catalog.ts
test_scope:
  - frontend build only
deliverables:
  - Pre-consent modal appears before OAuth redirect for google, github, microsoft365.
  - Modal shows requested capabilities, expected scopes, and whether the connector is cloud-required or local-first.
  - User must confirm before redirect.
out_of_scope:
  - backend health checks
  - Nexus permissions
verify:
  - cd frontend && npm run build
commit: feat(integrations): add pre-consent modal for oauth connectors
next: INT-B03
```

## Block INT-B03

```yaml
id: INT-B03
title: Add post-connect health checks and degraded statuses
goal: Replace false-positive connected states with validated provider health.
write_scope:
  - api/integrations.js
  - services/microsoft/graphApi.js
  - services/google/googleApi.js
  - tests/integrations.health-checks.test.js
test_scope:
  - tests/integrations.health-checks.test.js
deliverables:
  - Post-connect validation runs for google and microsoft365.
  - Integration status can be connected, degraded, or failed.
  - Missing scopes or unreachable APIs are surfaced cleanly.
out_of_scope:
  - Microsoft capability split
verify:
  - npx jest tests/integrations.health-checks.test.js --runInBand --forceExit
commit: feat(integrations): validate provider health after connect
next: INT-B04
```

## Block INT-B04

```yaml
id: INT-B04
title: Split Microsoft 365 promise from actual capability
goal: Align product labels with the scopes and runtime that actually exist.
write_scope:
  - frontend/src/lib/integrations/catalog.ts
  - frontend/src/app/(app)/integrations/page.tsx
  - frontend/src/app/(app)/settings/integrations/page.tsx
  - api/integrations.js
test_scope:
  - frontend build only
deliverables:
  - Microsoft connector is labeled according to current reality.
  - Teams, OneDrive, and SharePoint are not presented as effective unless implemented.
  - UI messaging distinguishes Outlook/Calendar/Contacts from future Microsoft capabilities.
out_of_scope:
  - implementing Teams, OneDrive, SharePoint
verify:
  - cd frontend && npm run build
  - npx jest tests/integrations.health-checks.test.js --runInBand --forceExit
commit: fix(integrations): align microsoft connector labels with real capability
next: NEX-B01
```

## Block NEX-B01

```yaml
id: NEX-B01
title: Fix Nexus local permission contract
goal: Make Nexus local permissions typed and consistently exposed across frontend, API, and runtime.
write_scope:
  - frontend/src/lib/api/types.ts
  - frontend/src/app/(app)/nexus/page.tsx
  - api/nexus.js
  - packages/nexus/index.js
  - tests/nexus.permissions-contract.test.js
test_scope:
  - tests/nexus.permissions-contract.test.js
deliverables:
  - DeployLocalPayload includes permissions without any casts.
  - Capabilities API returns allowedFolders and allowedActions.
  - Node detail UI can read the richer payload shape.
out_of_scope:
  - discovery run
  - OS-level diagnostics
verify:
  - npx jest tests/nexus.permissions-contract.test.js --runInBand --forceExit
  - cd frontend && npm run build
commit: feat(nexus): unify local permission contract across stack
next: NEX-B02
```

## Block NEX-B02

```yaml
id: NEX-B02
title: Expose Nexus permissions and source state in the UI
goal: Show what the node can actually access instead of only showing folders.
write_scope:
  - frontend/src/app/(app)/nexus/[id]/page.tsx
  - frontend/src/lib/api/types.ts
  - api/nexus.js
test_scope:
  - frontend build only
deliverables:
  - Node detail shows allowedActions as well as allowedFolders.
  - Node detail clearly displays providerSources and active vs fallback source.
  - UI language matches capability matrix semantics.
out_of_scope:
  - discovery run
verify:
  - cd frontend && npm run build
commit: feat(nexus): surface effective permissions and provider sources
next: NEX-B03
```

## Block NEX-B03

```yaml
id: NEX-B03
title: Implement Nexus discovery run
goal: Detect available local apps, synced folders, and local provider readiness on the client machine.
write_scope:
  - packages/nexus/lib/task-orchestrator.js
  - packages/nexus/index.js
  - packages/nexus/lib/providers
  - api/nexus.js
  - frontend/src/app/(app)/nexus/[id]/page.tsx
  - tests/nexus.discovery-run.test.js
test_scope:
  - tests/nexus.discovery-run.test.js
deliverables:
  - A discovery action exists and returns installed-app and provider availability data.
  - The result is stored or retrievable from the node API.
  - The node UI shows the latest discovery snapshot.
out_of_scope:
  - automated OS remediation
verify:
  - npx jest tests/nexus.discovery-run.test.js --runInBand --forceExit
  - cd frontend && npm run build
commit: feat(nexus): add local discovery run for apps and providers
next: NEX-B04
```

## Block NEX-B04

```yaml
id: NEX-B04
title: Add Nexus consent model by source, app, and action
goal: Move from coarse toggles to a real productized local-consent model.
write_scope:
  - frontend/src/app/(app)/nexus/page.tsx
  - frontend/src/app/(app)/nexus/[id]/page.tsx
  - packages/nexus/dashboard/onboarding.html
  - packages/nexus/dashboard/server.js
  - packages/nexus/lib/permission-engine.js
  - api/nexus.js
  - tests/nexus.consent-model.test.js
test_scope:
  - tests/nexus.consent-model.test.js
deliverables:
  - Consent is represented by source, app, and action.
  - Local onboarding can show and edit more than folders.
  - Cloud UI can inspect the effective local consent state.
out_of_scope:
  - deep OS integration for system prompts
verify:
  - npx jest tests/nexus.consent-model.test.js --runInBand --forceExit
  - cd frontend && npm run build
commit: feat(nexus): productize local consent by source app and action
next: INT-B05
```

## Block INT-B05

```yaml
id: INT-B05
title: Add dedicated Jira connection flow
goal: Give Jira the same product maturity as the real backend connector already present.
write_scope:
  - frontend/src/app/(app)/settings/integrations/[provider]/page.tsx
  - frontend/src/app/(app)/settings/integrations/page.tsx
  - api/integrations.js
  - tests/integrations.jira-connect.test.js
test_scope:
  - tests/integrations.jira-connect.test.js
deliverables:
  - Jira has a dedicated connect form.
  - Connection can be validated before saving.
  - Errors are explicit and actionable.
out_of_scope:
  - ServiceNow
verify:
  - npx jest tests/integrations.jira-connect.test.js --runInBand --forceExit
  - cd frontend && npm run build
commit: feat(integrations): add dedicated jira connection flow
next: INT-B06
```

## Block INT-B06

```yaml
id: INT-B06
title: Quarantine stub connectors and finalize catalog truth
goal: Prevent non-wired connectors from appearing operational.
write_scope:
  - frontend/src/lib/integrations/catalog.ts
  - frontend/src/app/(app)/integrations/page.tsx
  - frontend/src/app/(app)/settings/integrations/page.tsx
  - api/integrations.js
test_scope:
  - frontend build only
deliverables:
  - Slack, Telegram, Discord, Notion, Linear, n8n are correctly marked as partial or coming soon if still stubbed.
  - Catalog badges reflect operational reality.
  - Real connectors are clearly separated from local-first and cloud-required connectors.
out_of_scope:
  - implementing the stub connectors
verify:
  - cd frontend && npm run build
  - npx jest tests/integrations.health-checks.test.js --runInBand --forceExit
commit: fix(integrations): quarantine stub connectors in catalog
next: DONE
```

## Definition Of Done

- OAuth connectors no longer rely on an implicit fragile callback path.
- Cloud connectors have a Vutler-side consent summary before redirect.
- Connected status means health-checked, not just token-stored.
- Microsoft messaging reflects implemented capabilities.
- Nexus local permissions are typed, inspectable, and action-aware.
- Nexus discovery exists and is visible in the UI.
- Jira has a proper connection surface.
- Stub connectors are no longer presented as already wired.
