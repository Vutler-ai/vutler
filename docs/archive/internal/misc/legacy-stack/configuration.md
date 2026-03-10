# Configuration Reference

Complete reference for all Vutler Agent Local configuration options.

---

## Environment Variables

### Connection

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VUTLER_SERVER_URL` | ✅ | — | WebSocket URL for Local Agent Service. Format: `ws://host:8081/local-agent` |
| `VUTLER_AGENT_ID` | ✅ | — | Unique agent identifier (from registration) |
| `VUTLER_WORKSPACE_ID` | ✅ | — | Workspace the agent belongs to |
| `VUTLER_LOCAL_TOKEN` | ✅ | — | 64-char hex authentication token (from registration) |

### Behavior

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HEARTBEAT_INTERVAL` | No | `30000` | Milliseconds between heartbeat pings. Server disconnects if no heartbeat for 2× this value |
| `TASK_TIMEOUT` | No | `300000` | Maximum time (ms) to complete a task before it's marked as timed out |
| `RECONNECT_DELAY` | No | `5000` | Milliseconds to wait before reconnecting after disconnect |
| `MAX_RECONNECT_ATTEMPTS` | No | `∞` | Maximum reconnection attempts (infinite by default) |

### Logging

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_FORMAT` | No | `text` | `text` or `json` |

### Redis (for AgentBus)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_HOST` | No | `localhost` | Redis server host |
| `REDIS_PORT` | No | `6379` | Redis server port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `REDIS_URL` | No | — | Full Redis URL (overrides host/port) |

### Snipara Memory Integration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SNIPARA_API_URL` | No | `https://api.snipara.com/mcp/vutler` | Snipara MCP endpoint |
| `SNIPARA_API_KEY` | No | — | Snipara API key for knowledge/memory access |

---

## Server-Side Configuration

These variables are set on the **Vutler server**, not the local agent:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOCAL_AGENT_PORT` | `8081` | Port for the Local Agent WebSocket Service |
| `RC_WS_URL` | `ws://rocketchat:3000/websocket` | Rocket.Chat DDP WebSocket URL |
| `RC_API_URL` | `http://rocketchat:3000` | Rocket.Chat REST API URL |
| `RC_ADMIN_USERNAME` | — | Rocket.Chat admin username |
| `RC_ADMIN_PASSWORD` | — | Rocket.Chat admin password |
| `MONGO_URL` | `mongodb://mongo:27017/vutler?replicaSet=rs0` | MongoDB connection string |

---

## LLM Provider Setup

LLM configuration is set **per agent** via the API, not in the local `.env`. The server handles LLM routing.

### Configure via API

```bash
# OpenAI
curl -X PUT http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/llm-config \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"provider": "openai", "api_key": "sk-...", "model": "gpt-4o-mini"}'

# Anthropic
curl -X PUT http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/llm-config \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"provider": "anthropic", "api_key": "sk-ant-...", "model": "claude-sonnet-4-5"}'

# Groq (custom endpoint)
curl -X PUT http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/llm-config \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"provider": "groq", "api_key": "gsk_...", "model": "llama-3.3-70b-versatile", "custom_endpoint": "https://api.groq.com/openai/v1"}'

# Managed tier (no API key needed)
curl -X PUT http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/llm-config \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"managed": true, "tier": "economy"}'
```

### Supported Providers

| Provider | Model Examples | Type |
|----------|---------------|------|
| `openai` | `gpt-4o`, `gpt-4o-mini`, `o3-mini` | BYOKEY |
| `anthropic` | `claude-opus-4`, `claude-sonnet-4-5`, `claude-haiku` | BYOKEY |
| `minimax` | `MiniMax-M2.5` | BYOKEY + Managed |
| `groq` | `llama-3.3-70b-versatile` | BYOKEY + custom endpoint |
| `ollama` | Any local model | BYOKEY + custom endpoint |

---

## Tool Configuration

Tools are configured per-agent via the API:

```bash
# Enable tools for an agent
curl -X PUT http://your-server:3001/api/v1/agents/YOUR_AGENT_ID/tools \
  -H 'Content-Type: application/json' \
  -H 'x-workspace-id: default' \
  -d '{
    "tools": [
      { "tool_name": "web_search", "enabled": true },
      { "tool_name": "calculator", "enabled": true },
      { "tool_name": "http_request", "enabled": true, "config": {} },
      { "tool_name": "knowledge", "enabled": true },
      { "tool_name": "memory", "enabled": true }
    ]
  }'
```

See [tools.md](./tools.md) for the full list of available tools.

---

## Example `.env` File

```bash
# ─── Vutler Connection ───────────────────────────────
VUTLER_SERVER_URL=ws://vutler.example.com:8081/local-agent
VUTLER_AGENT_ID=agent-dev-001
VUTLER_WORKSPACE_ID=default
VUTLER_LOCAL_TOKEN=a1b2c3d4e5f6...64-char-hex...

# ─── Behavior ────────────────────────────────────────
HEARTBEAT_INTERVAL=30000
TASK_TIMEOUT=300000
RECONNECT_DELAY=5000

# ─── Logging ─────────────────────────────────────────
LOG_LEVEL=info

# ─── Optional: Redis (if using AgentBus locally) ─────
# REDIS_URL=redis://localhost:6379

# ─── Optional: Snipara Memory ────────────────────────
# SNIPARA_API_URL=https://api.snipara.com/mcp/vutler
# SNIPARA_API_KEY=rlm_your_key_here
```

---

## Security Notes

- **Local tokens** are 32-byte (64-char hex) random strings — treat them like passwords
- Tokens are stored in PostgreSQL and verified on every WebSocket connection
- The `http_request` tool enforces a **URL allowlist** — only approved domains can be fetched
- API keys for LLM providers are **AES-256-GCM encrypted** at rest in MongoDB
- Use `wss://` (TLS) in production for the WebSocket connection
