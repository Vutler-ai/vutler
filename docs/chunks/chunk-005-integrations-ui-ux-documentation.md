# Chunk 005 — Integrations UI/UX And Documentation Rollout

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
Execute the blocks in docs/chunks/chunk-005-integrations-ui-ux-documentation.md sequentially.

Rules:
1. Start with the first block whose status is not done.
2. Restrict edits to that block's write_scope.
3. Add or update tests in that block's test_scope.
4. Run every command in verify.
5. If verify passes, create one commit with the exact commit message.
6. Continue automatically to the next block.
7. If verify fails, stop and report the blocker. Do not continue.
8. Never skip a block. Never squash blocks together.
```

## Block UX-B01

```yaml
id: UX-B01
title: Add integration readiness legend and admin audit framing
goal: Make the integrations catalog understandable at a glance for admins.
write_scope:
  - frontend/src/app/(app)/integrations/page.tsx
  - frontend/src/app/(app)/settings/integrations/page.tsx
  - frontend/src/lib/integrations/catalog.ts
test_scope:
  - frontend build only
deliverables:
  - A readiness legend explains operational, partial, and coming soon.
  - The integrations catalog uses consistent admin-facing language.
  - Local-first vs cloud-required is visible without opening each connector.
out_of_scope:
  - agent-level capability UI
  - Nexus OS remediation
verify:
  - cd frontend && npm run build
commit: feat(integrations): add readiness legend to admin catalog
next: UX-B02
```

## Block UX-B02

```yaml
id: UX-B02
title: Build integration detail UX around effective capability
goal: Show what a connector can actually do instead of only whether it is connected.
write_scope:
  - frontend/src/app/(app)/settings/integrations/[provider]/page.tsx
  - frontend/src/lib/api/types.ts
  - api/integrations.js
test_scope:
  - frontend build only
deliverables:
  - Integration detail pages display workspace_available, provisioned, and effective status.
  - Detail pages distinguish consented scopes, validated scopes, and unsupported capabilities.
  - The Microsoft and Google pages explain local-first fallback where relevant.
out_of_scope:
  - agent policy editing
verify:
  - cd frontend && npm run build
commit: feat(integrations): expose effective capability on detail pages
next: UX-B03
```

## Block UX-B03

```yaml
id: UX-B03
title: Add agent-facing capability matrix entry points
goal: Let admins understand whether a connected integration is usable by a given agent.
write_scope:
  - frontend/src/app/(app)/agents/[id]/integrations/page.tsx
  - frontend/src/lib/api/types.ts
  - api/integrations.js
test_scope:
  - frontend build only
deliverables:
  - Agent integrations UI shows workspace_available, agent_allowed, provisioned, effective.
  - Read-only indicators explain why a connector is blocked for the agent.
  - Copy matches the agent configuration model in docs/agent-configuration-model.md.
out_of_scope:
  - policy editing workflow
verify:
  - cd frontend && npm run build
commit: feat(agents): show integration capability matrix per agent
next: UX-B04
```

## Block UX-B04

```yaml
id: UX-B04
title: Add Nexus local diagnostics and remediation hints
goal: Help admins understand why local capabilities are unavailable.
write_scope:
  - frontend/src/app/(app)/nexus/[id]/page.tsx
  - api/nexus.js
  - packages/nexus/dashboard/onboarding.html
test_scope:
  - frontend build only
deliverables:
  - Nexus node detail shows discovery, consent, and effective local capability in one place.
  - UI distinguishes missing OS permission, missing app, missing sync folder, and denied consent.
  - Remediation hints point to the next action without performing OS automation.
out_of_scope:
  - native OS settings deep-links
verify:
  - cd frontend && npm run build
commit: feat(nexus): add diagnostics and remediation hints
next: DOC-B01
```

## Block DOC-B01

```yaml
id: DOC-B01
title: Write canonical integrations product spec
goal: Publish one source of truth for integrations capability, consent, and runtime semantics.
write_scope:
  - docs/specs/integrations-capability-consent-and-readiness-v1.md
test_scope:
  - documentation only
deliverables:
  - Canonical terminology for operational, partial, local-first, cloud-required.
  - Canonical capability matrix definitions.
  - Admin, agent, and Nexus-local semantics documented in one place.
out_of_scope:
  - deployment runbooks
verify:
  - test -f docs/specs/integrations-capability-consent-and-readiness-v1.md
commit: docs(integrations): add capability readiness specification
next: DOC-B02
```

## Block DOC-B02

```yaml
id: DOC-B02
title: Write admin runbook for integrations and local consent
goal: Give ops and customer admins one procedural guide for setup, validation, and remediation.
write_scope:
  - docs/runbooks/integrations-admin-operations.md
  - docs/runbooks/database-owner-normalization.md
test_scope:
  - documentation only
deliverables:
  - Runbook covers cloud connectors, Nexus local, validation, degraded states, and remediation.
  - Runbook documents the Vaultbrix DB owner normalization path used in production.
  - Runbook explains what evidence to gather before escalating.
out_of_scope:
  - product marketing copy
verify:
  - test -f docs/runbooks/integrations-admin-operations.md
  - test -f docs/runbooks/database-owner-normalization.md
commit: docs(ops): add integrations and local consent runbooks
next: DOC-B03
```

## Block DOC-B03

```yaml
id: DOC-B03
title: Document customer-facing consent and trust model
goal: Explain to customers what Vutler accesses, where, and under which controls.
write_scope:
  - docs/product-briefs/integrations-consent-and-trust-model.md
test_scope:
  - documentation only
deliverables:
  - Customer-facing explanation of cloud consent, local consent, and local-first execution.
  - Clear language on what runs on the client PC vs in Vutler cloud.
  - Clarifies why some integrations are unnecessary when Nexus local is deployed.
out_of_scope:
  - legal terms and DPA text
verify:
  - test -f docs/product-briefs/integrations-consent-and-trust-model.md
commit: docs(product): add integrations consent trust model brief
next: done
```
