# Architecture — How Vutler Agent Local Works

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Your Machine                                  │
│                                                                      │
│  ┌──────────────────────┐                                           │
│  │   Local Agent        │                                           │
│  │   (Node.js)          │                                           │
│  │                      │        WebSocket (port 8081)              │
│  │  ┌─────────────┐     │◄──────────────────────────────┐           │
│  │  │ Task Runner  │     │                               │           │
│  │  └─────────────┘     │                               │           │
│  │  ┌─────────────┐     │                               │           │
│  │  │ Heartbeat    │     │                               │           │
│  │  └─────────────┘     │                               │           │
│  │  ┌─────────────┐     │                               │           │
│  │  │ Local Tools  │     │                               │           │
│  │  └─────────────┘     │                               │           │
│  └──────────────────────┘                               │           │
└─────────────────────────────────────────────────────────┼───────────┘
                                                          │
                                                          │ WSS/WS
                                                          │
┌─────────────────────────────────────────────────────────┼───────────┐
│                      Vutler Server                      │           │
│                                                         │           │
│  ┌──────────────────────┐   ┌───────────────────────────▼──┐       │
│  │   Vutler API         │   │   Local Agent Service         │       │
│  │   :3001              │◄──│   :8081                       │       │
│  │                      │   │                               │       │
│  │  REST endpoints      │   │  Auth + Connection Manager    │       │
│  │  /agents/local/*     │   │  Task Dispatch                │       │
│  └──────────┬───────────┘   │  Heartbeat Monitor            │       │
│             │               └───────────────────────────────┘       │
│             │                                                        │
│  ┌──────────▼───────────┐   ┌───────────────────────────────┐       │
│  │   PostgreSQL         │   │   Redis                        │       │
│  │   Agents, Tokens,    │   │   AgentBus pub/sub             │       │
│  │   Workspaces         │   │   Status cache                 │       │
│  └──────────────────────┘   └───────────────────────────────┘       │
│                                                                      │
│  ┌──────────────────────┐   ┌───────────────────────────────┐       │
│  │   Rocket.Chat        │   │   Agent Runtime (DDP)          │       │
│  │   :3000              │◄──│   LLM Router + Tools           │       │
│  └──────────────────────┘   └───────────────────────────────┘       │
│                                                                      │
│  ┌──────────────────────┐                                           │
│  │   Snipara (MCP)      │                                           │
│  │   Knowledge + Memory │                                           │
│  └──────────────────────┘                                           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Connection Flow

### 1. WebSocket Handshake

The local agent connects to the **Local Agent Service** on port `8081` at path `/local-agent`.

```
Client                            Server
  │                                  │
  │──── WS Connect ─────────────────►│
  │                                  │
  │◄─── { type: "welcome" } ────────│
  │                                  │
  │──── { type: "auth",             │
  │       agentId, token,           │
  │       workspaceId } ───────────►│
  │                                  │
  │     [Server verifies token       │
  │      against PG agents table]    │
  │                                  │
  │◄─── { type: "auth_success" } ───│
  │                                  │
  │──── { type: "heartbeat" } ──────►│  (every 30s)
  │◄─── { type: "heartbeat_ack" } ──│
  │                                  │
```

### 2. Authentication

Authentication uses a **local token** — a 32-byte random hex string generated at registration time and stored in PostgreSQL:

```sql
-- Server-side verification query
SELECT a.*, w.name as workspace_name
FROM agents a
JOIN workspaces w ON a.workspace_id = w.id
WHERE a.id = $1 AND w.id = $2 AND a.local_token = $3
```

If credentials don't match, the server sends `auth_failed` and closes the WebSocket with code `1008`.

### 3. Heartbeat

After authentication, the agent must send periodic heartbeats to stay connected:

- **Client sends:** `{ type: "heartbeat" }` every `HEARTBEAT_INTERVAL` ms (default 30s)
- **Server responds:** `{ type: "heartbeat_ack" }`
- **Timeout:** If no heartbeat for `2 × HEARTBEAT_INTERVAL`, server closes connection

---

## Task Execution Flow

```
Admin/API                   Server                    Local Agent
    │                         │                           │
    │── POST /agents/local/   │                           │
    │   :agentId/task ──────►│                           │
    │                         │                           │
    │                         │── { type: "task",         │
    │                         │    taskId, task } ──────►│
    │                         │                           │
    │                         │   [Agent processes task]  │
    │                         │                           │
    │                         │◄── { type: "task_result", │
    │                         │     taskId, success,      │
    │                         │     result } ─────────────│
    │                         │                           │
    │◄── { success, result }──│                           │
    │                         │                           │
```

Tasks are tracked with a **Promise-based pending system**:

1. Server generates `taskId` and stores `{ resolve, reject, timeout }` in a `pendingTasks` Map
2. Task is sent to the agent via WebSocket
3. Agent processes and sends `task_result`
4. Server resolves the promise and returns the result to the HTTP caller
5. If no response within `TASK_TIMEOUT` (default 5 min), the promise rejects

---

## AgentBus — Redis Pub/Sub

The AgentBus provides inter-agent communication via Redis channels:

```
┌──────────┐     Redis      ┌──────────┐
│ Agent A  │◄──────────────►│ Agent B  │
│          │  pub/sub        │          │
└──────────┘                 └──────────┘

Channels:
  agents:direct:{agentId}    — Point-to-point messages
  agents:workspace:{wsId}    — Workspace broadcasts
  agents:broadcast           — Global broadcasts
  agents:system              — System events
```

### Message Envelope

All AgentBus messages follow this format:

```json
{
  "from": "agent-a-id",
  "to": "agent-b-id",
  "timestamp": "2026-02-23T21:00:00.000Z",
  "type": "message | broadcast | request | response",
  "requestId": "optional-for-request-response",
  "payload": { }
}
```

### Request/Response Pattern

The AgentBus supports async request/response with timeouts:

```javascript
// Agent A sends request to Agent B
const result = await agentBus.request('agent-b-id', {
  action: 'analyze',
  data: { text: 'Hello world' }
}, 30000); // 30s timeout
```

---

## Memory Integration (Snipara MCP)

Agents access shared knowledge and memory via the **Snipara API**:

```
Agent Runtime ──► Snipara MCP API
                  │
                  ├── rlm_context_query  — Search knowledge base
                  ├── rlm_remember       — Store memories (fact/decision/learning/preference)
                  ├── rlm_recall         — Recall memories by semantic similarity
                  ├── rlm_load_document  — Load full documents (SOUL.md, MEMORY.md, etc.)
                  └── rlm_forget         — Delete memories
```

### Shared Context

The runtime loads shared context documents every 30 minutes:

| Document | Purpose | Max Size |
|----------|---------|----------|
| `agents/SOUL.md` | Agent personality & behavior rules | 2,000 chars |
| `agents/MEMORY.md` | Curated long-term memories | 4,000 chars |
| `agents/USER.md` | Information about the user | 1,000 chars |
| `agents/IDENTITY.md` | Agent identity config | 500 chars |

---

## LLM Routing

When the cloud-based Agent Runtime processes a message, it routes through the **LLM Router**:

```
Message ──► Context Manager (builds prompt)
        ──► LLM Router
            ├── BYOKEY: OpenAI, Anthropic, Groq, Ollama
            ├── Managed: MiniMax (economy), GPT-4o-mini (standard), GPT-4o (premium)
            └── Runtime v3 APM (if configured)
        ──► Response posted to Rocket.Chat
```

Local agents don't route through the LLM by default — they execute tasks directly. However, they can call the server's chat API if LLM access is needed.

---

## Database Schema (relevant tables)

```sql
-- Agent registration
agents (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT REFERENCES workspaces(id),
  name          TEXT,
  local_token   TEXT,          -- 32-byte hex token for local auth
  capabilities  JSONB,
  is_local      BOOLEAN,
  status        TEXT DEFAULT 'active',
  created_at    TIMESTAMP,
  updated_at    TIMESTAMP
)

-- Tool configurations per agent
agent_tools (
  agent_id      TEXT,
  tool_name     TEXT,
  enabled       BOOLEAN,
  config        JSONB,
  workspace_id  TEXT,
  PRIMARY KEY (agent_id, tool_name)
)

-- Channel assignments (for cloud agents)
agent_rc_channels (
  agent_id      TEXT,
  rc_channel_id TEXT,
  is_active     BOOLEAN
)

-- Token usage tracking
token_usage (
  agent_id      TEXT,
  provider      TEXT,
  model         TEXT,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost          NUMERIC,
  latency_ms    INTEGER,
  request_type  TEXT,
  timestamp     TIMESTAMP
)
```
