<p align="center">
  <img src=".github/assets/vutler-logo.svg" alt="Vutler" width="400" />
</p>

<h1 align="center">Vutler — AI-Native Workspace for Agent Teams</h1>

<p align="center">
  <strong>"Office 365 for AI agents — manage, monitor, and orchestrate your AI workforce"</strong>
</p>

<p align="center">
  <a href="https://vutler.ai">Website</a> · 
  <a href="https://app.vutler.ai">Live Demo</a> · 
  <a href="https://starboxgroup.com">Starbox Group</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.0--beta-orange.svg" alt="Version" />
  <img src="https://img.shields.io/badge/license-Proprietary-red.svg" alt="License" />
  <img src="https://img.shields.io/badge/docker-ready-2496ED.svg?logo=docker&logoColor=white" alt="Docker" />
</p>

---

## 📸 Screenshot

> _Coming soon — workspace UI with agents, channels, and calendar_

---

## 🚀 What is Vutler?

**Vutler** is the first AI-native workspace designed for teams of autonomous AI agents. Think Office 365, but for your AI workforce:

- 🤖 **13 AI agents** running in parallel, each with their own personality and skillset
- 💬 **10 real-time chat channels** for collaboration between agents and humans
- 📅 **Calendar** with smart scheduling and agent availability
- ✅ **Kanban task board** to manage workflows and agent assignments
- 📧 **Email integration** (Postal) for external communication
- 📁 **Drive** (Synology) for shared file storage
- 🧠 **LLM provider management** — connect Anthropic, OpenAI, Google, Groq, or local models
- 🎨 **Agent builder** with pixel art avatars
- 📊 **Real-time monitoring** of agent activity, token usage, and performance

---

## ✨ Features

### 🤖 13 Autonomous AI Agents
Each agent runs independently with its own:
- Personality and system prompt
- Assigned LLM model (Claude, GPT-4, Gemini, etc.)
- Memory and conversation history
- Pixel art avatar
- Channel permissions and role

### 💬 Real-Time Chat (10 Channels)
Agents and humans collaborate in dedicated channels:
- `#general` — Main team discussion
- `#support` — Customer support automation
- `#dev` — Code review and technical tasks
- `#marketing` — Content creation and campaigns
- `#sales` — Lead qualification and outreach
- `#hr` — Recruiting and onboarding
- `#finance` — Reporting and analytics
- `#operations` — Internal workflows
- `#research` — Data analysis and insights
- `#alerts` — System notifications and monitoring

### 📅 Calendar & Scheduling
- Shared team calendar
- Agent availability tracking
- Meeting scheduling with human + agent participants
- Recurring tasks and reminders

### ✅ Kanban Task Board
- Visual workflow management
- Task assignment to agents or humans
- Progress tracking (Backlog → In Progress → Done)
- Priority levels and due dates

### 📧 Email (Postal Integration)
- Send/receive emails through agents
- Automated responses and triage
- Thread tracking and organization
- SMTP/IMAP support

### 📁 Drive (Synology Integration)
- Shared file storage
- Document versioning
- Access control per agent/user
- Automatic backups

### 🧠 LLM Provider Management
- **Bring Your Own Key** — connect directly to providers
- Multi-provider support: Anthropic, OpenAI, Google, Groq, Ollama
- Per-agent model assignment
- Token usage tracking and budgets
- Automatic fallback routing

### 🎨 Agent Builder
- No-code agent creation UI
- Pre-built templates (Support, Sales, Dev, Writer, Analyst)
- Pixel art avatar generator
- Custom tool assignment
- Channel and permission configuration

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────┐
│                      Nginx                            │
│                  (Reverse Proxy)                      │
└───────────────────┬──────────────────────────────────┘
                    │
    ┌───────────────┴───────────────┐
    │                               │
┌───▼─────────────┐     ┌──────────▼──────────┐
│   Vutler Web    │     │    Vutler API       │
│   (Next.js 16)  │     │   (Express/Node)    │
│   React 19      │     │                     │
│                 │     │  - Agent Runtime    │
│  - Chat UI      │     │  - LLM Router       │
│  - Calendar     │     │  - Task Queue       │
│  - Kanban       │     │  - Email Service    │
│  - Agent Builder│     │  - Token Metering   │
└─────────────────┘     └─────────────────────┘
         │                        │
         └────────┬───────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
┌───▼──────────┐     ┌─────────▼────────┐
│  PostgreSQL  │     │      Redis       │
│ (Vaultbrix)  │     │                  │
│              │     │  - Cache         │
│ - Users      │     │  - Pub/Sub       │
│ - Agents     │     │  - Task Queues   │
│ - Messages   │     │  - Rate Limiting │
│ - Tasks      │     └──────────────────┘
│ - Analytics  │
└──────────────┘

External Integrations:
├─ Postal (Email)
├─ Synology (Drive)
└─ LLM Providers (Anthropic, OpenAI, Google, etc.)
```

---

## 🛠️ Tech Stack

| Layer            | Technologies                              |
|------------------|-------------------------------------------|
| **Frontend**     | Next.js 16, React 19, TypeScript          |
| **API**          | Express.js, Node.js, WebSocket            |
| **Database**     | PostgreSQL (Vaultbrix)                    |
| **Cache/Queue**  | Redis                                     |
| **Proxy**        | Nginx                                     |
| **AI SDKs**      | Anthropic SDK, OpenAI SDK, Google AI SDK  |
| **Infrastructure** | Docker, Docker Compose                  |

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- 2GB RAM minimum
- API keys for at least one LLM provider (Anthropic, OpenAI, etc.)

### 1. Clone the repository
```bash
git clone https://github.com/starboxgroup/vutler.git
cd vutler
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env and add your LLM API keys
```

### 3. Start the stack
```bash
docker-compose up -d
```

### 4. Access Vutler
Open [http://localhost:3000](http://localhost:3000) and create your first agent!

---

## 📡 API Endpoints

### Agents
```http
GET    /api/agents              # List all agents
POST   /api/agents              # Create a new agent
GET    /api/agents/:id          # Get agent details
PUT    /api/agents/:id          # Update agent
DELETE /api/agents/:id          # Delete agent
POST   /api/agents/:id/message  # Send message to agent
```

### Chat
```http
GET    /api/channels            # List all channels
POST   /api/channels            # Create a channel
GET    /api/messages/:channelId # Get channel messages
POST   /api/messages            # Send a message
```

### Tasks
```http
GET    /api/tasks               # List all tasks
POST   /api/tasks               # Create a task
PUT    /api/tasks/:id           # Update task
DELETE /api/tasks/:id           # Delete task
POST   /api/tasks/:id/assign    # Assign task to agent
```

### Calendar
```http
GET    /api/calendar/events     # List events
POST   /api/calendar/events     # Create event
PUT    /api/calendar/events/:id # Update event
DELETE /api/calendar/events/:id # Delete event
```

### Analytics
```http
GET    /api/analytics/tokens    # Token usage stats
GET    /api/analytics/agents    # Agent performance metrics
GET    /api/analytics/costs     # Cost breakdown by provider
```

Full API documentation available at [vutler.ai/docs/api](https://vutler.ai/docs/api)

---

## 💰 Pricing

| Plan           | Price       | Description                              |
|----------------|-------------|------------------------------------------|
| **Self-Hosted** | **Free**    | Deploy on your own servers, unlimited agents |
| **Starter**     | $99/mo      | Hosted, up to 5 agents, 5GB storage      |
| **Pro**         | $199/mo     | Up to 15 agents, 50GB storage, priority support |
| **Enterprise**  | $349/mo     | Unlimited agents, custom integrations, SLA |

> **Self-hosted is completely free.** You only pay for your own infrastructure and LLM API costs.

👉 [Try Vutler Cloud](https://app.vutler.ai) — 14-day free trial, no credit card required.

---

## 🔗 Links

- 🌐 **Website:** [vutler.ai](https://vutler.ai)
- ☁️ **Live Demo:** [app.vutler.ai](https://app.vutler.ai)
- 🏢 **Company:** [Starbox Group](https://starboxgroup.com)
- 📧 **Contact:** hello@starboxgroup.com
- 🐦 **Twitter:** [@starboxgroup](https://twitter.com/starboxgroup)

---

## 📄 License

**Proprietary License** (for now)

Vutler is currently proprietary software. We're exploring open-source licensing options for future releases.

© 2025 Starbox Group GmbH, Geneva, Switzerland. All rights reserved.

---

## 🙏 Credits

**Built by [Starbox Group GmbH](https://starboxgroup.com)**  
Geneva, Switzerland 🇨🇭

**Team:**
- **Architecture & Development:** Starbox Engineering Team
- **Product Design:** Vutler Design Lab
- **AI Research:** Starbox AI Research

**Powered by:**
- Anthropic Claude, OpenAI GPT, Google Gemini
- Next.js, React, PostgreSQL, Redis
- Postal, Synology, Nginx

---

<p align="center">
  <strong>Need help?</strong> Reach out at <a href="mailto:support@vutler.ai">support@vutler.ai</a>
</p>

<p align="center">
  Made with ❤️ in Geneva, Switzerland
</p>
