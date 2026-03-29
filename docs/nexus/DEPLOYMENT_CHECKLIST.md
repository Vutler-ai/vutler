# Nexus Local Integrations — Deployment Checklist

## Pre-Deployment Verification (Development/Staging)

### 1. TaskExecutor Functionality

```bash
# Check that pending tasks execute on Mike (Codex provider)
npm run test:tasks-executor

# Expected output:
# ✅ Task 1 executed successfully
# ✅ Task 2 executed successfully
# Status: completed (not pending/failed)
```

### 2. WebSocket Client Connectivity

```bash
# Verify ws-client connects and maintains heartbeat
npm run test:ws-client

# Expected: Connection established, heartbeat received every 30s
# Check logs: ~/.vutler/logs/nexus.log
```

### 3. Provider Health Checks

```bash
# Test all 6 provider suites
npm run test:providers

# Should verify:
# ✓ Search provider (SearchProviderDarwin/Win32)
# ✓ Document reader (PDF, XLSX, CSV, DOCX)
# ✓ Clipboard polling
# ✓ File watcher
# ✓ Mail (AppleScript/COM)
# ✓ Calendar/Contacts
```

### 4. Dashboard Pairing Flow

```bash
# 1. Open browser to http://localhost:9999
# 2. QR onboarding page should display
# 3. Copy 6-char pairing code
# 4. Test folder permission toggles
# 5. Verify health check completes
# Expected: "You're all set!" message
```

### 5. Offline Queue Functionality

```bash
# Simulate connection loss and reconnection
npm run test:offline-queue

# Verify:
# - Tasks queued locally when cloud unavailable
# - Tasks drain on reconnection
# - No data loss
```

## VPS Deployment Steps

### Prerequisites

```bash
# On VPS (Ubuntu 20.04+)
sudo apt-get update
sudo apt-get install -y \
  node-18 npm \
  python3 python3-dev \
  build-essential \
  git

# Verify versions
node --version  # v18+
npm --version   # v9+
```

### 1. Pull Latest Code

```bash
cd /var/www/vutler
git fetch origin main
git reset --hard origin/main
```

### 2. Install Dependencies

```bash
cd packages/nexus
npm install

# New dependencies added:
# - better-sqlite3 (offline queue)
# - chokidar (file watching)
# - mammoth (DOCX reading)
# - pdf-parse (PDF reading)
# - xlsx (XLSX reading)

# Verify installation:
npm ls better-sqlite3 chokidar mammoth pdf-parse xlsx
```

### 3. Build Binaries (Optional)

```bash
# If distributing to users:
cd packages/nexus
npm run build:binaries

# Creates dist/nexus-macos and dist/nexus-windows
# These are portable executables requiring no Node.js installation
```

### 4. Initialize User Directories

```bash
# Create ~/.vutler with required structure
mkdir -p ~/.vutler/logs
touch ~/.vutler/permissions.json ~/.vutler/queue.db

# Verify permissions:
# - permissions.json: { "allowedFolders": [] } (JSON)
# - queue.db: SQLite database (created on first run)
```

### 5. Start TaskExecutor Service

```bash
# Using PM2:
pm2 start app/custom/services/taskExecutor.js --name "task-executor"
pm2 save
pm2 startup

# Or systemd:
sudo cat > /etc/systemd/system/vutler-task-executor.service << 'EOF'
[Unit]
Description=Vutler TaskExecutor
After=network.target

[Service]
Type=simple
User=vutler
WorkingDirectory=/var/www/vutler
ExecStart=/usr/bin/node app/custom/services/taskExecutor.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl enable vutler-task-executor
sudo systemctl start vutler-task-executor
```

### 6. Verify Nexus Dashboard

```bash
# Dashboard should be accessible at:
# http://vutler-vps:9999

# Test endpoints:
curl http://localhost:9999/health
# Expected: { "ok": true, "mode": "local", "node_id": "..." }

curl http://localhost:9999/api/status
# Expected: { "node_id": "...", "connection_status": "connected", ... }
```

## Post-Deployment Testing

### Test 1: Mike's Codex Task Execution

```bash
# Create a test task assigned to Mike (Codex provider)
INSERT INTO tenant_vutler.tasks (
  id, title, description, status, assignee, workspace_id, created_at
) VALUES (
  gen_random_uuid(),
  'Test: Calculate factorial of 5',
  'Use Python to calculate 5! and explain the result',
  'pending',
  'mike',
  '00000000-0000-0000-0000-000000000001',
  NOW()
);

# Wait 30-40 seconds (3-4 poll cycles)
# Check task status:
SELECT id, title, status, metadata FROM tenant_vutler.tasks WHERE title LIKE 'Test:%';

# Expected: status = 'completed', metadata.result contains response from GPT-5.4
```

### Test 2: File Search

```bash
# Task with search action:
INSERT INTO tenant_vutler.tasks (
  id, title, description, status, assignee, workspace_id, created_at
) VALUES (
  gen_random_uuid(),
  'Search for PDF files',
  'search:*.pdf in ~/Documents',
  'pending',
  'mike',
  '00000000-0000-0000-0000-000000000001',
  NOW()
);

# Wait for execution
# Check metadata.result for array of PDF file paths
```

### Test 3: Clipboard Reading

```bash
# Copy something to clipboard
pbpaste > /tmp/clipboard_before.txt

# Create task:
INSERT INTO tenant_vutler.tasks (
  id, title, description, status, assignee, workspace_id, created_at
) VALUES (
  gen_random_uuid(),
  'Read clipboard content',
  'read_clipboard:plain',
  'pending',
  'mike',
  '00000000-0000-0000-0000-000000000001',
  NOW()
);

# Verify result matches clipboard content
```

### Test 4: Mail List

```bash
# Task to list recent emails:
INSERT INTO tenant_vutler.tasks (
  id, title, description, status, assignee, workspace_id, created_at
) VALUES (
  gen_random_uuid(),
  'List recent emails',
  'list_emails:limit=5&sort=date_desc',
  'pending',
  'mike',
  '00000000-0000-0000-0000-000000000001',
  NOW()
);

# Verify metadata.result contains email list with sender, subject, date, preview
```

## Health Check Endpoints

```bash
# System status
curl http://localhost:9999/api/status
# Returns: node_id, connection_status, uptime, agents count, memory usage

# Recent tasks
curl http://localhost:9999/api/tasks
# Returns: array of recent task executions with status

# Configuration
curl http://localhost:9999/api/config
# Returns: mode, providers, permissions, offline_enabled

# Permissions API
curl http://localhost:9999/api/permissions
# Returns: current allowed folders
```

## Troubleshooting

### Issue: "ChatGPT not connected" Error

**Cause**: OAuth token for Codex provider not active

**Fix**:
```bash
# 1. Open Vutler dashboard (frontend)
# 2. Go to Settings → Integrations → ChatGPT/Codex
# 3. Reconnect OAuth (click "Connect")
# 4. Verify token is saved in database
# 5. TaskExecutor will pick up token on next pool query (60s cache TTL)
```

### Issue: Pending Tasks Not Executing

**Cause**: TaskExecutor service not running or agent not found

**Fix**:
```bash
# Check service status:
pm2 status task-executor
# or
systemctl status vutler-task-executor

# Check logs:
tail -f ~/.vutler/logs/nexus.log
tail -f ~/.vutler/logs/task-executor.log

# Verify agent exists:
SELECT id, name, username, model, provider FROM tenant_vutler.agents;
# Mike should be listed with provider = 'codex', model = 'codex/gpt-5.4'
```

### Issue: WebSocket Connection Fails

**Cause**: WSS endpoint unavailable or auth token expired

**Fix**:
```bash
# Check connection in logs:
grep "WebSocket" ~/.vutler/logs/nexus.log

# Verify fallback to polling is working:
grep "polling" ~/.vutler/logs/nexus.log

# If fallback fails, check API connectivity:
curl -I https://api.vutler.com/ws/chat
# Should return HTTP 426 (upgrade required) - normal for WebSocket endpoint
```

### Issue: Offline Queue Not Draining

**Cause**: Connection to cloud still unavailable or queue corrupted

**Fix**:
```bash
# Check queue size:
SELECT COUNT(*) FROM offline_queue;

# Manual drain:
npm run drain:queue

# Reset queue if corrupted:
rm ~/.vutler/queue.db
# Queue will recreate on next offline event
```

## Rollback Procedure

```bash
# If deployment fails:
git reset --hard <previous-commit>
npm install
systemctl restart vutler-task-executor

# Verify:
curl http://localhost:9999/api/status
```

## Monitoring

### Log Files

```bash
# Real-time monitoring:
tail -f ~/.vutler/logs/nexus.log

# Check for errors:
grep ERROR ~/.vutler/logs/nexus.log

# Access log (permission checks):
tail -f ~/.vutler/logs/access.jsonl
```

### PM2 Monitoring

```bash
# Dashboard:
pm2 monit

# Log stream:
pm2 logs task-executor

# Show process info:
pm2 show task-executor
```

### Database Monitoring

```bash
# Task execution rate:
SELECT DATE(created_at) as day, COUNT(*) as tasks,
  COUNT(CASE WHEN status='completed' THEN 1 END) as completed,
  COUNT(CASE WHEN status='failed' THEN 1 END) as failed
FROM tenant_vutler.tasks
WHERE workspace_id = '00000000-0000-0000-0000-000000000001'
GROUP BY DATE(created_at)
ORDER BY day DESC;

# Average execution latency:
SELECT provider, AVG((metadata->>'latency_ms')::numeric) as avg_latency_ms,
  COUNT(*) as executions
FROM tenant_vutler.tasks
WHERE metadata->>'latency_ms' IS NOT NULL
GROUP BY provider;
```

## Success Criteria

✅ All tests pass
✅ TaskExecutor picks up pending tasks within 40s (4 poll cycles)
✅ Mike's Codex tasks execute and complete with results
✅ WebSocket connects or falls back to polling gracefully
✅ Offline queue captures and drains tasks on reconnection
✅ Dashboard accessible at /health endpoint
✅ No error logs for 5 minutes of normal operation

**Status**: Ready for VPS deployment
