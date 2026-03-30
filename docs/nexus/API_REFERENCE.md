# Nexus Local Integrations — API Reference

## WebSocket API

### Endpoint

```
wss://api.vutler.ai/ws/nexus
```

Authentication: Include `Authorization: Bearer <VUTLER_API_KEY>` header.

TLS: Required. Nexus enforces secure connections only.

### Connection Handshake

After TCP connect, Nexus sends registration message:

```json
{
  "type": "nexus.register",
  "payload": {
    "nodeId": "nexus-mac-001",
    "name": "MacBook-Pro",
    "type": "local",
    "version": "0.1.0",
    "capabilities": [
      "search",
      "read_document",
      "open_file",
      "list_dir",
      "write_file",
      "shell_exec",
      "read_clipboard",
      "list_emails",
      "search_emails",
      "read_calendar",
      "read_contacts",
      "search_contacts"
    ]
  }
}
```

Cloud responds with configuration:

```json
{
  "type": "nexus.config",
  "payload": {
    "nodeId": "nexus-mac-001",
    "workspaceId": "workspace-abc123",
    "permissions": {
      "filesystem": {
        "allowed_paths": ["~/Documents", "~/Desktop"]
      }
    },
    "agentConfigs": [
      {
        "agentId": "agent-123",
        "primaryAgent": true,
        "seats": 2
      }
    ]
  }
}
```

## Message Types

All WebSocket messages follow the structure:

```json
{
  "type": "message.type",
  "payload": { /* ... */ },
  "node_id": "nexus-mac-001"
}
```

### Heartbeat (Bidirectional)

**Nexus → Cloud** (every 30 seconds):
```json
{
  "type": "nexus.heartbeat",
  "payload": {
    "status": "online",
    "uptime_seconds": 3600,
    "memory_mb": 42,
    "task_queue_size": 0,
    "last_task_timestamp": "2026-03-29T15:30:00Z"
  }
}
```

**Cloud → Nexus** (optional config update with heartbeat response):
```json
{
  "type": "nexus.heartbeat.response",
  "payload": {
    "ack": true,
    "timestamp": "2026-03-29T15:30:00Z"
  }
}
```

If Nexus doesn't receive pong within 45 seconds, it force-closes and reconnects.

### Task Dispatch (Cloud → Nexus)

Cloud sends task with full parameters:

```json
{
  "type": "task.dispatch",
  "payload": {
    "taskId": "task-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "action": "search",
    "params": {
      "query": "quarterly report",
      "scope": ["~/Documents"],
      "limit": 20,
      "filters": {
        "type": "pdf",
        "dateAfter": "2026-01-01"
      }
    },
    "agentId": "agent-123",
    "timestamp": "2026-03-29T15:30:00Z"
  }
}
```

Nexus immediately starts execution in background and sends progress updates.

### Task Progress (Nexus → Cloud)

Streamed every 2 seconds for long-running actions:

```json
{
  "type": "task.progress",
  "payload": {
    "taskId": "task-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "action": "search",
    "message": "Scanning ~/Documents (234/1045 files processed)",
    "percentComplete": 22,
    "timestamp": "2026-03-29T15:30:02Z"
  }
}
```

### Task Result (Nexus → Cloud)

Sent when task completes (success or error):

```json
{
  "type": "task.result",
  "payload": {
    "taskId": "task-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "success",
    "data": {
      "results": [
        {
          "path": "~/Documents/Q1-2026-Report.pdf",
          "type": "document",
          "size": 245123,
          "modified": "2026-03-15T10:20:00Z"
        },
        {
          "path": "~/Documents/Q1-2026-Summary.docx",
          "type": "document",
          "size": 87654,
          "modified": "2026-03-16T14:30:00Z"
        }
      ],
      "totalResults": 2,
      "searchTimeMs": 2340
    },
    "metadata": {
      "provider": "search",
      "executionMs": 2345,
      "filesScanned": 1045,
      "message": null
    }
  }
}
```

Error response:

```json
{
  "type": "task.result",
  "payload": {
    "taskId": "task-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "error",
    "error": {
      "code": "TIMEOUT",
      "message": "Search exceeded 5 second timeout",
      "meta": {
        "action": "search",
        "timeout_ms": 5000
      }
    },
    "metadata": {
      "provider": "search",
      "executionMs": 5023
    }
  }
}
```

## Task Actions

All actions are routed through TaskOrchestrator to the appropriate provider. Permission validation happens before any action executes.

### search

Full-text file search across allowed folders.

**Params:**
```json
{
  "query": "budget 2026",
  "scope": ["~/Documents", "~/Downloads"],
  "limit": 20,
  "filters": {
    "type": "pdf|docx|xlsx|csv|txt",
    "dateAfter": "2026-01-01",
    "sizeBytesMax": 10485760
  }
}
```

**Result:**
```json
{
  "results": [
    {
      "path": "~/Documents/budget-2026.pdf",
      "type": "pdf",
      "size": 245123,
      "modified": "2026-03-15T10:20:00Z",
      "snippet": "Q1 2026 budget allocation: ...",
      "relevance": 0.95
    }
  ],
  "totalResults": 1,
  "searchTimeMs": 1200
}
```

**Platform Notes:**
- macOS: Uses Spotlight (mdfind), ~5s timeout
- Windows: Uses Windows Search or Get-ChildItem fallback, ~10s timeout

### read_document

Extract text from a single document (PDF, Word, Excel, CSV).

**Params:**
```json
{
  "path": "~/Documents/budget-2026.pdf",
  "format": "text|json|html"
}
```

**Result (format: text):**
```json
{
  "path": "~/Documents/budget-2026.pdf",
  "type": "pdf",
  "size": 245123,
  "pages": 15,
  "text": "Q1 2026 Budget Report\n...",
  "encoding": "utf-8"
}
```

**Result (format: json):**
```json
{
  "path": "~/Documents/budget-2026.xlsx",
  "type": "xlsx",
  "sheets": [
    {
      "name": "Q1",
      "headers": ["Category", "Budget", "Spent"],
      "rows": [
        ["Salaries", 50000, 48000],
        ["Operations", 25000, 24500]
      ]
    }
  ]
}
```

### open_file

Open a file with the default system application (Finder, Explorer, Preview, etc.).

**Params:**
```json
{
  "path": "~/Documents/budget-2026.pdf",
  "app": "Preview"  // optional, defaults to system default
}
```

**Result:**
```json
{
  "path": "~/Documents/budget-2026.pdf",
  "opened": true,
  "app": "Preview",
  "message": "File opened successfully"
}
```

### list_dir

List directory contents with optional filtering and recursion.

**Params:**
```json
{
  "path": "~/Documents",
  "recursive": false,
  "pattern": "*.pdf",
  "limit": 100
}
```

**Result:**
```json
{
  "path": "~/Documents",
  "entries": [
    {
      "name": "budget-2026.pdf",
      "path": "~/Documents/budget-2026.pdf",
      "type": "file",
      "size": 245123,
      "modified": "2026-03-15T10:20:00Z"
    },
    {
      "name": "Projects",
      "path": "~/Documents/Projects",
      "type": "directory",
      "entries": 5
    }
  ],
  "totalEntries": 12
}
```

### write_file

Write text to a file. Requires explicit permission in `permissions.json` (action.requires_confirmation).

**Params:**
```json
{
  "path": "~/Documents/notes.txt",
  "content": "Meeting notes from March 29...",
  "encoding": "utf-8",
  "append": false
}
```

**Result:**
```json
{
  "path": "~/Documents/notes.txt",
  "bytes_written": 245,
  "created": false,
  "message": "File written successfully"
}
```

### shell_exec

Execute shell command with restricted whitelist. Requires explicit permission.

**Params:**
```json
{
  "command": "ls -la ~/Documents"
}
```

**Result:**
```json
{
  "command": "ls -la ~/Documents",
  "exit_code": 0,
  "stdout": "total 234\ndrwx------  5 user  group  160 Mar 29 15:30 .\n...",
  "stderr": "",
  "execution_ms": 45
}
```

**Allowed Commands** (configurable in permissions.json):
- `ls`, `cat`, `grep`, `find`, `locate`, `pwd`, `whoami`

**Blocked Patterns**:
- `rm`, `delete`, `sudo`, `passwd`, `system`, `exec`

### read_clipboard

Read current clipboard contents.

**Params:**
```json
{}
```

**Result:**
```json
{
  "content": "Text copied from clipboard",
  "type": "text",
  "size": 245
}
```

### list_emails

List emails from a folder (Inbox, Sent, Archive, etc.).

**Params:**
```json
{
  "folder": "Inbox",
  "limit": 20,
  "unread_only": false
}
```

**Result:**
```json
{
  "folder": "Inbox",
  "emails": [
    {
      "id": "msg-123",
      "from": "alice@example.com",
      "subject": "Q1 Budget Review",
      "date": "2026-03-29T10:30:00Z",
      "preview": "Here are the Q1 budget numbers...",
      "unread": false,
      "has_attachments": true
    }
  ],
  "totalEmails": 143
}
```

### search_emails

Search emails by sender, subject, or content.

**Params:**
```json
{
  "query": "budget",
  "folder": "Inbox",
  "from": "finance@example.com",
  "dateAfter": "2026-03-01",
  "limit": 10
}
```

**Result:**
```json
{
  "results": [
    {
      "id": "msg-123",
      "from": "finance@example.com",
      "subject": "Q1 Budget Review",
      "date": "2026-03-29T10:30:00Z",
      "preview": "Here are the Q1 budget numbers..."
    }
  ],
  "totalMatches": 5
}
```

### read_calendar

Read calendar events for the next N days.

**Params:**
```json
{
  "days_ahead": 7,
  "calendar": "Work"  // optional, defaults to primary
}
```

**Result:**
```json
{
  "calendar": "Work",
  "events": [
    {
      "id": "evt-123",
      "title": "Budget Review Meeting",
      "start": "2026-03-31T14:00:00Z",
      "end": "2026-03-31T15:30:00Z",
      "location": "Conference Room B",
      "attendees": ["alice@example.com", "bob@example.com"],
      "description": "Quarterly budget review"
    }
  ],
  "daysQueried": 7
}
```

### read_contacts

List contacts with optional filtering.

**Params:**
```json
{
  "limit": 50,
  "group": "Work",  // optional
  "fields": ["name", "email", "phone"]
}
```

**Result:**
```json
{
  "contacts": [
    {
      "id": "contact-123",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "phone": "+1-555-0100",
      "organization": "Finance Dept"
    }
  ],
  "totalContacts": 234
}
```

### search_contacts

Search contacts by name, email, or organization.

**Params:**
```json
{
  "query": "finance",
  "fields": ["name", "email", "organization"],
  "limit": 10
}
```

**Result:**
```json
{
  "results": [
    {
      "id": "contact-123",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "organization": "Finance Dept"
    }
  ],
  "totalMatches": 3
}
```

## Dashboard Pairing API

The dashboard (localhost:3100) exposes REST endpoints for pairing and configuration.

### Generate Pairing Code

```
GET /api/pairing/generate
```

Returns a 6-character pairing code with 5-minute TTL.

**Response:**
```json
{
  "code": "A3K9M2",
  "expiresAt": "2026-03-29T15:35:00Z",
  "qrCode": "data:image/png;base64,iVBORw0KGgo..."
}
```

### Check Pairing Status

```
GET /api/pairing/status?code=A3K9M2
```

**Response:**
```json
{
  "code": "A3K9M2",
  "status": "pending|confirmed|expired",
  "expiresAt": "2026-03-29T15:35:00Z"
}
```

### Confirm Pairing

```
POST /api/pairing/confirm
Content-Type: application/json

{
  "code": "A3K9M2",
  "permissions": {
    "allowed_paths": ["~/Documents", "~/Desktop", "~/Downloads"]
  }
}
```

**Response:**
```json
{
  "nodeId": "nexus-mac-001",
  "authToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "workspaceId": "workspace-abc123",
  "message": "Pairing confirmed. You can now use Nexus."
}
```

Creates `~/.vutler/nexus.json` and `~/.vutler/permissions.json`.

### Health Check

```
GET /api/health
```

**Response:**
```json
{
  "status": "online|offline",
  "uptime_seconds": 3600,
  "memory_mb": 42,
  "wsConnected": true,
  "lastHeartbeat": "2026-03-29T15:30:00Z",
  "taskQueueSize": 0
}
```

### Fetch Logs

```
GET /api/logs?limit=100&level=info
```

**Response:**
```json
{
  "logs": [
    {
      "timestamp": "2026-03-29T15:30:00.123Z",
      "level": "INFO",
      "component": "[WSClient]",
      "message": "Connected to wss://api.vutler.ai/ws/nexus"
    }
  ],
  "total": 2456
}
```

## Error Codes

All errors include a code for programmatic handling:

| Code | HTTP | Meaning | Recovery |
|------|------|---------|----------|
| `PERMISSION_DENIED` | 403 | Action blocked by ACL | Update permissions in dashboard |
| `PROVIDER_UNAVAILABLE` | 503 | Mail app not running, etc. | Start the required app |
| `PARSE_ERROR` | 400 | Document format error | Verify file is valid |
| `TIMEOUT` | 504 | Action exceeded timeout | Try again, larger scope may timeout |
| `UNKNOWN_ERROR` | 500 | Unexpected error | Check logs, restart Nexus |
| `INVALID_PARAMS` | 400 | Missing required param | Review API reference |
| `OFFLINE` | 503 | No connection to cloud | Check internet, will retry |

**Example Error Response:**
```json
{
  "type": "task.result",
  "payload": {
    "taskId": "task-f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "status": "error",
    "error": {
      "code": "PERMISSION_DENIED",
      "message": "Access to ~/Projects/confidential denied by policy",
      "meta": {
        "path": "~/Projects/confidential",
        "action": "search",
        "reason": "not_in_allowed_paths"
      }
    },
    "metadata": {
      "executionMs": 12
    }
  }
}
```

---

## Vault API

All endpoints require workspace authentication (`req.workspaceId`). Secrets are **never** returned in decrypted form except via `/vault/resolve`.

Base path: `/api/v1`

---

### GET `/vault`

List all secrets for the workspace (metadata only, secret masked).

**Auth:** JWT (workspace)

**Query params:**

| Param | Type | Description |
|-------|------|-------------|
| `tags` | string | Comma-separated tags filter (ALL must match) |
| `type` | string | Filter by type: `ssh`, `api_token`, `smtp`, `database`, `password`, `certificate`, `custom` |
| `q` | string | Partial match on label or notes |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "workspace_id": "uuid",
      "label": "Prod DB",
      "type": "database",
      "host": "db.example.com",
      "port": 5432,
      "username": "admin",
      "secret_encrypted": "••••••••",
      "tags": ["production", "postgres"],
      "notes": null,
      "last_used_at": "2026-03-30T10:00:00Z",
      "expires_at": null,
      "created_at": "2026-01-01T00:00:00Z"
    }
  ],
  "total": 1
}
```

---

### POST `/vault`

Store a secret manually.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "label": "AWS Access Key",
  "type": "api_token",
  "host": null,
  "port": null,
  "username": "AKIAIOSFODNN7EXAMPLE",
  "secret": "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  "tags": ["aws", "production"],
  "notes": "S3 read-only access",
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

Required: `label`, `type`, `secret`.

**Response:** `201` with stored row (secret masked).

---

### GET `/vault/:id`

Get secret metadata by ID (secret masked).

**Auth:** JWT (workspace)

**Response:** `200` with the row, or `404`.

---

### DELETE `/vault/:id`

Delete a secret.

**Auth:** JWT (workspace)

**Response:**
```json
{ "success": true, "data": { "id": "uuid", "deleted": true } }
```

---

### PATCH `/vault/:id`

Partial update. Accepted fields: `label`, `type`, `host`, `port`, `username`, `secret` (rotates key), `tags`, `notes`, `expiresAt`.

**Auth:** JWT (workspace)

**Response:** `200` with updated row (secret masked), or `404`.

---

### POST `/vault/extract`

Use LLM to extract credentials from raw text. Returns a preview — nothing is stored.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "text": "DB_HOST=db.prod.example.com\nDB_PASS=s3cr3t123\nAWS_SECRET_ACCESS_KEY=abc...",
  "agentId": "agent-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "credentials": [
      {
        "label": "MySQL prod password",
        "type": "database",
        "host": "db.prod.example.com",
        "username": null,
        "secret": "s3cr3t123",
        "tags": ["production"],
        "notes": null
      }
    ],
    "count": 1,
    "message": "Found 1 credential(s). Review and confirm to store."
  }
}
```

---

### POST `/vault/extract/confirm`

Confirm and store a set of extracted credentials.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "credentials": [ /* same shape as extract response */ ],
  "sourceFile": "config/.env.prod",
  "agentId": "agent-uuid"
}
```

**Response:** `201` (all stored) or `207` (partial — some failed):
```json
{
  "success": true,
  "data": {
    "stored": [ /* masked rows */ ],
    "errors": [],
    "summary": "2 stored, 0 failed"
  }
}
```

---

### POST `/vault/resolve`

Decrypt and return a secret. Requires machine API key.

**Auth:** `x-vault-api-key: <VAULT_MACHINE_KEY>` header (compared via `timingSafeEqual`)

**Body (one of):**
```json
{ "id": "uuid" }
{ "label": "Prod DB" }
{ "tags": ["aws", "production"], "type": "api_token" }
```

**Response:** `200` with decrypted row:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "label": "Prod DB",
    "type": "database",
    "host": "db.prod.example.com",
    "username": "admin",
    "secret": "<plaintext password>",
    "last_used_at": "2026-03-30T10:00:00Z"
  }
}
```

Note: The `secret` value is **never logged** by the server.

---

## Jira API

Base path: `/api/v1/jira`. Requires Jira to be connected for the workspace (`POST /integrations/jira/connect`).

---

### GET `/jira/projects`

List all Jira projects accessible to the configured API token.

**Auth:** JWT (workspace)

**Response:** `200` with Jira project array.

---

### GET `/jira/issues`

Search issues using JQL.

**Auth:** JWT (workspace)

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `jql` | yes | JQL query string |
| `maxResults` | no | Max results (default 50, max 100) |

**Example:** `GET /jira/issues?jql=project=MYPROJ AND status="In Progress"&maxResults=20`

**Response:** `200` with Jira search result.

---

### POST `/jira/issues`

Create a new Jira issue.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "projectKey": "MYPROJ",
  "summary": "Fix login timeout",
  "description": "Users are being logged out after 5 minutes.",
  "issueType": "Bug",
  "priority": "High",
  "assignee": "accountId-string",
  "labels": ["backend", "auth"]
}
```

Required: `projectKey`, `summary`. Description is converted to Atlassian Document Format (ADF).

**Response:** `201` with created issue.

---

### GET `/jira/issues/:key`

Get full issue details.

**Auth:** JWT (workspace)

**Path params:** `key` — e.g. `MYPROJ-123`

**Response:** `200` with Jira issue object.

---

### PATCH `/jira/issues/:key`

Update issue fields.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "fields": {
    "summary": "Updated title",
    "priority": { "name": "Medium" }
  }
}
```

Required: `fields` object (Jira fields format).

**Response:** `200` with `{ updated: true, key: "MYPROJ-123" }`.

---

### POST `/jira/issues/:key/comment`

Add a comment to an issue.

**Auth:** JWT (workspace)

**Body:** `{ "body": "Comment text" }`

**Response:** `201` with created comment.

---

### GET `/jira/issues/:key/transitions`

List available status transitions for an issue.

**Auth:** JWT (workspace)

**Response:** `200` with Jira transitions array (id, name, to.name).

---

### POST `/jira/issues/:key/transition`

Transition an issue to a new status.

**Auth:** JWT (workspace)

**Body:** `{ "transitionId": "31" }` — use IDs from GET transitions.

**Response:** `200` with `{ transitioned: true, key: "MYPROJ-123", transitionId: "31" }`.

---

### POST `/integrations/jira/connect`

Connect Jira to the workspace. Encrypts the API token before storage.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "baseUrl": "https://mycompany.atlassian.net",
  "email": "user@mycompany.com",
  "apiToken": "ATATT3xFfGF0..."
}
```

**Response:** `200` with integration row (token masked).

---

### DELETE `/integrations/jira/disconnect`

Disconnect Jira integration.

**Auth:** JWT (workspace)

**Response:** `200` with `{ disconnected: true }`.

---

### POST `/webhooks/jira` (Jira → Vutler)

Receive Jira Cloud webhook events.

**Auth:** `?secret=<JIRA_WEBHOOK_SECRET>` query param or `x-jira-webhook-secret` header (if `JIRA_WEBHOOK_SECRET` env var is set).

**Supported events:** `jira:issue_created`, `jira:issue_updated`, `jira:issue_deleted`, `comment_created`, `comment_updated`.

**Response:** Always `200` (to prevent Jira retries).

---

## Runbooks API

Base path: `/api/v1`. All routes require agent authentication (`authenticateAgent`).

---

### POST `/runbooks/parse`

Parse free text or structured JSON into a runbook preview. Does not execute.

**Auth:** Agent token

**Body (free text):**
```json
{ "text": "1. Deploy app to staging\n2. Run smoke tests\n3. Deploy to prod (requires approval)" }
```

**Body (structured):**
```json
{
  "json": {
    "name": "Deploy pipeline",
    "steps": [
      { "order": 1, "action": "deploy_app", "params": { "env": "staging" } },
      { "order": 2, "action": "run_smoke_tests" },
      { "order": 3, "action": "deploy_app", "params": { "env": "prod" }, "requireApproval": true }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "runbook": { "name": "...", "steps": [ /* ... */ ] },
    "validation": { "valid": true, "errors": [] }
  }
}
```

---

### POST `/runbooks/execute`

Launch runbook execution (asynchronous). Returns immediately with `runbookId`.

**Auth:** Agent token

**Body:**
```json
{
  "runbook": { /* parsed Runbook object or raw string */ },
  "agentId": "agent-uuid",
  "dryRun": false
}
```

With `dryRun: true`, returns validation result without executing.

**Response:** `202`:
```json
{
  "success": true,
  "data": {
    "runbookId": "uuid",
    "name": "Deploy pipeline",
    "totalSteps": 3
  }
}
```

---

### GET `/runbooks`

List runbooks for the workspace.

**Auth:** Agent token

**Query params:** `limit` (default 50), `status` (filter by: `pending`, `running`, `completed`, `failed`, `cancelled`).

**Response:** `200` with array and `meta.total`.

---

### GET `/runbooks/:id`

Get status and step results for a runbook.

**Auth:** Agent token

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Deploy pipeline",
    "status": "running",
    "current_step": 2,
    "total_steps": 3,
    "results": [
      { "order": 1, "action": "deploy_app", "success": true, "duration_ms": 1200 }
    ]
  }
}
```

---

### POST `/runbooks/:id/cancel`

Cancel a running runbook (sets cancellation flag; checked at next step boundary).

**Auth:** Agent token

**Response:** `200` with `{ cancelled: true }` or `404`.

---

### POST `/runbooks/:id/approve/:stepOrder`

Approve (or reject) a step that is paused waiting for human review.

**Auth:** Agent token

**Path params:** `id` (runbook UUID), `stepOrder` (integer)

**Body:** `{ "approved": true }` (default `true` if omitted)

**Response:** `200` with `{ runbookId, stepOrder, approved }`.

---

## Schedules API

Base path: `/api/v1/schedules`. All routes require JWT authentication (`req.workspaceId`).

---

### POST `/schedules/parse`

Parse natural language into a schedule preview. Does not save.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "text": "Every Monday at 9am, send a summary report",
  "provider": "openrouter",
  "model": "openrouter/auto"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cron": "0 9 * * 1",
    "description": "Every Monday at 9am",
    "taskDescription": "send a summary report",
    "next_run_at": "2026-04-07T09:00:00.000Z",
    "cron_preview": "0 9 * * 1"
  }
}
```

---

### POST `/schedules`

Create a new schedule.

**Auth:** JWT (workspace)

**Body:**
```json
{
  "cron": "0 9 * * 1",
  "description": "Weekly report — every Monday at 9am",
  "task_title": "Send weekly summary",
  "task_description": "Compile and send the weekly activity summary to the team",
  "priority": "P2",
  "agent_id": "agent-uuid"
}
```

Or pass `task_template` directly instead of flat fields.

**Response:** `201` with schedule row including `next_run_at`.

---

### GET `/schedules`

List all schedules for the workspace.

**Auth:** JWT (workspace)

**Response:** `200` with schedule array and `count`.

---

### GET `/schedules/:id`

Get schedule detail including last 20 execution runs and timer status.

**Auth:** JWT (workspace)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "cron_expression": "0 9 * * 1",
    "description": "Weekly report",
    "is_active": true,
    "is_timer_active": true,
    "last_run_at": "2026-03-24T09:00:00Z",
    "next_run_at": "2026-03-31T09:00:00Z",
    "run_count": 12,
    "recent_runs": [ /* last 20 scheduled_task_runs rows */ ]
  }
}
```

---

### PATCH `/schedules/:id`

Update cron, description, task template, agent, or active state.

**Auth:** JWT (workspace)

**Body (any subset):**
```json
{
  "cron": "0 10 * * 1",
  "description": "Weekly report — now at 10am",
  "is_active": true,
  "task_template": { "title": "...", "description": "...", "priority": "P1" },
  "agent_id": "agent-uuid"
}
```

**Response:** `200` with updated schedule. Timer is re-armed or stopped based on `is_active`.

---

### DELETE `/schedules/:id`

Delete a schedule and stop its timer.

**Auth:** JWT (workspace)

**Response:** `200` with `{ message: "Schedule deleted" }`.

---

### POST `/schedules/:id/activate`

Set `is_active = true` and arm the cron timer.

**Auth:** JWT (workspace)

**Response:** `200` with updated schedule row.

---

### POST `/schedules/:id/deactivate`

Set `is_active = false` and stop the cron timer.

**Auth:** JWT (workspace)

**Response:** `200` with `{ message: "Schedule deactivated" }`.

---

### POST `/schedules/:id/run-now`

Manually trigger a schedule execution regardless of cron timing.

**Auth:** JWT (workspace)

**Response:**
```json
{
  "success": true,
  "message": "Schedule executed immediately",
  "data": { "runId": "uuid", "taskId": "uuid", "status": "completed" }
}
```

---

### GET `/schedules/:id/history`

Paginated execution history.

**Auth:** JWT (workspace)

**Query params:** `limit` (default 50, max 200), `offset` (default 0)

**Response:**
```json
{
  "success": true,
  "total": 48,
  "limit": 50,
  "offset": 0,
  "data": [
    {
      "id": "uuid",
      "schedule_id": "uuid",
      "status": "completed",
      "task_id": "uuid",
      "result": { "task_id": "uuid", "created": true },
      "started_at": "2026-03-24T09:00:00Z",
      "completed_at": "2026-03-24T09:00:01Z"
    }
  ]
}
```

---

## Rate Limiting

WebSocket connections are not rate-limited. REST endpoints have the following limits:

| Endpoint | Window | Max requests | HTTP on exceed |
|----------|--------|-------------|----------------|
| `POST /runtime/heartbeat` | 1 minute | 2 | 429 |
| `POST /register` | 15 minutes | 5 | 429 |
| `POST /keys` | 1 hour | 10 | 429 |

Other limits:
- Max concurrent deployed agents per node: configured via `config.max_seats` (default: unlimited)
- Max task result size: 1 MB (capped by TaskOrchestrator)

Rate-limit responses follow the standard format:
```json
{ "success": false, "error": "Rate limit exceeded" }
```

Standard `RateLimit-*` response headers are included.

## Enterprise REST Endpoints

All enterprise endpoints are mounted under `/api/v1/nexus`. Authentication is via JWT (workspace sessions) unless noted otherwise.

---

### GET `/:nodeId/seats`

Returns seat quota status for a node.

**Auth:** JWT (workspace)

**Path params:** `nodeId` — UUID of the nexus node

**Response:**
```json
{
  "success": true,
  "data": {
    "current": 2,
    "max": 5,
    "available": 3
  }
}
```

`max` is `null` when no seat limit is configured. `available` is `null` when `max` is `null`.

**Error:** `404` if node is not found or does not belong to the workspace.

---

### GET `/metrics`

Workspace-level metrics snapshot (in-memory, resets on process restart).

**Auth:** JWT (workspace)

**Response:**
```json
{
  "success": true,
  "data": {
    "workspaceId": "workspace-abc123",
    "totalTasks": 142,
    "successCount": 138,
    "failureCount": 4,
    "errorRate": 0.0282,
    "byAgent": [
      {
        "agentId": "agent-uuid-001",
        "tasks": 80,
        "success": 78,
        "failures": 2,
        "errorRate": 0.025,
        "avgDurationMs": 1240,
        "totalDurationMs": 99200
      }
    ],
    "byTaskType": [
      {
        "taskType": "feature",
        "count": 55,
        "avgDurationMs": 980,
        "totalDurationMs": 53900
      }
    ],
    "hourlyBuckets": [
      { "hour": "2026-03-30T14:00:00.000Z", "tasks": 12, "errors": 0 }
    ],
    "inFlightCount": 1,
    "snapshotAt": "2026-03-30T15:30:00.000Z"
  }
}
```

Hourly buckets cover the last 24 hours and are sorted oldest → newest. The cleanup interval purges buckets older than 24 hours every hour.

---

### GET `/metrics/:nodeId`

Node-scoped metrics. Aggregates counters for agents deployed on the given node.

**Auth:** JWT (workspace)

**Path params:** `nodeId` — UUID

**Response:**
```json
{
  "success": true,
  "data": {
    "nodeId": "node-uuid-001",
    "workspaceId": "workspace-abc123",
    "totalTasks": 45,
    "successCount": 44,
    "failureCount": 1,
    "errorRate": 0.0222,
    "byAgent": [ /* same shape as /metrics */ ],
    "snapshotAt": "2026-03-30T15:30:00.000Z"
  }
}
```

**Error:** `404` if node not found.

---

### GET `/metrics/agents/:agentId`

Single-agent metrics within the workspace.

**Auth:** JWT (workspace)

**Path params:** `agentId` — UUID

**Response (agent with recorded tasks):**
```json
{
  "success": true,
  "data": {
    "agentId": "agent-uuid-001",
    "workspaceId": "workspace-abc123",
    "tasks": 80,
    "success": 78,
    "failures": 2,
    "errorRate": 0.025,
    "avgDurationMs": 1240,
    "totalDurationMs": 99200,
    "snapshotAt": "2026-03-30T15:30:00.000Z"
  }
}
```

Returns an empty-bucket `200` (not `404`) when no tasks have been recorded for the agent yet.

---

### POST `/metrics/reset`

Flush in-memory metrics for the workspace.

**Auth:** JWT (workspace)

**Body (optional):**
```json
{ "all": true }
```

`all: true` resets metrics for all workspaces. Requires `req.isSuperAdmin = true` in production — returns `403` otherwise.

**Response:**
```json
{ "success": true, "message": "Metrics reset for workspace workspace-abc123" }
```

---

### POST `/routing/report`

Report a task result to the agent health tracker. Used to track consecutive failures and trigger cooldowns.

**Auth:** JWT (workspace) or unauthenticated internal call

**Body:**
```json
{
  "agentId": "agent-uuid-001",
  "success": true
}
```

Both fields are required. `success` must be a boolean.

On success: resets the agent's failure counter.
On failure: increments the counter. At 3 consecutive failures, the agent enters a 30-second cooldown and is deprioritised by the router.

**Response:**
```json
{ "success": true }
```

---

### POST `/routing/cache/invalidate`

Flush the routing rules cache. Call this after updating `nexus_routing_rules` in the database.

**Auth:** JWT (workspace)

**Body (optional):**
```json
{ "workspace_id": "workspace-abc123" }
```

Omit `workspace_id` to flush the cache for all workspaces.

**Response:**
```json
{ "success": true, "flushed": "workspace-abc123" }
```

`flushed` is `"all"` when no workspace was specified.

---

## Offline Behavior

When WebSocket disconnects:

1. Nexus continues executing tasks locally
2. Results queue in SQLite (`~/.vutler/tasks.db`)
3. On reconnect, queued results send back to cloud
4. UI shows "Offline" indicator
5. Reconnect attempts follow exponential backoff (1s → 60s)

Queries are not queued—only completed task results.

## Implementation Examples

### Python Client

```python
import asyncio
import json
import websockets

async def query_nexus():
    uri = "wss://api.vutler.ai/ws/nexus"
    headers = {"Authorization": f"Bearer {api_key}"}

    async with websockets.connect(uri, extra_headers=headers) as ws:
        # Register
        await ws.send(json.dumps({
            "type": "nexus.register",
            "payload": {"nodeId": "client-python"}
        }))

        # Send task
        await ws.send(json.dumps({
            "type": "task.dispatch",
            "payload": {
                "taskId": "task-123",
                "action": "search",
                "params": {"query": "budget", "scope": ["~/Documents"]}
            }
        }))

        # Listen for results
        async for msg in ws:
            data = json.loads(msg)
            if data["type"] == "task.result":
                print(f"Result: {data['payload']}")
                break
```

### Node.js Client

```javascript
const WebSocket = require('ws');

const ws = new WebSocket('wss://api.vutler.ai/ws/nexus', {
  headers: { 'Authorization': `Bearer ${API_KEY}` }
});

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'task.dispatch',
    payload: {
      taskId: 'task-123',
      action: 'search',
      params: { query: 'budget', scope: ['~/Documents'] }
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.type === 'task.result') {
    console.log('Result:', msg.payload);
  }
});
```
