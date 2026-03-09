# Snipara ↔ Vutler Agent Synchronization Guide

> **Date:** 2026-03-02  
> **Status:** Configuration ready — agents can be synced to Snipara swarm  
> **API Key:** `${SNIPARA_API_KEY}`  
> **Project ID:** `cmlunio5v00016imvktf58v0b`  
> **Project Slug:** `vutler`

---

## 🎯 Overview

All Vutler agents are now configured to sync with Snipara's swarm system. Each agent has:
- Its own **SOUL.md** (persona + role-specific configuration)
- Access to **shared knowledge** (AGENTS.md, TOOLS.md, CODING_STANDARDS.md)
- **Personal memory** synced from `memory/` directory
- **Swarm coordination** tools for multi-agent collaboration

---

## 📋 Agent Configuration

| Agent | Role | Model | Skills | Memory Files |
|-------|------|-------|--------|--------------|
| **Jarvis** | Lead Architect | Claude Opus 4 | system-architect, dev-story-executor | All memory |
| **Mike** | Lead Engineer | Kimi K2.5 | dev-story-executor, system-architect | `kimi-k2.5-*.md`, `vutler-bugs-*.md` |
| **Philip** | UI/UX Designer | Claude Sonnet 4 | product-vision-builder | Design docs |
| **Luna** | Product Manager | Claude Sonnet 4 | product-vision-builder, agile-story-master | `bmad-*.md`, `dev-workflow-*.md` |
| **Marcus** | Full-Stack Dev | Claude Sonnet 4 | dev-story-executor | Frontend docs |
| **Rex** | DevOps | Claude Haiku | system-architect | `rex-*.md`, monitoring |
| **Andrea** | Office Manager | Claude Sonnet 4 | product-vision-builder | Legal/compliance |
| **Sarah** | Content Writer | Claude Haiku | — | Documentation |
| **Leo** | QA Engineer | Claude Haiku | dev-story-executor | Test reports |
| **Nina** | Data Analyst | Claude Sonnet 4 | system-architect | Analytics |

---

## 🔧 MCP Configuration

### Local (`.mcp.json`)
```json
{
  "mcpServers": {
    "snipara-vutler": {
      "command": "npx",
      "args": ["-y", "@snipara/mcp@latest"],
      "env": {
        "SNIPARA_API_KEY": "${SNIPARA_API_KEY}",
        "SNIPARA_PROJECT_ID": "cmlunio5v00016imvktf58v0b",
        "SNIPARA_PROJECT_SLUG": "vutler"
      }
    }
  }
}
```

### Environment Variables
```bash
export SNIPARA_API_URL="https://api.snipara.com"
export SNIPARA_API_KEY="${SNIPARA_API_KEY}"
export SNIPARA_PROJECT_ID="cmlunio5v00016imvktf58v0b"
export SNIPARA_PROJECT_SLUG="vutler"
```

---

## 🚀 Synchronization Script

### Usage
```bash
# Sync all agents to Snipara
node scripts/sync-agents-to-snipara.js
```

### What Gets Synced
1. **Agent SOUL.md** — Generated from base SOUL + agent-specific config
2. **Shared files** — AGENTS.md, TOOLS.md, CODING_STANDARDS.md, SECURITY.md, TODO.md
3. **Agent memory** — Matched files from `memory/` directory
4. **Swarm configuration** — Coordination setup for multi-agent tasks

---

## 🧠 Available Snipara Tools

### Context & Knowledge
| Tool | Purpose |
|------|---------|
| `rlm_context_query` | Query knowledge base (default for questions) |
| `rlm_ask` | Simple Q&A on docs |
| `rlm_search` | Regex search |
| `rlm_load_document` | Load full document |
| `rlm_load_project` | Load entire project context |

### Memory
| Tool | Purpose |
|------|---------|
| `rlm_remember` | Store memory (fact, decision, learning, preference, todo) |
| `rlm_recall` | Semantic memory search |
| `rlm_memories` | List/filter memories |
| `rlm_forget` | Delete memory |

### Swarm Coordination
| Tool | Purpose |
|------|---------|
| `rlm_swarm_create` | Create swarm for multi-agent task |
| `rlm_swarm_join` | Join existing swarm |
| `rlm_claim` / `rlm_release` | Resource locking |
| `rlm_state_get` / `rlm_state_set` | Shared state |
| `rlm_broadcast` | Send event to all swarm members |
| `rlm_task_create` / `rlm_task_claim` / `rlm_task_complete` | Distributed task queue |

---

## 📁 File Structure on Snipara

```
vutler/
├── agents/
│   ├── jarvis/
│   │   ├── SOUL.md          # Agent-specific persona
│   │   ├── shared/
│   │   │   ├── AGENTS.md
│   │   │   ├── TOOLS.md
│   │   │   └── ...
│   │   └── memory/
│   │       ├── 2026-03-01.md
│   │       └── ...
│   ├── mike/
│   │   ├── SOUL.md
│   │   └── ...
│   └── ... (9 agents total)
└── swarm/
    └── vutler-team/         # Swarm configuration
```

---

## 🔗 Swarm Workflow

### Creating a Multi-Agent Task
```javascript
// 1. Create swarm
rlm_swarm_create({
  name: "Sprint-12-Feature",
  agents: ["jarvis", "mike", "philip"],
  goal: "Implement Pixel Office v2"
})

// 2. Create tasks
rlm_task_create({
  swarm: "Sprint-12-Feature",
  title: "Backend API for positions",
  assignee: "mike",
  priority: "high"
})

// 3. Agents claim and complete
rlm_task_claim({ taskId: "..." })  // Mike claims
rlm_task_complete({ taskId: "...", result: "..." })  // Mike completes

// 4. Broadcast updates
rlm_broadcast({
  swarm: "Sprint-12-Feature",
  event: "task_completed",
  data: { taskId: "...", agent: "mike" }
})
```

---

## 📝 Best Practices

### For Agents
1. **Always `rlm_context_query`** before answering project questions
2. **`rlm_remember`** decisions, preferences, learnings
3. **`rlm_claim`** before modifying shared files
4. **Use `rlm_broadcast`** to notify swarm of important changes

### For Humans (Alex)
1. **Run sync script** after major documentation updates
2. **Check `memory/`** — agents read daily files for context
3. **Use swarm tasks** for cross-agent collaboration
4. **Review agent memories** periodically for accuracy

---

## ⚡ Quick Commands

```bash
# Full sync
node scripts/sync-agents-to-snipara.js

# Check sync status
curl -H "X-API-Key: $SNIPARA_API_KEY" \
  https://api.snipara.com/mcp/vutler/status

# Query agent knowledge
curl -X POST -H "X-API-Key: $SNIPARA_API_KEY" \
  -d '{"method":"tools/call","params":{"name":"rlm_context_query","arguments":{"query":"What is the Pixel Office architecture?"}}}' \
  https://api.snipara.com/mcp/vutler
```

---

## 🔐 Security Notes

- API key has **project-scoped access** only
- No write access outside `vutler` project
- Memory files are **agent-isolated** (Jarvis can't see Mike's private notes unless shared)
- All sync operations are **logged** for audit

---

## 📊 Current Status

| Component | Status |
|-----------|--------|
| MCP Configuration | ✅ Ready |
| Sync Script | ✅ Ready |
| 10 Agents Configured | ✅ Ready |
| Shared Knowledge | ✅ Ready |
| Memory Sync | ✅ Ready |
| Swarm Setup | ⏳ To be run |

---

**Next Step:** Run `node scripts/sync-agents-to-snipara.js` to sync all agents to Snipara.
