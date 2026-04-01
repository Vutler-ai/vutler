# Snipara VPS Hotfix Notes

Date: 2026-04-01

## Canonical Snipara runtime
- Default workspace ID: `00000000-0000-0000-0000-000000000001`
- Canonical swarm ID: `cmnfqjr5600i0qgotdbrgpd5q`
- Legacy swarm ID: `cmmfe0cq90008o1cohufkls68`
- Snipara project ID: `cmmfdy2up0002o1colc66rxs2`
- Snipara project slug: `test-workspace-api-vutler`

## VPS endpoints
- App/API: [https://app.vutler.ai](https://app.vutler.ai)
- SSH: `ssh -i ~/.ssh/vps-ssh-key.pem ubuntu@83.228.222.180`
- Container: `vutler-api`
- VPS repo path: `/home/ubuntu/vutler`

## Runtime config that must stay aligned
- Container env now points to the canonical swarm:
  - `SNIPARA_SWARM_ID=cmnfqjr5600i0qgotdbrgpd5q`
  - `SNIPARA_LEGACY_SWARM_ID=cmmfe0cq90008o1cohufkls68`
- Workspace override in `tenant_vutler.workspace_settings` for workspace `00000000-0000-0000-0000-000000000001` must also define `snipara_swarm_id=cmnfqjr5600i0qgotdbrgpd5q`
- If the DB override is missing, the runtime falls back to the container env.

## Failure modes seen on 2026-04-01
- `tasks-v2` route skipped at startup due a bad in-container edit:
  - `Unexpected token '||'`
- Hierarchical task creation failed when the running container had an older `SwarmCoordinator` implementation:
  - `swarmCoordinator.createHtask is not a function`
- Older code used invalid default `workstreamType: 'GENERAL'` for `N2_WORKSTREAM`
- Earlier legacy coordinator variants tried schema mutations and can fail with DB ownership issues; avoid reintroducing `ALTER TABLE` logic in runtime init paths.

## Fast recovery procedure
Use this instead of a full Docker rebuild when prod drift is limited to the task/Snipara hotfix files.

1. Copy the clean local `tasks-v2` file to the VPS repo.
2. Replace the running container files directly.
3. Restart only `vutler-api`.
4. Re-run the backend-only sync test.

Commands:

```bash
scp -i ~/.ssh/vps-ssh-key.pem \
  /Users/alopez/Devs/Vutler/app/custom/api/tasks-v2.js \
  ubuntu@83.228.222.180:/home/ubuntu/vutler/app/custom/api/tasks-v2.js

ssh -i ~/.ssh/vps-ssh-key.pem ubuntu@83.228.222.180 '
  set -e
  node --check /home/ubuntu/vutler/app/custom/api/tasks-v2.js
  cat /home/ubuntu/vutler/app/custom/api/tasks-v2.js | docker exec -i vutler-api sh -lc "cat > /app/app/custom/api/tasks-v2.js"
  cat /home/ubuntu/vutler/app/custom/services/swarmCoordinator.js | docker exec -i vutler-api sh -lc "cat > /app/app/custom/services/swarmCoordinator.js"
  docker exec vutler-api node --check /app/app/custom/api/tasks-v2.js
  docker restart vutler-api >/dev/null
  until curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null; do sleep 2; done
'
```

Verification helpers:

```bash
ssh -i ~/.ssh/vps-ssh-key.pem ubuntu@83.228.222.180 \
  'docker inspect -f "{{range .Config.Env}}{{println .}}{{end}}" vutler-api | egrep "^(SNIPARA_SWARM_ID|SNIPARA_LEGACY_SWARM_ID|VUTLER_API_KEY|JWT_SECRET)="'

ssh -i ~/.ssh/vps-ssh-key.pem ubuntu@83.228.222.180 \
  'docker logs --tail 120 vutler-api 2>&1 | tail -n 120'
```

## Backend-only validation
Test file:
- `/Users/alopez/Devs/Vutler/scripts/test-snipara-vutler-sync.js`

Command:

```bash
cd /Users/alopez/Devs/Vutler
VUTLER_API_KEY='vutler_eccf4b48ffdbabf1f1c2e1051a4d99bbc48dd486270fc689' \
node scripts/test-snipara-vutler-sync.js \
  --base-url https://app.vutler.ai \
  --prefix SYNCTEST-prod-$(date +%H%M%S)
```

Expected result:
- `task` Vutler -> Snipara: OK
- `task` Snipara -> Vutler: OK
- `htask` root/workstream/leaf: OK
- Local hierarchy projection: OK

Known good validation run after hotfix:
- Prefix: `SYNCTEST-prod-112227`

## Files touched for this hotfix
- `/Users/alopez/Devs/Vutler/app/custom/api/tasks-v2.js`
- `/Users/alopez/Devs/Vutler/scripts/test-snipara-vutler-sync.js`
- `/Users/alopez/Devs/Vutler/docs/specs/snipara-vutler-backend-test-protocol.md`
- `/Users/alopez/Devs/Vutler/docs/specs/snipara-vps-hotfix-notes.md`

## Important operational note
The local repo and `/home/ubuntu/vutler` can drift. Before the next full deploy, make sure the VPS repo still contains the clean `tasks-v2.js` hotfix and a `SwarmCoordinator` implementation with `createHtask`, `blockHtask`, `unblockHtask`, `completeHtask`, `verifyHtaskClosure`, and `closeHtask`.
