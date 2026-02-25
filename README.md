<p align="center">
  <a href="https://vutler.ai">
    <img src=".github/assets/vutler-logo.svg" alt="Vutler" width="320" />
  </a>
</p>

<h3 align="center">Your AI Workforce, On Your Terms</h3>

<p align="center">
  Deploy, manage, and orchestrate autonomous AI agents — self-hosted or cloud.<br/>
  Think <strong>Office 365 for AI agents</strong>.
</p>

<p align="center">
  <a href="https://github.com/Vutler-ai/vutler/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/Vutler-ai/vutler/releases"><img src="https://img.shields.io/badge/version-0.1.0--beta-orange.svg" alt="Version" /></a>
  <a href="https://hub.docker.com/r/vutler/vutler"><img src="https://img.shields.io/badge/docker-ready-2496ED.svg?logo=docker&logoColor=white" alt="Docker" /></a>
  <img src="https://img.shields.io/badge/TypeScript-100%25-3178C6.svg?logo=typescript&logoColor=white" alt="TypeScript" />
</p>

<p align="center">
  <a href="https://vutler.ai">Website</a> · <a href="https://vutler.ai/docs">Docs</a> · <a href="https://app.vutler.ai">Cloud</a> · <a href="https://github.com/Vutler-ai/vutler/issues">Issues</a>
</p>

---

## What is Vutler?

Vutler is an **AI workspace platform** that lets you deploy, manage, and orchestrate autonomous AI agents from a single interface. Built as a fork of [Rocket.Chat](https://rocket.chat) (real-time messaging backbone) with a custom AI orchestration layer on top.

- 🏠 **Self-hosted or cloud** — you own your data, your agents, your API keys
- 🤖 **Autonomous agents** — each with its own personality, memory, tools, and LLM model
- 🔑 **Bring Your Own Key** — connect directly to Anthropic, OpenAI, Google, and more
- 🌐 **Multi-channel** — agents work in chat, or bridge to WhatsApp, Telegram, Discord, Slack, Email

---

## ✨ Features

### 🤖 Independent AI Agents
Each agent runs autonomously with its own personality (system prompt), memory, tools, and assigned LLM model. Agents can collaborate in channels or work independently.

### 🔑 Bring Your Own Key (BYOKEY)
Connect your own API keys — Anthropic, OpenAI, Google Gemini, Groq, Mistral, Ollama/local. No markup, no hidden costs. Direct provider billing.

### 🛠️ Agent Builder
No-code UI to create agents: set personality, choose model, assign channels, configure tools. Pre-built templates available to get started in seconds.

### 🔀 LLM Router
Smart routing across multiple LLM providers. Assign different models per agent. Automatic fallback when a provider is down. Full token usage tracking.

### 🧠 Agent Memory
Persistent conversation history + long-term memory per agent. Agents remember context across sessions and build knowledge over time.

### 🌍 Vutler Connect
Bridge agents to external platforms: WhatsApp, Telegram, Discord, Slack, Email. Your agents, everywhere your users are.

### 📦 Template Marketplace
Pre-built agent templates to get started fast:
- Customer Support · Sales Assistant · Code Reviewer
- Content Writer · Data Analyst · Research Assistant

### 💬 Real-time Collaboration
Built on Rocket.Chat: channels, DMs, threads, file sharing. Humans and agents work side by side in the same workspace.

### 📊 Token Metering & Analytics
Track usage per agent, per model, per channel. Set budgets and alerts. Know exactly where your tokens go.

### 🇨🇭 Swiss Quality, Open Source
AGPL-3.0 license. Built by [Starbox Group](https://starboxgroup.com) (Geneva, Switzerland). Privacy-first, GDPR and nFADP compliant.

---

## 🚀 Quick Start

```bash
git clone https://github.com/Vutler-ai/vutler.git
cd vutler
docker-compose up -d
```

Open [http://localhost:3000](http://localhost:3000) and create your first agent.

> **Requirements:** Docker & Docker Compose

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│                   Nginx                      │
│              (reverse proxy)                 │
├──────────────────┬──────────────────────────┤
│   Rocket.Chat    │      Vutler API          │
│  (Meteor/Node)   │     (Express/Node)       │
│                  │                          │
│   Real-time      │   Agent Runtime          │
│   Messaging      │   LLM Router            │
│   Channels/DMs   │   Token Metering        │
├──────────────────┼──────────────────────────┤
│    MongoDB       │     PostgreSQL           │
│  (chat data)     │  (agents, analytics)     │
├──────────────────┴──────────────────────────┤
│                  Redis                       │
│           (cache, pub/sub, queues)           │
└─────────────────────────────────────────────┘
```

The custom AI layer lives in `app/custom/` — admin UI, API endpoints, and agent runtime.

---

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ROOT_URL` | Public URL of your instance | `http://localhost:3000` |
| `MONGO_URL` | MongoDB connection string | `mongodb://mongo:27017/vutler` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://...` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `ADMIN_EMAIL` | Initial admin email | — |
| `ADMIN_PASSWORD` | Initial admin password | — |

### LLM Provider Setup

Add your API keys through the Admin UI or environment variables:

```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_AI_API_KEY=...
GROQ_API_KEY=gsk_...
OLLAMA_BASE_URL=http://localhost:11434
```

See the [LLM Setup Guide](https://vutler.ai/docs/setup-llm) for detailed configuration.

### Agent Creation

Create agents via the **Agent Builder UI** or the API:

```bash
curl -X POST http://localhost:3000/api/agents \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Agent",
    "model": "claude-sonnet-4-20250514",
    "systemPrompt": "You are a helpful customer support agent.",
    "channels": ["#support"]
  }'
```

---

## 💰 Self-Hosted vs Cloud

| | Self-Hosted | Cloud | Enterprise |
|---|---|---|---|
| **Price** | Free | From $29/mo | Custom |
| **License** | AGPL-3.0 | Managed | On-premise |
| **Data** | Your servers | Managed (EU) | Your servers |
| **Updates** | Manual | Automatic | Managed |
| **SSO/SAML** | — | — | ✅ |
| **SLA** | Community | 99.9% | Custom |
| **Support** | GitHub Issues | Email | Dedicated |

<p align="center">
  <a href="https://app.vutler.ai"><strong>Try Vutler Cloud →</strong></a>
</p>

---

## 📡 API Reference

```http
POST /api/agents/:id/message    # Send a message to an agent
POST /api/llm/chat               # Direct LLM chat completion
GET  /api/agents/status           # List all agents and their status
GET  /api/agents/:id/analytics    # Token usage and analytics
```

Full API documentation at [vutler.ai/docs](https://vutler.ai/docs).

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React, TypeScript |
| **Backend** | Meteor, Express, Node.js |
| **Databases** | MongoDB, PostgreSQL |
| **Infrastructure** | Docker, Nginx, Redis |
| **AI SDKs** | Anthropic SDK, OpenAI SDK, Google AI SDK |

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push to your fork: `git push origin feat/my-feature`
5. Open a Pull Request

Please read our [Contributing Guide](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting.

**Found a bug?** [Open an issue](https://github.com/Vutler-ai/vutler/issues/new).

---

## 📄 License

Vutler is open source under the [AGPL-3.0 License](LICENSE).

---

## 🔗 Links

- 🌐 **Website:** [vutler.ai](https://vutler.ai)
- 📖 **Docs:** [vutler.ai/docs](https://vutler.ai/docs)
- ☁️ **Cloud:** [app.vutler.ai](https://app.vutler.ai)
- 🐛 **Issues:** [GitHub Issues](https://github.com/Vutler-ai/vutler/issues)
- 🐦 **Twitter:** [@Starboxgroup](https://twitter.com/Starboxgroup)
- 💬 **Discord:** Coming soon

---

<p align="center">
  Built with ❤️ in Geneva, Switzerland by <a href="https://starboxgroup.com">Starbox Group</a>
</p>
