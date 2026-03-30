# Nexus Local Integrations — Architecture Guide

## System Overview

Nexus is a local AI agent execution runtime that bridges cloud-based task orchestration with local file, mail, calendar, clipboard, and contact integrations. The system is built around a persistent WebSocket connection, multi-provider architecture, and a permission-gated task execution pipeline.

### Core Components

```
┌──────────────────────────────────────────────────────────────┐
│              Vutler Cloud (wss://api.vutler.com)             │
│  - Agent orchestration, task dispatch, result collection     │
└──────────────────────────────────────────────────────────────┘
              ↑ WSS (wss://api.vutler.com/ws/nexus)
              │ ↓
┌──────────────────────────────────────────────────────────────┐
│                   Nexus Local Runtime                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ WSClient (WebSocket Manager)                            │ │
│ │ - TLS connection + heartbeat (30s)                      │ │
│ │ - Auto-reconnect with exponential backoff (1s→60s)      │ │
│ │ - Message routing to orchestrator                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                         ↓                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ TaskOrchestrator (Task Executor)                        │ │
│ │ - Schema validation                                     │ │
│ │ - Permission engine integration                         │ │
│ │ - Provider routing & action dispatch                    │ │
│ │ - Progress streaming (2s intervals)                     │ │
│ │ - Error handling & result formatting                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                         ↓                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Provider Layer (Multi-platform)                         │ │
│ ├─────────────────────────────────────────────────────────┤ │
│ │ Search       → mdfind (macOS) | PowerShell (Windows)    │ │
│ │ Documents    → PdfReader, XlsxReader, CsvReader, etc.   │ │
│ │ Filesystem   → fs.promises + rich metadata              │ │
│ │ Clipboard    → pbpaste/Get-Clipboard + polling          │ │
│ │ Watch        → chokidar folder monitor                  │ │
│ │ Mail         → AppleScript/COM (Mail/Outlook)           │ │
│ │ Calendar     → AppleScript/COM                          │ │
│ │ Contacts     → AppleScript/COM                          │ │
│ │ Shell        → child_process.execSync (gated)           │ │
│ │ Filesystem   → File I/O + listing                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                         ↓                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Permission Engine                                       │ │
│ │ - Folder ACLs (~/.vutler/permissions.json)              │ │
│ │ - Action whitelist (search, read, write, execute)       │ │
│ │ - Real-time validation before provider execution        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                         ↓                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ OfflineQueue & OfflineMonitor (Enterprise)              │ │
│ │ - AES-256-GCM encrypted queue (.enc files)             │ │
│ │ - Exponential backoff retry (5 attempts)                │ │
│ │ - Dead letter queue (DLQ) for exhausted items          │ │
│ │ - Cron task runner (whitelist-validated binaries)       │ │
│ │ - Disk space guard (abort < 100 MB, warn < 500 MB)     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                         ↓                                    │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Dashboard UI (localhost:3100)                           │
│ │ - Real-time health status                               │ │
│ │ - Onboarding flow (QR code pairing)                     │ │
│ │ - Permission management                                 │ │
│ │ - Logs & activity history                               │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
              ↓ Local file system, Mail, Calendar, Contacts
```

### NexusNode Class (Core Runtime)

The `NexusNode` class is the entry point for the entire system. It:

- Manages WebSocket lifecycle (connection, heartbeat, reconnection)
- Initializes all provider instances with permission contexts
- Instantiates the TaskOrchestrator for task execution
- Manages the AgentManager for multi-agent coordination
- Provides graceful shutdown on SIGINT/SIGTERM
- Integrates offline queue (enterprise mode)

### Key Configuration

```javascript
const nexus = new NexusNode({
  key: 'VUTLER_API_KEY',
  server: 'https://app.vutler.ai',
  name: 'MacBook-Pro',
  type: 'local',
  port: 3100,
  mode: 'standard' | 'enterprise',
  permissions: {
    filesystem: {
      allowed_paths: ['~/Documents', '~/Desktop'],
      read_only_paths: []
    },
    shell: {
      allowed_commands: ['ls', 'cat', 'grep']
    }
  },
  offline_config: {
    enabled: true,
    max_queue_size: 1000,
    retry_interval_ms: 30000
  }
});

await nexus.connect();
```

## Data Flow Diagram

### Task Execution Pipeline

```
1. Cloud Dispatch
   ┌─────────────────────────────────────────────────────────┐
   │ Agent formulates task:                                  │
   │ { taskId, action: 'search', params: {...} }             │
   └─────────────────────────────────────────────────────────┘
                        ↓ WebSocket
2. Message Reception
   ┌─────────────────────────────────────────────────────────┐
   │ WSClient receives 'task.dispatch' message               │
   │ Emits 'message' event → TaskOrchestrator listener       │
   └─────────────────────────────────────────────────────────┘
                        ↓
3. Validation & Authorization
   ┌─────────────────────────────────────────────────────────┐
   │ TaskOrchestrator._validate(task)                        │
   │ - Confirm taskId, action are present                    │
   │ - Confirm action is in whitelisted set                  │
   │ - Confirm params match expected schema                  │
   │ ↓                                                        │
   │ PermissionEngine.validate(params.scope)                 │
   │ - Load ~/.vutler/permissions.json                       │
   │ - Check user has enabled each requested path           │
   │ - Return 403 if denied                                  │
   └─────────────────────────────────────────────────────────┘
                        ↓
4. Provider Routing & Execution
   ┌─────────────────────────────────────────────────────────┐
   │ TaskOrchestrator._route(action, params)                 │
   │ - Route to correct provider based on action             │
   │ - Start progress ticker for long-running actions        │
   │ - Execute provider method (e.g., search(), readMail())  │
   │ - Progress interval: 2s updates sent via WebSocket      │
   └─────────────────────────────────────────────────────────┘
                        ↓
5. Result Formatting & Stream Back
   ┌─────────────────────────────────────────────────────────┐
   │ TaskOrchestrator._successResult(taskId, data, durationMs) │
   │ - Cap result size to 1MB (drop metadata if needed)       │
   │ - Return structured result object                        │
   │ ↓                                                        │
   │ WSClient.send('task.result', { taskId, data, ... })     │
   │ ↓                                                        │
   │ Fallback: HTTP POST to /api/tasks/:taskId/result        │
   └─────────────────────────────────────────────────────────┘
                        ↓ Cloud receives result
6. Error Handling (at any step)
   ┌─────────────────────────────────────────────────────────┐
   │ Catch block in execute()                                │
   │ - Wrap in UnknownError if not a NexusError              │
   │ - Log structured error with metadata                    │
   │ - Return task.result with error object                  │
   │ - Never throw — orchestrator is resilient               │
   └─────────────────────────────────────────────────────────┘
```

### WebSocket Message Format

**Task Dispatch (Cloud → Nexus)**
```json
{
  "type": "task.dispatch",
  "payload": {
    "taskId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "action": "search",
    "params": {
      "query": "budget report 2026",
      "scope": ["~/Documents", "~/Downloads"],
      "limit": 20
    },
    "agentId": "agent-123",
    "timestamp": "2026-03-29T15:30:00Z"
  },
  "node_id": "nexus-mac-001"
}
```

**Progress Update (Nexus → Cloud)**
```json
{
  "type": "task.progress",
  "payload": {
    "taskId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "message": "Scanning ~/Documents (234/1045 files processed)",
    "percentComplete": 22,
    "timestamp": "2026-03-29T15:30:02Z"
  },
  "node_id": "nexus-mac-001"
}
```

**Result (Nexus → Cloud)**
```json
{
  "type": "task.result",
  "payload": {
    "taskId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "success",
    "data": {
      "results": [
        {
          "path": "~/Documents/budget-report-2026.pdf",
          "type": "document",
          "size": 245123,
          "modified": "2026-03-15T10:20:00Z"
        }
      ],
      "totalResults": 1
    },
    "metadata": {
      "provider": "search",
      "executionMs": 4230,
      "filesScanned": 1045
    }
  },
  "node_id": "nexus-mac-001"
}
```

## Provider Architecture

### Provider Interface Pattern

Each provider follows a common interface, with OS-specific implementations selected at runtime:

```
providers/
├── search/
│   ├── ISearchProvider.js         (interface)
│   ├── SearchProviderDarwin.js   (mdfind via spotlight)
│   ├── SearchProviderWin32.js    (PowerShell Get-ChildItem)
│   └── index.js                  (factory)
├── documents/
│   ├── IDocumentReader.js        (interface)
│   ├── PdfReader.js              (pdf-parse)
│   ├── XlsxReader.js             (xlsx)
│   ├── CsvReader.js              (auto-detect delimiter)
│   ├── DocxReader.js             (mammoth)
│   └── index.js                  (auto-detect + batch)
├── mail/
│   ├── IMailProvider.js          (interface)
│   ├── MailProviderDarwin.js     (AppleScript → Mail.app)
│   ├── MailProviderWin32.js      (COM/PowerShell → Outlook)
│   └── index.js                  (factory)
├── filesystem.js
├── shell.js
├── clipboard.js                  (pbpaste/Get-Clipboard)
├── calendar.js
├── contacts.js
├── watch.js                      (chokidar folder monitor)
└── search-providers/             (search impl details)
```

### Search Provider (Platform-Specific)

**macOS (SearchProviderDarwin)**
- Uses `mdfind` to query Spotlight index
- Scope: custom paths (~/Documents, ~/Downloads, etc.)
- Timeout: 5 seconds
- Fast because it leverages built-in Spotlight indexing

**Windows (SearchProviderWin32)**
- Uses `Get-ChildItem` with PowerShell
- Fallback to `fast-glob` for large searches
- Scope: custom paths (same interface)
- Timeout: 10 seconds
- May require Windows Search service for best performance

### Document Reader (Cross-platform)

- **PdfReader**: `pdf-parse` library, handles encrypted/scanned PDFs, graceful ParseError
- **XlsxReader**: `xlsx` library, multi-sheet support with headers + row data
- **CsvReader**: Auto-detect separator (comma/semicolon/tab), quoted field handling
- **DocxReader**: `mammoth` library, text + HTML table extraction
- **Batch Mode**: Auto-detect and process all supported docs in a folder with progress callback

### Clipboard Provider

- **macOS**: `pbpaste` (read), `pbcopy` (write)
- **Windows**: `Get-Clipboard`, `Set-Clipboard` PowerShell cmdlets
- **Linux**: `xclip` binary
- **Polling**: Configurable interval (default 3s), onChange callback
- **Queue**: Avoid redundant duplicates on rapid copy/paste

### Mail Provider

**macOS (MailProviderDarwin)**
- AppleScript interface to Mail.app
- Methods: list_emails (folder, limit), search_emails (query, folder)
- Returns: sender, subject, date, preview, message_id

**Windows (MailProviderWin32)**
- COM interface to Outlook (via PowerShell)
- Methods: list_emails, search_emails
- Returns: same schema as Darwin variant

### Calendar Provider

- **macOS**: AppleScript to Calendar.app
- **Windows**: COM to Outlook Calendar
- Methods: read_calendar (num_days_ahead), read_event (event_id)
- Returns: title, start_time, end_time, attendees, location

### Contacts Provider

- **macOS**: AppleScript to Contacts.app
- **Windows**: COM to Outlook Contacts
- Methods: read_contacts (limit), search_contacts (query)
- Returns: name, email, phone, organization

## Permission Engine

### Architecture

The PermissionEngine enforces two layers of access control:

**Layer 1: Folder ACLs**
- User explicitly enables folders during onboarding (QR pairing flow)
- Stored in `~/.vutler/permissions.json`
- Example:
  ```json
  {
    "filesystem": {
      "allowed_paths": ["~/Documents", "~/Desktop", "~/Downloads"],
      "read_only_paths": ["~/Projects/client-data"],
      "denied_paths": ["~/.ssh", "~/.aws"]
    },
    "shell": {
      "allowed_commands": ["ls", "cat", "grep"],
      "denied_patterns": ["rm -rf", "sudo"]
    }
  }
  ```

**Layer 2: Action Whitelist**
- Only specific actions are allowed: `search`, `read_document`, `list_dir`, `open_file`, `read_clipboard`, `list_emails`, `search_emails`, `read_calendar`, `read_contacts`
- Actions like `write_file`, `shell_exec` require elevated user confirmation
- Blocked actions: `delete`, `modify system files`, `install software`

### Validation Flow

```javascript
// In TaskOrchestrator.execute()
const targetPath = params.path || params.scope;
if (targetPath) {
  getPermissionEngine().validate(targetPath, action);
  // Throws PermissionDeniedError if denied
}
```

## Error Handling Strategy

### Error Hierarchy

```
Error (JavaScript built-in)
├── PermissionDeniedError (code: PERMISSION_DENIED)
├── ProviderUnavailableError (code: PROVIDER_UNAVAILABLE)
├── ParseError (code: PARSE_ERROR)
├── TimeoutError (code: TIMEOUT)
└── UnknownError (code: UNKNOWN_ERROR, wraps any JS Error)
```

### Error Response Example

```json
{
  "taskId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "error",
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Access to ~/Projects/confidential denied by policy",
    "meta": {
      "path": "~/Projects/confidential",
      "reason": "not_in_allowed_paths"
    }
  },
  "metadata": {
    "executionMs": 12
  }
}
```

### Logging Strategy

All errors logged to structured JSON log file:

```
~/.vutler/logs/nexus.log

[2026-03-29T15:30:00.123Z] ERROR [search] taskId=f47ac10b-58cc-4372-a567-0e02b2c3d479
code=TIMEOUT path=~/Documents/Large reason="search exceeded 5s timeout"
```

Never crash the runtime — always catch, log, return error result.

## Offline Resilience (Enterprise Mode)

### OfflineQueue

When WebSocket disconnects:

1. **Queue incoming task messages** in better-sqlite3 database (`~/.vutler/tasks.db`)
2. **Persist state** of partially executed tasks
3. **Attempt execution** of queued tasks during disconnected periods (with graceful failure)
4. **Auto-replay on reconnect** with exponential backoff

### OfflineMonitor

Enterprise deployments can enable offline monitoring:

```javascript
offline_config: {
  enabled: true,
  max_queue_size: 1000,
  retry_interval_ms: 30_000,
  auto_heartbeat_when_offline: true
}
```

### Graceful Degradation

If WebSocket fails:
- Nexus falls back to HTTP polling every 10 seconds
- Tasks continue to execute locally
- Results queued until connection restored
- User sees "offline" indicator in dashboard

## WebSocket Client Implementation

### Connection Lifecycle

```
1. Constructor
   → Store URL, API key, nodeId

2. connect()
   → _open()
   → New WebSocket(wss://api.vutler.com/ws/nexus)
   → Set TLS options

3. On open
   → Emit 'connected'
   → Start heartbeat timer (30s)
   → Reset reconnect delay

4. On message
   → Parse JSON
   → Emit 'message' event

5. On close
   → Emit 'disconnected'
   → If not closing flag, schedule reconnect with exponential backoff

6. On error
   → Emit 'error' event
   → Log error
   → Trigger reconnect
```

### Heartbeat Protocol

- Interval: 30 seconds
- Message: `{ type: 'nexus.heartbeat', payload: { status: 'online' } }`
- Timeout: If no pong after 45s, force close and reconnect
- Cloud can respond with tasks or configuration updates

### Reconnection Strategy

- Base delay: 1 second
- Max delay: 60 seconds
- Backoff multiplier: 1.5x
- Example: 1s → 1.5s → 2.25s → 3.37s → ... → 60s
- Jitter: ±10% to avoid thundering herd

## Dashboard & Pairing Flow

### Onboarding (QR Code Pairing)

1. **Generate Pairing Code** (`/api/pairing/generate`)
   - Returns 6-character alphanumeric code
   - 5-minute TTL
   - Encoded in QR code for scanning

2. **QR Code Display**
   - User opens localhost:3100/onboarding
   - QR code contains pairing code + device name
   - Shows step-by-step instructions

3. **Permission Toggles**
   - User selects folders: Documents, Desktop, Downloads, Custom
   - Stores selections in `~/.vutler/permissions.json`

4. **Health Verification**
   - POST to `/api/pairing/status` with pairing code
   - Confirms Nexus is running
   - Confirms WebSocket connected to cloud

5. **Confirmation** (`/api/pairing/confirm`)
   - Cloud-side confirmation of pairing
   - Auth token stored in `~/.vutler/nexus.json`
   - Redirect to dashboard

### Dashboard UI

- **Status Widget**: Online/Offline, last heartbeat, task queue size
- **Logs Viewer**: Real-time logs from `~/.vutler/logs/nexus.log`
- **Permissions Manager**: Toggle folder access, view action history
- **Activity History**: Recent tasks executed, success/failure rate

## Performance Targets (NFRs)

| Metric | Target | Implementation |
|--------|--------|-----------------|
| Search e2e latency | < 5s | Spotlight (macOS) + Windows Search |
| WebSocket latency | < 500ms | TLS + heartbeat keepalive |
| Memory (idle) | < 50MB | pkg binary, no Electron |
| Document reading (10 docs) | < 2s | Parallel processing |
| Task result size | 1MB max | Cap + compression |
| Reconnect time | < 10s | Exponential backoff |

## Security Hardening

### Authentication

The `/register` endpoint enforces strict API key validation against the database in all environments. The `NEXUS_DEV_BYPASS` env var is explicitly rejected in production — if it is set, the server logs a critical misconfiguration error and continues to require valid credentials. There is no dev-mode shortcut.

```
Authorization: Bearer <nexus_api_key>
```

Keys are resolved via `resolveApiKey()`, which checks the `tenant_vutler.api_keys` table. Revoked keys are rejected immediately.

### Rate Limiting

Sensitive endpoints are protected by `express-rate-limit`:

| Endpoint | Window | Max requests |
|----------|--------|-------------|
| `POST /runtime/heartbeat` | 1 minute | 2 |
| `POST /register` | 15 minutes | 5 |
| `POST /keys` | 1 hour | 10 |

All rate-limited endpoints return `429` with `{ success: false, error: "Rate limit exceeded" }` when the threshold is crossed. Standard `RateLimit-*` headers are emitted; legacy `X-RateLimit-*` headers are disabled.

### Offline Queue Encryption (AES-256-GCM)

Queue files written by `OfflineMonitor` are encrypted at rest using AES-256-GCM when an API key is available.

**Key derivation:**
- Algorithm: PBKDF2-SHA-512
- Iterations: 100,000
- Key length: 32 bytes (AES-256)
- Salt: 32 random bytes, stored in `<queue_path>/.salt`, generated once per node
- Input: Nexus API key (`opts.apiKey` → `node.apiKey` → `node.config.apiKey`)

**Wire format (binary .enc files):**
```
[IV (16 B)] || [GCM auth tag (16 B)] || [ciphertext]
```

Decryption fails with an authentication error if the ciphertext has been tampered with. Corrupted files are moved to `<queue_path>/corrupted/` and excluded from future sync attempts.

If no API key is configured, the monitor falls back to plain-text `.json` files and logs a warning. On the next sync cycle, legacy `.json` files are automatically migrated to `.enc` when a key becomes available.

### Cron Command Injection Prevention

Offline cron tasks run via `execFileSync` (no shell interpolation). Before any task is scheduled, `parseSafeCommand()` validates:

1. **Binary whitelist** — only approved binaries are permitted:

   | Category | Binaries |
   |----------|---------|
   | HTTP | `curl`, `wget` |
   | Runtimes | `node`, `python`, `python3`, `ruby`, `php` |
   | Shells | `bash`, `sh` |
   | Text utils | `echo`, `printf`, `cat`, `ls`, `pwd`, `date`, `env`, `grep`, `awk`, `sed`, `sort`, `uniq`, `wc`, `head`, `tail`, `cut` |
   | Data | `jq`, `yq` |
   | Network | `ping`, `nslookup`, `dig` |
   | VCS / pkg | `git`, `npm`, `npx`, `pnpm`, `yarn` |

2. **Dangerous characters** — any argument containing `;`, `|`, `&`, `` ` ``, `$`, `<`, `>`, `(`, `)`, `{`, `}`, `[`, `]`, `\` is rejected.
3. **Command length** — max 1,024 characters.
4. **Fail-fast** — all tasks in a batch are validated before any timer is started. An invalid task is skipped; the rest are still scheduled.

### Disk Space Monitoring

Before writing to the offline queue, `OfflineMonitor.enqueue()` calls `df -k` to check available disk space:

| Free space | Action |
|-----------|--------|
| > 500 MB | Normal write |
| 100–500 MB | Write with `WARN` log entry |
| < 100 MB | Reject with `Error: Insufficient disk space` |

The check falls back to `Infinity` (non-blocking) in environments where `df` is unavailable.

---

## Enterprise Features

### Seat Enforcement

Agent deployment is gated by a seat quota stored in `nexus_nodes.config.max_seats` (or `config.seats`). The `validateSeatQuota()` function compares the current `agents_deployed` array length against the configured maximum.

- `POST /:id/deploy` returns `403` with `Seat quota exceeded (current/max)` if the limit is reached.
- `GET /:nodeId/seats` exposes the current quota status to the cloud dashboard.
- A node with no `max_seats` configured has unlimited seats (`max: null`).

### Load Balancing

`nexusRouting.js` implements multi-agent routing with three complementary mechanisms:

**Round-robin**: Each `workspaceId:taskType` key maintains an independent index. The index resets automatically when the candidate list changes (e.g., after a routing rule update).

**Weight-based**: Agents can declare a `config.weight` (integer 1–10, default 1). A weight-3 agent is expanded to three slots in the pool, giving it three times the probability of being selected in a round-robin cycle.

**Health-aware**: An agent is considered eligible only when:
- `status = 'online'` in the DB
- Last heartbeat is < 90 seconds old
- Not in failure cooldown (< 3 consecutive failures, or cooldown window of 30 s expired)

If no primary candidate is eligible, the router walks the `FALLBACK_CHAIN` map. If all fallbacks are also offline, the first candidate is returned anyway with `warning: 'primary_agent_offline'`.

Routing rules are loaded from `tenant_vutler.nexus_routing_rules` (workspace-aware) with a 60-second in-memory cache. Static rules in `ROUTING_RULES` are used when no DB rows exist for the workspace.

### Dead Letter Queue (DLQ)

Failed offline sync items follow exponential backoff, then graduate to the DLQ:

| Attempt | Backoff |
|---------|---------|
| 1 | 1 s |
| 2 | 2 s |
| 3 | 4 s |
| 4 | 8 s |
| 5 (final) | Moved to DLQ |

DLQ files live in `<queue_path>/../queue/dlq/` (configurable via `opts.dlq_path`). Each file keeps a sidecar `.meta.json` with attempt count, last error, and DLQ timestamp.

`getDLQStatus()` returns the count, oldest, and newest task filenames. `retryDLQ(taskId?)` moves files back into the main queue with a fresh attempt counter.

### In-Memory Metrics

`nexusMetrics.js` provides process-local counters with no database dependency. Metrics are scoped by `workspaceId` and retained for 24 hours in hourly buckets. A cleanup interval runs every hour to purge stale buckets.

**Tracked dimensions:**

| Dimension | Fields |
|-----------|--------|
| Workspace | `totalTasks`, `successCount`, `failureCount`, `errorRate` |
| Per-agent | `tasks`, `success`, `failures`, `errorRate`, `avgDurationMs` |
| Per-task-type | `count`, `avgDurationMs` |
| Hourly | `hour` (ISO), `tasks`, `errors` |

Metrics are recorded by calling `recordTaskStart(workspaceId, agentId, taskType, taskId)` at dispatch time and `recordTaskEnd(taskId, success, durationMs?)` at completion. Both calls are no-ops if the workspace or taskId is missing.

---

## Security Considerations

1. **No Raw Files**: Results contain metadata + extracted text, never raw file uploads
2. **Encrypted Communication**: WSS with TLS, API key in Authorization header
3. **Permission Boundaries**: Tasks rejected if outside allowed paths
4. **Audit Logging**: All task execution logged with timestamp, agent ID, action, result
5. **Offline Queue**: Queue files encrypted at rest with AES-256-GCM when API key is present
6. **Command Injection**: Cron tasks validated against binary whitelist before scheduling
