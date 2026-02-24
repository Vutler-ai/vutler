# Vutler — AI Agent Platform

> **Deploy AI agents that email, chat, and think — on top of Rocket.Chat.**

[![CI](https://img.shields.io/badge/CI-passing-brightgreen)](#testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Vutler lets you create AI agents that:
- 🤖 Answer via chat (WebSocket + Rocket.Chat)
- 📧 Send and receive emails
- 🧠 Use your own LLM key (OpenAI, Anthropic, Groq, Ollama…) or our managed tier
- 📁 Manage files via the Drive API
- 📊 Track token usage and costs
- 🔐 Rotate API keys, rate-limit, and stay secure by default

---

## Table of Contents

1. [Quick Start (Docker)](#quick-start-docker)
2. [Architecture](#architecture)
3. [Configuration (.env)](#configuration-env)
4. [API Reference](#api-reference)
   - [Agents](#agents-api)
   - [LLM Config](#llm-config-api)
   - [Email](#email-api)
   - [Chat](#chat-api)
   - [Drive](#drive-api)
   - [Usage / Billing](#usage-billing-api)
   - [Runtime](#runtime-api)
   - [WebSocket](#websocket-api)
   - [Security](#security-api)
5. [LLM Providers](#llm-providers)
6. [WebSocket Protocol](#websocket-protocol)
7. [Templates](#templates)
8. [Testing](#testing)
9. [Development](#development)

---

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone https://github.com/your-org/vutler.git
cd vutler

# 2. Copy and edit environment variables
cp .env.example .env
# → edit .env: set LLM_ENCRYPTION_KEY at minimum

# 3. Start all services
docker compose up -d

# 4. Wait ~2 minutes for Rocket.Chat to boot, then visit:
#    http://localhost:3000   — Rocket.Chat UI
#    http://localhost:3001   — Vutler API
#    http://localhost:8025   — MailHog (test email)

# 5. Create your first agent
curl -X POST http://localhost:3001/api/v1/agents \
  -H 'Content-Type: application/json' \
  -d '{"name":"My First Agent","email":"agent@vutler.local"}'
# → Returns { agent: { id, apiKey } }

# 6. Run E2E tests to verify everything works
make test-e2e
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Docker Compose                      │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Rocket.Chat │  │  Vutler API  │  │   MailHog    │  │
│  │  :3000       │  │  :3001       │  │  :8025/:1025 │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                              │
│  ┌──────┴─────────────────┴──────────────────────────┐  │
│  │                   MongoDB :27017                   │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │                   Redis :6379                       │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

Vutler API exposes:
  REST  → /api/v1/*
  WS    → ws://host:3001/ws?agent_id=…&api_key=…
```

**Services:**
| Service | Port | Purpose |
|---------|------|---------|
| Rocket.Chat | 3000 | Chat UI, channels, users |
| Vutler API | 3001 | Agent management, LLM, email, drive |
| MongoDB | 27017 | Primary database |
| Redis | 6379 | Rate limiting, caching |
| MailHog | 1025/8025 | SMTP test server |

---

## Configuration (.env)

Copy `.env.example` to `.env` and fill in your values.

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LLM_ENCRYPTION_KEY` | ✅ Yes | `default-key…` | 32-char key for AES-256-GCM encryption of API keys |
| `MANAGED_LLM_KEY` | Only for managed tier | — | Your MiniMax API key for the managed LLM service |
| `MANAGED_LLM_PROVIDER` | No | `minimax` | Provider for managed tier |
| `SMTP_HOST` | No | `mailhog` | SMTP server host |
| `SMTP_PORT` | No | `1025` | SMTP port (587 for real SMTP) |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | `noreply@vutler.local` | From address |
| `IMAP_HOST` | No | — | IMAP server (for email receive) |
| `IMAP_PORT` | No | `993` | IMAP port |
| `IMAP_USER` | No | — | IMAP username |
| `IMAP_PASS` | No | — | IMAP password |
| `IMAP_TLS` | No | `true` | Use TLS for IMAP |
| `IMAP_POLL_INTERVAL` | No | `5` | Minutes between IMAP polls |
| `CORS_ORIGIN` | No | `http://localhost:3000` | Allowed CORS origins (comma-separated) |
| `DRIVE_STORAGE_PATH` | No | `data/drive` | File storage directory |
| `DRIVE_MAX_FILE_SIZE` | No | `52428800` | Max upload size (50MB) |
| `OPENCLAW_PATH` | No | `openclaw` | Path to openclaw binary |
| `PORT` | No | `3001` | Vutler API port |
| `MONGO_URL` | No | `mongodb://mongo:27017/vutler?replicaSet=rs0` | MongoDB connection URL |
| `REDIS_URL` | No | `redis://redis:6379` | Redis connection URL |

---

## API Reference

All API endpoints are under `http://localhost:3001/api/v1/`.

Authentication: `Authorization: Bearer <api_key>`

### Agents API

#### Create Agent
```
POST /agents
```
```json
// Body
{ "name": "MyAgent", "email": "agent@company.com", "description": "optional" }

// Response 201
{ "success": true, "agent": { "id": "…", "name": "…", "email": "…", "apiKey": "vutler_…" } }
```

#### List Agents
```
GET /agents
Authorization: Bearer <api_key>
```

#### Get Agent
```
GET /agents/:id
Authorization: Bearer <api_key>
```

#### Get Agent Status (live)
```
GET /agents/:id/status
Authorization: Bearer <api_key>
```
Returns: `{ status: "online"|"offline", pid, uptime_ms, lastSeen }`

#### Deploy from Template
```
POST /agents/from-template
```
```json
{
  "templateId": "customer-support",
  "name": "Support Bot",
  "email": "support@company.com",
  "customization": { "systemPrompt": "You are a friendly support agent." }
}
```

---

### LLM Config API

#### Set LLM Configuration (BYOKEY)
```
PUT /agents/:id/llm-config
Authorization: Bearer <api_key>
```
```json
// OpenAI
{ "provider": "openai", "api_key": "sk-…", "model": "gpt-4o-mini" }

// Anthropic
{ "provider": "anthropic", "api_key": "sk-ant-…", "model": "claude-sonnet-4-5" }

// Custom endpoint (Ollama, Groq, LM Studio…)
{ "provider": "ollama", "model": "llama3", "custom_endpoint": "http://localhost:11434/v1" }

// Managed tier (Vutler provides the LLM)
{ "managed": true, "tier": "economy" }
```

#### Get LLM Config
```
GET /agents/:id/llm-config
Authorization: Bearer <api_key>
```
> ⚠️ Raw API keys are **never** returned. `hasKey: true` confirms a key is stored.

#### Test LLM Connection
```
POST /agents/:id/llm-test
Authorization: Bearer <api_key>
```

#### Chat with Agent LLM
```
POST /agents/:id/chat
Authorization: Bearer <api_key>
```
```json
{ "messages": [{ "role": "user", "content": "Hello!" }] }
```

---

### Email API

#### Send Email
```
POST /email/send
Authorization: Bearer <api_key>
```
```json
{ "to": "user@example.com", "subject": "Hello", "body": "Hi there!", "html": "<p>Hi</p>" }
```

#### List Sent Emails
```
GET /email/sent?limit=20&skip=0
Authorization: Bearer <api_key>
```

#### List Inbox
```
GET /email/inbox?limit=20&skip=0&unread=true
Authorization: Bearer <api_key>
```

#### Mark Email Read
```
PATCH /email/inbox/:id/read
Authorization: Bearer <api_key>
```

---

### Chat API

#### List Channels
```
GET /chat/channels
Authorization: Bearer <api_key>
```

#### Send Message
```
POST /chat/send
Authorization: Bearer <api_key>
```
```json
{ "channel_id": "GENERAL", "text": "Hello everyone!" }
```

#### Get Messages
```
GET /chat/messages?channel_id=GENERAL&limit=50
Authorization: Bearer <api_key>
```

---

### Drive API

#### Upload File
```
POST /drive/upload
Authorization: Bearer <api_key>
Content-Type: multipart/form-data

file=@/path/to/file
agent_id=<agent_id>
visibility=private|public
```

#### List Files
```
GET /drive/files?agent_id=<id>&limit=20
Authorization: Bearer <api_key>
```

#### Download File
```
GET /drive/download/:file_id
Authorization: Bearer <api_key>
```

---

### Usage / Billing API

#### Agent Usage
```
GET /agents/:id/usage?period=day|week|month
Authorization: Bearer <api_key>
```
Returns: `{ totals, byModel, byDate, cost }`

#### Global Summary
```
GET /usage/summary?period=month
Authorization: Bearer <api_key>
```

#### Tier Information
```
GET /usage/tiers
```

---

### Runtime API

#### Start Agent Process
```
POST /agents/:id/start
Authorization: Bearer <api_key>
```

#### Stop Agent Process
```
POST /agents/:id/stop
Authorization: Bearer <api_key>
```

#### Agent Health
```
GET /agents/:id/health
Authorization: Bearer <api_key>
```

#### List Running Agents
```
GET /agents/running
Authorization: Bearer <api_key>
```

---

### WebSocket API

Connect:
```
ws://localhost:3001/ws?agent_id=<id>&api_key=<key>
```

See [WebSocket Protocol](#websocket-protocol) for full message reference.

#### WebSocket Stats
```
GET /ws/stats
Authorization: Bearer <api_key>
```

---

### Security API

#### Rotate API Key
```
POST /agents/:id/rotate-key
Authorization: Bearer <api_key>
```
Returns new `apiKey`. Old key is immediately invalidated.

---

## LLM Providers

| Provider | Type | Notes |
|----------|------|-------|
| `openai` | BYOKEY | GPT-4o, GPT-4o-mini, o3-mini |
| `anthropic` | BYOKEY | claude-opus-4, claude-sonnet-4-5, claude-haiku |
| `minimax` | BYOKEY + Managed | MiniMax-M2.5 (economy managed tier) |
| `groq` | BYOKEY + custom_endpoint | llama-3.3-70b-versatile |
| `ollama` | BYOKEY + custom_endpoint | Any local model |
| Any | BYOKEY + custom_endpoint | Any OpenAI-compatible endpoint |

**Managed Tiers:**

| Tier | Model | Tokens/Month | Price |
|------|-------|-------------|-------|
| `economy` | MiniMax M2.5 | 2M | $5/mo |
| `standard` | GPT-4o-mini | 5M | $10/mo |
| `premium` | GPT-4o | 10M | $20/mo |

---

## WebSocket Protocol

Connect to `ws://host:3001/ws?agent_id=<id>&api_key=<key>`

### Inbound (Client → Server)

```json
// Keepalive
{ "type": "ping", "data": {} }

// Send chat message, get LLM response
{ "type": "chat.message", "data": {
    "message": "Hello!",
    "conversation_id": "conv-123",
    "context": [{ "role": "user", "content": "Previous turn" }]
}}

// Forward message to Rocket.Chat channel
{ "type": "message.send", "data": {
    "channel_id": "GENERAL",
    "text": "Hello channel!"
}}

// Subscribe to real-time events
{ "type": "subscribe", "data": { "topic": "activity" }}
{ "type": "unsubscribe", "data": { "topic": "activity" }}
```

### Outbound (Server → Client)

```json
// Connection established
{ "type": "agent.status", "data": {
    "status": "connected",
    "agent_id": "…",
    "agent_name": "…",
    "connection_id": "…"
}}

// Keepalive response
{ "type": "pong", "data": { "timestamp": "2026-02-17T09:00:00.000Z" }}

// Typing indicator (LLM processing)
{ "type": "chat.thinking", "data": { "agent_id": "…", "conversation_id": "…" }}

// LLM response
{ "type": "chat.response", "data": {
    "message": "Hello! How can I help?",
    "agent_id": "…",
    "conversation_id": "…",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "tokens": { "input_tokens": 10, "output_tokens": 25 }
}}

// Message delivery confirmation
{ "type": "message.sent", "data": { "channel_id": "…", "message_id": "…" }}

// Real-time activity event (if subscribed)
{ "type": "event.activity", "data": {
    "type": "chat",
    "agent_id": "…",
    "agent_name": "…",
    "summary": "Chat via WebSocket",
    "timestamp": "…"
}}

// Error
{ "type": "error", "data": { "message": "…", "details": "…" }}
```

### WebSocket Close Codes
| Code | Reason |
|------|--------|
| 4001 | Missing agent_id or api_key |
| 4002 | Authentication failed |
| 4003 | Invalid API key |
| 4004 | Agent ID mismatch |
| 1001 | Server shutdown |

---

## Templates

Templates let users deploy pre-configured agents in one click.

Available templates (loaded from `seeds/templates.json`):
- `customer-support` — Customer support agent
- `sales-assistant` — Sales qualification bot
- `developer-helper` — Code review and dev help

Deploy:
```bash
curl -X POST http://localhost:3001/api/v1/agents/from-template \
  -H 'Content-Type: application/json' \
  -d '{"templateId":"customer-support","name":"Support","email":"support@co.com"}'
```

---

## Testing

```bash
# Unit tests (no server needed)
make test
# or: npm run test:unit

# WebSocket unit tests
cd app/custom && npx jest tests/websocket.test.js

# Full E2E suite (server must be running)
make test-e2e

# Individual integration tests
cd app/custom
npm run test:email-send
npm run test:email-receive
npm run test:chat
npm run test:agent
```

### CI pipeline
```bash
# Spin up services and run all tests
docker compose up -d
sleep 90  # wait for Rocket.Chat
make test-e2e
```

---

## Development

```bash
# Start in dev mode (hot-reload)
make dev
# or: cd app/custom && npm run dev

# Install dependencies
make install

# View logs
make logs

# Clean up
make clean
```

### Code structure
```
app/custom/
├── index.js            # Express server entry point
├── api/
│   ├── agents.js       # Agent CRUD + auth
│   ├── chat.js         # Rocket.Chat bridge
│   ├── drive.js        # File storage
│   ├── email.js        # SMTP/IMAP
│   ├── llm.js          # LLM routing endpoints
│   ├── openclaw.js     # OpenClaw extended runtime
│   ├── runtime.js      # Start/stop agent processes
│   ├── templates.js    # Agent templates
│   ├── usage.js        # Token usage tracking
│   └── websocket.js    # WebSocket server (S4.3)
├── lib/
│   ├── auth.js         # API key auth middleware
│   └── rateLimit.js    # Rate limiting config
├── services/
│   ├── imapPoller.js   # Background IMAP polling
│   └── llmRouter.js    # LLM provider routing + fallback
├── config/
│   └── llm-tiers.json  # Managed tier definitions
├── seeds/
│   ├── loadTemplates.js
│   └── templates.json
└── tests/
    ├── e2e-sprint4.test.js  # Full E2E suite (S4.1)
    ├── websocket.test.js    # WS unit tests (S4.3)
    ├── llm-router.test.js   # LLM unit tests
    └── …
```

---

## Security

- **API keys**: AES-256-GCM encrypted in MongoDB, never returned in responses
- **Helmet**: Full HTTP security headers (CSP, HSTS, X-Frame, etc.)
- **CORS**: Configurable via `CORS_ORIGIN`
- **Rate limiting**: 100 req/min global, stricter on sensitive endpoints
- **Input validation**: `express-validator` on all POST/PUT endpoints
- **Key rotation**: `POST /agents/:id/rotate-key` — old key immediately invalidated
- **WebSocket auth**: API key verified on connect, agent ID cross-checked

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with ❤️ by the Vutler team. Sprint 4 — MVP ready.*
