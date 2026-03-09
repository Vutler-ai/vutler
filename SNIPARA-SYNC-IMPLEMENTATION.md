# Snipara Auto-Provisioning + Task Sync Implementation

## ✅ Completed

### 1. Database Migration
**File:** `/home/ubuntu/vutler/scripts/migration-snipara-sync.sql`

⚠️ **REQUIRES ADMIN CREDENTIALS** - The service user doesn't have ALTER TABLE privileges.

Run manually with admin credentials:
```bash
psql -h REDACTED_DB_HOST -p 6543 -U <ADMIN_USER> -d postgres -f /home/ubuntu/vutler/scripts/migration-snipara-sync.sql
```

Migration adds:
- `workspaces.snipara_project_id` (TEXT)
- `workspaces.snipara_api_key` (TEXT)  
- `tasks.swarm_task_id` (TEXT)
- Index on `tasks.swarm_task_id`

### 2. Snipara Service Module
**File:** `/home/ubuntu/vutler/services/sniparaService.js`

Functions:
- `createProject(workspaceName, workspaceId)` — Creates Snipara project during workspace provisioning
- `createTask(task, apiKey)` — Syncs Vutler task to Snipara swarm
- `completeTask(swarmTaskId, apiKey)` — Marks task complete in swarm

### 3. Auto-Provisioning in Onboarding
**File:** `/home/ubuntu/vutler/api/onboarding.js` (backup: `onboarding.js.bak-snipara`)

Modified `POST /complete`:
- Calls `sniparaService.createProject()` when workspace is created
- Stores `snipara_project_id` and `snipara_api_key` in workspaces table
- Non-blocking: continues even if Snipara provisioning fails

### 4. Bidirectional Task Sync
**File:** `/home/ubuntu/vutler/services/taskRouter.js` (backup: `taskRouter.js.bak-snipara`)

Modified functions:
- `createTask()`: Calls `sniparaService.createTask()` after creating task, stores `swarm_task_id`
- `updateTask()`: Calls `sniparaService.completeTask()` when status changes to 'done' or 'completed'
- `getWorkspaceSniparaKey()`: Retrieves workspace-specific API key

### 5. Webhook Endpoint
**File:** `/home/ubuntu/vutler/api/tasks-router.js`

New endpoint: `POST /api/v1/task-router/sync`

Handles Snipara webhooks:
- `task_created`: Creates new task in Vutler from swarm
- `task_completed`: Marks Vutler task as done
- `task_updated`: Updates task fields from swarm

Expected webhook payload:
```json
{
  "event": "task_created|task_completed|task_updated",
  "task": {
    "swarm_task_id": "...",
    "title": "...",
    "description": "...",
    "priority": "P1|P2|P3",
    "status": "todo|in_progress|completed",
    "metadata": {
      "workspace_id": "uuid",
      "vutler_task_id": "uuid (optional)"
    }
  }
}
```

## 🔧 Configuration

Add to `.env` (optional, uses defaults if not set):
```bash
SNIPARA_API_URL=https://api.snipara.com/mcp/test-workspace-api-vutler
SNIPARA_API_KEY=REDACTED_SNIPARA_KEY_2
SNIPARA_SWARM_ID=cmmdu24k500g01ihbw32d44x2
```

## 📝 Next Steps

1. **Run migration SQL** with admin credentials
2. **Restart Docker container**: `docker restart vutler-api-test`
3. **Test endpoints** (see below)
4. **Configure Snipara webhook** to point to `https://vutler.com/api/v1/task-router/sync`

## 🧪 Testing

### Test Auto-Provisioning
```bash
curl -X POST https://vutler.com/api/v1/onboarding/complete \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <USER_TOKEN>" \
  -d '{
    "workspaceName": "Test Workspace",
    "categories": ["startup"],
    "plan": "starter"
  }'
```

Expected response should include `snipara_project_id`.

### Test Task Creation (Vutler → Snipara)
```bash
curl -X POST https://vutler.com/api/v1/task-router/ \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test task sync to Snipara",
    "description": "This should appear in swarm",
    "priority": "P2",
    "workspace_id": "<WORKSPACE_UUID>"
  }'
```

Check response for `swarm_task_id`.

### Test Task Completion (Vutler → Snipara)
```bash
curl -X PUT https://vutler.com/api/v1/task-router/<TASK_ID> \
  -H "Content-Type: application/json" \
  -d '{ "status": "done" }'
```

Should log completion in Snipara swarm.

### Test Webhook (Snipara → Vutler)
```bash
curl -X POST https://vutler.com/api/v1/task-router/sync \
  -H "Content-Type: application/json" \
  -d '{
    "event": "task_created",
    "task": {
      "swarm_task_id": "test-swarm-123",
      "title": "Task from Snipara swarm",
      "description": "Created in swarm",
      "priority": "P1",
      "metadata": {
        "workspace_id": "<WORKSPACE_UUID>"
      }
    }
  }'
```

Should create a new task in Vutler.

## 📋 Files Modified/Created

- ✅ `/home/ubuntu/vutler/scripts/migration-snipara-sync.sql` (new)
- ✅ `/home/ubuntu/vutler/services/sniparaService.js` (new)
- ✅ `/home/ubuntu/vutler/api/onboarding.js` (modified, backup created)
- ✅ `/home/ubuntu/vutler/services/taskRouter.js` (modified, backup created)
- ✅ `/home/ubuntu/vutler/api/tasks-router.js` (modified with /sync endpoint)

## ⚠️ Known Issues

1. **DB Migration pending**: Service user lacks ALTER TABLE privileges
   - Solution: Run migration script with admin/owner credentials
   
2. **Snipara API testing**: Cannot fully test without running migration first
   - Application code is defensive and will handle missing columns gracefully
   
3. **Webhook configuration**: Snipara needs to be configured to send webhooks to Vutler
   - URL: `https://vutler.com/api/v1/task-router/sync`
   - Method: POST
   - Events: task_created, task_completed, task_updated

## 🎯 Flow Summary

### Workspace Creation (Auto-Provisioning)
1. User completes onboarding
2. Vutler creates workspace
3. Vutler calls Snipara API to create project
4. Snipara returns `project_id` and `api_key`
5. Vutler stores these in `workspaces` table
6. All agents in workspace can now use this Snipara project

### Task Creation (Vutler → Snipara)
1. User/Agent creates task in Vutler
2. Task saved to DB
3. Vutler retrieves workspace `snipara_api_key`
4. Vutler calls Snipara API `rlm_task_create`
5. Snipara returns `swarm_task_id`
6. Vutler updates task with `swarm_task_id`

### Task Completion (Vutler → Snipara)
1. User/Agent marks task as done
2. Task status updated in DB
3. If `swarm_task_id` exists, call Snipara API `rlm_task_complete`
4. Task marked complete in swarm

### Task Sync (Snipara → Vutler)
1. Snipara swarm sends webhook to `/api/v1/task-router/sync`
2. Vutler receives event (created/completed/updated)
3. Vutler creates or updates corresponding task
4. Task appears in Vutler UI

## 🔐 Security Notes

- API keys stored in workspaces table (encrypted at DB level via Vaultbrix)
- Webhook endpoint is public but validates workspace_id
- Non-blocking sync: failures don't break main task flow
- All Snipara errors are logged but don't halt operations
