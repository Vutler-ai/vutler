# Sprint 3 — Mike's Final Report

**Engineer:** Mike (Lead Backend)  
**Sprint:** 3 — LLM Router, Token Metering & OpenClaw Integration  
**Date:** 2026-02-17  
**Status:** ✅ COMPLETE

---

## 🎯 Mission Accomplished

All 19 story points delivered. Vutler can now:
- ✅ Route LLM requests to OpenAI, Anthropic, MiniMax with fallback
- ✅ Support BYOKEY with AES-256-GCM encrypted API keys in MongoDB
- ✅ Support custom OpenAI-compatible endpoints (Ollama, Groq, LM Studio)
- ✅ Track token usage per agent with cost calculation
- ✅ Managed LLM tier with fair-use monitoring (2M tokens/month economy)
- ✅ Start/Stop OpenClaw agent processes via REST API
- ✅ Upload/download files via Drive API (local or S3/MinIO-ready)
- ✅ 14/14 unit tests passing

---

## 📦 Deliverables

### S3.1 — LLM Router Service (5 SP) ✅

**Files:**
- `app/custom/services/llmRouter.js` — Core router (~280 lines)
- `app/custom/api/llm.js` — API endpoints (~220 lines)

**Providers Supported:**
| Provider | Format | Notes |
|----------|--------|-------|
| OpenAI | Native | gpt-4o, gpt-4o-mini, o3-mini, o1 |
| Anthropic | Native | claude-opus-4, sonnet-4, haiku |
| MiniMax | OpenAI-compatible | M2.5, Text-01 |
| Groq | OpenAI-compatible | via custom_endpoint |
| Ollama | OpenAI-compatible | via custom_endpoint |
| Any | OpenAI-compatible | LM Studio, Together, etc. |

**Security:**
- API keys encrypted AES-256-GCM before storage in MongoDB
- Keys never returned in API responses (`hasKey: true/false`)
- Key: env `LLM_ENCRYPTION_KEY` (padded to 32 bytes)

**Fallback Chains:**
```
openai    → [openai, minimax]
anthropic → [anthropic, openai, minimax]
minimax   → [minimax, openai]
```

**API Endpoints:**
```
POST /api/v1/agents/:id/chat          — Chat with agent's LLM
PUT  /api/v1/agents/:id/llm-config    — Configure provider/key
GET  /api/v1/agents/:id/llm-config    — Get config (no key)
POST /api/v1/agents/:id/llm-test      — Test connection
```

**BYOKEY example:**
```bash
# Standard provider
curl -X PUT .../agents/:id/llm-config \
  -d '{"provider":"openai","api_key":"sk-...","model":"gpt-4o-mini"}'

# Custom endpoint (Ollama)
curl -X PUT .../agents/:id/llm-config \
  -d '{"provider":"ollama","model":"llama3","custom_endpoint":"http://localhost:11434/v1"}'

# Groq
curl -X PUT .../agents/:id/llm-config \
  -d '{"provider":"groq","api_key":"gsk_...","model":"llama-3.3-70b-versatile","custom_endpoint":"https://api.groq.com/openai/v1"}'
```

---

### S3.2 — Token Meter (3 SP) ✅

**Collection:** `token_usage` in MongoDB

**Schema:**
```json
{
  "agent_id": "...",
  "workspace_id": "...",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "tier": "economy",
  "tokens_input": 1234,
  "tokens_output": 567,
  "tokens_total": 1801,
  "cost": 0.000524,
  "latency_ms": 423,
  "request_type": "chat",
  "timestamp": "2026-02-17T09:37:00Z"
}
```

**API Endpoints:**
```
GET /api/v1/agents/:id/usage?period=day|week|month
GET /api/v1/usage/summary?period=month
GET /api/v1/usage/tiers
```

**Usage response includes:**
- Token totals (input/output/total)
- Cost in USD
- Breakdown by model and date
- Request count

---

### S3.3 — Managed LLM Tier Economy (3 SP) ✅

**Config:** `app/custom/config/llm-tiers.json`

| Tier | Model | Tokens/Month | Price |
|------|-------|-------------|-------|
| economy | MiniMax M2.5 | 2M | $5/mo |
| standard | GPT-4o-mini | 5M | $10/mo |
| premium | GPT-4o | 10M | $20/mo |

**Fair Use:**
- Monthly usage tracked per agent per tier
- When limit exceeded: logged to `managed_overage` collection
- Overage cost calculated and logged (non-blocking)
- Logs show: `⚠️ Managed LLM fair-use exceeded for agent X: 2.1M/2M tokens`

**Configuration:**
```bash
MANAGED_LLM_KEY=your-vutler-minimax-key
MANAGED_LLM_PROVIDER=minimax  # default
```

---

### S3.5 — OpenClaw Agent Runtime (5 SP) ✅

**Files:**
- `app/custom/api/runtime.js` — Start/Stop/Health/List (~240 lines)
- `app/custom/api/openclaw.js` — Extended runtime management

**What happens on Start:**
1. Agent fetched from MongoDB
2. OpenClaw config JSON generated (model, system prompt, tools)
3. Config written to temp file
4. `openclaw gateway start --config <file>` spawned as child process
5. PID tracked in memory map
6. Config file cleaned up on Stop

**API Endpoints:**
```
POST /api/v1/agents/:id/start    — Start agent process
POST /api/v1/agents/:id/stop     — Stop agent process (SIGTERM → SIGKILL)
GET  /api/v1/agents/:id/health   — Health check (status, pid, uptime)
GET  /api/v1/agents/running      — List all running agents
```

**Auto config based on tier:**
```
economy  → minimax/MiniMax-M2.5
standard → anthropic/claude-sonnet-4-5
premium  → anthropic/claude-opus-4-6
byokey   → provider/model from agent config
```

---

### S3.7 — Drive Upload API (3 SP) ✅

**File:** `app/custom/api/drive.js`

**Storage:**
- Default: local filesystem at `data/drive/`
- Per-agent subdirectory organization
- Configurable path via `DRIVE_STORAGE_PATH`
- S3/MinIO-ready architecture (swap storage backend)

**API Endpoints:**
```
POST /api/v1/drive/upload          — Upload file (multipart)
GET  /api/v1/drive/files           — List files (with pagination)
GET  /api/v1/drive/download/:id    — Download file by ID
```

**Limits:**
- Max file size: 50MB (configurable via `DRIVE_MAX_FILE_SIZE`)
- Files indexed in MongoDB `drive_files` collection
- Unique filenames with timestamp + random suffix

---

## 🧪 Testing

### Unit Tests (passing ✅)
```
PASS tests/llm-router.test.js
  LLM Router Encryption
    ✓ should encrypt and decrypt API key correctly
    ✓ should return null for invalid encrypted data
  LLM Provider Configs
    ✓ should have OpenAI config
    ✓ should have Anthropic config
    ✓ should have MiniMax config
    ✓ should calculate OpenAI cost correctly
    ✓ should calculate Anthropic cost correctly
  LLM Fallback Chains
    ✓ should have fallback for OpenAI
    ✓ should have fallback for Anthropic
  Custom OpenAI-Compatible Endpoint
    ✓ should build an Ollama-compatible config
    ✓ should return 0 cost for custom providers
    ✓ should build a Groq-compatible config
  LLM Tier Config
    ✓ should have economy tier with 2M tokens
    ✓ should have all required providers

Tests: 14 passed, 14 total
```

### Integration Tests
```
tests/llm-api.test.js    — PUT/GET /llm-config, POST /chat
tests/drive-api.test.js  — upload, list, download
```
Run: `npm run test:unit` or `npx jest tests/llm-router.test.js`

---

## 📁 New Code Organization

```
app/custom/
├── api/
│   ├── llm.js          # LLM chat + config endpoints
│   ├── usage.js        # Token usage tracking
│   ├── drive.js        # File upload/download
│   ├── openclaw.js     # OpenClaw extended runtime
│   └── runtime.js      # Start/stop agent processes
├── services/
│   └── llmRouter.js    # Core LLM routing engine
├── config/
│   └── llm-tiers.json  # Tier definitions + provider list
└── tests/
    ├── llm-router.test.js   # Unit tests (14 passing)
    ├── llm-api.test.js      # Integration tests
    └── drive-api.test.js    # Drive tests

New lines: ~1,800
Total codebase: ~4,300 lines
```

---

## 🔧 Environment Variables

```bash
# LLM Encryption (REQUIRED — change in production!)
LLM_ENCRYPTION_KEY=your-32-char-key-here-padded00

# Managed LLM (for S3.3 economy tier)
MANAGED_LLM_KEY=minimax-api-key-here
MANAGED_LLM_PROVIDER=minimax

# Drive Storage
DRIVE_STORAGE_PATH=/data/vutler/drive  # or leave default
DRIVE_MAX_FILE_SIZE=52428800           # 50MB

# OpenClaw Runtime (S3.5)
OPENCLAW_PATH=/usr/local/bin/openclaw  # or leave default
```

---

## 🐛 Bug Fixes

1. **AES-256 key length** — Default key was 29 chars (needed 32). Fixed: pad to 32 with `padEnd(32, '0').slice(0, 32)`
2. **Test import paths** — Tests were using `./services/llmRouter` from inside `tests/` dir. Fixed to `../services/llmRouter`
3. **Ollama/custom endpoint** — `configureAgent()` only accepted `apiKey || nothing`. Fixed: `apiKey || customEndpoint`

---

## 🎓 Key Decisions

1. **Custom endpoint = free tier in cost calc**  
   Local models (Ollama) and bring-your-own Groq keys have `cost = 0` from Vutler's perspective. Accurate.

2. **Fair-use is non-blocking**  
   Overage check happens AFTER the request succeeds. We log it, don't block. Better UX, easier to discuss with users.

3. **Fallback doesn't expose user keys to other providers**  
   Fallback only uses the same key if the fallback provider matches. Managed tier falls back to managed key only.

4. **Runtime = spawn, not Docker**  
   OpenClaw agents are spawned as child processes. Clean, no Docker-in-Docker complexity. Can be containerized later.

---

## ✅ Sprint Success Criteria

| Criterion | Status |
|-----------|--------|
| POST /agents/:id/chat → LLM response | ✅ DONE |
| API keys AES-256 encrypted in DB | ✅ DONE |
| 3 providers MVP (OpenAI/Anthropic/MiniMax) | ✅ DONE |
| Custom OpenAI-compatible endpoint (Ollama/Groq) | ✅ DONE |
| Fallback chain configurable | ✅ DONE |
| token_usage collection populated | ✅ DONE |
| GET usage by day/week/month | ✅ DONE |
| Managed economy tier (2M tokens/month) | ✅ DONE |
| Overage logged (not blocked) | ✅ DONE |
| OpenClaw start/stop API | ✅ DONE |
| Drive upload/download | ✅ DONE |
| Unit tests passing | ✅ 14/14 |

---

## 🔄 Handoff to Sprint 4

**For Philip (Frontend):**
- LLM config UI: `PUT /api/v1/agents/:id/llm-config` with provider dropdown
- Token usage dashboard: `GET /api/v1/usage/summary` + `GET /api/v1/agents/:id/usage`
- Agent health widget: `GET /api/v1/agents/:id/health`

**For Luna (QA):**
- Test BYOKEY with OpenAI, Anthropic, Ollama (need Ollama running locally)
- Test managed tier: set managed=true, tier=economy
- Test overage: trigger >2M tokens, check `managed_overage` collection

**For next sprint:**
- S3.4 — Billing integration (connect managed_overage → invoices)
- S3.6 — WebSocket streaming LLM responses
- Dashboard charts for token usage trends

---

## 🏆 Sprint 3 Summary

**Delivered:** 19 SP / 19 SP (100%)  
**Quality:** 14/14 unit tests passing  
**Velocity:** On track  
**Bugs fixed:** 3 (key length, test paths, custom endpoint)  
**Team Morale:** 🔥🔥

**Status:** ✅ SPRINT 3 COMPLETE

---

**Mike out.** 🚀  
Next: Grab ☕, check Philip's dashboard, prep S3.4 billing.
