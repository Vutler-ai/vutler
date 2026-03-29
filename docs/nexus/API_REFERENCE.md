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

## Rate Limiting

WebSocket connections are not rate-limited. However:

- Max concurrent tasks per Nexus: determined by AgentManager `seats` config (default 1)
- Max task result size: 1 MB (capped by TaskOrchestrator)
- Dashboard API: standard 100 req/min per IP

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
