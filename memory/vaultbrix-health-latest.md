# Vaultbrix + VPS Daily Health Check

**Run timestamp:** 2026-03-18 08:02 Europe/Zurich (07:02 UTC)  
**Scope:** SSH reachability, containers, disk, memory, SSL expiry, DB connectivity, Exoscale backup reachability/freshness, mirror sync status.

## Executive Summary
- **Overall:** ⚠️ **Attention needed** (root disk high; mirror sync failed; Exoscale freshness check skipped)
- **SSH reachability (VPS):** ✅ OK
- **Docker/container status:** ✅ Core containers running
- **Disk usage:** ⚠️ Root volume high (`/` at **89%**)
- **Memory:** ⚠️ No swap configured (RAM currently sufficient)
- **SSL certificates:** ✅ Valid (Vaultbrix domains expiring 2026-05-10)
- **DB connectivity:** ✅ PostgreSQL container accepts connections
- **Exoscale backup reachability:** ✅ Endpoint reachable (`https://sos-ch-gva-2.exo.io`)
- **Exoscale backup freshness:** ⚠️ **BACKUP_CHECK_SKIPPED** (AWS/Exoscale CLI + credentials not available in check runtime; cannot list object timestamps)
- **Mirror script:** ❌ Failed (`mkdir: /data: Read-only file system`)

## Detailed Findings

### 1) SSH Reachability
- Target: `ubuntu@83.228.222.180`
- Result: `SSH_OK`
- Hostname: `ov-364ef1`

### 2) Docker / Container Status
Running containers:
- `postal-smtp`, `postal-web`, `postal-worker`, `postal-rabbitmq`, `postal-mariadb`
- `vutler-api` (healthy)
- `postiz`, `postiz-db`, `postiz-redis`
- `vutler-redis` (healthy)

### 3) Disk Usage
- `/dev/sda1` mounted on `/`: **19G total, 17G used, 2.2G free (89%)** ⚠️

### 4) Memory
- RAM: **11 GiB total / 4.6 GiB used / 742 MiB free / 7.1 GiB buff-cache**
- Available memory: **7.1 GiB**
- Swap: **0 B configured** ⚠️

### 5) SSL Expiry
- `vaultbrix.com` → `May 10 09:36:22 2026 GMT`
- `www.vaultbrix.com` → `May 10 10:01:14 2026 GMT`
- `app.vaultbrix.com` → `May 10 09:36:23 2026 GMT`
- `api.vaultbrix.com` → `May 10 09:36:22 2026 GMT`

### 6) Database Connectivity
- `docker exec postiz-db pg_isready -U postiz -d postiz` → **accepting connections** ✅
- No public DB listeners detected on common DB ports in `ss -ltn` output ✅

### 7) Backup (Exoscale) Check (Updated Policy)
- Exoscale endpoint probe: `HTTP/2 405` from `https://sos-ch-gva-2.exo.io` (expected for HEAD/GET without signed request) → **reachability OK** ✅
- Tooling check on VPS: `aws` CLI not found, `exo` CLI not found.
- **Freshness status:** ⚠️ **BACKUP_CHECK_SKIPPED**
- **Reason (explicit):** Backup object listing/last-modified validation on Exoscale requires authenticated tooling/credentials not available in this runtime.

### 8) Mirror Status
Command:
- `/Users/lopez/.openclaw/workspace/scripts/mirror-projects-vutler-to-drive.sh`

Result:
- **FAILED** ❌
- Error: `mkdir: /data: Read-only file system`

## Recommended Next Actions
1. Reduce root disk pressure on VPS (`docker system df`, prune unused images/layers/logs carefully).
2. Fix mirror script destination/path assumptions (`/data` currently read-only in this environment).
3. Enable authenticated Exoscale backup freshness checks (install `aws` or `exo` + scoped read-only credentials for backup bucket listing).
4. Optional resilience: add 2–4 GiB swap to reduce OOM risk during spikes.

---
Status: generated automatically by `soc2-main-daily-vaultbrix-vps-health` cron job.