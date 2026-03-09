# 🚀 Snipara Sync - Quick Start

## ⚠️ STEP 1: Run Database Migration (REQUIRED)

```bash
# You need admin/owner DB credentials for this
PGPASSWORD='<ADMIN_PASSWORD>' psql \
  -h REDACTED_DB_HOST \
  -p 6543 \
  -U <ADMIN_USER> \
  -d postgres \
  -f /home/ubuntu/vutler/scripts/migration-snipara-sync.sql
```

**Or manually:**
```sql
ALTER TABLE tenant_vutler.workspaces 
  ADD COLUMN IF NOT EXISTS snipara_project_id TEXT,
  ADD COLUMN IF NOT EXISTS snipara_api_key TEXT;

ALTER TABLE tenant_vutler.tasks 
  ADD COLUMN IF NOT EXISTS swarm_task_id TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_swarm_task_id 
  ON tenant_vutler.tasks(swarm_task_id);
```

---

## ✅ STEP 2: Verify Deployment

```bash
# Check if server is running
curl http://83.228.222.180:3001/api/v1/health

# Test webhook endpoint
curl -X POST http://83.228.222.180:3001/api/v1/task-router/sync \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'

# Expected: {"success":false,"error":"event and task are required"}
# If you get this, the endpoint is live ✓
```

---

## 🧪 STEP 3: Run Tests

```bash
cd /home/ubuntu/vutler/scripts
./test-snipara-sync.sh
```

---

## 🔗 STEP 4: Configure Snipara Webhook

Point Snipara to send webhooks to:
```
POST https://vutler.com/api/v1/task-router/sync
```

Or direct IP:
```
POST http://83.228.222.180:3001/api/v1/task-router/sync
```

**Events to subscribe:**
- `task_created`
- `task_completed`
- `task_updated`

---

## 📋 What Each Endpoint Does

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/onboarding/complete` | POST | Creates workspace + Snipara project |
| `/api/v1/task-router` | POST | Creates task + syncs to Snipara |
| `/api/v1/task-router/:id` | PUT | Updates task + syncs completion |
| `/api/v1/task-router/sync` | POST | Receives Snipara webhooks |

---

## 🔍 Troubleshooting

**Problem:** Columns don't exist errors in logs  
**Solution:** Run migration (Step 1)

**Problem:** Snipara sync not working  
**Solution:** Check workspace has `snipara_api_key` set

**Problem:** Webhook not creating tasks  
**Solution:** Verify `workspace_id` in webhook payload

**Problem:** Tasks not appearing in Snipara  
**Solution:** Check Docker logs for API errors

---

## 📁 Important Files

- **Migration:** `/home/ubuntu/vutler/scripts/migration-snipara-sync.sql`
- **Tests:** `/home/ubuntu/vutler/scripts/test-snipara-sync.sh`
- **Docs:** `/home/ubuntu/vutler/CHUNK-3-4-FINAL-REPORT.md`
- **Config:** `/home/ubuntu/vutler/.env` (optional Snipara settings)

---

## 📞 Quick Commands

```bash
# Restart Docker
ssh ubuntu@83.228.222.180 "docker restart vutler-api-test"

# View logs
ssh ubuntu@83.228.222.180 "docker logs vutler-api-test --tail 50"

# Check for Snipara errors
ssh ubuntu@83.228.222.180 "docker logs vutler-api-test 2>&1 | grep -i snipara"

# Run tests
ssh ubuntu@83.228.222.180 "cd /home/ubuntu/vutler/scripts && ./test-snipara-sync.sh"
```

---

## ✅ Success Criteria

After migration, you should see:
- ✅ Workspaces created via onboarding have `snipara_project_id`
- ✅ Tasks created have `swarm_task_id` populated
- ✅ Completing tasks logs "Completed task in Snipara swarm"
- ✅ Webhook creates tasks in Vutler DB
- ✅ No "column does not exist" errors in logs

---

**Full documentation:** `/home/ubuntu/vutler/CHUNK-3-4-FINAL-REPORT.md`
