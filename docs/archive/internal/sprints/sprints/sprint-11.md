# Sprint 11 — Agent Autonomy: Email, Tools, Multi-Agent

**Started:** 2026-02-17 20:20 CET
**Goal:** Give agents real email, tool use, multi-agent routing, API docs, PWA

## Mike (Backend) — 18 SP

### S11.1 — Haraka Email Server Setup (5 SP)
- Deploy Haraka (Node.js SMTP server) in Docker alongside Vutler stack
- Configure MX records for vutler.ai → VPS IP (83.228.222.180)
- Catch-all: any email to *@vutler.ai routes to Haraka
- Haraka webhook plugin: on email received → POST to Vutler API
- Add to docker-compose.yml: haraka service, port 25/587
- Create API endpoint: `POST /api/v1/email/inbound-webhook` that:
  1. Parses sender, to, subject, body
  2. Extracts agent username from "to" address (e.g., adam@vutler.ai → adam)
  3. Routes to agent's LLM for processing
  4. Agent replies via Haraka SMTP send
- Also create: `POST /api/v1/email/send` (agent sends email)
- Setup agent emails: jarvis@, mike@, philip@, luna@, adam@ etc.
- DKIM + SPF records for deliverability

### S11.2 — Agent Tools Framework (5 SP)
- Implement Anthropic tool_use (function calling) in llmRouter.js
- Tool registry in services/tools.js:
  - `web_search` — search the web via Brave API or SearXNG
  - `http_request` — make HTTP GET/POST requests (with URL allowlist)
  - `calculator` — evaluate math expressions safely
  - `read_file` — read workspace files (sandboxed)
  - `send_email` — send email via S11.1
- Per-agent tool config in PG: `agent_tools` table (agent_id, tool_name, enabled, config)
- In agentRuntime.js: pass tools array to LLM, handle tool_use responses, execute tool, return result
- Security: URL allowlist for http_request, no arbitrary code execution (yet)

### S11.3 — Multi-Agent Routing (3 SP)
- When an agent receives a message mentioning another agent (@mike, @luna, etc.)
- Or when the LLM response includes a handoff directive
- Route the conversation to the mentioned agent
- Implement in agentRuntime.js:
  1. Parse @mentions in user messages
  2. If mention found, check if mentioned agent is assigned to a channel
  3. Forward message to mentioned agent, or post "Let me pass this to @mike"
  4. Coordinator pattern: the first agent can delegate subtasks

### S11.4 — API Documentation (3 SP)
- Install swagger-jsdoc + swagger-ui-express
- Add JSDoc annotations to all API routes
- Serve Swagger UI at /api/docs
- Document all endpoints: agents, channels, onboarding, workspace, LLM providers, usage, email
- Include auth instructions (X-Auth-Token + X-User-Id headers)
- Add examples for common flows (create agent, assign channel, send message)

### S11.5 — Real-time Monitoring (2 SP)
- Track in memory: messages_processed, avg_response_time, errors_count, active_agents
- WebSocket endpoint: /ws/stats — push stats every 5s
- Expose via REST: GET /api/v1/stats (for dashboard)
- Log slow responses (>10s) as warnings

## Philip (Frontend) — 8 SP

### S11.6 — PWA Mobile Support (3 SP)
- Add manifest.json to RC custom assets:
  - name: "Vutler", short_name: "Vutler", theme_color: #0a0f1e, background_color: #0a0f1e
  - Icons: Vutler icosahedron 192px + 512px
  - display: "standalone", start_url: "/"
- Add service worker for offline caching (cache static assets)
- Add meta tags for mobile: viewport, apple-mobile-web-app-capable
- Register service worker in RC custom script
- Test: "Add to Home Screen" on iOS/Android should work

### S11.7 — Agent Tools UI (3 SP)
- In agent-detail.html, add "Tools" section after Channels
- Show available tools with toggle switches (enabled/disabled per agent)
- Tool list fetched from new API: GET /api/v1/tools (returns available tools)
- Save via: PUT /api/v1/agents/:id/tools
- Each tool shows: name, description, icon, enabled toggle

### S11.8 — API Docs Link + Dashboard Stats (2 SP)  
- Add "📚 API Docs" link on admin dashboard → /api/docs
- Real-time stats cards: messages/hour, avg response time, error rate
- Fetch from GET /api/v1/stats
- Auto-refresh every 10s

## VPS Context
- IP: 83.228.222.180, SSH key: `.secrets/vps-ssh-key.pem`
- Source: `/home/ubuntu/vutler/app/custom/`
- Rebuild: `cd /home/ubuntu/vutler && docker compose up -d --build vutler-api`
- Docker compose: `/home/ubuntu/vutler/docker-compose.yml`
- RC admin: alopez3006 / Roxanne1212**##
- Domain: vutler.ai (DNS managed at registrar)
- Current MX: probably Infomaniak — need to check/change to VPS IP for Haraka

## Notes from Alex
- Email server: dedicated setup, NOT K-Suite (agents need webhooks/API, not human UI)
- Haraka chosen: Node.js (same stack), lightweight, plugin-based
- Tools framework: use Anthropic tool_use API
- Code execution (RLM-Runtime): deferred to Sprint 12
- Billing study: deferred to Sprint 12
