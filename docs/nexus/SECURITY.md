# Nexus Security Reference

## Threat Model

Nexus bridges local machine resources to a cloud orchestration layer. The attack surface covers:

| Threat | Mitigated by |
|--------|-------------|
| Unauthenticated cloud access to local resources | API key DB validation on every register/heartbeat |
| Dev-mode bypass left enabled in production | Hard rejection of `NEXUS_DEV_BYPASS` in production |
| Replay attacks on offline queue | AES-256-GCM auth tag — decryption fails on tampered ciphertext |
| Shell injection via cron commands | Binary whitelist + dangerous-character rejection in `parseSafeCommand` |
| Disk exhaustion via queue growth | Pre-write disk check (abort < 100 MB, warn < 500 MB) |
| Brute-force API key / registration | Rate limiting on `/register` (5/15 min) and `/keys` (10/hour) |
| Unauthorised seat deployment | Cloud-side `validateSeatQuota` enforced before `agents_deployed` update |
| Cross-workspace data leakage | All queries scope to `workspace_id` extracted from validated JWT/API key |
| Stale/expired tokens | `revokeApiKey` immediately removes from DB; `resolveApiKey` rejects revoked keys |

---

## Auth Chain

```
HTTP request
    │
    ▼
1. JWT middleware (app-level)
   └─ Extracts workspaceId from session token
   └─ Sets req.workspaceId, req.userId
    │
    ▼
2. requireApiKey middleware (runtime endpoints only)
   └─ Reads Authorization: Bearer <secret>
   └─ resolveApiKey(secret) → DB lookup in tenant_vutler.api_keys
   └─ Rejects revoked keys (revoked_at IS NOT NULL)
   └─ Sets req.workspaceId from key record (overrides JWT workspace)
    │
    ▼
3. Endpoint handler
   └─ All DB queries include AND workspace_id = $n
   └─ Node/deployment lookups verify ownership before mutation
```

The register endpoint accepts an API key either in the `Authorization: Bearer` header or in `req.body.apiKey`. The `NEXUS_DEV_BYPASS` env var is checked and **explicitly ignored** in production:

```javascript
if (process.env.NODE_ENV === 'production' && process.env.NEXUS_DEV_BYPASS === 'true') {
  console.error('[NEXUS][SECURITY] NEXUS_DEV_BYPASS is set in production — ignoring.');
}
// Always validate against DB — no bypass
```

---

## Encryption at Rest (Offline Queue)

Queue files produced by `OfflineMonitor` are encrypted with AES-256-GCM when an API key is present.

### Key Lifecycle

```
1. Node starts
2. OfflineMonitor._deriveKey() called on first enqueue
3. _getSalt() reads ~/.vutler/offline-queue/.salt (or generates 32 random bytes)
4. PBKDF2-SHA512(apiKey, salt, 100_000 iterations, 32 bytes) → encKey
5. encKey cached in-process for lifetime of OfflineMonitor instance
```

### File Layout

```
<queue_path>/
├── .salt                         ← 32-byte random salt (binary, persistent)
├── 1743350400000-f47ac10b.enc    ← IV || authTag || ciphertext (binary)
├── 1743350400000-f47ac10b.meta.json  ← attempt counter sidecar
├── corrupted/                    ← quarantined files (bad decrypt / parse)
└── (legacy .json files)          ← plain-text fallback if no API key
```

**Encrypted file binary layout:**

| Offset | Length | Content |
|--------|--------|---------|
| 0 | 16 bytes | Random IV (AES block size) |
| 16 | 16 bytes | GCM authentication tag |
| 32 | variable | Ciphertext (JSON payload) |

Authentication failure on decrypt (wrong key or tampered file) moves the file to `corrupted/`.

### Key Rotation

Rotating the Nexus API key breaks decryption of existing `.enc` files because the derived key changes. Procedure:

1. Drain the queue — trigger `_syncQueue()` and confirm all items are synced.
2. Verify DLQ is empty (`getDLQStatus().count === 0`).
3. Rotate the key.
4. Delete `.salt` to force a new salt on next startup (recommended).
5. Restart Nexus.

---

## Command Injection Prevention

Cron tasks run via Node.js `child_process.execFileSync`, which passes arguments as a separate array — no shell is invoked. This means shell metacharacters in arguments do not cause injection.

The `parseSafeCommand(command)` function enforces three rules before any task is scheduled:

### 1. Binary whitelist

`path.basename(tokens[0])` must be in `ALLOWED_CRON_BINARIES`:

```
curl wget node python python3 ruby php bash sh echo printf cat ls pwd date env
grep awk sed sort uniq wc head tail cut jq yq ping nslookup dig git npm npx pnpm yarn
```

Absolute paths (e.g., `/usr/bin/curl`) are accepted — the basename is used for the whitelist check only.

### 2. Argument validation

Each argument is tested against:
```
/[;|&`$<>(){}[\]\\]/
```

Any match causes the entire task to be rejected with a logged error.

### 3. Length cap

Commands longer than 1,024 characters are rejected.

**Fail-fast**: all tasks in a batch are validated before any timer starts. Invalid tasks are skipped; valid tasks in the same batch are still scheduled.

---

## Rate Limiting Strategy

Rate limiters use `express-rate-limit` with in-memory stores (per-process). In multi-process (PM2 cluster) deployments, each process has independent counters — effective limit is `max × instances`.

| Endpoint | Threat | Window | Limit |
|----------|--------|--------|-------|
| `POST /runtime/heartbeat` | Spam / resource exhaustion | 1 min | 2 req |
| `POST /register` | Credential enumeration | 15 min | 5 req |
| `POST /keys` | API key flood | 1 hour | 10 req |

All limiters use standard `RateLimit-*` response headers. Legacy `X-RateLimit-*` headers are disabled. Exceeded requests receive:

```json
HTTP 429
{ "success": false, "error": "Rate limit exceeded" }
```

---

## Disk Exhaustion Protection

`OfflineMonitor.enqueue()` checks available disk space via `df -k` before every write:

```javascript
const freeDisk = getFreeDiskBytes(this.queuePath);

if (freeDisk < 100 MB) → throw Error (task not queued)
if (freeDisk < 500 MB) → log WARN (write proceeds)
```

`getFreeDiskBytes` parses the `Available` column (field 4) of `df -k` output. On parse failure or when `df` is unavailable, it returns `Infinity` — the queue is never blocked by a missing utility.

To integrate this with monitoring, watch for log lines matching:
```
[Offline] Disk space critically low
[Offline] Disk space low — queue write proceeding
```

---

## Audit Logging

### Access log (`~/.vutler/logs/access.jsonl`)

One JSON line per request to the local dashboard API (when enabled). Fields: `timestamp`, `method`, `path`, `status`, `durationMs`, `ip`.

### Application log (`~/.vutler/logs/nexus.log`)

Structured JSON entries from OfflineMonitor and runtime components. Relevant security events:

| Event | Level | Trigger |
|-------|-------|---------|
| Queue file decryption failure | `error` | Wrong key or tampered `.enc` file |
| Queue file quarantined | `error` | Moved to `corrupted/` |
| DLQ promotion | `error` | 5 consecutive sync failures |
| Disk space warning | `warn` | Free space 100–500 MB |
| Disk space abort | `error` | Free space < 100 MB |
| Cron task rejected | `error` | Binary not in whitelist or dangerous arg |
| Offline mode entered | `info` | No cloud contact for threshold duration |
| DLQ task requeued | `info` | `retryDLQ()` called |

All OfflineMonitor log entries include `ts` (ISO-8601), `level`, `msg`, and relevant context fields (`taskId`, `file`, `freeMB`, etc.).

### Cloud-side logs

`POST /runtime/heartbeat` and `POST /register` log to the Express process stdout with `[NEXUS]` prefix. Authentication failures log at `warn` level with the key prefix (first 12 chars) for traceability without exposing the full secret.

---

## Security Configuration Reference

| Parameter | Location | Recommended value |
|-----------|----------|-------------------|
| `NODE_ENV` | `.env` | `production` |
| `NEXUS_DEV_BYPASS` | `.env` | Must not be set |
| `VUTLER_KEY` | `.env` | From secrets manager |
| Queue path permissions | filesystem | `chmod 700 ~/.vutler/` |
| `.salt` file permissions | filesystem | `chmod 600` |
| `nexus.json` permissions | filesystem | `chmod 600` |
| `max_seats` | `nexus_nodes.config` | Set for enterprise nodes |
