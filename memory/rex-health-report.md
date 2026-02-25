# VPS Health Check Report
**Date:** 2026-02-25 14:59 CET  
**Reporter:** Rex 🛡️ (Security & Monitoring)  
**Overall Score:** 85/100

## Summary
VPS is operationally healthy. All core services running, API responding, resources within safe limits. One configuration issue identified (non-critical).

---

## Container Status (11 total)

### ✅ Healthy (5)
- vutler-mongo (Up 16h)
- vutler-api (Up 16h)
- vutler-redis (Up 16h)
- vutler-postgres (Up 16h)

### ⚠️ Unhealthy (1)
- **vutler-rocketchat** (Up 16h) — **FALSE POSITIVE**
  - Root cause: Docker healthcheck uses `curl` but executable not found in container
  - Service status: **OPERATIONAL** (API responds 200, logs show healthy startup)
  - Action needed: Fix healthcheck in docker-compose.yml (use node-based check or install curl)

### ⚠️ No Health Check (6)
- vutler-mailhog (Up 16h)
- postal-smtp (Up 16h)
- postal-worker (Up 16h)
- postal-web (Up 16h)
- postal-rabbitmq (Up 16h)
- postal-mariadb (Up 16h)

---

## API Health
**Status:** ✅ PASS  
**RC API Endpoint:** 200 OK  
**Vutler API Endpoint:** 200 OK

---

## Resource Usage

### Disk Usage
**Status:** ✅ HEALTHY (76% used)  
- Total: 19G
- Used: 14G
- Available: 4.5G
- Threshold: <85% ✅

### Memory
**Status:** ✅ EXCELLENT (9792 MB available)  
- Total: 11960 MB
- Used: 2167 MB
- Free: 7940 MB
- Buff/Cache: 2224 MB
- Threshold: >500 MB ✅

### Swap
- Configured: 0 (disabled)

---

## SSL Certificate
**Status:** ✅ VALID  
**Domain:** app.vutler.ai  
**Expires:** May 18, 2026 GMT (~82 days remaining)  
**Action:** Monitor, renew before May 1, 2026

---

## Issues Found

### 🔴 Priority: MEDIUM
**Issue:** Rocket.Chat healthcheck failing (curl not found)  
**Impact:** Docker reports container as unhealthy (cosmetic issue, service functional)  
**Resolution:**
```yaml
# Option 1: Node-based healthcheck (recommended)
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/api/info', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"]
  interval: 30s
  timeout: 10s
  retries: 3

# Option 2: Install curl in Dockerfile
RUN apk add --no-cache curl
```

### 🟡 Priority: LOW
**Issue:** 6 containers lack health checks (Postal stack + Mailhog)  
**Impact:** No automated monitoring of service health  
**Resolution:** Add healthchecks to docker-compose.yml for Postal/Mailhog

---

## Recommendations

1. **Immediate:** Fix RC healthcheck definition (blocking false alerts)
2. **This week:** Add healthchecks for Postal stack
3. **Monitor:** Disk usage trending (currently 76%, add 10GB if hits 80%)
4. **Scheduled:** SSL renewal before May 1, 2026

---

## Next Check
Scheduled: 2026-02-26 14:59 CET (24h interval)
