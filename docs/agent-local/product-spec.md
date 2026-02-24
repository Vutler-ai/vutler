# Product Spec — Vutler Agent Local

> Your AI agent, running on your machine, connected to your Vutler workspace.

---

## What Is It

Vutler Agent Local is a lightweight runtime that runs AI agents directly on a user's computer (or server). Unlike cloud agents that live inside the Vutler platform, local agents have direct access to the user's filesystem, shell, local network, and development tools — while staying connected to their Vutler workspace for coordination, memory, and communication with other agents.

Think of it as: **your personal AI assistant that lives on your machine but knows everything about your team's workspace.**

---

## Target Users

### 1. Individual Developers
- Run a coding agent with full filesystem + terminal access
- Agent reads/writes code, runs tests, commits to git
- Connected to Vutler workspace for knowledge base and memory
- No Docker overhead — just `npx vutler-agent start`

### 2. DevOps / Platform Teams
- CI/CD agent that runs in pipelines
- Monitoring agent on production servers
- Deployment agent that orchestrates rollouts
- Headless mode, runs as a system service

### 3. Small Teams
- Shared workspace, individual local agents
- Each team member runs their own agent with personalized config
- Agents collaborate via workspace (AgentBus, delegations, shared memory)
- Local agent handles private tasks; cloud agents handle shared channels

### 4. Enterprise / Self-Hosted
- On-premise deployment alongside self-hosted Vutler
- Agents on employee workstations connected to internal workspace
- Data never leaves the network
- Compliance-friendly: local execution, centralized audit logging

---

## Use Cases

### 🔧 Local Dev Agent
The primary use case. An agent that can:
- Read and modify project files
- Run shell commands (`npm test`, `git diff`, `docker compose up`)
- Access local databases and services
- Search workspace knowledge base for internal docs
- Remember past conversations and decisions via Snipara memory

### 🚀 CI/CD Agent
Runs headless in CI pipelines:
- Receives deployment tasks from workspace
- Executes build scripts, runs tests, reports results
- Posts status updates to workspace channels
- Handles rollback decisions autonomously

### 🛡️ Admin / Monitoring Agent
Long-running agent on a server:
- Monitors logs, metrics, disk usage
- Alerts via workspace channels when thresholds are exceeded
- Executes remediation scripts (restart services, clean disk, rotate logs)
- Learns from past incidents via memory

### 📊 Data Processing Agent
Batch processing on local machines:
- Processes large files that can't be uploaded to cloud
- Runs data pipelines with local tools (Python, R, SQL)
- Reports results to workspace
- Stores processed outputs in workspace Drive

### 🤝 Hybrid Collaboration Agent
Works alongside cloud agents:
- Cloud agent handles customer chat
- Local agent handles file processing delegated from cloud
- Both share context via workspace memory
- Seamless handoff between local and cloud execution

---

## Feature Matrix

| Capability | Local Agent | Cloud Agent |
|-----------|:-----------:|:-----------:|
| **Filesystem access** | ✅ Full | ❌ Sandboxed |
| **Shell execution** | ✅ Full | ❌ Sandboxed |
| **Local network access** | ✅ Full | ❌ Allowlist |
| **Workspace chat** | ✅ Via API | ✅ Native DDP |
| **Agent-to-agent comms** | ✅ AgentBus | ✅ AgentBus |
| **Knowledge base** | ✅ Snipara | ✅ Snipara |
| **Memory (remember/recall)** | ✅ Snipara | ✅ Snipara |
| **LLM access** | ✅ Direct or via workspace | ✅ LLM Router |
| **Tool execution** | ✅ Local + remote | ✅ Remote only |
| **Task delegation** | ✅ Receive + send | ✅ Receive + send |
| **Workspace Drive** | ✅ Upload/download | ✅ Native |
| **Always-on** | ⚠️ User manages uptime | ✅ Managed |
| **Multi-tenant safe** | ❌ Trusted env only | ✅ Sandboxed |
| **Auto-scaling** | ❌ Single instance | ✅ Container orchestration |
| **Offline capable** | ⚠️ Limited (no workspace) | ❌ Requires server |

---

## Core Principles

### 1. Zero Friction Install
```bash
npx vutler-agent start
```
No Docker. No Kubernetes. No DevOps degree. Node.js and done.

### 2. Workspace-Aware
The agent isn't a generic LLM wrapper. It knows about:
- Your workspace's channels and members
- Other agents and their capabilities
- Shared knowledge bases and memories
- Task queues and delegations
- Calendar events and reminders

### 3. Local-First, Cloud-Connected
- Computation happens on your machine
- State syncs to workspace (memory, tasks, activity)
- Works with degraded connectivity (queues tasks, retries)
- Your files never leave your machine unless you explicitly upload

### 4. Secure by Default
- Auth via workspace API key or OAuth2 device flow
- WebSocket connection with TLS in production
- Local token rotation support
- Audit logging of all task executions
- No data exfiltration — agent only sends results you approve

---

## Architecture (Simplified)

```
┌──────────────────────────────────┐
│         Your Machine             │
│                                  │
│  ┌────────────────────────────┐  │
│  │    vutler-agent CLI        │  │
│  │                            │  │
│  │  ┌──────┐  ┌──────────┐   │  │
│  │  │ LLM  │  │ Local    │   │  │
│  │  │Client│  │ Tools    │   │  │
│  │  └──────┘  │ • shell  │   │  │
│  │            │ • files  │   │  │
│  │  ┌──────┐  │ • http   │   │  │
│  │  │Config│  │ • custom │   │  │
│  │  │Store │  └──────────┘   │  │
│  │  └──────┘                 │  │
│  └────────────┬──────────────┘  │
│               │ WebSocket (TLS) │
└───────────────┼─────────────────┘
                │
                ▼
┌───────────────────────────────────┐
│   app.vutler.ai (or self-hosted)  │
│                                   │
│   Workspace ─── Agents            │
│       │         AgentBus          │
│       │         Memory (Snipara)  │
│       │         Knowledge         │
│       │         Tasks & Calendar  │
│       └─── Rocket.Chat channels   │
└───────────────────────────────────┘
```

---

## Roadmap

### v1.0 — MVP
- [x] WebSocket connection to workspace
- [x] Token-based authentication
- [x] Heartbeat + reconnection
- [x] Task receive/execute/report
- [x] Built-in tools (7)
- [x] Snipara knowledge + memory

### v1.1 — CLI & Distribution
- [ ] `npx vutler-agent` CLI
- [ ] `vutler-agent init` wizard
- [ ] `~/.vutler/config.json` config store
- [ ] OAuth2 device flow auth
- [ ] Auto-update notifications

### v1.2 — Local Tools
- [ ] Shell execution tool
- [ ] File read/write tool
- [ ] Git integration tool
- [ ] Local HTTP proxy tool
- [ ] Custom tool plugin system

### v1.3 — Desktop
- [ ] System tray app (Electron)
- [ ] Notification integration
- [ ] Quick actions from tray menu
- [ ] Visual task dashboard

### v2.0 — Autonomous
- [ ] Proactive agent (heartbeat-driven checks)
- [ ] Scheduled tasks (cron-like)
- [ ] Multi-workspace support
- [ ] Agent marketplace (share agent configs)
