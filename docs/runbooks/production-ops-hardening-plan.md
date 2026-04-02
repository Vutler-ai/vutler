# Production Ops Hardening Plan

This is the next hardening track for Vutler production on Vaultbrix.

## Current Baseline

- DB ownership normalized on `tenant_vutler_owner`
- runtime DDL blocked in production
- migrations tracked in `tenant_vutler.schema_migrations`
- API deploys run on Node 20
- smoke test covers core API surfaces
- release metadata is now persisted by deploy and rollback scripts

## Priority 1: Release Discipline

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

## Priority 2: Backup And Restore

Goal:

- move from “backup exists” to “backup is verified and restorable”

Actions:

- schedule `./scripts/backup-db.sh --mode schema` daily
- schedule `./scripts/backup-db.sh --mode full` before risky migrations and at a regular cadence
- run a monthly restore drill using [database-backup-restore.md](/Users/alopez/Devs/Vutler/docs/runbooks/database-backup-restore.md)

Exit criteria:

- latest verified schema backup < 24h old
- latest verified full backup < agreed RPO
- latest restore drill date documented

## Priority 3: Deploy Gates

Goal:

- stop shipping when the platform is already drifting

Actions:

- block deploy if `production-state-audit.sh --strict` fails
- block deploy if smoke test fails
- block deploy if the target commit is not contained in `origin/main`

Exit criteria:

- no deploy proceeds with unhealthy API, pending migrations or mixed owners

## Priority 4: Observability

Goal:

- shorten time-to-detection and time-to-diagnosis

Actions:

- alert on repeated `500` by route family
- alert on failed migrations, failed backups and failed smoke tests
- add a dashboard for API health, worker status, DB connectivity and scheduler activity

Exit criteria:

- incidents are visible without SSH
- regressions are caught before user reports

## Priority 5: Secret And Role Hygiene

Goal:

- remove silent privilege and credential drift

Actions:

- inventory all active `.env` sources and container env files
- rotate DB and API credentials on a schedule
- keep owner/admin roles separated from app roles

Exit criteria:

- each runtime credential has one owner and one rotation path
- app roles are never object owners
