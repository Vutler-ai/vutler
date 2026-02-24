# Vutler Agent Local — Quick Start

> Run a Vutler AI agent directly on your machine. No Docker, no containers — just Node.js.

Vutler Agent Local connects to your Vutler server over WebSocket, receives tasks, executes tools locally (file access, HTTP requests, calculations), and reports results back. It's ideal for development, admin workflows, and scenarios where you need direct access to your local filesystem.

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| **Node.js** | 18+ |
| **npm** | 9+ |
| **Vutler server** | Running & accessible |

You also need:
- A **workspace ID** from your Vutler instance
- An **agent ID** and **local token** (generated during registration)

---

## Installation

```bash
# 1. Clone or copy the agent-local package
git clone https://github.com/your-org/vutler.git
cd vutler

# 2. Install dependencies
npm install ws redis

# 3. Create your local agent script
touch agent-local.js
```

---

## Configuration

Create a `.env` file in your project root:

```bash
# ─── Required ─────────────────────────────────────────
VUTLER_SERVER_URL=ws://your-server:8081/local-agent
VUTLER_AGENT_ID=your-agent-id
VUTLER_WORKSPACE_ID=your-workspace-id
VUTLER_LOCAL_TOKEN=your-local-token

# ─── Optional ─────────────────────────────────────────
HEARTBEAT_INTERVAL=30000        # ms between heartbeats (default: 30s)
TASK_TIMEOUT=300000             # max task execution time (default: 5min)
LOG_LEVEL=info                  # debug | info | warn | error
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VUTLER_SERVER_URL` | ✅ | — | WebSocket URL of the Local Agent Service |
| `VUTLER_AGENT_ID` | ✅ | — | Your agent's unique ID |
| `VUTLER_WORKSPACE_ID` | ✅ | — | Workspace this agent belongs to |
| `VUTLER_LOCAL_TOKEN` | ✅ | — | Authentication token (from registration) |
| `HEARTBEAT_INTERVAL` | No | `30000` | Heartbeat interval in ms |
| `TASK_TIMEOUT` | No | `300000` | Max time to complete a task |
| `LOG_LEVEL` | No | `info` | Logging verbosity |

---

## Register Your Agent

Before connecting, register the local agent with the server:

```bash
curl -X POST http://your-server:3001/api/v1/agents/local/register \
  -H 'Content-Type: application/json' \
  -d '{
    "agentId": "my-local-agent",
    "workspaceId": "default",
    "name": "My Local Agent",
    "capabilities": {
      "tools": ["web_search", "calculator", "http_request"],
      "local_access": true
    }
  }'
```

Response:

```json
{
  "success": true,
  "agent": {
    "id": "my-local-agent",
    "name": "My Local Agent",
    "workspaceId": "default",
    "localToken": "a1b2c3d4...generated-token...",
    "isLocal": true
  }
}
```

**Save the `localToken`** — you'll need it for your `.env` file.

---

## Minimal Agent Script

```javascript
// agent-local.js
const WebSocket = require('ws');
require('dotenv').config();

const SERVER_URL = process.env.VUTLER_SERVER_URL;
const AGENT_ID = process.env.VUTLER_AGENT_ID;
const WORKSPACE_ID = process.env.VUTLER_WORKSPACE_ID;
const TOKEN = process.env.VUTLER_LOCAL_TOKEN;
const HEARTBEAT_MS = parseInt(process.env.HEARTBEAT_INTERVAL) || 30000;

let ws;
let heartbeatTimer;

function connect() {
  console.log(`Connecting to ${SERVER_URL}...`);
  ws = new WebSocket(SERVER_URL);

  ws.on('open', () => {
    console.log('Connected. Authenticating...');
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    handleMessage(msg);
  });

  ws.on('close', (code, reason) => {
    console.log(`Disconnected (${code}). Reconnecting in 5s...`);
    clearInterval(heartbeatTimer);
    setTimeout(connect, 5000);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
  });
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      // Server says hello — send auth
      send({
        type: 'auth',
        agentId: AGENT_ID,
        workspaceId: WORKSPACE_ID,
        token: TOKEN
      });
      break;

    case 'auth_success':
      console.log(`✅ Authenticated as ${msg.agentId}`);
      // Start heartbeats
      heartbeatTimer = setInterval(() => {
        send({ type: 'heartbeat' });
      }, HEARTBEAT_MS);
      break;

    case 'auth_failed':
      console.error(`❌ Auth failed: ${msg.error}`);
      process.exit(1);
      break;

    case 'heartbeat_ack':
      // Server confirmed we're alive
      break;

    case 'task':
      console.log(`📋 Task received: ${msg.taskId}`);
      executeTask(msg.taskId, msg.task);
      break;

    default:
      console.log('Unknown message:', msg.type);
  }
}

async function executeTask(taskId, task) {
  try {
    // Your task logic here
    const result = { output: `Processed: ${JSON.stringify(task)}` };

    send({
      type: 'task_result',
      taskId,
      success: true,
      result
    });
    console.log(`✅ Task completed: ${taskId}`);
  } catch (error) {
    send({
      type: 'task_result',
      taskId,
      success: false,
      error: error.message
    });
    console.error(`❌ Task failed: ${taskId} — ${error.message}`);
  }
}

// Go
connect();
```

---

## Start the Agent

```bash
node agent-local.js
```

Expected output:

```
Connecting to ws://your-server:8081/local-agent...
Connected. Authenticating...
✅ Authenticated as my-local-agent
```

---

## Verify Connection

Check your agent's status from the server:

```bash
curl http://your-server:3001/api/v1/agents/local/status?workspaceId=default
```

```json
{
  "success": true,
  "agents": [{
    "id": "my-local-agent",
    "name": "My Local Agent",
    "connected": true,
    "status": "active",
    "lastHeartbeat": "2026-02-23T21:00:00.000Z"
  }],
  "count": 1,
  "connected": 1
}
```

---

## Send a Task to Your Agent

```bash
curl -X POST http://your-server:3001/api/v1/agents/local/my-local-agent/task \
  -H 'Content-Type: application/json' \
  -d '{"task": {"action": "greet", "name": "World"}}'
```

```json
{
  "success": true,
  "result": { "output": "Processed: {\"action\":\"greet\",\"name\":\"World\"}" }
}
```

---

## Next Steps

- **[Architecture](./architecture.md)** — How local agents communicate with the server
- **[Configuration](./configuration.md)** — Full environment variable reference
- **[Tools](./tools.md)** — Available tools and how to add custom ones
- **[Troubleshooting](./troubleshooting.md)** — Common issues and fixes
- **[Local vs Cloud](./local-vs-cloud.md)** — When to use which deployment model
