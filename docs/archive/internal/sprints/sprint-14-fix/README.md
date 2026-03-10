# 🔧 Sprint 14 Runtime - Schema Fix Package

**Status:** ✅ READY FOR DEPLOYMENT  
**Date:** 2026-02-27  
**Author:** Mike ⚙️

---

## 📦 What's Inside

This package contains **patched runtime files** that fix all schema mismatches between the Sprint 14 runtime code and the **real PostgreSQL schema** (tenant_vutler).

### Files Included

```
sprint-14-fix/
├── agent-loop.js                  # Main agent loop
├── system-prompt-builder.js       # Dynamic prompt builder
├── memory-manager.js              # Memory recall/save/decay
├── tools/
│   ├── tasks.js                   # Tasks CRUD
│   ├── memories.js                # Memories store/recall
│   ├── goals.js                   # Goals CRUD
│   └── calendar.js                # Calendar events CRUD
├── DEPLOYMENT.md                  # Detailed deployment guide
├── PATCH_SUMMARY.md               # Complete changelog
├── deploy.sh                      # Automated deployment script
└── README.md                      # This file
```

**NOT included** (already OK):
- `tools/email.js` — no DB dependencies
- `tools/web-search.js` — no DB dependencies

---

## 🎯 Problems Fixed

### Schema Mismatches Corrected

| File | Problem | Fix |
|------|---------|-----|
| agent-loop.js | `last_heartbeat`, `error_message` columns don't exist | → `last_activity`, `config` |
| agent-loop.js | `metadata` column in agent_llm_configs | Removed from query |
| system-prompt-builder.js | Queries 8 non-existent columns | Split into LLM config + runtime config |
| memory-manager.js | `memory_type`, `importance`, etc. don't exist | → `type` + metadata JSON |
| tasks.js | `assigned_to` column | → `assignee` |
| memories.js | Multiple fake columns | → `type` + metadata JSON |
| goals.js | `target_date` column | → `deadline` |
| calendar.js | `location`, `status`, `metadata`, `updated_at` | Removed (don't exist) |

**ALL** queries now use `tenant_vutler.` schema prefix.

---

## 🚀 Quick Deploy

### Option 1: Automated Script

```bash
cd projects/vutler/sprint-14-fix
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Manual Deployment

See `DEPLOYMENT.md` for step-by-step instructions.

---

## ⚠️ Prerequisites

Before deploying:

1. **Backup current runtime:**
   ```bash
   ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180
   sudo cp -r /app/runtime /app/runtime-backup-$(date +%Y%m%d-%H%M%S)
   ```

2. **Set ANTHROPIC_API_KEY:**
   - Container currently has NO API key
   - Add to docker env or use existing LLM router
   - See `DEPLOYMENT.md` section "CRITICAL: ANTHROPIC_API_KEY Missing"

3. **Verify VPS access:**
   ```bash
   ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180 "echo OK"
   ```

---

## 📊 Schema Reference

Real PostgreSQL schema (tenant_vutler):

```sql
-- Agent Runtime
agent_runtime_status: id, agent_id, status, started_at, last_activity, config, created_at, workspace_id
agent_llm_configs: id, agent_id, provider, model, temperature, max_tokens, created_at, updated_at, workspace_id
agent_memories: id, agent_id, type, content, metadata, created_at, updated_at, workspace_id

-- Agent Tools
tasks: id, title, description, status, priority, assignee, due_date, created_at, updated_at, workspace_id
goals: id, workspace_id, agent_id, title, description, status, progress, deadline, phases, checkins, priority, created_at, updated_at
events: id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at
```

**Workspace ID:** `00000000-0000-0000-0000-000000000001`

---

## 🧪 Testing

After deployment:

```bash
# SSH into container
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180
docker exec -it vutler-api sh

# Test runtime load
node -e "const AgentLoop = require('./runtime/agent-loop'); console.log('✅ Runtime OK');"

# Test DB queries
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test each table
const tests = [
  'SELECT COUNT(*) FROM tenant_vutler.agent_runtime_status',
  'SELECT COUNT(*) FROM tenant_vutler.agent_llm_configs',
  'SELECT COUNT(*) FROM tenant_vutler.agent_memories',
  'SELECT COUNT(*) FROM tenant_vutler.tasks',
  'SELECT COUNT(*) FROM tenant_vutler.goals',
  'SELECT COUNT(*) FROM tenant_vutler.events'
];

(async () => {
  for (const q of tests) {
    const r = await pool.query(q);
    console.log('✅', q, '→', r.rows[0].count);
  }
  await pool.end();
})();
"
```

---

## 🆘 Rollback

If something breaks:

```bash
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180

# List backups
ls -la /app/ | grep runtime-backup

# Restore
sudo rm -rf /app/runtime
sudo mv /app/runtime-backup-YYYYMMDD-HHMMSS /app/runtime
docker restart vutler-api
```

---

## 📚 Documentation

- **DEPLOYMENT.md** — Full deployment guide with all options
- **PATCH_SUMMARY.md** — Complete changelog and diff summary

---

## 🎬 Next Steps After Deployment

1. ✅ Verify runtime loads without errors
2. ✅ Test agent endpoints (POST /agent/:id/message)
3. ✅ Check logs: `docker logs -f vutler-api`
4. ✅ Test tool executions (tasks, goals, memories, calendar)
5. ✅ Monitor DB queries for errors

---

## 💡 Notes

- All metadata fields are now JSONB (importance, tags, decay_factor, etc.)
- Runtime identity data (name, soul, mbti) stored in `agent_runtime_status.config`
- Email & web-search tools unchanged (no DB dependencies)
- Schema prefix `tenant_vutler.` required for all queries

---

**Questions?** Check `DEPLOYMENT.md` or `PATCH_SUMMARY.md`

**Ready to deploy?** Run `./deploy.sh` or follow `DEPLOYMENT.md`
