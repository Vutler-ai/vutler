# Database Backup And Restore

## Goal

Take repeatable logical backups of the `tenant_vutler` schema on Vaultbrix and verify that those backups are actually restorable.

## Use When

Use this runbook when:
- scheduling routine database backups
- taking a pre-change backup before risky migrations or owner changes
- rehearsing a restore drill
- validating backup retention and artifact integrity

## Inputs

Script:

```bash
./scripts/backup-db.sh
```

Defaults:
- mode: `schema`
- schema: `tenant_vutler`
- retention: `7`
- output dir: `/home/ubuntu/backups`

Required environment:

```bash
export BACKUP_DB_HOST=...
export BACKUP_DB_USER=...
export BACKUP_DB_PASSWORD=...
```

Optional environment:

```bash
export BACKUP_DB_PORT=6543
export BACKUP_DB_NAME=postgres
export BACKUP_DB_SCHEMA=tenant_vutler
```

## Procedure

### 1. Run the correct backup mode

Schema-only before migrations:

```bash
./scripts/backup-db.sh --mode schema
```

Full logical backup before risky data changes:

```bash
./scripts/backup-db.sh --mode full
```

Data-only backup for migration rehearsals:

```bash
./scripts/backup-db.sh --mode data
```

### 2. Verify the expected artifacts exist

Each run should write:
- the backup artifact
- `*.sha256`
- `*.meta`

Verification is automatic unless `--no-verify` is passed.

### 3. Rehearse restore into a non-production target

Schema-only:

```bash
gunzip -c /path/to/vutler-schema-backup-<timestamp>.sql.gz | psql "$DATABASE_URL"
```

Full or data custom dump:

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" /path/to/vutler-full-backup-<timestamp>.dump
```

Preferred drill flow:

```bash
createdb vutler_restore_test
pg_restore --clean --if-exists -d vutler_restore_test /path/to/vutler-full-backup-<timestamp>.dump
```

## Validation

Restore drill policy:
- run a restore drill at least once per month
- test both `schema` and `full` backup paths
- record duration, errors, and object count
- keep the last successful drill date in ops notes

Expected outcome:
- backup artifact exists
- checksum artifact exists
- restore completes on a temporary target without silent errors

## Operational Rules

- Always take a backup before owner normalization or risky migrations.
- Keep schema-only backups for fast diff and debug work.
- Keep full backups for disaster recovery.
- Do not rely on ad hoc `pg_dump` commands from shell history.
- Do not restore directly into production for a rehearsal.
