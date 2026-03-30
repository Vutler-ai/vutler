# Staging Deploy and Validation Runbook

## Goal

Use this runbook after backend, frontend, migration, or orchestration changes that affect chat, tasks, Snipara, or realtime delivery.

If the VPS checkout is dirty or if production must match one exact commit, use
[production-deploy-clean-artifact.md](production-deploy-clean-artifact.md)
instead of rebuilding directly from `/home/ubuntu/vutler`.

The current staging host for Vutler is:

- VPS: `83.228.222.180`
- user: `ubuntu`
- key: `~/.ssh/vps-ssh-key.pem`

Base SSH command:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no ubuntu@83.228.222.180
```

## Current Runtime Assumptions

- API container name: `vutler-api`
- Frontend container name: `vutler-frontend`
- preferred smoke auth mode: `api_key`
- runtime API key name: `vutler-api-runtime`

## Preconditions

- the repo checkout on the VPS is up to date
- `DATABASE_URL`, `JWT_SECRET`, and `VUTLER_API_KEY` are available to the API runtime
- migrations to be deployed are present in `scripts/migrations/`
- Docker is healthy on the host

## 1. Apply database migrations

On the VPS:

```bash
cd /home/ubuntu/vutler
DATABASE_URL="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' vutler-api | sed -n 's/^DATABASE_URL=//p' | head -1)"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/20260330_chat_orchestration_hardening.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/20260330_tasks_snipara_task_id.sql
```

If the migration is already applied, inspect the schema before forcing another change.

## 2. Deploy backend and frontend

On the VPS:

```bash
cd /home/ubuntu/vutler
./scripts/deploy-api.sh
./scripts/deploy-frontend.sh
```

Notes:

- `./scripts/deploy-api.sh` will now fail fast if `JWT_SECRET` or `VUTLER_API_KEY` is missing
- `./scripts/deploy-api.sh` prints `Next: ./scripts/smoke-test.sh` when the API is healthy

## 3. Check container health

On the VPS:

```bash
docker inspect -f '{{.State.Health.Status}}' vutler-api
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'vutler-api|vutler-frontend'
curl -fsS http://127.0.0.1:3002/api/health
curl -I http://127.0.0.1:3002/chat
```

Expected result:

- `vutler-api`: `healthy`
- `vutler-frontend`: running
- frontend `/api/health`: `200`
- frontend `/chat`: `200`

## 4. Run the smoke test

On the VPS:

```bash
cd /home/ubuntu/vutler
./scripts/smoke-test.sh
```

Expected result:

- `Auth mode: api_key`
- `Results: 10/10 passed, 0 failed`

Current smoke coverage:

- health
- tasks
- tasks-v2
- sandbox
- chat
- clients
- notifications
- deployments
- nexus/status
- nexus/routing

## 5. Run e2e validation through an SSH tunnel

From the local workstation, open a tunnel:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem -o StrictHostKeyChecking=no \
  -L 13001:127.0.0.1:3001 \
  -L 13002:127.0.0.1:3002 \
  ubuntu@83.228.222.180
```

In another local shell, run the targeted e2e checks with an explicit workspace API key:

```bash
cd /path/to/vutler
TEST_API_URL=http://127.0.0.1:13001 \
TEST_API_KEY=<workspace-api-key> \
node tests/e2e/chat.test.js

TEST_API_URL=http://127.0.0.1:13001 \
TEST_API_KEY=<workspace-api-key> \
node tests/e2e/tasks.test.js
```

Expected result:

- `tests/e2e/chat.test.js`: pass
- `tests/e2e/tasks.test.js`: pass

## 6. Inspect logs for provider gating failures

Use a precise filter. Do not grep raw `403`, because channel IDs and UUID fragments can create false positives.

On the VPS:

```bash
docker logs vutler-api --tail 500 2>&1 | grep -Ei 'HTTP 403|feature_not_available|not available on your' || true
```

Expected result:

- no matches for the current validation window

## 7. Rollback Rules

- if the deploy fails after API key rotation, restore the last `.env` backup and redeploy
- do not revoke the previous runtime API key until smoke passes
- if a migration-dependent feature fails, verify schema state before rolling application code again

For runtime API key rotation, use [vutler-api-key-rotation.md](vutler-api-key-rotation.md).

## Reference Validation Snapshot

Reference staging validation completed on `2026-03-30`:

- migrations applied for chat orchestration hardening and `snipara_task_id`
- `vutler-api`: healthy
- `vutler-frontend`: healthy
- `./scripts/smoke-test.sh`: `10/10 passed`, `Auth mode: api_key`
- `tests/e2e/chat.test.js`: pass
- `tests/e2e/tasks.test.js`: pass
- runtime API key metadata renamed to `vutler-api-runtime`
