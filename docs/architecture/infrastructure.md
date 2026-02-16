# Infrastructure Design - Vutler

**Version:** 1.0  
**Date:** 2026-02-16  
**Status:** Draft

---

## 1. Overview

This document defines the infrastructure design for Vutler MVP: Docker Compose deployment, environment management, monitoring, and operational procedures.

**Principles:**
- **Self-hosted first**: No vendor lock-in, full data control
- **Docker Compose for MVP**: Simple, reproducible, easy to operate
- **Kubernetes post-MVP**: Scale when needed (not earlier)
- **Infrastructure as Code**: All config in version control

---

## 2. Docker Compose Architecture

### 2.1 Services

```yaml
version: '3.8'

services:
  # Core application
  vutler:
    image: vutler/app:${VERSION:-latest}
    container_name: vutler-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      # Database
      - MONGO_URL=mongodb://mongo:27017/vutler  # Legacy Rocket.Chat
      - POSTGRES_URL=postgresql://postgres:5432/vutler
      - POSTGRES_USER=vutler
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      
      # Cache & Queue
      - REDIS_URL=redis://redis:6379
      
      # Object Storage
      - MINIO_ENDPOINT=minio:9000
      - MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY}
      - MINIO_SECRET_KEY=${MINIO_SECRET_KEY}
      - MINIO_BUCKET=vutler-files
      
      # External Services
      - SNIPARA_API_URL=${SNIPARA_API_URL}
      - SNIPARA_API_KEY=${SNIPARA_API_KEY}
      
      # Application
      - NODE_ENV=production
      - ROOT_URL=https://${DOMAIN}
      - PORT=3000
      
    volumes:
      - vutler-uploads:/app/uploads
      - vutler-logs:/app/logs
    depends_on:
      - mongo
      - postgres
      - redis
      - minio
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/info"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    networks:
      - vutler-net

  # MongoDB (legacy Rocket.Chat data)
  mongo:
    image: mongo:7-jammy
    container_name: vutler-mongo
    restart: unless-stopped
    volumes:
      - mongo-data:/data/db
      - mongo-dump:/dump
    environment:
      - MONGO_INITDB_ROOT_USERNAME=admin
      - MONGO_INITDB_ROOT_PASSWORD=${MONGO_PASSWORD}
    networks:
      - vutler-net
    command: --wiredTigerCacheSizeGB 1.5

  # PostgreSQL (primary database via Vaultbrix)
  postgres:
    image: postgres:16-alpine
    container_name: vutler-postgres
    restart: unless-stopped
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - postgres-backup:/backup
    environment:
      - POSTGRES_DB=vutler
      - POSTGRES_USER=vutler
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - PGDATA=/var/lib/postgresql/data/pgdata
    networks:
      - vutler-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vutler"]
      interval: 10s
      timeout: 5s
      retries: 5
    command: >
      postgres
      -c max_connections=100
      -c shared_buffers=256MB
      -c effective_cache_size=1GB
      -c maintenance_work_mem=64MB
      -c checkpoint_completion_target=0.9
      -c wal_buffers=16MB
      -c default_statistics_target=100

  # Redis (cache, presence, sessions)
  redis:
    image: redis:7-alpine
    container_name: vutler-redis
    restart: unless-stopped
    volumes:
      - redis-data:/data
    networks:
      - vutler-net
    command: >
      redis-server
      --appendonly yes
      --maxmemory 512mb
      --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  # MinIO (S3-compatible object storage)
  minio:
    image: minio/minio:latest
    container_name: vutler-minio
    restart: unless-stopped
    ports:
      - "9000:9000"
      - "9001:9001"  # Console UI
    environment:
      - MINIO_ROOT_USER=${MINIO_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${MINIO_SECRET_KEY}
    volumes:
      - minio-data:/data
    networks:
      - vutler-net
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3

  # NGINX (reverse proxy, TLS termination)
  nginx:
    image: nginx:alpine
    container_name: vutler-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - nginx-cache:/var/cache/nginx
    depends_on:
      - vutler
    networks:
      - vutler-net
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Prometheus (metrics collection)
  prometheus:
    image: prom/prometheus:latest
    container_name: vutler-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    networks:
      - vutler-net
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'

  # Grafana (dashboards)
  grafana:
    image: grafana/grafana:latest
    container_name: vutler-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD}
      - GF_INSTALL_PLUGINS=redis-datasource
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards:ro
      - ./grafana/datasources:/etc/grafana/provisioning/datasources:ro
    networks:
      - vutler-net
    depends_on:
      - prometheus

volumes:
  vutler-uploads:
  vutler-logs:
  mongo-data:
  mongo-dump:
  postgres-data:
  postgres-backup:
  redis-data:
  minio-data:
  nginx-cache:
  prometheus-data:
  grafana-data:

networks:
  vutler-net:
    driver: bridge
```

### 2.2 Service Specifications

| Service | CPU | Memory | Disk | Notes |
|---------|-----|--------|------|-------|
| **vutler** | 2 cores | 4 GB | 10 GB | Meteor app, real-time connections |
| **postgres** | 1 core | 2 GB | 50 GB | Primary database, SSD recommended |
| **mongo** | 1 core | 2 GB | 20 GB | Legacy data, WiredTiger cache |
| **redis** | 0.5 core | 512 MB | 5 GB | In-memory cache, persistence enabled |
| **minio** | 1 core | 1 GB | 100 GB | Object storage, grows with files |
| **nginx** | 0.5 core | 256 MB | 1 GB | Reverse proxy, TLS termination |
| **prometheus** | 0.5 core | 512 MB | 20 GB | 30-day retention |
| **grafana** | 0.5 core | 256 MB | 5 GB | Dashboards only |
| **TOTAL** | **7 cores** | **10.5 GB** | **211 GB** | Minimum for MVP |

**Recommended VM:** 
- **MVP**: 8 vCPU, 16 GB RAM, 250 GB SSD
- **Production (100 agents)**: 16 vCPU, 32 GB RAM, 500 GB SSD

---

## 3. Environment Management

### 3.1 Environment Variables

**`.env` file structure:**

```bash
# === Application ===
VERSION=1.0.0
DOMAIN=vutler.yourdomain.com
NODE_ENV=production

# === Databases ===
POSTGRES_PASSWORD=<strong-password>
MONGO_PASSWORD=<strong-password>

# === Object Storage ===
MINIO_ACCESS_KEY=<minio-access-key>
MINIO_SECRET_KEY=<minio-secret-key>

# === External Services ===
SNIPARA_API_URL=https://api.snipara.ai
SNIPARA_API_KEY=<snipara-key>

# === Monitoring ===
GRAFANA_PASSWORD=<admin-password>

# === Email (optional) ===
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=noreply@vutler.com
SMTP_PASSWORD=<smtp-password>
```

**Security:**
- Never commit `.env` to git (use `.env.example` template)
- Use Docker secrets in production (swarm mode) or Kubernetes secrets
- Rotate passwords every 90 days

### 3.2 Environments

| Environment | Purpose | Config |
|-------------|---------|--------|
| **dev** | Local development | docker-compose.dev.yml, hot-reload |
| **staging** | Pre-production testing | docker-compose.staging.yml, mirrors prod |
| **production** | Live system | docker-compose.yml, TLS, monitoring |

**Deploy with:**
```bash
docker-compose --env-file .env.production up -d
```

---

## 4. Deployment Procedures

### 4.1 Initial Deployment

**Prerequisites:**
- Docker 24+ and Docker Compose 2.20+
- VM with 8 vCPU, 16 GB RAM, 250 GB disk
- Domain name (DNS A record pointing to VM)

**Steps:**

1. **Clone repo and configure:**
   ```bash
   git clone https://github.com/your-org/vutler.git
   cd vutler
   cp .env.example .env
   nano .env  # Fill in passwords and keys
   ```

2. **Generate TLS certificates:**
   ```bash
   mkdir -p nginx/ssl
   # Option 1: Let's Encrypt (recommended)
   certbot certonly --standalone -d vutler.yourdomain.com
   cp /etc/letsencrypt/live/vutler.yourdomain.com/fullchain.pem nginx/ssl/
   cp /etc/letsencrypt/live/vutler.yourdomain.com/privkey.pem nginx/ssl/
   
   # Option 2: Self-signed (dev only)
   openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
     -keyout nginx/ssl/privkey.pem -out nginx/ssl/fullchain.pem
   ```

3. **Start services:**
   ```bash
   docker-compose up -d
   docker-compose logs -f vutler  # Watch startup
   ```

4. **Verify health:**
   ```bash
   curl https://vutler.yourdomain.com/api/info
   # Should return: {"status": "ok", "version": "1.0.0"}
   ```

5. **Create initial admin:**
   ```bash
   docker-compose exec vutler npm run create-admin -- \
     --email admin@vutler.com --password <admin-pass>
   ```

### 4.2 Application Updates

**Zero-downtime rolling update:**

```bash
# 1. Pull new image
docker pull vutler/app:1.1.0

# 2. Update .env
echo "VERSION=1.1.0" >> .env

# 3. Graceful restart
docker-compose up -d vutler
# Old connections drain, new version starts

# 4. Verify
docker-compose logs vutler | grep "Server started"
curl https://vutler.yourdomain.com/api/info
```

**Rollback procedure:**
```bash
echo "VERSION=1.0.0" >> .env
docker-compose up -d vutler
```

### 4.3 Database Migrations

**Run migrations before updating app:**

```bash
# 1. Backup database
docker-compose exec postgres pg_dump -U vutler vutler > backup.sql

# 2. Run migrations
docker-compose exec vutler npm run migrate up

# 3. Verify
docker-compose exec postgres psql -U vutler -c "\d messages"
```

**Rollback migration:**
```bash
docker-compose exec vutler npm run migrate down
psql -U vutler vutler < backup.sql
```

---

## 5. Monitoring & Observability

### 5.1 Metrics (Prometheus)

**Vutler app metrics exposed:**
- `http://localhost:3000/metrics` (Prometheus format)

**Key metrics:**
- `vutler_messages_sent_total` — Counter
- `vutler_websocket_connections` — Gauge
- `vutler_api_request_duration_seconds` — Histogram
- `vutler_file_upload_bytes_total` — Counter

**Prometheus config (`prometheus/prometheus.yml`):**
```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'vutler'
    static_configs:
      - targets: ['vutler:3000']
  
  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres-exporter:9187']
  
  - job_name: 'redis'
    static_configs:
      - targets: ['redis-exporter:9121']
  
  - job_name: 'node'
    static_configs:
      - targets: ['node-exporter:9100']
```

### 5.2 Dashboards (Grafana)

**Pre-built dashboards:**
1. **Vutler Overview**
   - Active agents (online count)
   - Messages per minute
   - API request rate
   - WebSocket connections
   - Error rate (5xx)

2. **Infrastructure Health**
   - CPU, memory, disk usage
   - PostgreSQL connections
   - Redis memory usage
   - MinIO storage usage

3. **Agent Experience**
   - Message latency (p50, p95, p99)
   - File upload success rate
   - Presence update lag

**Access Grafana:** `http://localhost:3001` (admin / `${GRAFANA_PASSWORD}`)

### 5.3 Alerting

**Critical alerts (send to Slack/PagerDuty):**

```yaml
# prometheus/alerts.yml
groups:
  - name: vutler_critical
    interval: 1m
    rules:
      - alert: HighErrorRate
        expr: rate(vutler_http_requests_total{code=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High 5xx error rate"
          
      - alert: PostgreSQLDown
        expr: up{job="postgres"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "PostgreSQL is down"
          
      - alert: DiskSpaceWarning
        expr: node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes < 0.15
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk space < 15%"
```

### 5.4 Logging

**Log aggregation:**
- MVP: Docker logs (`docker-compose logs -f`)
- Post-MVP: ELK stack or Loki

**Structured logging format:**
```json
{
  "timestamp": "2026-02-16T10:30:00Z",
  "level": "INFO",
  "service": "vutler",
  "agent_id": "550e8400-e29b-41d4-a716-446655440000",
  "action": "send_message",
  "channel_id": "channel-123",
  "latency_ms": 45,
  "status": "success"
}
```

**Log rotation:**
```yaml
# docker-compose.yml
services:
  vutler:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 6. Backup & Disaster Recovery

### 6.1 Backup Strategy

| Component | Frequency | Retention | Method |
|-----------|-----------|-----------|--------|
| **PostgreSQL** | Daily (02:00 UTC) | 30 days | pg_dump + WAL archiving |
| **MongoDB** | Daily (02:30 UTC) | 30 days | mongodump |
| **MinIO** | Daily (03:00 UTC) | 30 days | MinIO mirror to S3 |
| **Configs** | On change | Forever | Git repo |

**Automated backup script (`/scripts/backup.sh`):**
```bash
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/backup

# PostgreSQL
docker-compose exec -T postgres pg_dump -U vutler vutler | \
  gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# MongoDB
docker-compose exec -T mongo mongodump --archive | \
  gzip > $BACKUP_DIR/mongo_$DATE.archive.gz

# MinIO (sync to S3)
docker-compose exec -T minio mc mirror /data s3/vutler-backups/minio_$DATE/

# Upload to S3
aws s3 sync $BACKUP_DIR s3://vutler-backups/daily/$DATE/

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -type f -mtime +30 -delete
```

**Cron job:**
```bash
0 2 * * * /opt/vutler/scripts/backup.sh >> /var/log/vutler-backup.log 2>&1
```

### 6.2 Restore Procedures

**PostgreSQL restore:**
```bash
# 1. Stop application
docker-compose stop vutler

# 2. Restore database
gunzip < postgres_20260216_020000.sql.gz | \
  docker-compose exec -T postgres psql -U vutler vutler

# 3. Restart
docker-compose start vutler
```

**Full system restore (disaster recovery):**
```bash
# 1. Provision new VM
# 2. Install Docker + Docker Compose
# 3. Clone repo and restore .env
git clone https://github.com/your-org/vutler.git
cd vutler
aws s3 cp s3://vutler-backups/.env .env

# 4. Restore backups
aws s3 sync s3://vutler-backups/daily/20260216_020000/ /backup/

# 5. Start services
docker-compose up -d

# 6. Restore data
./scripts/restore.sh /backup/postgres_20260216_020000.sql.gz
./scripts/restore-minio.sh /backup/minio_20260216_030000/

# 7. Verify
curl https://vutler.yourdomain.com/api/info
```

**RTO:** 1 hour (target)  
**RPO:** 24 hours (daily backups), 5 minutes (PostgreSQL WAL archiving)

---

## 7. Scaling Strategy

### 7.1 Horizontal Scaling (Post-MVP)

**Load-balanced Vutler instances:**

```yaml
# docker-compose.scale.yml
services:
  vutler:
    deploy:
      replicas: 3
    environment:
      - REDIS_URL=redis://redis-cluster:6379  # Session store
      - STICKY_SESSIONS=true  # WebSocket requirement
```

**NGINX upstream config:**
```nginx
upstream vutler_backend {
    ip_hash;  # Sticky sessions for WebSocket
    server vutler-1:3000;
    server vutler-2:3000;
    server vutler-3:3000;
}
```

### 7.2 Vertical Scaling

**When to scale up:**
- CPU > 80% sustained
- Memory > 90%
- Disk I/O wait > 20%

**Upgrade path:**
```bash
# Resize VM: 8 vCPU → 16 vCPU, 16 GB → 32 GB
# Update docker-compose.yml resource limits
# Graceful restart
docker-compose up -d
```

### 7.3 Database Scaling

**PostgreSQL read replicas:**
- Use Vaultbrix replication (Supabase feature)
- Route read queries to replicas
- Write queries to primary

**MongoDB sharding:**
- Not needed for MVP (single instance handles 100 agents)
- Post-MVP: Shard by agent_id

---

## 8. Security

### 8.1 Network Security

**Firewall rules:**
```bash
# Allow only necessary ports
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (redirect to HTTPS)
ufw allow 443/tcp    # HTTPS
ufw deny 3000/tcp    # Block direct app access
ufw deny 5432/tcp    # Block direct PostgreSQL
ufw deny 27017/tcp   # Block direct MongoDB
ufw enable
```

**Docker network isolation:**
- All services in `vutler-net` bridge network
- Only NGINX exposed to public
- Inter-service communication internal only

### 8.2 TLS Configuration

**NGINX TLS config:**
```nginx
ssl_protocols TLSv1.3;
ssl_ciphers 'ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
ssl_prefer_server_ciphers on;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
ssl_stapling on;
ssl_stapling_verify on;

# HSTS
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

### 8.3 Secrets Management

**Docker secrets (production):**
```bash
echo "my-postgres-password" | docker secret create postgres_password -
```

**Update docker-compose.yml:**
```yaml
secrets:
  postgres_password:
    external: true

services:
  postgres:
    secrets:
      - postgres_password
    environment:
      - POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password
```

---

## 9. Operational Runbooks

### 9.1 Health Checks

**Daily health check:**
```bash
#!/bin/bash
# Check all services are running
docker-compose ps | grep "Up" | wc -l  # Should be 8

# Check app health
curl -f https://vutler.yourdomain.com/api/info || exit 1

# Check database connections
docker-compose exec postgres pg_isready || exit 1
docker-compose exec mongo mongosh --eval "db.adminCommand('ping')" || exit 1

# Check disk space
df -h | grep "/$" | awk '{print $5}' | sed 's/%//' | \
  awk '{if ($1 > 85) exit 1}'
```

### 9.2 Common Issues

| Issue | Symptom | Resolution |
|-------|---------|------------|
| **PostgreSQL connection pool exhausted** | 503 errors | Increase `max_connections`, restart app |
| **WebSocket disconnects** | Agents go offline | Check NGINX timeout, increase to 60s |
| **High memory (Meteor)** | App slowness | Restart: `docker-compose restart vutler` |
| **MinIO disk full** | File uploads fail | Cleanup old files, expand volume |
| **Redis memory limit hit** | Presence data loss | Increase maxmemory, use LRU eviction |

### 9.3 Emergency Procedures

**App crash loop:**
```bash
# 1. Check logs
docker-compose logs vutler --tail 100

# 2. Rollback to previous version
echo "VERSION=1.0.0" >> .env
docker-compose up -d vutler

# 3. Notify team
```

**Database corruption:**
```bash
# 1. Stop app
docker-compose stop vutler

# 2. Restore from backup
./scripts/restore.sh /backup/latest.sql.gz

# 3. Restart
docker-compose start vutler
```

---

## 10. Migration to Kubernetes (Post-MVP)

When you outgrow Docker Compose (500+ agents):

**Why Kubernetes:**
- Auto-scaling (HPA based on CPU/memory)
- Rolling updates with zero downtime
- Self-healing (automatic restarts)
- Multi-zone HA

**Migration path:**
1. Convert docker-compose.yml to Kubernetes manifests (Kompose)
2. Use Helm charts for deployment
3. Set up Ingress controller (NGINX or Traefik)
4. Configure persistent volumes (PVC)
5. Deploy to GKE, EKS, or self-hosted K3s

**Timeline:** 3-4 months after MVP

---

## 11. Cost Estimation

| Component | Resource | Monthly Cost |
|-----------|----------|--------------|
| **VM (MVP)** | 8 vCPU, 16 GB, 250 GB SSD | $80-120 |
| **VM (Production)** | 16 vCPU, 32 GB, 500 GB SSD | $200-300 |
| **Bandwidth** | 1 TB/month | $50 |
| **S3 Backups** | 500 GB | $10 |
| **Domain + TLS** | Let's Encrypt (free) | $0 |
| **Monitoring** | Self-hosted | $0 |
| **TOTAL (MVP)** | | **$140-180/month** |
| **TOTAL (Production)** | | **$260-360/month** |

**Post-MVP (Kubernetes):**
- Add $150-300/month for managed K8s (GKE/EKS)
- Or use self-hosted K3s (no extra cost)

---

## 12. References

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/)
- [PostgreSQL Backup Guide](https://www.postgresql.org/docs/current/backup.html)
- [NGINX Reverse Proxy](https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/)

---

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | AI Architecture Team | Initial infrastructure design |
