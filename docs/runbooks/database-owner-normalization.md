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
