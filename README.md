# Vutler Platform

> **Two products. One AI platform.** — by [Starbox Group](https://starbox-group.com/)

Vutler is a production-grade platform for deploying AI agents that collaborate with humans across chat, email, drive, and tasks. Built on a monorepo architecture with two distinct products.

**Homepage:** [vutler.ai](https://vutler.ai) · **App:** [app.vutler.ai](https://app.vutler.ai) · **Open Source:** [github.com/Vutler-ai/vutler](https://github.com/Vutler-ai/vutler)

---

## Two Products

### Vutler Office (Proprietary SaaS)
AI-powered workspace where humans and agents collaborate.

| Feature | Description |
|---------|-------------|
| **Chat** | Real-time messaging with AI agents in the conversation |
| **Email** | Agents send/receive via Postal (custom domains or @slug.vutler.ai) |
| **Drive** | Shared file storage on Exoscale SOS (Swiss, GDPR/LPD) |
| **Calendar** | Team scheduling with event management |
| **Tasks** | Kanban board with subtasks + Snipara sync |
| **Memory** | Workspace knowledge + agent memories + cross-scope search |
| **Billing** | Stripe checkout with 8 plan tiers |

### Vutler Agents (Open Source — AGPL-3.0)
Build, deploy, and orchestrate AI agents anywhere.

| Feature | Description |
|---------|-------------|
| **17 Templates** | Pre-built agents for sales, ops, technical, finance |
| **68 Skills** | Modular capabilities assignable to any agent |
| **Nexus CLI** | Deploy agents locally or at client sites |
| **Multi-Agent** | Rule-based task routing across agent teams |
| **OpenRouter Auto** | Best model per prompt (200+ models) |
| **Marketplace** | Share and install agent configurations |
| **Sandbox** | Test agent execution safely |

---

## Architecture

```
vutler-platform/
├── packages/
│   ├── core/           # Shared: auth, DB, permissions, feature gate
│   ├── office/         # SaaS: chat, email, drive, tasks, calendar
│   ├── agents/         # Open: agent routes, marketplace, swarm, LLM
│   ├── nexus/          # Open: CLI, multi-agent runtime, providers
│   └── mcp-server/     # MCP: 13 tools for external AI agents
├── frontend/           # Next.js 16 + shadcn/ui + Tailwind CSS 4
├── services/           # LLM router, Snipara client, Stripe, crypto
├── api/                # Express routes (agents, nexus, billing, etc.)
├── seeds/              # 17 templates + 68 skills
└── tests/e2e/          # 9 test suites
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express.js |
| **Frontend** | Next.js 16, React 19, TypeScript, shadcn/ui, Tailwind CSS 4 |
| **Database** | PostgreSQL (Vaultbrix) |
| **LLM** | OpenRouter Auto, Anthropic, OpenAI, Groq, Mistral, Ollama |
| **Memory** | Snipara (3-level scoping: instance, template, global) |
| **Storage** | Exoscale SOS (Swiss, S3-compatible) |
| **Email** | Postal (self-hosted SMTP) |
| **Payments** | Stripe (live, 5 products, 10 prices) |
| **Auth** | JWT + Google OAuth + GitHub OAuth |
| **Hosting** | Swiss 🇨🇭 (Geneva datacenter, GDPR/LPD) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/alopez3006/vutler-platform.git
cd vutler-platform

# Install
npm install
cd frontend && npm install && cd ..

# Configure
cp .env.example .env  # Add your keys

# Run API
PORT=3001 node index.js

# Run Frontend (separate terminal)
cd frontend && npm run dev
```

**Health:** `curl http://localhost:3001/api/v1/health`

---

## API Endpoints

### Workspace (Office)
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/v1/chat/channels` | Chat channels + messages |
| GET/POST | `/api/v1/email` | Email inbox + send + drafts + approval |
| GET/POST | `/api/v1/drive/files` | File browser + upload + download |
| GET/POST | `/api/v1/tasks-v2` | Tasks + subtasks + Snipara sync |
| GET/POST | `/api/v1/calendar/events` | Calendar events CRUD |
| GET | `/api/v1/memory/*` | Memory: workspace, agents, search |

### Agents
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/v1/agents` | Agent CRUD + execute |
| GET/POST | `/api/v1/nexus/*` | Nexus node management + multi-agent |
| GET | `/api/v1/marketplace/templates` | 17 agent templates |
| GET | `/api/v1/marketplace/skills` | 68 skills by category |
| GET/POST | `/api/v1/llm/*` | LLM provider management |

### Billing
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/v1/billing/plans` | 8 plan tiers |
| GET | `/api/v1/billing/subscription` | Current subscription + usage |
| POST | `/api/v1/billing/checkout` | Stripe checkout session |
| POST | `/api/v1/billing/portal` | Stripe customer portal |
| POST | `/api/v1/billing/webhooks/stripe` | Stripe webhook handler |

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/v1/auth/login` | Email/password login |
| POST | `/api/v1/auth/register` | New account |
| GET | `/api/v1/auth/google` | Google OAuth |
| GET | `/api/v1/auth/github` | GitHub OAuth |

---

## MCP Server

Expose your Vutler workspace to any AI agent (Claude Code, Cursor, etc.):

```json
{
  "mcpServers": {
    "vutler": {
      "command": "npx",
      "args": ["@vutler/mcp-office"],
      "env": {
        "VUTLER_API_KEY": "your-api-key",
        "VUTLER_API_URL": "https://app.vutler.ai"
      }
    }
  }
}
```

**13 tools:** send_email, read_emails, send_chat, create_task, list_tasks, upload_file, list_files, list_events, search, and more.

---

## Nexus CLI

Deploy agents locally or at client sites:

```bash
# Local mode (clone cloud agents to your machine)
vutler-nexus start --key YOUR_KEY --name "My Workstation"

# Multi-agent (3 agents with routing rules)
vutler-nexus agents          # List running agents
vutler-nexus spawn mike      # Spawn an agent from pool

# Enterprise (deploy at client site)
vutler-nexus create-agent    # Create new agent for client
```

---

## Plans & Pricing

| Plan | Price | Category |
|------|-------|----------|
| Free | $0/mo | Office |
| Office Starter | $29/mo | Office |
| Office Team | $79/mo | Office |
| Agents Starter | $29/mo | Agents |
| Agents Pro | $79/mo | Agents |
| Full Platform | $129/mo | Full |
| Enterprise | Custom | Full |

---

## Deployment

### Docker (Production)
```bash
# API
docker build -t vutler-api:latest .
docker run -d --name vutler-api --network host --env-file .env vutler-api:latest

# Frontend
cd frontend && bash ../scripts/deploy-frontend.sh
```

### VPS
```bash
ssh ubuntu@83.228.222.180
cd /home/ubuntu/vutler
git pull origin main
docker build --no-cache -t vutler-api:latest .
bash scripts/deploy-frontend.sh
```

---

## Testing

```bash
# E2E tests (9 suites)
npm run test:e2e

# Suites: health, agents, tasks, chat, drive, billing, nexus, marketplace
```

---

## Security

- JWT + OAuth (Google, GitHub)
- Rate limiting (express-rate-limit)
- Helmet security headers
- Stripe webhook signature verification
- CORS + CSRF protection
- Swiss hosting (GDPR/LPD compliant)

---

## License

- **Vutler Agents** (packages/agents, packages/nexus, packages/core): **AGPL-3.0**
- **Vutler Office** (packages/office, frontend, billing): **Proprietary**

---

## Links

- 🌐 [vutler.ai](https://vutler.ai)
- 📱 [app.vutler.ai](https://app.vutler.ai)
- 🐙 [github.com/Vutler-ai/vutler](https://github.com/Vutler-ai/vutler) (Open Source)
- 💼 [starbox-group.com](https://starbox-group.com/)

---

**Built with ❤️ in Geneva, Switzerland 🇨🇭** · **Last updated:** March 2026
