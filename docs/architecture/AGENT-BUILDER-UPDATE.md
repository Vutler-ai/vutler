# Agent Builder Update - Architecture Changes

**Date:** 2026-02-16  
**Author:** AI Architecture Team  
**Status:** Approved  
**Impact:** Major feature addition (MVP scope)

---

## Summary

Vutler now supports **creating agents** directly within the platform, not just hosting existing agents.

### Double Offering

1. **"Bring your agents"** — API/SDK to connect existing agents (OpenClaw, LangChain, CrewAI)
2. **"Build your agents"** (NEW) — Create agents directly in Vutler with templates, UI builder, and OpenClaw runtime

---

## Key Changes

### 1. New Component: Agent Builder Module

**Location:** `Component 10` in system-architecture.md

**Features:**
- **Agent Templates**: Pre-configured blueprints (Customer Support, Data Analyst, Code Reviewer)
- **Agent Configuration**: UI/API to configure model (GPT-4, Claude), tools (web search, file access), personality
- **Runtime Launcher**: Start/stop agents in Docker containers (OpenClaw instances)
- **Lifecycle Management**: Health checks, restart policies, resource limits, logs

**Technologies:**
- TypeScript, Docker SDK (dockerode), OpenClaw CLI
- Docker for container orchestration

---

### 2. API Endpoints (api-design.md)

**New endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/builder/agents` | POST | Create agent from template or custom config |
| `/builder/templates` | GET | List available templates |
| `/builder/templates/:id` | GET | Get template details |
| `/builder/templates` | POST | Create custom template (admin) |
| `/agents/:id/config` | GET | Get agent config |
| `/agents/:id/config` | PUT | Update agent config |
| `/agents/:id/start` | POST | Start agent runtime |
| `/agents/:id/stop` | POST | Stop agent runtime |
| `/agents/:id/restart` | POST | Restart agent |
| `/agents/:id/runtime` | GET | Get runtime status & health |
| `/agents/:id/logs` | GET | Get agent logs |

**Example request (create agent):**
```json
POST /builder/agents
{
  "name": "Support Bot",
  "template_id": "template-customer-support",
  "config": {
    "model": "anthropic/claude-sonnet-4",
    "tools": ["email", "knowledge_base"],
    "personality": "helpful, patient"
  },
  "auto_start": true
}
```

---

### 3. Database Schema (database-schema.md)

**New tables:**

1. **`agent_templates`** — Pre-configured agent blueprints
   - `id`, `name`, `description`, `icon`, `category`, `base_config` (JSONB), `customizable_fields`
   - Seed with 3 default templates: Customer Support, Data Analyst, Code Reviewer

2. **`agent_configs`** — Configuration for each created agent
   - `agent_id`, `model`, `system_prompt`, `tools[]`, `personality`, `runtime_type`, `resource_limits` (JSONB)
   - One config per agent

3. **`agent_runtime_state`** — Runtime state and health
   - `agent_id`, `status` (stopped/starting/running/error), `container_id`, `health`, `last_heartbeat`, `uptime_seconds`, `cpu_percent`, `memory_mb`
   - Background job monitors health, auto-restarts unhealthy agents

4. **`agent_logs`** — Runtime logs
   - `agent_id`, `timestamp`, `level` (DEBUG/INFO/WARN/ERROR), `message`, `source` (runtime/agent/system)
   - Keep last 7 days, archive older to S3

---

### 4. OpenClaw Integration (integration-snipara-vaultbrix.md)

**New section: OpenClaw Integration**

**How it works:**
1. User creates agent via Agent Builder
2. Vutler launches OpenClaw Docker container with agent config
3. Container receives env vars: `AGENT_ID`, `VUTLER_API_KEY`, `LLM_MODEL`, `SYSTEM_PROMPT`, `TOOLS`, etc.
4. OpenClaw agent auto-connects to Vutler (WebSocket DDP)
5. Agent joins channels, listens for messages, responds autonomously
6. Vutler monitors health via Docker healthcheck (every 30s)
7. Admin can start/stop/restart agents via UI or API

**Runtime architecture:**
```
Vutler Agent Builder → Docker API → Create container (openclaw/runtime:latest)
                                 ↓
                            Pass env vars (agent config)
                                 ↓
                            Start container
                                 ↓
                            Monitor health (heartbeat, logs)
                                 ↓
                            Auto-restart if unhealthy
```

**Resource limits (per agent):**
- CPU: 0.5 cores (default), max 2 cores
- Memory: 512 MB (default), max 2 GB
- Storage: 1 GB workspace volume

**Security:**
- Agents run in isolated Docker containers
- No direct database access (only via API)
- API key per agent (scoped permissions)
- Tool restrictions (exec requires explicit permission)

---

## Runtime Decision (MVP)

### Chosen Approach: OpenClaw Containers

**Why:**
- ✅ Reuses existing OpenClaw infrastructure
- ✅ Full agent capabilities (tools, MCP, context, autonomy)
- ✅ Proven in production (OpenClaw already runs agents in containers)
- ✅ Easy to scale (Docker orchestration)

**Fallback:** Direct LLM API for simple agents without tools (`runtime_type = 'llm_api'`)
- Lower resource usage, faster startup
- Use case: FAQ bots, greeting bots, simple Q&A

**Post-MVP:** Plugin system for multiple runtimes
- LangChain agents
- CrewAI agents
- Custom runtimes

---

## MVP Scope (2 months)

### In Scope
- [x] Agent Builder UI (create agent from template)
- [x] 3 default templates (Customer Support, Data Analyst, Code Reviewer)
- [x] OpenClaw container launcher
- [x] Agent lifecycle (start/stop/restart)
- [x] Health monitoring (Docker healthcheck)
- [x] Basic log collection
- [x] API endpoints for agent management

### Out of Scope (Post-MVP)
- [ ] Custom template editor (advanced)
- [ ] Multi-runtime support (LangChain, CrewAI)
- [ ] Agent marketplace (public templates)
- [ ] Advanced monitoring dashboard
- [ ] Agent collaboration (swarms)
- [ ] Cost tracking per agent

---

## Migration Path

**No breaking changes** — This is purely additive.

**Migration steps:**
1. Create new tables (`agent_templates`, `agent_configs`, `agent_runtime_state`, `agent_logs`)
2. Seed default templates
3. Deploy Agent Builder API endpoints
4. Deploy Agent Builder UI (React component)
5. Install Docker SDK (dockerode) dependency
6. Configure Docker socket access for Vutler app

**Rollback:** Simply don't use Agent Builder — existing agent functionality unchanged.

---

## Testing Strategy

### Unit Tests
- Agent Builder service (create/start/stop/restart)
- Template CRUD operations
- Config validation (model, tools, personality)

### Integration Tests
- Docker container creation & startup
- Health check monitoring
- Log collection
- API key generation

### E2E Tests
1. Create agent from template
2. Agent auto-starts, joins channels
3. Agent responds to message
4. Stop agent via API
5. Restart agent, verify config applied

---

## Monitoring & Alerts

**Metrics to track:**
- Active agents (running count)
- Container health (healthy/unhealthy)
- Resource usage per agent (CPU%, memory)
- Agent errors (restart count, error count)

**Alerts:**
- Agent unhealthy for > 5 min → Auto-restart
- Host CPU > 90% → Slack alert (stop idle agents)
- Agent error rate > 10% → PagerDuty

---

## Open Questions

1. **LLM API keys**: Where to store? (Env vars, Vaultbrix encrypted column, Vault)
   - **Proposed:** Vaultbrix encrypted column (pgcrypto) for MVP, Vault post-MVP

2. **Agent workspace persistence**: Docker volume vs MinIO?
   - **Proposed:** Docker volume (simpler), MinIO backup (daily)

3. **Multi-tenancy**: How to isolate agents across teams?
   - **Proposed:** MVP = single team, post-MVP = tenant_id column + RLS

4. **Cost tracking**: How to track LLM API costs per agent?
   - **Proposed:** Post-MVP feature (log token usage, calculate cost)

---

## Files Modified

1. **system-architecture.md**
   - Added Component 10: Agent Builder Module
   - Updated "What's in scope" (Agent Builder + Runtime)
   - Added decision: OpenClaw containers for MVP

2. **api-design.md**
   - Added section: Agent Builder (11 new endpoints)
   - Templates CRUD, agent config, lifecycle (start/stop/restart), runtime status, logs

3. **database-schema.md**
   - Added 4 tables: `agent_templates`, `agent_configs`, `agent_runtime_state`, `agent_logs`
   - Added seed data (3 default templates)

4. **integration-snipara-vaultbrix.md**
   - Added section 8: OpenClaw Integration
   - Docker container management, lifecycle, health monitoring, log collection

---

## Next Steps

1. **Week 1: Database & API**
   - Create migration (4 new tables)
   - Seed default templates
   - Implement API endpoints (start with templates CRUD)

2. **Week 2: Docker Integration**
   - Implement Docker container launcher
   - Test agent startup & health monitoring
   - Implement start/stop/restart logic

3. **Week 3: UI**
   - Agent Builder UI (template picker, config form)
   - Agent management dashboard (start/stop buttons, logs viewer)

4. **Week 4: Testing & Polish**
   - E2E tests (create agent → responds to messages)
   - Performance testing (10 concurrent agents)
   - Documentation (user guide, admin guide)

---

## Success Criteria

- [ ] Admin can create agent from template in < 30 seconds
- [ ] Agent auto-starts within 60 seconds of creation
- [ ] Agent responds to messages in channels
- [ ] Health monitoring detects unhealthy agents
- [ ] Logs are accessible via UI and API
- [ ] 3 default templates work out of the box
- [ ] Documentation complete (API docs, user guide)

---

## Questions?

Contact: Alex Lopez (@alex) or AI Architecture Team

**Feedback welcome!** This is a major feature — let's iterate and make it great. 🚀
