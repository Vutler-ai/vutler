# Database Backup And Restore

Use this runbook for logical backups of the `tenant_vutler` schema on Vaultbrix.

## Goal

- take repeatable backups from a controlled script
- verify artifacts immediately after dump
- keep enough history for rollback and restore drills

## Backup Script

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

## Recommended Backup Modes

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

Each run writes:

- the backup artifact
- `*.sha256`
- `*.meta`

Verification is automatic unless `--no-verify` is passed.

## Restore Hints

Schema-only:

```bash
gunzip -c /path/to/vutler-schema-backup-<timestamp>.sql.gz | psql "$DATABASE_URL"
```

Full or data custom dump:

```bash
pg_restore --clean --if-exists -d "$DATABASE_URL" /path/to/vutler-full-backup-<timestamp>.dump
```

For restore drills, restore into a temporary database first:

```bash
createdb vutler_restore_test
pg_restore --clean --if-exists -d vutler_restore_test /path/to/vutler-full-backup-<timestamp>.dump
```

## Restore Drill Policy

- run a restore drill at least once per month
- test both `schema` and `full` backup paths
- record duration, errors and object count
- keep the last successful drill date in ops notes

## Operational Rules

- always take a backup before owner normalization or risky migrations
- keep schema-only backups for fast diff/debug
- keep full backups for disaster recovery
- do not rely on ad hoc `pg_dump` commands from shell history
