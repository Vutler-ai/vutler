# Database Owner Normalization

Use this runbook when `tenant_vutler` objects have mixed owners such as `postgres`, `tenant_vutler`, and `tenant_vutler_service`.

## Goal

- move schema ownership to one dedicated role
- keep app roles as granted users, not owners
- stop runtime DDL from recreating the drift

## Recommended target model

- owner role: `tenant_vutler_owner` (`NOLOGIN`)
- app roles: `tenant_vutler`, `tenant_vutler_service`
- derived app roles: keep environment-scoped roles such as `tenant_vutler_service.vaultbrix-prod`
- migrations: executed by admin, then `SET ROLE tenant_vutler_owner` if needed

## 1. Audit current owners

```bash
npm run db:owners:audit
```

JSON output:

```bash
npm run db:owners:audit:json
```

## 2. Backup before changing ownership

Schema dump:

```bash
pg_dump "$DATABASE_URL" --schema-only --schema=tenant_vutler > tenant_vutler-schema.sql
```

Owner snapshot:

```bash
npm run db:owners:audit:json > tenant_vutler-owners.json
```

## 3. Generate normalization SQL

```bash
npm run db:owners:sql > tenant_vutler-owner-normalization.sql
```

The generator automatically expands derived roles that match a granted base role, for example:

- `tenant_vutler_service` -> `tenant_vutler_service.vaultbrix-prod`

Custom target role:

```bash
node scripts/generate-owner-normalization-sql.js --target-owner tenant_vutler_owner > tenant_vutler-owner-normalization.sql
```

## 4. Apply with an admin role

Do not apply with the app role if objects are owned by other roles.

```bash
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f tenant_vutler-owner-normalization.sql
```

### Current Vaultbrix Production Path

Current production uses a split operational model:

- Vutler app host: `83.228.222.180`
- Vaultbrix/Supabase DB host: `84.234.19.42`

When `production-state-audit.sh --strict` reports mixed owners, the fix may need to run on the Vaultbrix side, not on the Vutler app host.

Operational path used successfully in production:

1. Connect to Vaultbrix:

```bash
ssh -i ~/.ssh/vaultbrix_ed25519 ubuntu@84.234.19.42
```

2. Use the Supabase Postgres container with an admin role:

```bash
docker exec -e PGPASSWORD="$SUPABASE_ADMIN_PASSWORD" supabase-db \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -f tenant_vutler-owner-normalization.sql
```

3. For targeted fixes, apply only the drifting objects:

```sql
BEGIN;
ALTER TABLE tenant_vutler.orchestration_run_events OWNER TO tenant_vutler_owner;
ALTER TABLE tenant_vutler.orchestration_run_steps OWNER TO tenant_vutler_owner;
ALTER TABLE tenant_vutler.orchestration_runs OWNER TO tenant_vutler_owner;
ALTER SEQUENCE tenant_vutler.orchestration_run_events_id_seq OWNER TO tenant_vutler_owner;
COMMIT;
```

4. Re-run the strict audit from the Vutler repo:

```bash
./scripts/production-state-audit.sh --strict
```

### SSH And Tunnel Shortcuts Used In Production

Vaultbrix host:

```bash
ssh -i ~/.ssh/vaultbrix_ed25519 ubuntu@84.234.19.42
```

Optional local tunnel for direct psql work:

```bash
ssh -i ~/.ssh/vaultbrix_ed25519 -L 15432:localhost:5433 ubuntu@84.234.19.42
```

Example direct session through the tunnel:

```bash
PGPASSWORD="..." psql -h localhost -p 15432 -U tenant_vutler -d postgres
```

Important current-state note:

- `tenant_vutler` is the app role
- it is not sufficient to change owners on objects owned by another role
- owner normalization still requires an admin or owner-capable role such as `supabase_admin`

Use the tunnel path for inspection and targeted SQL only if you already have the correct password and role.

## 5. Verify

```bash
npm run db:owners:audit
npm run migrate:status
```

Expected result:

- a single owner for all `tenant_vutler` objects
- zero pending migrations

## Runtime DDL guard

`lib/vaultbrix.js` now blocks runtime DDL when `NODE_ENV=production`, unless:

```bash
ALLOW_RUNTIME_SCHEMA_MUTATIONS=true
```

That override should stay disabled in production. Use migrations instead.
