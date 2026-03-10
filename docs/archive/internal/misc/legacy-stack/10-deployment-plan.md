# 10. Plan de Déploiement — Vutler Phase 2

## Infrastructure Requirements

### Current Stack
- **VPS**: 4 CPU, 12GB RAM, 250GB storage (83.228.222.180)
- **Containers**: vutler-rocketchat (3000), vutler-api (3001), vutler-mongo, vutler-postgres, vutler-redis
- **Storage**: Synology NAS (primary), local /mnt/data (cache)
- **Reverse Proxy**: Nginx with SSL (Let's Encrypt)

### Phase 2 Additional Requirements
| Component | Requirement | Notes |
|-----------|-------------|-------|
| CPU | +1 core (crypto ops) | AES-256-GCM is hardware-accelerated on most CPUs |
| RAM | +2GB (key cache, GitHub webhook processing) | Total ~6.5GB estimated |
| Storage | +50GB (encrypted blobs, VDrive cache) | NAS absorbs most |
| Network | GitHub webhook ingress | Port 443 already open |

### No Infrastructure Upgrade Needed
Current VPS handles Phase 2 comfortably for 500-1000 users.

---

## Phased Rollout Strategy

### Phase 2.0 — Foundation (Week 1-2)
```
Deploy:
├── Crypto library (server-side AES-256-GCM module)
├── Key derivation endpoint (/api/v1/crypto/derive)
├── Database schema migration (encrypted columns)
└── Feature flags: E2E_ENABLED=false, VDRIVE_CHAT=false, GITHUB_CONNECTOR=false
```

**Rollout**: Internal only (Starbox team). Feature flags OFF for users.

### Phase 2.1 — E2E Encryption (Week 3-4)
```
Deploy:
├── Client-side encryption (app.js v5)
├── Hybrid encryption flow (ephemeral decrypt for LLM)
├── Key management UI (settings page)
├── Encrypted message storage migration
└── Feature flag: E2E_ENABLED=true (beta users)
```

**Rollout**: Beta users opt-in. Existing messages remain unencrypted. New messages encrypted.

### Phase 2.2 — VDrive in Vchat (Week 5)
```
Deploy:
├── VDrive panel in chat UI
├── File sharing in messages
├── Encrypted file upload/download
├── Agent file access API
└── Feature flag: VDRIVE_CHAT=true
```

**Rollout**: All users. Non-breaking addition.

### Phase 2.3 — GitHub Connector (Week 6)
```
Deploy:
├── GitHub OAuth2 flow
├── Webhook receiver (/api/v1/webhooks/github)
├── Auto-deploy pipeline
├── Dependency monitoring
└── Feature flag: GITHUB_CONNECTOR=true (Teams plan)
```

**Rollout**: Teams plan users only.

### Phase 2.4 — Dashboard & Polish (Week 7)
```
Deploy:
├── Enhanced monitoring dashboard
├── Performance metrics collection
├── Agent activity logs
├── Security audit logging
└── All feature flags ON
```

**Rollout**: GA (General Availability) for all plans.

---

## Deployment Process

### Pre-deployment Checklist
```bash
# 1. Backup
ssh ubuntu@83.228.222.180 << 'EOF'
  docker exec vutler-postgres pg_dump -U vaultbrix vaultbrix > /mnt/data/backups/pre-phase2-$(date +%Y%m%d).sql
  docker exec vutler-mongo mongodump --db vutler --out /mnt/data/backups/mongo-pre-phase2-$(date +%Y%m%d)
EOF

# 2. Tag current version
cd /home/ubuntu/vutler && git tag v1.0-pre-phase2

# 3. Run tests
npm test -- --coverage

# 4. Review nginx config changes
nginx -t
```

### Deployment Steps
```bash
# 1. Pull changes
cd /home/ubuntu/vutler && git pull origin main

# 2. Run database migrations
docker exec vutler-postgres psql -U vaultbrix -d vaultbrix -f /app/migrations/phase2.sql

# 3. Restart API container
docker restart vutler-api

# 4. Verify health
curl -s https://app.vutler.ai/api/v1/health | jq .

# 5. Verify feature flags
curl -s https://app.vutler.ai/api/v1/features | jq .

# 6. Smoke test
# - Login, send message, check encryption indicator
# - Upload file via VDrive panel
# - Connect GitHub (if applicable)
```

### Zero-Downtime Strategy
- API container restart takes <5s
- RC container not restarted (no changes to RC core)
- Nginx reload (not restart) for config changes
- Database migrations are additive (new columns, not ALTER existing)

---

## Rollback Procedure

### Immediate Rollback (< 5 min)
```bash
# 1. Disable feature flags
docker exec vutler-postgres psql -U vaultbrix -d vaultbrix \
  -c "UPDATE workspace_settings SET value='false' WHERE key IN ('E2E_ENABLED','VDRIVE_CHAT','GITHUB_CONNECTOR');"

# 2. Restart API
docker restart vutler-api
```

### Full Rollback (< 15 min)
```bash
# 1. Revert code
cd /home/ubuntu/vutler && git checkout v1.0-pre-phase2

# 2. Restore database (if schema changed)
docker exec -i vutler-postgres psql -U vaultbrix vaultbrix < /mnt/data/backups/pre-phase2-YYYYMMDD.sql

# 3. Restart everything
docker restart vutler-api vutler-rocketchat

# 4. Verify
curl -s https://app.vutler.ai/api/v1/health
```

### Data Safety
- Encrypted messages remain readable if E2E is rolled back (keys stored locally)
- Unencrypted messages are never deleted during migration
- VDrive files remain accessible regardless of feature flags

---

## Monitoring & Alerting

### Health Checks
```yaml
endpoints:
  - url: https://app.vutler.ai/api/v1/health
    interval: 60s
    alert_on: status != 200

  - url: https://app.vutler.ai/api/v1/crypto/status
    interval: 300s
    alert_on: status != 200

metrics:
  - encryption_latency_ms (p50, p95, p99)
  - key_derivation_time_ms
  - encrypted_messages_per_hour
  - vdrive_operations_per_hour
  - github_webhook_processing_time_ms
```

### Alerting Rules
| Metric | Warning | Critical |
|--------|---------|----------|
| API response time | > 500ms | > 2000ms |
| Encryption latency | > 50ms | > 200ms |
| Error rate | > 1% | > 5% |
| Disk usage | > 80% | > 90% |
| Memory usage | > 75% | > 90% |
| Failed key derivations | > 0/hour | > 5/hour |

### Logging
- All crypto operations logged to `audit_logs` table
- GitHub webhook events logged with payload hash
- VDrive file operations logged with user/agent context
- Sensitive data (keys, plaintext) NEVER logged

---

## CI/CD Pipeline (Future)

### Target Architecture
```
GitHub Push → GitHub Actions → Build & Test → Docker Image → VPS Deploy
```

### Phase 2 Pipeline (Manual + Scripted)
```bash
# deploy.sh
#!/bin/bash
set -e

echo "🚀 Deploying Vutler Phase 2..."

# Pre-flight
ssh ubuntu@83.228.222.180 'docker exec vutler-postgres pg_dump -U vaultbrix vaultbrix > /mnt/data/backups/auto-$(date +%Y%m%d%H%M).sql'

# Deploy
ssh ubuntu@83.228.222.180 << 'EOF'
  cd /home/ubuntu/vutler
  git pull origin main
  docker restart vutler-api
  sleep 5
  curl -sf https://app.vutler.ai/api/v1/health > /dev/null && echo "✅ Deploy OK" || echo "❌ Deploy FAILED"
EOF
```

### Future CI/CD (Post-MVP)
- GitHub Actions workflow
- Automated tests before deploy
- Staging environment
- Blue/green deployment
- Automated rollback on health check failure

---

## Timeline Summary

| Week | Milestone | Risk Level |
|------|-----------|------------|
| 1-2 | Foundation + schema migration | Low |
| 3-4 | E2E Encryption (beta) | Medium |
| 5 | VDrive in Vchat | Low |
| 6 | GitHub Connector | Low |
| 7 | Dashboard + GA | Low |

**Total: 7 weeks** from start to GA.

---

*Document: Vutler Phase 2 Deployment Plan*
*Version: 1.0*
*Date: 2026-02-23*
*Author: Jarvis (Starbox Group)*
