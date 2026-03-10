# 📋 Sprint 14 Runtime Deployment - Checklist

**Use this checklist to ensure a smooth deployment.**

---

## Pre-Deployment Checks

- [ ] **VPS access verified**
  ```bash
  ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180 "echo OK"
  ```

- [ ] **Current runtime backed up**
  ```bash
  ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180
  sudo cp -r /app/runtime /app/runtime-backup-$(date +%Y%m%d-%H%M%S)
  ```

- [ ] **Database schema validated**
  ```bash
  # Upload test-schema.sql to VPS
  scp -i .secrets/vps-ssh-key.pem test-schema.sql ubuntu@83.228.222.180:/tmp/
  
  # Run validation
  ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180
  docker exec vutler-api psql $DATABASE_URL -f /tmp/test-schema.sql
  ```

- [ ] **All patch files present locally**
  ```bash
  cd projects/vutler/sprint-14-fix
  ls -la agent-loop.js system-prompt-builder.js memory-manager.js
  ls -la tools/tasks.js tools/memories.js tools/goals.js tools/calendar.js
  ```

- [ ] **ANTHROPIC_API_KEY decision made**
  - [ ] Option A: Add to container env
  - [ ] Option B: Use LLM Router
  - [ ] See DEPLOYMENT.md section "CRITICAL: ANTHROPIC_API_KEY Missing"

---

## Deployment Steps

- [ ] **1. Upload patch files**
  ```bash
  ./deploy.sh
  # OR manually:
  scp -i .secrets/vps-ssh-key.pem -r * ubuntu@83.228.222.180:/tmp/runtime-patch/
  ```

- [ ] **2. Replace runtime files**
  ```bash
  ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180
  sudo cp /tmp/runtime-patch/*.js /app/runtime/
  sudo cp /tmp/runtime-patch/tools/*.js /app/runtime/tools/
  ```

- [ ] **3. Set permissions**
  ```bash
  sudo chown -R node:node /app/runtime/
  sudo chmod -R 755 /app/runtime/
  ```

- [ ] **4. Restart container**
  ```bash
  docker restart vutler-api
  ```

- [ ] **5. Watch logs**
  ```bash
  docker logs -f vutler-api --tail 50
  ```

---

## Post-Deployment Tests

- [ ] **Runtime loads without errors**
  ```bash
  docker exec vutler-api node -e "
    const AgentLoop = require('./runtime/agent-loop');
    console.log('✅ AgentLoop loaded');
  "
  ```

- [ ] **Database connection works**
  ```bash
  docker exec vutler-api node -e "
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    pool.query('SELECT COUNT(*) FROM tenant_vutler.agent_runtime_status')
      .then(r => console.log('✅ DB OK:', r.rows[0]))
      .catch(e => console.error('❌ DB Error:', e.message));
  "
  ```

- [ ] **Test each tool**
  - [ ] Tasks tool loads: `require('./runtime/tools/tasks')`
  - [ ] Goals tool loads: `require('./runtime/tools/goals')`
  - [ ] Memories tool loads: `require('./runtime/tools/memories')`
  - [ ] Calendar tool loads: `require('./runtime/tools/calendar')`

- [ ] **Agent endpoint responds**
  ```bash
  # From local machine or use curl on VPS
  curl -X POST http://83.228.222.180:PORT/agent/TEST-AGENT-ID/message \
    -H "Content-Type: application/json" \
    -d '{"message":"Hello, test runtime"}'
  ```

- [ ] **Check for schema errors in logs**
  ```bash
  docker logs vutler-api 2>&1 | grep -i "column.*does not exist"
  # Should return NOTHING
  ```

---

## Configuration Checks

- [ ] **ANTHROPIC_API_KEY set**
  ```bash
  docker exec vutler-api env | grep -i ANTHROPIC_API_KEY
  # Should show: ANTHROPIC_API_KEY=process.env.ANTHROPIC_API_KEY...
  ```

- [ ] **DATABASE_URL correct**
  ```bash
  docker exec vutler-api env | grep DATABASE_URL
  # Should point to tenant_vutler schema
  ```

- [ ] **Workspace ID matches**
  ```bash
  # Check if workspace exists
  docker exec vutler-api psql $DATABASE_URL -c "
    SELECT id, name FROM workspaces 
    WHERE id = '00000000-0000-0000-0000-000000000001';
  "
  ```

---

## Rollback (If Needed)

- [ ] **Identify backup**
  ```bash
  ssh -i .secrets/vps-ssh-key.pem ubuntu@83.228.222.180
  ls -la /app/ | grep runtime-backup
  ```

- [ ] **Restore backup**
  ```bash
  sudo rm -rf /app/runtime
  sudo mv /app/runtime-backup-YYYYMMDD-HHMMSS /app/runtime
  docker restart vutler-api
  ```

- [ ] **Verify rollback worked**
  ```bash
  docker logs -f vutler-api --tail 20
  ```

---

## Final Sign-Off

- [ ] **No errors in logs for 5 minutes**
- [ ] **Agent can process messages**
- [ ] **All tools functional**
- [ ] **Backup location documented**
- [ ] **Team notified of deployment**

---

## 🚨 Emergency Contacts

- **VPS IP:** 83.228.222.180
- **Container:** vutler-api
- **Backup location:** `/app/runtime-backup-*`
- **Logs:** `docker logs vutler-api`
- **Schema:** tenant_vutler
- **Workspace:** 00000000-0000-0000-0000-000000000001

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Backup Path:** _______________  
**Status:** ⬜ Success  ⬜ Partial  ⬜ Failed  ⬜ Rolled Back

---

**Notes:**
```
(Add any deployment notes here)
```
