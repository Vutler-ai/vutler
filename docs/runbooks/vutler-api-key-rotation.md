# VUTLER_API_KEY Rotation Runbook

## Goal

Rotate the runtime `VUTLER_API_KEY` used by `vutler-api` without losing the ability to run post-deploy smoke tests.

## Preconditions

- You are on the host that runs `vutler-api`.
- `docker`, `psql`, `openssl`, and `sha256sum` are available.
- `DATABASE_URL` is present either in the running `vutler-api` container or in the target `.env` file.
- `JWT_SECRET` remains valid during the rotation window.

## Recommended Procedure

1. Prepare a new runtime key and update the target env file:

```bash
./scripts/rotate-vutler-api-key.sh
```

Defaults:

- container: `vutler-api`
- env file: `/home/ubuntu/vutler/.env`
- workspace: `00000000-0000-0000-0000-000000000001`
- key name: `vutler-api-runtime`

Useful overrides:

```bash
VUTLER_API_ENV_FILE=/path/to/.env \
VUTLER_WORKSPACE_ID=<workspace-id> \
VUTLER_API_KEY_NAME=prod-vutler-api-runtime \
./scripts/rotate-vutler-api-key.sh
```

2. Redeploy the API:

```bash
./scripts/deploy-api.sh
```

The deploy script now refuses to continue if either `JWT_SECRET` or `VUTLER_API_KEY` is missing from the runtime env file.

3. Run the smoke test:

```bash
./scripts/smoke-test.sh
```

Expected result:

- `Auth mode: api_key`
- `Results: 10/10 passed, 0 failed`

4. Revoke the previous key only after the smoke test passes.

The helper script prints a ready-to-run `psql` command for revocation if an old key was detected.

## Manual Rollback

If the deploy fails after writing the new key to the env file:

1. Restore the latest env backup created by `rotate-vutler-api-key.sh`.
2. Run `./scripts/deploy-api.sh` again.
3. Do not revoke the previous key.

## Notes

- `scripts/smoke-test.sh` supports both `VUTLER_API_KEY` and `JWT_SECRET`, but the preferred steady state is `Auth mode: api_key`.
- Keep the key name explicit. Recommended names:
  - `vutler-api-runtime`
  - `staging-vutler-api-runtime`
  - `prod-vutler-api-runtime`
