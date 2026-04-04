# Production Ops Hardening Plan

## Goal

Define the next production hardening track for Vutler on Vaultbrix.

This document is a planning runbook, not an incident procedure.

## Use When

Use this runbook when:
- reviewing production readiness
- prioritizing operations work after an incident or audit
- deciding which safeguards must be enforced before broader rollout

## Current Baseline

- DB ownership normalized on `tenant_vutler_owner`
- runtime DDL blocked in production
- migrations tracked in `tenant_vutler.schema_migrations`
- API deploys run on Node 20
- smoke test covers core API surfaces
- release metadata is persisted by deploy and rollback scripts

## Priority Tracks

### Priority 1: Release Discipline

Goal:
- know exactly what commit and image are live
- detect drift before incidents become invisible

Actions:
- use [production-state-audit.sh](/Users/alopez/Devs/Vutler/scripts/production-state-audit.sh) before and after deploys
- keep `current-release.env` and release history on the VPS
- require `smoke-test.sh` after deploy and rollback

Exit criteria:
- live API revision is always known
- pending migrations and mixed owners are visible from one command

### Priority 2: Backup And Restore

Goal:
- move from "backup exists" to "backup is verified and restorable"

Actions:
- schedule `./scripts/backup-db.sh --mode schema` daily
- schedule `./scripts/backup-db.sh --mode full` before risky migrations and at a regular cadence
- run a monthly restore drill using [database-backup-restore.md](/Users/alopez/Devs/Vutler/docs/runbooks/database-backup-restore.md)

Exit criteria:
- latest verified schema backup is less than 24 hours old
- latest verified full backup is within agreed RPO
- latest restore drill date is documented

### Priority 3: Deploy Gates

Goal:
- stop shipping when the platform is already drifting

Actions:
- block deploy if `production-state-audit.sh --strict` fails
- block deploy if smoke test fails
- block deploy if the target commit is not contained in `origin/main`

Exit criteria:
- no deploy proceeds with unhealthy API, pending migrations, or mixed owners

### Priority 4: Observability

Goal:
- shorten time to detection and time to diagnosis

Actions:
- alert on repeated `500` responses by route family
- alert on failed migrations, failed backups, and failed smoke tests
- add a dashboard for API health, worker status, DB connectivity, and scheduler activity

Exit criteria:
- incidents are visible without SSH
- regressions are caught before user reports

### Priority 5: Secret And Role Hygiene

Goal:
- remove silent privilege and credential drift

Actions:
- inventory all active `.env` sources and container env files
- rotate DB and API credentials on a schedule
- keep owner and admin roles separated from app roles

Exit criteria:
- each runtime credential has one owner and one rotation path
- app roles are never object owners

## Validation

Use these references to validate progress:
- [production-state-audit.sh](/Users/alopez/Devs/Vutler/scripts/production-state-audit.sh)
- [database-backup-restore.md](/Users/alopez/Devs/Vutler/docs/runbooks/database-backup-restore.md)
- [production-deploy-clean-artifact.md](/Users/alopez/Devs/Vutler/docs/runbooks/production-deploy-clean-artifact.md)
- [production-rollback-clean-artifact.md](/Users/alopez/Devs/Vutler/docs/runbooks/production-rollback-clean-artifact.md)

## Hard Rules

- Do not treat "it worked once" as production hardening.
- Do not widen rollout if deploy state, backups, or credential ownership are still ambiguous.
- Do not introduce a new operational dependency without an owner, a validation path, and a rollback story.
