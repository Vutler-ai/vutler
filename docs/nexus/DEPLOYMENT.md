# Nexus Local Integrations — Deployment Guide

## Overview

Nexus is designed to run as a standalone local service on individual machines (macOS, Windows, Linux). This guide covers production VPS/server deployment for centralized agent orchestration scenarios or CI/CD environments.

## VPS Preparation (Ubuntu 20.04+)

### System Setup

```bash
# SSH into VPS
ssh ubuntu@your-vps-ip

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 18 LTS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs npm

# Install Python 3 (for native module compilation)
sudo apt-get install -y python3 python3-dev

# Install build tools
sudo apt-get install -y build-essential g++

# Verify installations
node --version  # v18.x.x
npm --version   # 9.x.x
python3 --version  # 3.x

# Create non-root user for Nexus
sudo useradd -m -s /bin/bash nexus
sudo usermod -aG sudo nexus

# Switch to nexus user
su - nexus
```

### Clone Repository

```bash
# As nexus user
cd /home/nexus
git clone https://github.com/your-org/vutler.git
cd vutler/packages/nexus

# Install dependencies
npm install

# Verify all deps
npm list --depth=0
```

## Environment Variables

Create `.env` file with production credentials:

```bash
# .env (store securely, e.g., in .gitignore)
VUTLER_KEY=sk_prod_1234567890abcdef  # From Vutler dashboard
VUTLER_SERVER=https://app.vutler.ai
NODE_ENV=production
NODE_NAME=nexus-prod-01
PORT=3100
LOG_LEVEL=info
OFFLINE_MODE_ENABLED=true            # Enterprise only
OFFLINE_MODE_MAX_QUEUE_SIZE=5000

# Optional: restrict filesystem
FILESYSTEM_ROOT=/home/nexus/allowed  # Only allow access to this dir
```

Never commit `.env` to version control. Load via:

```bash
export $(cat .env | xargs)
node index.js
```

Or use PM2 ecosystem file (see below).

## PM2 Process Manager

PM2 ensures Nexus restarts on crash and persists across reboots.

### Install PM2

```bash
sudo npm install -g pm2

# Allow sudo-free restart
pm2 startup ubuntu -u nexus --hp /home/nexus
```

### PM2 Ecosystem File

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: 'nexus',
      script: './index.js',
      cwd: '/home/nexus/vutler/packages/nexus',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
        VUTLER_KEY: 'sk_prod_1234567890abcdef',
        VUTLER_SERVER: 'https://app.vutler.ai',
        NODE_NAME: 'nexus-prod-01',
        PORT: 3100,
        LOG_LEVEL: 'info',
        OFFLINE_MODE_ENABLED: 'true'
      },
      instances: 1,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/home/nexus/.pm2/logs/nexus-error.log',
      out_file: '/home/nexus/.pm2/logs/nexus-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 3000
    }
  ]
};
```

### Start with PM2

```bash
cd /home/nexus/vutler/packages/nexus

# Start the app
pm2 start ecosystem.config.js

# Check status
pm2 status

# View logs (real-time)
pm2 logs nexus --lines 100

# Save PM2 process list for auto-start on reboot
pm2 save

# Test auto-start
pm2 kill
pm2 resurrect  # Should auto-restart
```

### PM2 Commands

```bash
# Monitor
pm2 monit

# Restart
pm2 restart nexus

# Stop
pm2 stop nexus

# Delete from PM2
pm2 delete nexus

# View error log
tail -f /home/nexus/.pm2/logs/nexus-error.log

# View combined log
tail -f /home/nexus/.pm2/logs/nexus-out.log
```

## Nginx Reverse Proxy (Optional)

If running behind a load balancer or exposing dashboard publicly:

### Install Nginx

```bash
sudo apt-get install -y nginx

# Enable
sudo systemctl enable nginx
sudo systemctl start nginx
```

### Configuration

Create `/etc/nginx/sites-available/nexus`:

```nginx
upstream nexus_backend {
  server localhost:3100;
}

server {
  listen 80;
  listen [::]:80;
  server_name nexus.your-domain.com;

  # Redirect HTTP to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name nexus.your-domain.com;

  # SSL certificates (e.g., from Let's Encrypt)
  ssl_certificate /etc/letsencrypt/live/nexus.your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/nexus.your-domain.com/privkey.pem;

  # Security headers
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;

  # WebSocket upgrade
  location /ws {
    proxy_pass http://nexus_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
  }

  # REST API
  location / {
    proxy_pass http://nexus_backend;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/nexus /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl reload nginx
```

## Database Migrations

Nexus uses SQLite for offline task queue (enterprise mode). Ensure the database is initialized:

```bash
# From packages/nexus directory
node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/home/nexus/.vutler/tasks.db');

  // Create schema
  db.exec(\`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      action TEXT,
      params JSON,
      status TEXT,
      result JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      executed_at DATETIME
    );

    CREATE INDEX IF NOT EXISTS idx_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_created ON tasks(created_at);
  \`);

  console.log('Database initialized');
  db.close();
"
```

## Health Checks & Monitoring

### Health Check Endpoint

Nexus exposes a health endpoint for load balancers:

```bash
# Returns 200 if healthy
curl http://localhost:3100/api/health

# Response:
{
  "status": "online",
  "uptime_seconds": 3600,
  "memory_mb": 42,
  "wsConnected": true,
  "lastHeartbeat": "2026-03-29T15:30:00Z"
}
```

### SystemD Health Check (Alternative to PM2)

If deploying without PM2, create a systemd service:

**File: `/etc/systemd/system/nexus.service`**

```ini
[Unit]
Description=Vutler Nexus Local Agent Runtime
After=network.target

[Service]
Type=simple
User=nexus
WorkingDirectory=/home/nexus/vutler/packages/nexus
ExecStart=/usr/bin/node /home/nexus/vutler/packages/nexus/index.js

# Environment
EnvironmentFile=/home/nexus/vutler/packages/nexus/.env

# Restart
Restart=on-failure
RestartSec=10

# Limits
LimitNOFILE=65535
MemoryLimit=500M

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable nexus
sudo systemctl start nexus
sudo systemctl status nexus
```

### Monitoring with Prometheus (Optional)

Add metrics endpoint to Nexus and scrape with Prometheus:

**prometheus.yml:**

```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'nexus'
    static_configs:
      - targets: ['localhost:3100']
    metrics_path: '/api/metrics'
```

View in Grafana dashboard.

## Logging Strategy

### Centralized Logging

Logs written to `~/.vutler/logs/nexus.log` (or configured path). For production, ship logs to centralized service:

**Filebeat Configuration (`/etc/filebeat/filebeat.yml`)**

```yaml
filebeat.inputs:
  - type: log
    enabled: true
    paths:
      - /home/nexus/.vutler/logs/nexus.log
    json.message_key: message
    json.keys_under_root: true

output.elasticsearch:
  hosts: ["elasticsearch.your-domain.com:9200"]
  index: "nexus-%{+yyyy.MM.dd}"
```

Start Filebeat:

```bash
sudo systemctl start filebeat
sudo systemctl enable filebeat
```

### Log Rotation

Configure logrotate to prevent disk issues:

**File: `/etc/logrotate.d/nexus`**

```
/home/nexus/.vutler/logs/nexus.log {
  daily
  missingok
  rotate 14
  compress
  delaycompress
  notifempty
  create 0640 nexus nexus
  postrotate
    pm2 kill -s SIGUSR2 nexus > /dev/null 2>&1
  endscript
}
```

Test:

```bash
sudo logrotate -f /etc/logrotate.d/nexus -v
```

## Permissions & Security

### File Permissions

```bash
# Restrict config to nexus user only
chmod 700 /home/nexus/.vutler/
chmod 600 /home/nexus/.vutler/permissions.json
chmod 600 /home/nexus/.vutler/nexus.json
chmod 600 /home/nexus/vutler/packages/nexus/.env
```

### Firewall Rules

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (redirect)
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 3100/tcp   # Nexus (if not behind proxy)
sudo ufw enable
```

### API Key Rotation

Store API keys in a secrets manager (HashiCorp Vault, AWS Secrets Manager, etc.):

```bash
# Example with HashiCorp Vault
export VUTLER_KEY=$(vault kv get -field=api_key secret/vutler/prod)
pm2 restart nexus
```

## Troubleshooting Common Issues

### WebSocket Connection Fails

**Symptom:** Logs show "Failed to connect to wss://api.vutler.ai"

**Solutions:**
- Verify `VUTLER_KEY` is correct
- Check internet connectivity: `curl -I https://api.vutler.ai`
- Verify firewall allows outbound HTTPS: `sudo ufw status`
- Check TLS certificates: `openssl s_client -connect api.vutler.ai:443 -showcerts`

### High Memory Usage

**Symptom:** `pm2 logs nexus` shows memory usage > 500MB

**Solutions:**
- Reduce max_memory_restart in ecosystem.config.js
- Lower MAX_RESULT_BYTES in task-orchestrator.js
- Kill large offline queues: `rm /home/nexus/.vutler/tasks.db` (careful!)

### Database Lock Issues

**Symptom:** "database is locked" errors in logs

**Solutions:**
- Restart Nexus: `pm2 restart nexus`
- Check for stale processes: `ps aux | grep node`
- Check database: `lsof | grep tasks.db`

### Slow Search Performance

**Symptom:** search actions timeout (> 5s)

**Solutions:**
- Run fewer concurrent tasks: reduce AgentManager `seats` config
- Exclude large folders from scope
- For Windows: ensure Windows Search service is running

### Dashboard Not Accessible

**Symptom:** `curl localhost:3100` returns connection refused

**Solutions:**
- Check Nexus is running: `pm2 status`
- Check PORT env var: `echo $PORT` (should be 3100)
- Verify firewall: `sudo ufw status`
- Check for port conflict: `lsof -i :3100`

## Performance Tuning

### Node.js Flags

In ecosystem.config.js, add Node.js flags:

```javascript
node_args: [
  '--max-old-space-size=512',    // Increase heap
  '--enable-source-maps',         // Better error traces
  '--no-warnings'                 // Suppress harmless warnings
]
```

### Task Executor Concurrency

Limit concurrent tasks to prevent resource exhaustion:

```javascript
// packages/nexus/lib/task-orchestrator.js
const MAX_CONCURRENT_TASKS = 2;  // Default 1, increase if needed
```

Restart Nexus after changes:

```bash
pm2 restart nexus
```

## Production Checklist

Before deploying to production:

- [ ] Node.js 18+ LTS installed on VPS
- [ ] `.env` file created with `VUTLER_KEY` (never in git)
- [ ] PM2 or systemd configured for auto-restart
- [ ] Nginx reverse proxy configured (if exposed to internet)
- [ ] SSL/TLS certificates installed (Let's Encrypt)
- [ ] Firewall rules allow inbound 443, outbound 443
- [ ] Logs shipping to centralized service (Filebeat/ELK)
- [ ] Health check endpoint monitored (`/api/health`)
- [ ] Database migrations applied
- [ ] Memory limits enforced (500MB max)
- [ ] File permissions locked down (700 for .vutler/)
- [ ] Backup strategy for permissions.json + offline queue
- [ ] Graceful shutdown tested (SIGTERM → close WS → stop tasks)

## Scaling Considerations

### Multiple Nexus Instances

For high availability, run multiple Nexus instances behind a load balancer:

```
Load Balancer
    ↓
Nexus-1 (port 3100)
Nexus-2 (port 3101)
Nexus-3 (port 3102)
```

Each registers independently with Vutler Cloud (different `NODE_NAME`).

### Nginx Load Balancing Config

```nginx
upstream nexus_cluster {
  server localhost:3100;
  server localhost:3101;
  server localhost:3102;
}

server {
  listen 443 ssl;
  server_name nexus.your-domain.com;

  location / {
    proxy_pass http://nexus_cluster;
    proxy_set_header Host $host;
  }
}
```

Start multiple instances:

```bash
# Create 3 ecosystem configs
pm2 start ecosystem-1.js  # port 3100
pm2 start ecosystem-2.js  # port 3101
pm2 start ecosystem-3.js  # port 3102
pm2 save
```

## Disaster Recovery

### Backup Strategy

```bash
# Daily backup of permissions + config
0 2 * * * tar -czf /backups/nexus-$(date +\%Y\%m\%d).tar.gz /home/nexus/.vutler/
```

### Restore from Backup

```bash
tar -xzf /backups/nexus-20260329.tar.gz -C /
pm2 restart nexus
```

## Support & Logs

For production issues, collect logs:

```bash
# Get last 1000 lines of logs
pm2 logs nexus --lines 1000 > /tmp/nexus-logs.txt

# Get PM2 info
pm2 info nexus > /tmp/nexus-info.txt

# Get system info
uname -a > /tmp/system-info.txt
node --version >> /tmp/system-info.txt
npm --version >> /tmp/system-info.txt

# Tar for support
tar -czf /tmp/nexus-support.tar.gz /tmp/nexus-*.txt
# Send to support@vutler.ai
```
