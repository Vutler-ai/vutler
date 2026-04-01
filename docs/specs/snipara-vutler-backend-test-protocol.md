# Snipara x Vutler backend test protocol

This protocol validates task and htask synchronization without querying PostgreSQL directly.
All checks go through the Vutler backend. The only direct Snipara call is the intentional inbound-sync test where a task is created on Snipara to ensure Vutler can ingest it.

## Preconditions

- API restarted with the new swarm `cmnfqjr5600i0qgotdbrgpd5q`
- `tenant_vutler.workspace_settings.snipara_swarm_id` updated for the target workspace
- either a valid Vutler API key is available in `VUTLER_API_KEY`
- or a valid `JWT_SECRET` is available so the script can mint a temporary admin JWT
- the script also attempts to read `.env`, `.env.local`, then `docker inspect vutler-api`
- local env already contains:
  - `SNIPARA_PROJECT_MCP_URL`
  - `SNIPARA_PROJECT_KEY` or `SNIPARA_API_KEY`
  - `SNIPARA_SWARM_ID`

## One-command test

```bash
cd /Users/alopez/Devs/Vutler
node scripts/test-snipara-vutler-sync.js --base-url http://localhost:3001
```

Optional flags:

```bash
node scripts/test-snipara-vutler-sync.js \
  --base-url http://localhost:3001 \
  --docker-container vutler-api \
  --workspace-id 00000000-0000-0000-0000-000000000001 \
  --assignee jarvis \
  --prefix SYNCTEST-manual \
  --wait-ms 5000 \
  --remote-wait-ms 130000 \
  --poll-ms 5000
```

## What the script validates

1. creates a simple task through `POST /api/v1/tasks-v2`
2. verifies the same task appears in Snipara
3. creates a task directly in Snipara
4. triggers `POST /api/v1/tasks-v2/sync`
5. verifies the Snipara-created task appears through `GET /api/v1/tasks-v2`
6. creates an htask root and two hierarchical children through Vutler backend
7. verifies the hierarchy is visible through Vutler using `GET /api/v1/tasks-v2/:id/subtasks`

## Backend endpoints used

- `POST /api/v1/tasks-v2`
- `GET /api/v1/tasks-v2`
- `POST /api/v1/tasks-v2/:id/subtasks`
- `POST /api/v1/tasks-v2/sync`
- `GET /api/v1/swarm/tasks`

## Pass criteria

- simple Vutler task is visible in Snipara
- simple Vutler task is visible through `GET /api/v1/swarm/tasks`
- direct Snipara task is visible through Vutler backend after sync
- hierarchical root, workstream, and leaf are all visible through Vutler backend
- the workstream is returned by the root subtasks endpoint
- the leaf is returned by the workstream subtasks endpoint

## Manual spot checks

- `GET /api/v1/swarm/tasks` should reflect the simple task title
- webhook receiver health should answer on `GET /api/v1/webhooks/snipara`
- if the direct Snipara task does not appear immediately, the sync loop window is up to 120 seconds by default

## Failure interpretation

- `401` from Vutler: invalid `VUTLER_API_KEY`, invalid `JWT_SECRET`, or wrong `workspace_id`
- `401` from Snipara: invalid `SNIPARA_PROJECT_KEY` / `SNIPARA_API_KEY`
- Vutler task exists but not in Snipara: outbound sync problem
- Snipara task exists but not in Vutler after `/tasks-v2/sync`: projection or webhook/sync loop problem
- root exists but children do not: hierarchical projection problem in `tasks-v2` or `SwarmCoordinator`
