# VPS Health Check Report
**Date:** 2026-02-25 23:09 CET  
**Agent:** Rex 🛡️  
**Overall Score:** 30/100 ⚠️

## Status Summary
🔴 **CRITICAL ISSUES DETECTED**

## Detailed Findings

### 🔴 CRITICAL: Disk Usage
- **Usage:** 92% (17G/19G used, 1.6G free)
- **Threshold:** >85%
- **Status:** CRITICAL — immediate cleanup required

### ⚠️ Container Health Issues

**Unhealthy Containers (3):**
1. **vutler-frontend** — Up ~1h but unhealthy
2. **vutler-rocketchat** — Up 2h but unhealthy

**Restart Loop:**
3. **postal-worker** — Restarting continuously (1 restart 56s ago)

**Recently Restarted:**
4. **postal-mariadb** — Up only 14s (possible crash recovery)

### ✅ Working Correctly

**Healthy Containers:**
- vutler-api (Up 39m, healthy)
- vutler-redis (Up 2h, healthy)
- vutler-mongo (Up 2h, healthy)
- vutler-postgres (Up 2h)
- vutler-mailhog (Up 2h)
- postal-web (Up 2h)
- postal-smtp (Up 2h)
- postal-rabbitmq (Up 2h)

**API Health:**
- ✅ HTTP 200 OK (localhost:3000)

**Memory:**
- ✅ 8017 MB available (well above 500MB threshold)

**SSL Certificate:**
- ✅ Valid until May 18, 2026 (82 days remaining)

## Recommended Actions

### URGENT (within 24h):
1. **Disk cleanup** — free up at least 5GB:
   - Check Docker logs: `docker system df` and `docker system prune -a`
   - Review `/var/log` and rotate/compress logs
   - Check Postal email storage
   - Review database backups retention

2. **Fix postal-worker restart loop:**
   - Check logs: `docker logs postal-worker --tail 100`
   - Verify RabbitMQ connection
   - Check postal-mariadb stability

3. **Investigate unhealthy containers:**
   - `docker inspect vutler-frontend vutler-rocketchat`
   - Review healthcheck endpoints
   - Check application logs

### MEDIUM (within week):
- Set up disk usage alerts (<90%)
- Implement log rotation policy
- Review container healthcheck configs

## Score Breakdown
- Base: 100
- Disk >85%: -25
- Unhealthy containers (3x): -30
- Restart loop: -15
- **Final: 30/100**
