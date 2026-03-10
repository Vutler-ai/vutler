# Sprint 8 (Backlog) — n8n Workflow Engine Integration

**Priority:** P2 — Post Next.js migration
**Dependency:** Sprint 7 complete (Next.js frontend live)

## Vision
n8n devient le moteur d'automation de Vutler — chaque agent peut déclencher et exécuter des workflows via l'UI Vutler.

## Architecture
```
Vutler UI (Next.js) → Vutler API (Express) → n8n API (port 5678)
                                             ↓
                                        Workflows:
                                        - Email automation
                                        - Slack/Discord triggers
                                        - CRM pipelines
                                        - Scheduled tasks
                                        - Agent-to-agent chains
```

## Epic: n8n Integration (21 pts)

### Story 8.1: n8n Docker Setup (3 pts)
- n8n container on VPS (port 5678, internal only)
- PostgreSQL backend (reuse vutler-postgres)
- n8n-mcp server configured for agent access
- Nginx: n8n.vutler.ai (admin only) or internal-only

### Story 8.2: Workflow Templates for Agents (5 pts)
- Pre-built workflows: email triage, lead scoring, content publishing, support ticket routing
- Agent trigger nodes (webhook per agent)
- Vutler API credential node

### Story 8.3: Vutler UI — Workflow Manager (5 pts)
- `/workflows` page in Next.js app
- List/create/enable/disable workflows
- Visual status (running, paused, error)
- Execution history per workflow
- Link workflows to specific agents

### Story 8.4: Agent Runtime ↔ n8n Bridge (5 pts)
- Agent actions trigger n8n webhooks
- n8n results feed back to agent context
- Error handling + retry logic
- Token metering for workflow executions

### Story 8.5: n8n-MCP Integration (3 pts)
- Install n8n-mcp (github.com/czlonkowski/n8n-mcp)
- Configure as MCP server for Mike + Andrea
- Agents can create/modify workflows via natural language

## Use Cases
1. **Andrea** — Auto-triage incoming emails → route to right agent
2. **Victor** — Lead comes in → CRM update → follow-up email → Slack notify
3. **Nora** — Discord message → sentiment analysis → auto-response or escalate
4. **Mike** — GitHub PR → run tests → deploy → notify team
5. **Max** — Schedule social posts → publish → track engagement → report

## Resources
- n8n Docker: https://docs.n8n.io/hosting/installation/docker/
- n8n-MCP: https://github.com/czlonkowski/n8n-mcp
- n8n API: https://docs.n8n.io/api/
