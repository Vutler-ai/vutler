# Sprint 11 — Agent Autonomy & Infrastructure (DRAFT)

**Goal:** Give agents real email, tools, API docs, and multi-agent capabilities

## Priority Stories

### S11.1 — Agent Email Functional (5 SP) — Mike
- Configure real email delivery for @vutler.ai domain
- Each agent gets a working inbox (receive + send)
- jarvis@vutler.ai, mike@vutler.ai, philip@vutler.ai, etc.
- IMAP/SMTP via Infomaniak mail or custom MX records
- Agents can use email to sign up for services, receive verification codes
- Email notification when new mail arrives → agent processes it

### S11.2 — Agent Tools Framework (5 SP) — Mike
- Tool registry: web search, HTTP requests, file read/write, calculator
- Tools are callable by agents during LLM conversations
- Use Anthropic tool_use API (function calling)
- Start with: web_search, http_request, read_file, calculator
- Agent config: which tools each agent has access to

### S11.3 — RLM-Runtime Code Execution (5 SP) — Mike
- Integrate Snipara RLM-Runtime for sandboxed code execution
- Agents can run Python/Node.js code in isolated containers
- Results returned to conversation
- Customise RLM-Runtime for Vutler's needs

### S11.4 — Multi-Agent Routing (3 SP) — Mike
- When a message mentions another agent or needs escalation
- Route to the right agent based on content/skills
- Basic handoff: "Let me pass this to @mike for the technical part"
- Coordinator agent pattern

### S11.5 — API Documentation (3 SP) — Oscar + Mike
- Auto-generate OpenAPI/Swagger docs from Express routes
- Serve at /api/docs (Swagger UI)
- Document all endpoints: agents, channels, onboarding, workspace, usage, LLM
- Include auth instructions and examples

### S11.6 — PWA Mobile (3 SP) — Philip
- Add PWA manifest to RC (service worker, manifest.json)
- App icon = Vutler icosahedron
- Install prompt on mobile browsers
- Offline: show cached messages
- Push notifications via service worker

### S11.7 — Billing Study (2 SP) — Victor + Luna
- Benchmark: ChatGPT Teams ($30/user), Claude Teams ($30/user), Intercom ($74/seat)
- Define Vutler pricing tiers with included LLM credits
- Document: what's free (self-hosted), what's paid (hosted)
- Output: pricing-study.md in docs/

### S11.8 — Real-time Monitoring Dashboard (3 SP) — Mike + Philip
- WebSocket-based live stats on admin dashboard
- Active agents count, messages/hour, avg response time, error rate
- Auto-refresh every 5s
- Alert if agent is down or error rate > threshold

## Alex's Feedback
- Code execution: use RLM-Runtime (Snipara) — customise it
- Mobile: PWA first, native app later
- Billing: study first, implement after
- Email: critical enabler — agents need real email to sign up for services
- Multi-agent and tools: very important, prioritise
