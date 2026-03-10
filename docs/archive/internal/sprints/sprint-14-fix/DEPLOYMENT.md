# Sprint 14 Runtime Schema Fix - Deployment Guide

## ✅ Fichiers Patchés

Tous les fichiers ont été corrigés pour matcher le **vrai schema PostgreSQL (tenant_vutler)**.

### Fichiers créés dans `projects/vutler/sprint-14-fix/`:

1. **agent-loop.js** (root)
   - ✅ `updateRuntimeStatus()`: `last_heartbeat` → `last_activity`, `error_message` → `config`
   - ✅ `getAgentLLMConfig()`: removed `metadata` column

2. **system-prompt-builder.js** (root)
   - ✅ `getAgentConfig()`: split into `getAgentLLMConfig()` + `getAgentRuntimeConfig()`
   - ✅ Removed non-existent columns: `name, soul, mbti_type, capabilities, system_prompt_template`
   - ✅ Now uses `config` from `agent_runtime_status` for identity data
   - ✅ `getAssignedTasks()`: `assigned_to` → `assignee`

3. **memory-manager.js** (root)
   - ✅ `memory_type` → `type`
   - ✅ Removed columns: `importance`, `last_accessed_at`, `decay_factor`
   - ✅ All metadata now stored in `metadata` JSON column

4. **tools/tasks.js**
   - ✅ All `assigned_to` → `assignee`
   - ✅ Table prefix `tenant_vutler.` added
   - ✅ Tool definitions updated

5. **tools/memories.js**
   - ✅ `memory_type` → `type`
   - ✅ Removed: `importance`, `last_accessed_at`, `decay_factor`, `embedding`, `confidence`, `access_count`
   - ✅ Importance/tags now stored in `metadata` JSON
   - ✅ Table prefix `tenant_vutler.` added

6. **tools/goals.js**
   - ✅ `target_date` → `deadline`
   - ✅ Added `phases`, `checkins` to GET query
   - ✅ Table prefix `tenant_vutler.` added

7. **tools/calendar.js**
   - ✅ Removed non-existent columns: `location`, `status`, `metadata`, `updated_at`
   - ✅ Real schema: `id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at`
   - ✅ Table prefix `tenant_vutler.` added

---

## 🚨 CRITICAL: ANTHROPIC_API_KEY Missing

**Constat:** Le container `vutler-api` n'a **AUCUNE** variable `ANTHROPIC_API_KEY` dans son environment.

### Solution 1: Add Environment Variable (Recommended)

Ajoute la clé dans le docker-compose ou l'env du container:

```bash
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180

# Option A: docker-compose.yml
cd /path/to/vutler-api
nano docker-compose.yml
# Add:
# environment:
#   - ANTHROPIC_API_KEY=process.env.ANTHROPIC_API_KEY...

# Option B: Direct env file
docker exec vutler-api sh -c 'echo "ANTHROPIC_API_KEY=process.env.ANTHROPIC_API_KEY..." >> .env'

# Restart container
docker restart vutler-api
```

### Solution 2: Use Existing LLM Router

Si `/app/api/llm-router.js` existe et gère déjà les API keys:

Modifie `agent-loop.js` pour utiliser le router au lieu de direct Anthropic API:

```javascript
// Replace this.anthropicEndpoint with:
const llmRouter = require('../api/llm-router');

// In callAnthropic(), use:
const response = await llmRouter.send(payload);
```

---

## 📦 Deployment Steps

### 1. Upload Patched Files to VPS

```bash
# From local machine
scp -i .secrets/vps-ssh-key.pem -r projects/vutler/sprint-14-fix/* ubuntu@83.228.222.180:/tmp/runtime-patch/
```

### 2. Backup Current Runtime

```bash
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180

# Backup
sudo cp -r /app/runtime /app/runtime-backup-$(date +%Y%m%d-%H%M%S)
```

### 3. Replace Files

```bash
# Copy patched files
sudo cp /tmp/runtime-patch/agent-loop.js /app/runtime/
sudo cp /tmp/runtime-patch/system-prompt-builder.js /app/runtime/
sudo cp /tmp/runtime-patch/memory-manager.js /app/runtime/
sudo cp /tmp/runtime-patch/tools/tasks.js /app/runtime/tools/
sudo cp /tmp/runtime-patch/tools/memories.js /app/runtime/tools/
sudo cp /tmp/runtime-patch/tools/goals.js /app/runtime/tools/
sudo cp /tmp/runtime-patch/tools/calendar.js /app/runtime/tools/

# Verify
ls -lah /app/runtime/
ls -lah /app/runtime/tools/
```

### 4. Set File Permissions

```bash
sudo chown -R node:node /app/runtime/
sudo chmod -R 755 /app/runtime/
```

### 5. Restart Container

```bash
docker restart vutler-api

# Check logs
docker logs -f vutler-api --tail 50
```

### 6. Test Runtime

```bash
# SSH into container
docker exec -it vutler-api sh

# Test import
node -e "const AgentLoop = require('./runtime/agent-loop'); console.log('✅ AgentLoop loaded');"

# Test DB connection
node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT COUNT(*) FROM tenant_vutler.agent_runtime_status')
  .then(r => console.log('✅ DB OK:', r.rows[0]))
  .catch(e => console.error('❌ DB Error:', e.message));
"
```

---

## 🔍 Schema Reference (Real)

### agent_runtime_status
```
id, agent_id, status, started_at, last_activity, config, created_at, workspace_id
```

### agent_llm_configs
```
id, agent_id, provider, model, temperature, max_tokens, created_at, updated_at, workspace_id
```

### agent_memories
```
id, agent_id, type, content, metadata, created_at, updated_at, workspace_id
```

### tasks
```
id, title, description, status, priority, assignee, due_date, created_at, updated_at, workspace_id
```

### goals
```
id, workspace_id, agent_id, title, description, status, progress, deadline, phases, checkins, priority, created_at, updated_at
```

### events
```
id, workspace_id, title, description, start_time, end_time, agent_id, event_type, color, created_at
```

---

## 🧪 Testing Checklist

- [ ] agent-loop.js loads without errors
- [ ] system-prompt-builder.js queries work
- [ ] Tasks CRUD operations work (assignee column)
- [ ] Goals CRUD operations work (deadline column)
- [ ] Memories store/recall work (type + metadata)
- [ ] Calendar events work (no location/status)
- [ ] Agent runtime status updates correctly
- [ ] ANTHROPIC_API_KEY set or LLM router configured

---

## 🆘 Rollback

Si quelque chose plante:

```bash
ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180

# Find backup
ls -la /app/ | grep runtime-backup

# Restore
sudo rm -rf /app/runtime
sudo mv /app/runtime-backup-YYYYMMDD-HHMMSS /app/runtime

# Restart
docker restart vutler-api
```

---

## 📝 Notes

- **Workspace ID:** `00000000-0000-0000-0000-000000000001` hardcoded partout
- **Schema prefix:** `tenant_vutler.` requis pour toutes les queries
- **Metadata columns:** Utilisés pour stocker les données qui n'ont pas de colonne dédiée
- **LLM Router:** Vérifier si `/app/api/llm-router.js` existe et peut remplacer direct Anthropic API

---

**Auteur:** Mike ⚙️  
**Date:** 2026-02-27  
**Sprint:** 14 Runtime Patch
