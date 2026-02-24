# OpenClaw vs Vutler Agent Local

Both are AI agent runtimes that run on your machine. Here's how they differ and when to use which.

---

## What They Are

**OpenClaw** is a general-purpose AI agent runtime. It connects to any LLM, runs any tools, works on any platform. It's model-agnostic, workspace-agnostic, and designed as infrastructure for building AI agents.

**Vutler Agent Local** is a Vutler-specific agent runtime. It connects to a Vutler workspace, uses Vutler's tools and memory system (Snipara), and coordinates with other Vutler agents. It's purpose-built for the Vutler ecosystem.

Think of it this way:
- **OpenClaw** = Linux kernel
- **Vutler Agent Local** = Ubuntu (built on the kernel, adds ecosystem)

---

## Feature Comparison

| Feature | OpenClaw | Vutler Agent Local |
|---------|----------|-------------------|
| **LLM Support** | Any (OpenAI, Anthropic, Google, Ollama, etc.) | Same (via workspace LLM config) |
| **Tool System** | Plugin-based, fully extensible | 7 built-in + Snipara agentic tools |
| **Memory** | File-based (MEMORY.md, daily notes) | Snipara MCP (semantic search, typed memories) |
| **Knowledge Base** | File-based (local docs) | Snipara (indexed, searchable, shared across agents) |
| **Multi-Agent** | Session-based sub-agents | Full workspace: AgentBus, delegation, directory |
| **Chat Integration** | Discord, WhatsApp, Telegram, Webchat | Rocket.Chat (native), workspace channels |
| **Workspace** | Local filesystem only | Vutler workspace (cloud or self-hosted) |
| **Agent Discovery** | None (standalone) | Agent directory with capabilities |
| **Task Queue** | None (direct execution) | Delegation protocol with priority + chains |
| **Scheduling** | Cron + heartbeats | Calendar + reminders + workspace tasks |
| **File Storage** | Local filesystem | Local + workspace Drive API |
| **Auth** | Local config file | Workspace API key or OAuth2 |
| **Billing / Usage** | None | Token tracking, cost per agent, tier system |
| **Distribution** | `npm install -g openclaw` | `npx vutler-agent start` |
| **Config** | `~/.openclaw/` | `~/.vutler/` |

---

## When to Use OpenClaw

- You don't use Vutler and don't need a workspace
- You want a **personal AI assistant** with chat platform integration (Discord, WhatsApp)
- You need **maximum flexibility** in tool configuration
- You're building your own agent platform on top of it
- You want file-based memory and config (simple, no external dependencies)
- You need **node pairing** (control remote devices)

## When to Use Vutler Agent Local

- You're a **Vutler user** (app.vutler.ai or self-hosted)
- You need **multi-agent coordination** (agents that talk to each other)
- You want **semantic memory** that persists across sessions and agents (Snipara)
- You need **workspace features**: channels, Drive, calendar, task delegation
- You're in a **team** and agents need to share context
- You want **usage tracking** and billing per agent

---

## Relationship: How They Fit Together

Vutler Agent Local is **inspired by OpenClaw** and can optionally **wrap OpenClaw** as its underlying runtime engine.

```
┌─────────────────────────────────┐
│       Vutler Agent Local        │
│                                 │
│  ┌───────────────────────────┐  │
│  │   Workspace Connector     │  │  ← Vutler-specific layer
│  │   • Auth (API key/OAuth)  │  │
│  │   • AgentBus integration  │  │
│  │   • Snipara memory        │  │
│  │   • Task delegation       │  │
│  │   • Workspace sync        │  │
│  └───────────┬───────────────┘  │
│              │                  │
│  ┌───────────▼───────────────┐  │
│  │   OpenClaw Runtime        │  │  ← General-purpose engine
│  │   • LLM routing           │  │
│  │   • Tool execution        │  │
│  │   • Shell & filesystem    │  │
│  │   • Session management    │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Three modes of operation:

1. **Standalone Vutler Agent** — No OpenClaw. Uses Vutler's own lightweight runtime. Best for simple task execution.

2. **Vutler Agent + OpenClaw** — OpenClaw handles LLM and tool execution. Vutler layer adds workspace awareness. Best for power users.

3. **OpenClaw only** — No Vutler. Pure general-purpose agent. Best for personal use or non-Vutler platforms.

---

## Can They Coexist?

**Yes.** You can run both on the same machine:

```bash
# Terminal 1: OpenClaw for personal Discord bot
openclaw gateway start

# Terminal 2: Vutler Agent for work workspace
vutler-agent start
```

They use separate config directories (`~/.openclaw/` vs `~/.vutler/`) and don't conflict.

### Shared LLM Keys

Both can use the same LLM API keys. If you've configured Anthropic in OpenClaw, you can reference the same key in Vutler's workspace LLM config.

### Shared Filesystem

Both access the same local filesystem. You could have:
- OpenClaw managing your personal projects in `~/projects/personal/`
- Vutler agent working on team projects in `~/projects/work/`

---

## Migration Paths

### OpenClaw User → Vutler Workspace

Already using OpenClaw and want to add Vutler collaboration features:

1. **Sign up** at app.vutler.ai (or self-host)
2. **Install Vutler Agent:**
   ```bash
   npx vutler-agent init
   ```
3. **Connect to workspace:**
   ```bash
   vutler-agent connect https://app.vutler.ai
   ```
4. **Keep OpenClaw running** for personal/non-Vutler tasks
5. **Migrate memory** (optional): Export from `MEMORY.md` → import to Snipara

### Vutler Cloud → Vutler Local

Using cloud agents and want local execution too:

1. **Register a local agent** via workspace admin
2. **Install and connect:**
   ```bash
   npx vutler-agent start
   ```
3. Cloud agents can **delegate tasks** to your local agent
4. Both share workspace memory and knowledge

### Vutler Local → OpenClaw

Want the general-purpose runtime without Vutler dependencies:

1. **Install OpenClaw:**
   ```bash
   npm install -g openclaw
   ```
2. **Copy relevant config** (LLM keys, tool settings)
3. **Export Snipara memories** to local `MEMORY.md` files
4. Configure OpenClaw channels (Discord, WhatsApp, etc.)

---

## Technical Differences

| Aspect | OpenClaw | Vutler Agent Local |
|--------|----------|-------------------|
| **Connection** | Gateway daemon (local HTTP) | WebSocket to remote workspace |
| **State** | Local files only | Local + synced to workspace |
| **Memory backend** | Flat files (Markdown) | Snipara MCP (PostgreSQL + vector search) |
| **Agent communication** | Sub-agent spawning (in-process) | AgentBus (Redis pub/sub, cross-network) |
| **Tool registration** | Skill system (SKILL.md files) | Server-side registry (PostgreSQL) |
| **Auth model** | Local config (no auth needed) | API key or OAuth2 to workspace |
| **Updates** | `npm update -g openclaw` | `vutler-agent update` (same mechanism) |
| **Telemetry** | None | Token usage + cost tracking to workspace |

---

## Summary

| I want to... | Use |
|---|---|
| Run a personal AI assistant with Discord/WhatsApp | **OpenClaw** |
| Connect an agent to my Vutler team workspace | **Vutler Agent Local** |
| Have agents collaborate on tasks across a team | **Vutler Agent Local** |
| Build my own agent platform | **OpenClaw** (as infrastructure) |
| Use both personal + team agents | **Both** (they coexist) |
| Self-host everything with no external dependencies | **OpenClaw** |
| Get usage tracking and billing per agent | **Vutler Agent Local** |
