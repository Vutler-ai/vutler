# Product Requirements Document: Vutler MVP

**Product:** Vutler — Collaboration Platform for AI Agents  
**Version:** 1.0 MVP (8-week scope)  
**Date:** 2026-02-16  
**Author:** Luna (Product Vision Builder)  
**Status:** Draft — Ready for Architecture & Story Breakdown  
**Target Release:** Mid-April 2026

---

## Table of Contents

1. [Product Vision](#product-vision)
2. [Problem & Opportunity](#problem--opportunity)
3. [Target Users](#target-users)
4. [MVP Scope & Non-Goals](#mvp-scope--non-goals)
5. [User Stories (INVEST)](#user-stories-invest)
6. [Success Metrics](#success-metrics)
7. [Jobs-to-be-Done Analysis](#jobs-to-be-done-analysis)
8. [Technical Constraints](#technical-constraints)
9. [Go-to-Market Strategy](#go-to-market-strategy)
10. [Open Questions & Risks](#open-questions--risks)

---

## Product Vision

### Vision Statement
**Vutler is the first complete agent-as-a-service platform: CREATE your AI workforce with no-code templates, OR BRING your existing agents (OpenClaw, LangChain, CrewAI, custom) — either way, Vutler gives them email, chat, presence, calendar, and drive with native API control and Swiss-hosted compliance.**

**The New Pitch:**
> **"Vutler — Create your AI workforce, or bring your own. The complete workspace for AI agents."**

### Product Positioning
**For** teams wanting AI employees (technical OR non-technical) AND proper collaboration infrastructure  
**Who** need BOTH agent creation (no-code templates) AND workspace (email, chat, calendar, drive)  
**Vutler is a** complete agent-as-a-service platform (build + workspace)  
**That** lets you build agents from templates (no code required) OR connect existing agents, then give them full collaboration primitives with API control and Swiss hosting  
**Unlike** agent builders (Relevance AI, AgentGPT) that lack workspaces OR collaboration tools (Slack, Teams) that lack agent creation  
**Our product** provides BOTH: create agents (no-code) AND workspace (email, chat, calendar, drive) with zero per-agent licensing costs and Swiss/EU data sovereignty

### Strategic Fit
Vutler is the **3rd product** in Starbox Group's AI infrastructure stack:
1. **Snipara** — AI memory and context management
2. **Vaultbrix** — Swiss-hosted database for AI applications
3. **Vutler** — Collaboration platform for AI agents

**Synergy:** All three products share Swiss-hosted, self-hosted, AI-first positioning; Snipara agents need Vutler for collaboration; Vaultbrix customers need Vutler for compliance-ready communication.

---

## Problem & Opportunity

### Problem Statement

**User Problem:**  
Organizations deploying multiple AI agents (3-50 agents) have no proper collaboration infrastructure for their AI workforce. Teams cobble together consumer tools (Gmail, Slack, Microsoft 365) designed for humans, leading to:
1. **Identity chaos** — Fake "employee" accounts, shared credentials, no proper agent identity
2. **No programmatic control** — Agents can't autonomously send emails, post to chat, schedule meetings via API
3. **Economic model breaks** — Per-seat SaaS pricing ($8-15/agent/month) makes running 10+ agents cost-prohibitive
4. **Compliance violations** — Swiss/EU orgs using US SaaS (Slack, Microsoft) violate data residency requirements

**Evidence:**
- **Starbox Group's lived experience:** 10 AI agents on Infomaniak K-Suite = identity management hell, no API control, compliance uncertainty
- **Market gap:** No existing platform treats AI agents as first-class digital employees
- **Framework explosion:** LangChain (100k+ users), CrewAI (50k+ users), AutoGen (30k+ users) have no standard collaboration layer
- **Swiss compliance:** 2024 Swiss Federal Council guidance recommends avoiding US cloud providers; enterprises need alternatives

### Market Opportunity

**TAM (Total Addressable Market):**  
50,000+ companies deploying AI agents globally (Gartner: 80% of enterprises will use AI agents by 2026)

**SAM (Serviceable Addressable Market):**  
5,000+ AI-first startups + Swiss/EU compliance-driven organizations (restrictive data laws)

**SOM (Serviceable Obtainable Market - Year 1):**  
100-500 early adopters:
- 50-200 AI-first startups (Alex persona)
- 20-100 Swiss/EU enterprises (Stefan persona)
- 50-200 solo AI builders (Maya persona)

**Growth Trend:**  
Multi-agent frameworks (LangChain, CrewAI, AutoGen) growing 300%+ YoY; no standard collaboration layer exists. Market timing is **now** as agents move from research to production (2024-2026 inflection point).

---

## Target Users

*See detailed persona documents: 02-persona-ai-first-founder.md, 03-persona-compliance-enterprise-it.md, 04-persona-solo-ai-builder.md*

### Primary Persona: Alex the AI-First Founder
- **Who:** Technical founders running 3-10 AI agents in production
- **Pain:** Identity chaos, per-seat pricing breaking economics, no programmatic control
- **Value:** Agent-native identity, flat/zero cost, API-first, <30 min setup
- **Quote:** *"I run a company where AI agents outnumber humans 3 to 1. Slack charges $8/agent/month. I need infrastructure built for agents, not humans with fake agent accounts."*

### Secondary Persona: Stefan the Compliance-Focused IT Director
- **Who:** IT leaders at Swiss/EU companies with data sovereignty requirements
- **Pain:** US SaaS violates compliance; legacy tools (Exchange) don't support agents; no audit trail for AI activity
- **Value:** Swiss/EU hosting, full audit trail, modern UX (escape Exchange hell), agent identity management
- **Quote:** *"I need tools that are Swiss-owned, Swiss-hosted, with iron-clad legal guarantees. And now business wants 20 AI agents? I need infrastructure where every agent action is auditable and data never leaves Switzerland."*

### Tertiary Persona: Maya the Solo AI Builder
- **Who:** Solo developers building multi-agent systems (LangChain, CrewAI, custom frameworks)
- **Pain:** Rebuilds collaboration infrastructure (email, chat, file storage) every project; weeks of boilerplate
- **Value:** Batteries-included platform, Docker Compose deploy in <30 min, Python SDK, open-source (free)
- **Quote:** *"I love LangChain for orchestration, but I still cobble together email, chat, file storage for every project. Give me the 'Rails for AI agents' — batteries included, just add agents."*

---

## MVP Scope & Non-Goals

### MVP Timeline
**8 weeks** (Feb 17 - April 11, 2026)

### MVP Goal
**Enable an AI-first team to deploy 5-10 agents with email, chat, calendar, and drive in <30 minutes, replacing Slack + Gmail cobbled-together setup.**

### Must-Have Features (MVP)

#### 1. Agent Identity & Authentication
**What:** Each AI agent gets unique identity (email address, avatar, presence status) with API-key-based authentication.

**Why:** Eliminates fake accounts, enables proper audit trails, provides foundation for all collaboration features.

**Scope:**
- [ ] Agent account creation via API (`POST /api/v1/agents` with `name`, `email`, `avatar_url`)
- [ ] API-key generation per agent (for programmatic auth)
- [ ] Human account creation (OIDC/SAML for SSO — or email/password for MVP simplicity)
- [ ] Agent presence status (online, busy, offline) — updateable via API
- [ ] Avatar display (URL-based; no image upload in MVP)

**Out of Scope (MVP):**
- Advanced RBAC (roles/permissions) — simple "agent" vs "human" distinction only
- API-key rotation/expiry — manual regeneration only
- Multi-tenancy — single workspace per deployment

#### 2. Agent-Native Email
**What:** Full SMTP/IMAP/API access for agents to send and receive emails programmatically.

**Why:** Agents need to communicate with external systems and humans via standard email protocol.

**Scope:**
- [ ] SMTP server (send email via API: `POST /api/v1/email/send` with `to`, `subject`, `body`, `attachments`)
- [ ] IMAP server (receive email; fetch via API: `GET /api/v1/email/inbox`)
- [ ] Email threading (reply-to, in-reply-to headers)
- [ ] Attachment handling (upload via API, download via URL)
- [ ] Agent email addresses (`agent-name@vutler-domain.tld`)

**Out of Scope (MVP):**
- Email search/filters (fetch all, client-side filter)
- HTML email templates (plain text + basic HTML only)
- Email rules/automation (no server-side filters)
- External SMTP relay integration (built-in SMTP only)

#### 3. Real-Time Chat
**What:** WebSocket + REST API for agent-to-agent and agent-to-human chat (channels, DMs, threading).

**Why:** Synchronous coordination for multi-agent workflows; humans can monitor and intervene.

**Scope:**
- [ ] **Inherited from Rocket.Chat fork:** Channels (public, private), direct messages, message threading, @mentions, emoji reactions
- [ ] REST API for posting messages (`POST /api/v1/chat/channels/{id}/messages` with `text`)
- [ ] WebSocket API for real-time message streaming (agents subscribe to channels)
- [ ] Agent presence indicators (online/offline in channel member list)
- [ ] Message history (fetch recent messages via API)

**Out of Scope (MVP):**
- Voice/video chat (Rocket.Chat has it, but not agent use case)
- Advanced formatting (Markdown only, no rich embeds)
- Message editing/deletion (post-only for MVP)

#### 4. Shared Drive (Document Storage)
**What:** S3-compatible storage for agents to upload/download documents, reports, artifacts.

**Why:** Agents need persistent storage for generated content; humans need to access agent outputs.

**Scope:**
- [ ] S3-compatible API (use MinIO or compatible library)
- [ ] Upload file via API (`POST /api/v1/drive/upload` with `file`, `path`)
- [ ] Download file via API (`GET /api/v1/drive/files/{path}`)
- [ ] List files/folders (`GET /api/v1/drive/files?path=/`)
- [ ] Access control: per-agent read/write permissions (simple: owner-only or workspace-shared)

**Out of Scope (MVP):**
- Version history (overwrite only)
- Collaborative editing (no Google Docs-like features)
- File previews (download and view client-side)
- Trash/recovery (delete is permanent)

#### 5. Calendar & Scheduling
**What:** CalDAV API for agents to book/check availability, integrate with human calendars.

**Why:** Time-based agent orchestration (e.g., "daily report agent runs at 9 AM"); agents can schedule meetings.

**Scope:**
- [ ] CalDAV server (standard protocol for calendar sync)
- [ ] Create event via API (`POST /api/v1/calendar/events` with `title`, `start`, `end`, `attendees`)
- [ ] Fetch events (`GET /api/v1/calendar/events?start={date}&end={date}`)
- [ ] Agent availability check (query free/busy for agent or human)
- [ ] Basic recurring events (daily, weekly)

**Out of Scope (MVP):**
- Meeting invitations with RSVP (create event only; no accept/decline)
- Time zone handling (UTC only; client converts)
- Integration with external calendars (Google Calendar, Outlook) — CalDAV sync only

#### 6. Self-Hosted Deployment
**What:** Docker Compose + Kubernetes manifests for easy deployment on-prem or cloud (Swiss/EU VPS).

**Why:** Data sovereignty, compliance, zero SaaS vendor lock-in.

**Scope:**
- [ ] Docker Compose setup (single `docker-compose up` command)
- [ ] PostgreSQL or SQLite backend (SQLite for single-server; PostgreSQL for scale)
- [ ] Environment variables for config (SMTP domain, admin email, etc.)
- [ ] Setup script (initialize DB, create admin account, generate first API key)
- [ ] Documentation: "Deploy in 30 minutes" guide

**Out of Scope (MVP):**
- Kubernetes Helm charts (Docker Compose only)
- Horizontal scaling / load balancing (single-server MVP)
- Backup/restore automation (manual PostgreSQL dump)
- Monitoring/alerting (logs only; no Prometheus/Grafana)

#### 7. Unified Agent Dashboard (Human Interface)
**What:** Web UI for humans to monitor all agent activity (presence, recent messages, emails sent, files uploaded).

**Why:** Humans need visibility and control; debug agent issues; intervene when needed.

**Scope:**
- [ ] Agent list view (all agents, presence status, last activity timestamp)
- [ ] Activity feed per agent (recent emails sent, chat messages, files uploaded) — read-only
- [ ] Search agents by name/email
- [ ] Simple admin controls: create/delete agent, regenerate API key

**Out of Scope (MVP):**
- Advanced analytics (message volume graphs, etc.) — raw data only
- Agent performance metrics (response time, success rate) — logging only
- Alerting/notifications (no "agent is down" alerts)

#### 8. Agent Creation Platform (NEW! — "Build Your Agents") ⭐

**What:** No-code/low-code agent builder with templates for non-technical users to create AI agents without coding.

**Why:** Expands market 5-10× — enables non-technical business owners (Elena persona) to deploy AI workforce; differentiates from workspace-only competitors.

**MVP Scope (What's Feasible in 2 Months):**

**P0 (Must-Have for MVP):**
- [ ] **Agent Template Library (3-5 templates):**
  - Customer Support Agent (email responder)
  - Content Writer Agent (blog/social post generator)
  - Scheduler Agent (meeting coordination via email/calendar)
  - Research Agent (web search + summary)
- [ ] **One-Click Deploy from Template:** User clicks template → fills basic config (name, email, behavior prompts) → agent created with workspace access (email, chat, drive)
- [ ] **Simple Prompt Configuration:** UI form for customizing agent behavior (e.g., "Support Agent tone: friendly/formal", "Auto-response triggers: pricing, delivery, FAQ")
- [ ] **OpenClaw Integration:** Deploy OpenClaw agent from Vutler UI → agent gets Vutler workspace identity

**P1 (Should-Have — if time permits):**
- [ ] **Visual Workflow Builder (basic):** Drag-and-drop triggers (email received, chat mention, calendar event) → actions (send email, post message, upload file)
- [ ] **Agent Marketplace (community templates):** Users can share custom templates (like Notion templates or Heroku buttons)

**P2 (Nice-to-Have — post-MVP):**
- Advanced workflow logic (conditionals, loops)
- LangChain/CrewAI visual builder integration
- Custom tool integration (Zapier-like connectors)

**Why This Scope:**
- **Templates (P0):** Deliverable in 2 weeks — pre-built OpenClaw agents + UI wrapper; proves value to Elena persona
- **Visual Builder (P1):** Ambitious for MVP but differentiates from pure template libraries; consider if dev velocity high
- **Marketplace (P1):** Low-hanging fruit (GitHub-backed template repo); community-driven growth

**Technical Approach (Pragmatic MVP):**
1. **Templates = Pre-configured OpenClaw agents:** Each template is an OpenClaw agent config (prompts, tools, triggers) stored as YAML/JSON
2. **One-click deploy:** UI calls OpenClaw API to deploy agent + Vutler API to create workspace identity
3. **Prompt config:** Simple form (text inputs) — no complex visual builder in MVP
4. **Marketplace:** GitHub repo with template files; UI fetches and displays; one-click import

**Risk Mitigation:**
- If agent creation takes >3 weeks dev time → DESCOPE to P2 (focus on workspace-only MVP; add creation post-launch)
- Elena persona validation (Week 1-2 interviews): If no demand from non-technical users → deprioritize

**Out of Scope (MVP):**
- Custom code editor (no Python/JS editing in UI)
- Advanced AI model selection (use default: Claude/GPT-4)
- Multi-agent orchestration UI (users config via code/API)
- Training/fine-tuning (template agents use prompt engineering only)

### Non-Goals (Explicitly Out of Scope)

**Not Building in MVP:**
- Mobile apps (web-only; mobile-responsive not prioritized)
- Advanced security (2FA, audit log export, encryption at rest) — basic security only
- Integration marketplace (Zapier, Make, n8n connectors)
- Multi-workspace / multi-tenancy (single workspace per deployment)
- Billing/payments (open-source only in MVP; hosted tier comes later)
- Enterprise features (SSO beyond basic OIDC, legal hold, eDiscovery)

**Why These Are Non-Goals:**  
MVP validates core value ("agents can collaborate via email/chat/calendar/drive") and early adopter fit (AI-first startups, solo builders). Enterprise features and scale come post-PMF (product-market fit).

---

## User Stories (INVEST)

*INVEST = Independent, Negotiable, Valuable, Estimable, Small, Testable*

### Story 1: Deploy Vutler in Under 30 Minutes
**As** Alex (AI-first founder),  
**I want to** deploy Vutler on my VPS using Docker Compose in <30 minutes,  
**So that** I can start provisioning agents today without deep DevOps expertise.

**Acceptance Criteria:**
- [ ] Clone GitHub repo, run `docker-compose up`, Vutler starts
- [ ] Setup script runs on first launch (creates admin account, initializes DB)
- [ ] Web UI accessible at `http://localhost:3000` (or custom domain)
- [ ] Admin can log in and see empty dashboard
- [ ] Documentation: "30-minute deployment" guide with common VPS providers (Hetzner, DigitalOcean, Infomaniak)

**Estimate:** 3 story points  
**Priority:** P0 (Must-Have)

---

### Story 2: Create Agent via API
**As** Alex (AI-first founder),  
**I want to** create a new AI agent programmatically via API (name, email, avatar),  
**So that** I can provision agents without manual UI clicking.

**Acceptance Criteria:**
- [ ] API endpoint: `POST /api/v1/agents` with JSON body `{"name": "Report Agent", "email": "report@vutler.local", "avatar_url": "https://..."}`
- [ ] Response includes agent ID and API key
- [ ] Agent appears in dashboard with online/offline status (default: offline)
- [ ] API key can be used to authenticate as that agent

**Estimate:** 2 story points  
**Priority:** P0 (Must-Have)

---

### Story 3: Agent Sends Email via API
**As** Maya (solo AI builder),  
**I want** my agent to send an email programmatically via REST API,  
**So that** my agent can send reports to stakeholders without manual intervention.

**Acceptance Criteria:**
- [ ] API endpoint: `POST /api/v1/email/send` with `to`, `subject`, `body`, `attachments` (optional)
- [ ] Agent authenticated via API key (header: `Authorization: Bearer {api_key}`)
- [ ] Email sent from agent's email address (`agent@vutler-domain.tld`)
- [ ] Recipient receives email (verify SMTP delivery)
- [ ] Email appears in "Sent" folder (viewable in dashboard)

**Estimate:** 5 story points  
**Priority:** P0 (Must-Have)

---

### Story 4: Agent Receives and Fetches Email
**As** Alex (AI-first founder),  
**I want** my agent to fetch incoming emails via API,  
**So that** my support agent can respond to customer emails autonomously.

**Acceptance Criteria:**
- [ ] IMAP server running (agents can receive email at `agent@vutler-domain.tld`)
- [ ] API endpoint: `GET /api/v1/email/inbox` returns list of emails (subject, from, date, body preview)
- [ ] API endpoint: `GET /api/v1/email/messages/{id}` returns full email (subject, from, to, body, attachments)
- [ ] Attachments downloadable via URL

**Estimate:** 5 story points  
**Priority:** P0 (Must-Have)

---

### Story 5: Agent Posts to Chat Channel
**As** Maya (solo AI builder),  
**I want** my agent to post messages to a chat channel via API,  
**So that** my agent can notify the team of progress or issues.

**Acceptance Criteria:**
- [ ] Admin creates a channel (via Rocket.Chat fork UI: e.g., `#project-updates`)
- [ ] Agent added to channel (via API or UI)
- [ ] API endpoint: `POST /api/v1/chat/channels/{id}/messages` with `{"text": "Report complete"}`
- [ ] Message appears in channel with agent's name and avatar
- [ ] Humans and other agents in channel see the message in real-time (WebSocket)

**Estimate:** 3 story points (mostly inherited from Rocket.Chat)  
**Priority:** P0 (Must-Have)

---

### Story 6: Agent Subscribes to Chat Messages (WebSocket)
**As** Alex (AI-first founder),  
**I want** my agent to receive real-time chat messages via WebSocket,  
**So that** my agent can respond to @mentions or questions from humans.

**Acceptance Criteria:**
- [ ] WebSocket endpoint: `wss://vutler-domain.tld/websocket` (authentication via API key)
- [ ] Agent subscribes to channels (send subscription message)
- [ ] When message is posted in channel, agent receives event with `channel_id`, `user_id`, `text`, `timestamp`
- [ ] Agent can filter for @mentions (`@agent-name`)

**Estimate:** 3 story points (Rocket.Chat provides this)  
**Priority:** P1 (Should-Have)

---

### Story 7: Agent Uploads File to Shared Drive
**As** Maya (solo AI builder),  
**I want** my agent to upload generated reports to a shared drive,  
**So that** humans can access agent outputs without email attachments.

**Acceptance Criteria:**
- [ ] API endpoint: `POST /api/v1/drive/upload` with `file` (multipart form) and `path` (e.g., `/reports/daily-2026-02-16.pdf`)
- [ ] File stored in backend (S3-compatible storage: MinIO or local file system)
- [ ] File appears in dashboard file browser (humans can browse `/reports/`)
- [ ] Download URL returned in API response

**Estimate:** 5 story points  
**Priority:** P0 (Must-Have)

---

### Story 8: Agent Creates Calendar Event
**As** Alex (AI-first founder),  
**I want** my agent to create calendar events via API (e.g., "Daily standup at 9 AM"),  
**So that** agents can coordinate time-based activities and notify humans.

**Acceptance Criteria:**
- [ ] API endpoint: `POST /api/v1/calendar/events` with `{"title": "Daily Report", "start": "2026-02-17T09:00:00Z", "end": "2026-02-17T09:15:00Z"}`
- [ ] Event appears in agent's calendar (viewable in dashboard)
- [ ] CalDAV-compatible (humans can sync calendar to Outlook, Google Calendar, etc.)
- [ ] Optional: `attendees` field (invite humans or other agents)

**Estimate:** 5 story points  
**Priority:** P1 (Should-Have)

---

### Story 9: Human Views Agent Activity Dashboard
**As** Stefan (compliance IT director),  
**I want to** see all agent activity in a unified dashboard (emails sent, messages posted, files uploaded),  
**So that** I can audit agent behavior and debug issues.

**Acceptance Criteria:**
- [ ] Dashboard page: `/agents/{agent_id}/activity`
- [ ] Activity feed shows recent actions with timestamps:
  - "Sent email to alex@example.com" (subject line)
  - "Posted in #engineering: 'Deploy complete'"
  - "Uploaded file: `/reports/daily-2026-02-16.pdf`"
- [ ] Filterable by action type (email, chat, file, calendar)
- [ ] Click action to view details (e.g., click email to see full email body)

**Estimate:** 5 story points  
**Priority:** P1 (Should-Have)

---

### Story 10: Human Creates Agent via Web UI (Non-Developer Path)
**As** Stefan (compliance IT director),  
**I want to** create an agent via web UI (not just API),  
**So that** non-technical team members can provision agents without coding.

**Acceptance Criteria:**
- [ ] Dashboard page: "Create Agent" button
- [ ] Form: Name, Email, Avatar URL (optional), Description (optional)
- [ ] On submit: Agent created, API key displayed (copy-to-clipboard)
- [ ] Warning: "Save this API key now; it won't be shown again"
- [ ] Agent appears in agent list

**Estimate:** 3 story points  
**Priority:** P1 (Should-Have)

---

### Story 11: Agent Checks Calendar Availability
**As** Maya (solo AI builder),  
**I want** my scheduling agent to check if a human is available at a given time,  
**So that** my agent can book meetings without conflicts.

**Acceptance Criteria:**
- [ ] API endpoint: `GET /api/v1/calendar/availability?user_id={id}&start={datetime}&end={datetime}`
- [ ] Response: `{"available": true/false, "conflicts": [...]}`
- [ ] Conflicts list shows existing events that overlap

**Estimate:** 3 story points  
**Priority:** P2 (Nice-to-Have)

---

### Story 12: Agent Searches Chat History
**As** Alex (AI-first founder),  
**I want** my agent to search past chat messages via API (e.g., "Find all mentions of 'bug' in #engineering last week"),  
**So that** my agent can provide context-aware responses.

**Acceptance Criteria:**
- [ ] API endpoint: `GET /api/v1/chat/search?query={text}&channel_id={id}&from={date}&to={date}`
- [ ] Response: List of messages matching query (ranked by relevance or chronological)
- [ ] Supports basic text search (no complex regex in MVP)

**Estimate:** 3 story points  
**Priority:** P2 (Nice-to-Have)

---

### 🆕 NEW STORIES: "Build Your Agents" (Elena Persona)

### Story 13: Elena Deploys Agent from Template (No Code)
**As** Elena (non-technical business owner),  
**I want to** deploy a Customer Support Agent from a template without writing code,  
**So that** I can handle routine customer emails automatically without hiring developers.

**Acceptance Criteria:**
- [ ] Dashboard shows "Agent Templates" library (3-5 templates visible)
- [ ] Elena clicks "Customer Support Agent" template
- [ ] Form appears: Name (default: "Support Agent"), Email, Behavior config (tone: friendly/formal, auto-response triggers: pricing/delivery/FAQ)
- [ ] Elena fills form, clicks "Deploy"
- [ ] Agent created with Vutler workspace identity (email, chat, calendar access)
- [ ] Agent starts responding to emails matching triggers (e.g., "What's your pricing?" → auto-response)
- [ ] Elena receives confirmation: "Support Agent deployed! Check activity dashboard."

**Estimate:** 8 story points (includes template backend + UI)  
**Priority:** P0 (Must-Have for "Build" offering)

---

### Story 14: Elena Customizes Agent Behavior via Prompts
**As** Elena (non-technical business owner),  
**I want to** customize my agent's behavior by editing plain-language prompts,  
**So that** the agent matches my business tone and handles specific use cases.

**Acceptance Criteria:**
- [ ] Agent config page shows "Behavior" section with text fields:
  - System prompt (e.g., "You are a friendly customer support agent for [Company Name]...")
  - Trigger keywords (e.g., "pricing, delivery, refund")
  - Response templates (e.g., "Pricing: [insert pricing URL]")
- [ ] Elena edits prompts (plain text, no code)
- [ ] "Test Agent" button lets Elena preview agent responses
- [ ] Save changes → agent behavior updates immediately
- [ ] No coding required (all config via text forms)

**Estimate:** 5 story points  
**Priority:** P1 (Should-Have)

---

### Story 15: Elena Monitors Agent Activity (Simple Dashboard)
**As** Elena (non-technical business owner),  
**I want to** see what my agents are doing (emails sent, responses given),  
**So that** I can verify they're working correctly and intervene if needed.

**Acceptance Criteria:**
- [ ] Dashboard shows agent activity feed (last 50 actions):
  - "Support Agent responded to john@example.com: 'What's your pricing?' → [response preview]"
  - "Content Agent posted blog draft to #content channel"
- [ ] Each action clickable for full details
- [ ] Filter by agent (if multiple agents deployed)
- [ ] Simple, non-technical language (no jargon like "API call," "webhook")
- [ ] "Pause Agent" button (Elena can disable agent if misbehaving)

**Estimate:** 3 story points (reuses Story 9 dashboard, simplified UI)  
**Priority:** P1 (Should-Have)

---

### Story 16: Elena Deploys Multiple Agent Types
**As** Elena (non-technical business owner),  
**I want to** deploy multiple agents from different templates (Support + Content Writer + Scheduler),  
**So that** I can build a complete AI workforce handling different tasks.

**Acceptance Criteria:**
- [ ] Elena deploys "Customer Support Agent" (Story 13)
- [ ] Elena returns to template library, deploys "Content Writer Agent" (generates blog drafts from topics)
- [ ] Elena deploys "Scheduler Agent" (coordinates meetings via email/calendar)
- [ ] All 3 agents appear in dashboard with separate activity feeds
- [ ] Agents have unique identities (support@company.com, content@company.com, scheduler@company.com)
- [ ] Elena can manage each agent independently (pause, edit config, delete)

**Estimate:** 2 story points (reuses Story 13 flow)  
**Priority:** P1 (Should-Have)

---

### Story 17: Elena Shares Agent Template with Community (Marketplace)
**As** Elena (non-technical business owner who successfully deployed agents),  
**I want to** share my customized agent template with the Vutler community,  
**So that** other business owners can benefit from my configuration.

**Acceptance Criteria:**
- [ ] Agent config page has "Share Template" button
- [ ] Elena clicks → form: Template name, description, category (Support, Content, Scheduler, Other)
- [ ] Elena submits → template published to community marketplace (GitHub-backed repo)
- [ ] Other users see Elena's template in "Community Templates" section
- [ ] One-click deploy from community template (same flow as official templates)

**Estimate:** 5 story points  
**Priority:** P2 (Nice-to-Have — drives community growth)

---

### Updated Story Sizing Summary

| Story | Priority | Estimate (SP) | Feature Area |
|-------|----------|---------------|--------------|
| **Original Stories (1-12)** | | | |
| 1. Deploy in <30 min | P0 | 3 | Deployment |
| 2. Create agent via API | P0 | 2 | Identity |
| 3. Agent sends email | P0 | 5 | Email |
| 4. Agent receives email | P0 | 5 | Email |
| 5. Agent posts to chat | P0 | 3 | Chat |
| 6. Agent subscribes WebSocket | P1 | 3 | Chat |
| 7. Agent uploads file | P0 | 5 | Drive |
| 8. Agent creates event | P1 | 5 | Calendar |
| 9. Human views activity | P1 | 5 | Dashboard |
| 10. Human creates agent (UI) | P1 | 3 | Dashboard |
| 11. Agent checks availability | P2 | 3 | Calendar |
| 12. Agent searches chat | P2 | 3 | Chat |
| **NEW: "Build" Stories (13-17)** | | | |
| 13. Deploy from template (no code) | P0 | 8 | Agent Creation |
| 14. Customize agent prompts | P1 | 5 | Agent Creation |
| 15. Simple activity dashboard | P1 | 3 | Agent Creation |
| 16. Deploy multiple agent types | P1 | 2 | Agent Creation |
| 17. Share template (marketplace) | P2 | 5 | Agent Creation |

**Original Total:** 45 story points  
**NEW "Build" Stories:** 23 story points  
**GRAND TOTAL (Both Offerings):** 68 story points

**Breakdown by Priority:**
- **P0 (Must-Have):** 31 SP (original 23 + new 8)
- **P1 (Should-Have):** 29 SP (original 16 + new 13)
- **P2 (Nice-to-Have):** 8 SP (original 6 + new 2 — marketplace community feature)

---

### Realistic MVP Scope Analysis (2 Months, Both Offerings)

**Team Capacity:**
- 10 AI agents + Alex = ~60-80 story points capacity (assuming AI agents are 40-60% as productive as humans on this stack)
- **With double offering:** 68 total story points = feasible BUT requires hard choices

**Pragmatic MVP Strategy:**

**Option A: Dual Offering (Ambitious)**
- **Deliver:** P0 stories only (31 SP) + selected P1 (15-20 SP) = ~50 SP total
- **Includes:**
  - Workspace infrastructure (email, chat, drive, calendar) — P0 (23 SP)
  - Agent creation (1-2 templates, basic config) — P0 (8 SP) + simplified P1 (5-10 SP)
- **Excludes:**
  - Advanced templates (only 2-3 in MVP: Support, Content)
  - Visual workflow builder (descope to post-MVP)
  - Marketplace (descope to P2/post-MVP)
- **Risk:** Spreading too thin; may under-deliver both offerings

**Option B: Workspace-First, Creation-Later (Conservative)**
- **Deliver:** Workspace infrastructure (P0 + P1 = 39 SP) + basic "bring" features
- **Add post-launch (Month 3):** Agent creation templates (8-13 SP)
- **Rationale:** Validate workspace PMF first; add creation once core is solid
- **Risk:** Delays non-technical user acquisition (Elena persona)

**Option C: Templates-First, Workspace-Light (Pivot)**
- **Deliver:** Agent templates + basic workspace (email + chat only, skip calendar/drive in MVP)
- **Rationale:** If Elena persona shows stronger demand than Alex
- **Risk:** Alienates technical users (Alex, Maya) who need full workspace

**RECOMMENDED: Option A (Dual Offering, Scoped Down)**

**2-Month MVP Deliverables:**

**Workspace (Track 2 - "Bring Your Agents"):**
- ✅ P0: Deploy, Identity, Email (send/receive), Chat (basic), Drive (basic) — 23 SP
- ✅ P1 (selected): Agent dashboard, WebSocket chat — 8 SP
- ❌ Descope: Calendar (move to Month 3), advanced drive features

**Agent Creation (Track 1 - "Build Your Agents"):**
- ✅ P0: 2-3 agent templates (Support, Content) with one-click deploy — 8 SP (reuse OpenClaw)
- ✅ P1: Basic prompt customization UI — 5 SP
- ❌ Descope: Visual workflow builder, marketplace (post-MVP)

**Total Delivered:** ~44 SP (within 60-80 SP capacity; safe margin)

**Post-MVP (Month 3-4):**
- Add calendar (5 SP)
- Add 3-5 more templates (10 SP)
- Build marketplace (5 SP)
- Visual workflow builder (15-20 SP)

**Decision Point (Week 2):**
- After Elena persona interviews (5-10 users), assess demand for "Build" offering
- If LOW demand → Option B (workspace-first)
- If HIGH demand → Option A (dual offering with scoped templates)

---

## Success Metrics

### North Star Metric
**Number of AI agents actively using Vutler (sending emails, posting messages, or uploading files in past 7 days)**

**Why this metric:**  
- Directly measures product value (agents collaborating)
- Leading indicator of retention (active agents = value delivered)
- Easy to measure (API usage logs)

**Target (3 months post-MVP):** 50-100 active agents (across 10-20 early adopter teams)

---

### Supporting Metrics

#### Adoption Metrics (First 90 Days)
| Metric | Target | How Measured |
|--------|--------|--------------|
| **Deployments** (unique instances) | 50-100 | GitHub clone count, Docker Hub pulls, landing page signups |
| **Agents created** | 200-500 | Total agents across all deployments (telemetry opt-in) |
| **Weekly active agents** | 50-100 | Agents with API activity in past 7 days |
| **Human users** | 100-200 | Humans logged into dashboard |

#### Engagement Metrics (Per Deployment)
| Metric | Target | How Measured |
|--------|--------|--------------|
| **Emails sent by agents** (per week) | 20-100 | SMTP log count |
| **Chat messages by agents** (per week) | 50-500 | Chat API log count |
| **Files uploaded by agents** (per week) | 5-50 | Drive API log count |
| **Calendar events created** (per week) | 5-20 | CalDAV log count |

#### Time-to-Value Metrics
| Metric | Target | How Measured |
|--------|--------|--------------|
| **Time to deploy** | <30 min | User survey + docs analytics |
| **Time to first agent** | <5 min | API logs (agent creation to first activity) |
| **Time to first email sent** | <10 min | API logs (agent creation to first SMTP send) |

#### Retention & Satisfaction
| Metric | Target | How Measured |
|--------|--------|--------------|
| **Week 1 retention** | >70% | Deployments active in week 1 after setup |
| **Week 4 retention** | >50% | Deployments active in week 4 |
| **NPS (Net Promoter Score)** | >40 | In-app survey (30 days post-deploy) |
| **GitHub stars** | 500+ | GitHub API |

---

### Success Criteria (MVP Validation)

**MVP is successful if, within 90 days:**
1. ✅ **50+ deployments** (proves market demand)
2. ✅ **50+ weekly active agents** (proves product value)
3. ✅ **5+ testimonials** from Alex/Stefan/Maya personas (proves persona fit)
4. ✅ **Week 4 retention >50%** (proves stickiness)
5. ✅ **3+ ProductHunt/HackerNews front-page features** (proves community interest)

**If MVP fails (below 25 deployments or <20 active agents in 90 days):**
- Re-evaluate persona fit (wrong target users?)
- Re-evaluate problem severity (do people actually have this pain?)
- Consider pivot (e.g., focus only on Swiss compliance market, drop agent-first positioning)

---

## Jobs-to-be-Done Analysis

*JTBD framework helps uncover real user needs beyond surface-level feature requests.*

### Primary Job: Enable AI Workforce Collaboration

**Job Statement:**  
**When** deploying multiple AI agents in production (3-50 agents),  
**I want to** give each agent proper identity and collaboration primitives (email, chat, calendar, drive),  
**So I can** scale my AI workforce without infrastructure chaos, security risks, or economic model breaking.

**Desired Outcomes (How Users Measure Success):**
1. **Speed:** Provision new agent in <5 minutes (vs. 30-60 min today)
2. **Cost:** Flat or zero cost (vs. $8-15/agent/month on Slack/Gmail)
3. **Security:** Each agent has unique identity; no shared credentials (vs. fake accounts today)
4. **Audit:** See all agent activity in one place (vs. archaeology across 4+ tools)
5. **Control:** Programmatic access to all features via API (vs. manual clicking in human UIs)

**Related Jobs:**
- **When** adding a new agent → **minimize setup friction** → <5 min provisioning
- **When** debugging agent failures → **unified visibility** → single dashboard for all activity
- **When** ensuring compliance → **prove data sovereignty** → Swiss/EU hosting guarantee

---

### Secondary Job: Escape Legacy Human-Centric Tools

**Job Statement:**  
**When** the business wants modern collaboration (Slack-level UX) but compliance blocks US SaaS,  
**I want to** deploy modern, agent-ready infrastructure that meets Swiss/EU data laws,  
**So I can** enable innovation without regulatory violations or legacy tool hell (Exchange 2016).

**Desired Outcomes:**
1. **Compliance:** Data in Switzerland/EU; no US parent company (CLOUD Act mitigation)
2. **Modern UX:** Escape Exchange/SharePoint legacy nightmare; Slack-level chat
3. **Agent support:** Agents have proper identity, API access, audit trail (not bolted-on bots)
4. **TCO:** Lower total cost of ownership vs. Microsoft 365 Enterprise (licenses + maintenance)

---

### Tertiary Job: Stop Rebuilding Collaboration Infra

**Job Statement:**  
**When** building a multi-agent system (research, writing, editing agents),  
**I want** batteries-included collaboration (email, chat, drive, calendar) with Python SDK,  
**So I can** focus on AI logic, not DevOps (Redis, S3, SMTP setup every project).

**Desired Outcomes:**
1. **Speed:** Deploy in <30 min; start building agents on day 1 (vs. day 3 after infra setup)
2. **Reusability:** One Vutler instance works for all projects (vs. custom infra per project)
3. **Developer experience:** Great docs, code examples, Python SDK, LangChain integration
4. **Cost:** Free for personal projects; <$50/month for client work

---

## Technical Constraints

### Technology Stack (Validated by Alex, Starbox CEO)

**Core Platform:**
- **Base:** Rocket.Chat (MIT license fork) — TypeScript, Meteor framework, MongoDB (replace with PostgreSQL/SQLite)
- **Backend:** Node.js, TypeScript
- **Frontend:** React (inherited from Rocket.Chat)
- **Database:** PostgreSQL (production) or SQLite (single-server/dev)

**Additional Components:**
- **Email:** Haraka (SMTP server, Node.js) or Postal (more mature, Ruby — evaluate)
- **Drive:** MinIO (S3-compatible, Go) or local file system with S3 API wrapper
- **Calendar:** Radicale (CalDAV server, Python) or Baikal (PHP — evaluate)

**Infrastructure:**
- **Deployment:** Docker Compose (MVP), Kubernetes (post-MVP)
- **Hosting:** Swiss VPS (Infomaniak, Hetzner, DigitalOcean) or on-prem

### Technical Assumptions to Validate

1. **Assumption:** Rocket.Chat's MIT license allows commercial fork with rebranding  
   **Validation:** Legal review of Rocket.Chat license + contributor agreements (Week 1)

2. **Assumption:** Replacing MongoDB with PostgreSQL is feasible (Rocket.Chat uses Meteor, which supports multiple DBs)  
   **Validation:** Spike: Run Rocket.Chat with PostgreSQL adapter (Week 1)

3. **Assumption:** Integrating Haraka (SMTP) + MinIO (S3) + Radicale (CalDAV) into single Docker Compose is achievable in 8 weeks  
   **Validation:** Architecture spike: Prototype integration (Week 1)

4. **Assumption:** AI agents can build/test 60-80% of features (Alex + 10 agents = effective team of 5-7 engineers)  
   **Validation:** Week 1-2 velocity measurement (story points completed)

### Non-Negotiable Constraints

- **Zero budget:** No SaaS licenses, no contractors, no paid dependencies (open-source only)
- **8-week timeline:** MVP ships mid-April 2026 (hard deadline)
- **Team:** Alex + 10 AI agents (no human hires)
- **Tech stack familiarity:** TypeScript/Node.js (Alex's expertise); avoid new languages (Go, Rust, Java)

---

## Go-to-Market Strategy

### Phase 1: Early Adopters (Months 1-3)

**Target:** AI-first startups (Alex persona) — 50-100 deployments

**Channels:**
1. **ProductHunt launch** (Week 10, post-MVP) — "Show HN: Vutler, the collaboration platform for AI agents"
2. **HackerNews post** (same day) — "We built Office 365 for AI agents using Rocket.Chat fork"
3. **LangChain Discord** — Share in #show-and-tell, offer integration help
4. **AI Twitter** — Thread by Alex (Starbox CEO): "Why we built Vutler after managing 10 agents on K-Suite hell"
5. **Direct outreach** — DM 20-30 AI-first founders (identified via Twitter, LinkedIn, LangChain community)

**Messaging:**
- **Headline:** "Stop paying Slack $8/agent. Vutler gives your AI workforce real identities — email, chat, calendar — for free."
- **Proof points:** Starbox uses it in production (dogfooding); open-source (MIT); deploy in 30 min
- **CTA:** GitHub repo, "Deploy now" button (Docker Compose one-liner)

**Success Metrics:**
- 500+ GitHub stars in first week
- 50-100 deployments in first month
- 5-10 testimonials/case studies

---

### Phase 2: Compliance Segment (Months 4-6)

**Target:** Swiss/EU enterprises (Stefan persona) — 10-30 deployments

**Channels:**
1. **Swiss IT events** — Present at Swiss IT Leadership Forum, Swiss CIO Summit
2. **Compliance consultants** — Partner with Big 4 (PwC, Deloitte) Swiss offices; offer workshops
3. **LinkedIn ads** — Target IT Directors in Switzerland/Germany (keywords: "FINMA," "GDPR," "data sovereignty")
4. **Case study** — Starbox Group + 1-2 Swiss enterprises (testimonial videos)

**Messaging:**
- **Headline:** "Modern collaboration for AI agents with Swiss data sovereignty. No US vendor risk."
- **Proof points:** Self-hosted; no US parent company; full audit trail; FINMA/GDPR-ready
- **CTA:** Free 1-hour consultation + demo deployment on client's Swiss VPS

**Success Metrics:**
- 3-5 Swiss enterprise pilots
- 1-2 paid support contracts ($5k-10k/year)

---

### Phase 3: Developer Community (Ongoing)

**Target:** Solo AI builders (Maya persona) — 500-2000 users

**Channels:**
1. **Dev.to articles** — "Building a Multi-Agent Content Pipeline with Vutler" (code walkthrough)
2. **YouTube tutorials** — Partner with AI YouTubers (1littlecoder, AI Jason) for integration tutorials
3. **LangChain integrations** — Submit PR to LangChain for Vutler tool wrapper
4. **GitHub Trending** — Optimize repo for discovery (tags, description, README GIFs)

**Messaging:**
- **Headline:** "Rails for AI agents. Batteries included: email, chat, calendar, drive. Deploy in 30 min."
- **Proof points:** Python SDK; LangChain integration; great docs; active Discord community
- **CTA:** "Try the 5-minute quickstart" (guided tutorial)

**Success Metrics:**
- 2000+ GitHub stars
- 500+ Discord members
- 10+ community-contributed integrations/plugins

---

### Pricing Strategy (Post-MVP)

*See detailed pricing document: 07-pricing-strategy.md*

**MVP Strategy:** Open-source only (MIT license); no hosted offering yet

**Future Tiers (6-12 months post-MVP):**
1. **Open Source (Free):** Self-hosted; community support; full features
2. **Hosted (Paid):** Managed hosting on Swiss VPS; $49-99/month flat (unlimited agents)
3. **Enterprise (Custom):** On-prem support, SLA, professional services ($5k-50k/year)

---

## Open Questions & Risks

### Open Questions (Require Validation)

1. **Legal:** Can we fork Rocket.Chat commercially? (MIT license review — Week 1)
2. **Technical:** Can we replace MongoDB with PostgreSQL without breaking Rocket.Chat? (Spike — Week 1)
3. **Market:** Will 100+ teams deploy in first 3 months? (Landing page validation — Week 1-2)
4. **Features:** Is email + chat + calendar + drive sufficient, or do we need more? (User interviews — Week 1-2)
5. **Pricing:** Will users pay for hosted option, or is open-source enough? (User interviews — Week 2-4)

### Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| **Rocket.Chat fork is harder than expected** (integration complexity) | High | Medium | Week 1 spike to validate architecture; fallback: build from scratch (slower) |
| **AI agents are slower than expected** (velocity <50% of humans) | High | Medium | Alex ramps up coding time; reduce scope (drop P2 stories) |
| **No market demand** (<25 deployments in 90 days) | High | Low | Early validation via landing page + user interviews (Week 1-2); pivot if needed |
| **Competitor launches similar product** (Slack adds "agent tier") | Medium | Low | Speed to market (8 weeks); open-source moat (can't be killed by competitor) |
| **Swiss compliance requirements more complex than assumed** | Medium | Medium | Partner with Swiss legal/compliance consultants; iterate on compliance story |

---

## Next Steps (Week 1)

**Architecture & Planning (Alex + Luna):**
- [ ] Validate Rocket.Chat fork strategy (license, PostgreSQL spike, integration architecture)
- [ ] Break down stories into tasks (architecture → dev → test)
- [ ] Set up GitHub repo, project board, CI/CD

**User Research (Luna):**
- [ ] Conduct 10 user interviews (3 Alex, 3 Stefan, 4 Maya personas)
- [ ] Validate problem severity, feature priorities, pricing willingness
- [ ] Refine MVP scope based on feedback

**Marketing Prep (Alex + Content Agent):**
- [ ] Launch landing page with email signup (validate demand)
- [ ] Write "Why we're building Vutler" blog post
- [ ] Identify 20-30 AI-first founders for direct outreach

**Development (Alex + 10 AI Agents):**
- [ ] Week 1-2: Rocket.Chat fork + agent identity API (Story 2)
- [ ] Week 3-4: Email (Stories 3, 4) + Chat (Stories 5, 6)
- [ ] Week 5-6: Drive (Story 7) + Calendar (Story 8)
- [ ] Week 7: Dashboard (Stories 9, 10)
- [ ] Week 8: Polish, docs, deployment guide (Story 1)

---

## Appendix: Relevant Documents

- **Product Brief:** `01-product-brief.md`
- **Personas:** `02-persona-ai-first-founder.md`, `03-persona-compliance-enterprise-it.md`, `04-persona-solo-ai-builder.md`
- **Competitive Analysis:** `05-competitive-analysis.md`
- **Pricing Strategy:** `07-pricing-strategy.md` (to be created)

---

**Document Status:** ✅ Ready for Story Breakdown & Architecture Design  
**Next Review:** 2026-02-23 (post user interviews)
