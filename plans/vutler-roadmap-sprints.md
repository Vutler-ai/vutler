# Vutler — Sprint Roadmap (post Sprint 10)

## Sprint 11 — Marketplace & Templates (Philip + Mike)
**Goal:** Users can browse, install, and publish agent templates

### Frontend (Philip)
- `/marketplace` — Browse agent templates (cards grid, search, filters by category)
- `/marketplace/:id` — Template detail (description, reviews, install button)
- `/agents/:id/publish` — Publish agent as template (name, description, category, pricing)
- Rating/review system (stars + comment)
- "Featured" and "Popular" sections

### Backend (Mike)
- `POST /api/v1/marketplace/templates` — publish template
- `GET /api/v1/marketplace/templates` — list (search, filter, sort)
- `GET /api/v1/marketplace/templates/:id` — detail
- `POST /api/v1/marketplace/templates/:id/install` — clone to workspace
- `POST /api/v1/marketplace/templates/:id/review` — add review
- Table: `marketplace_templates`, `marketplace_reviews`
- Categories: customer-support, data-analysis, code-review, content, sales, custom

---

## Sprint 12 — Integrations Framework (Mike + Philip)
**Goal:** Plugin architecture + first 4 integrations

### Architecture (Mike)
- Plugin system: each integration = isolated module in `/integrations/<name>/`
- OAuth2 flow centralisé: consent → token store → auto-refresh
- Webhook receiver: `POST /api/v1/webhooks/:integration` → event queue → agent triggers
- Credential vault: encrypted per-workspace (AES-256-GCM, same as LLM keys)
- Rate limiting per-provider
- Table: `integrations`, `integration_credentials`, `webhook_events`

### Integrations à implémenter:

#### 12a — Google Workspace
- **OAuth2 scopes:** Gmail (read/send), Drive (files), Calendar (events), Docs (read)
- **Agent capabilities:** read emails, send replies, search Drive, create/read calendar events, read Docs
- **Triggers:** new email → agent, calendar event reminder → agent

#### 12b — Microsoft 365 (Graph API)
- **OAuth2 scopes:** Mail, OneDrive, Calendar, Teams
- **Agent capabilities:** same as Google but via Graph API
- **Triggers:** new email, upcoming meeting, Teams message

#### 12c — GitHub
- **OAuth2 + personal token support**
- **Agent capabilities:** list repos, read/create issues, review PRs, trigger Actions, read code
- **Triggers:** new issue, PR opened, CI failed, mention in comment
- **Webhooks:** repository events

#### 12d — Slack
- **Bolt SDK / OAuth2**
- **Agent capabilities:** send/read messages, create channels, manage threads
- **Triggers:** message in channel, DM, mention, reaction

### Frontend (Philip)
- `/settings/integrations` — grid of available integrations with connect/disconnect buttons
- OAuth connect flow (redirect → callback → success)
- Per-integration settings panel
- Integration status badges on dashboard

---

## Sprint 13 — Advanced Integrations (Mike + Philip)
**Goal:** 4 more integrations + n8n deep integration

### Integrations:

#### 13a — GitLab
- OAuth2, repos, MRs, CI/CD, webhooks

#### 13b — Notion
- OAuth2, read/write pages, query databases, search

#### 13c — Jira / Linear
- OAuth2, issues, boards, sprints, comments

#### 13d — n8n (Deep Integration)
- **Self-hosted n8n on VPS** (Docker) or **n8n cloud webhook**
- Vutler ↔ n8n bidirectional:
  - Vutler triggers → n8n workflows (via webhook)
  - n8n results → Vutler notifications/actions (via API callback)
- Pre-built n8n workflow templates for common automations:
  - New email → summarize → Slack notification
  - GitHub PR → code review agent → comment
  - Calendar event → prepare brief → email
  - Form submission → CRM update → agent follow-up
- Existing `/api/v1/automations` endpoint enhanced to manage n8n workflows
- UI: visual workflow builder (simplified) or link to n8n dashboard

---

## Sprint 14 — Billing & Stripe (Mike + Philip)
**Goal:** Per-agent pricing, Stripe integration, usage dashboard

### Backend (Mike)
- Stripe integration: subscription management, per-agent billing
- Plans: Free (1 Nexus + 1 agent), Starter ($29-49), Pro ($149-199), Enterprise (custom)
- Usage tracking (not metering — just for dashboard visibility)
- Webhook: `POST /api/v1/webhooks/stripe` (subscription events)
- Tables: `subscriptions`, `billing_events`
- Agent limit enforcement per plan

### Frontend (Philip)
- `/billing` — Current plan, usage stats, upgrade/downgrade
- `/billing/checkout` — Stripe Checkout integration
- `/billing/invoices` — Invoice history
- Plan comparison page
- Agent limit warning when approaching cap

---

## Sprint 15 — White-label & Enterprise (Mike + Philip)
**Goal:** Multi-Nexus, SSO, custom branding

### Backend (Mike)
- Multi-Nexus: one per department (enterprise plan)
- SSO/SAML integration (passport-saml)
- Custom domain support (CNAME + SSL)
- White-label config: logo, colors, name per workspace
- Client reporting API: agent performance, execution stats, uptime

### Frontend (Philip)
- `/settings/branding` — logo upload, color picker, custom name
- `/settings/sso` — SAML/SSO configuration
- `/reports` — Client-facing dashboard (agents, executions, uptime charts)
- Multi-Nexus management UI

---

## Sprint 16 — Analytics & Monitoring (Mike + Philip)
**Goal:** Deep visibility into agent performance

### Backend (Mike)
- Time-series metrics: agent response time, execution count, error rate
- Cost tracking per agent (LLM tokens × price)
- Alerting rules: error rate > X%, agent offline > Y min
- Export: CSV, PDF reports

### Frontend (Philip)
- `/analytics` — Charts (line, bar, pie) for all metrics
- Real-time agent monitoring dashboard
- Alert configuration UI
- Cost breakdown per agent/workspace

---

## Sprint 17 — Mobile & PWA (Philip)
**Goal:** Full mobile experience

### Frontend (Philip)
- PWA enhancements: offline cache, push notifications, install prompt
- Mobile-optimized layouts for all pages
- Touch gestures (swipe to navigate, pull to refresh)
- Mobile agent chat interface
- Quick actions: start/stop agent, view notifications, check status

---

## Sprint 18 — Agent-to-Agent Protocol (Mike)
**Goal:** Agents communicate and collaborate

### Backend (Mike)
- A2A protocol: agent discovery, message passing, task delegation
- Shared context between agents (via Snipara)
- Agent roles & permissions in multi-agent workflows
- Conversation threads between agents (visible to admin)
- Table: `agent_conversations`, `agent_messages`

---

## Sprint 19 — Offline Mode (Mike + Philip)
**Goal:** Nexus works without cloud connection

### Backend (Mike)
- Yjs full offline sync (local-first, merge on reconnect)
- Local LLM routing (Ollama integration)
- Local secret execution (no cloud dependency)
- Sync queue: buffer actions while offline, replay on reconnect

### Frontend (Philip)
- Offline indicator in UI
- Sync status: "Last synced X ago"
- Conflict resolution UI (if needed post-CRDT)

---

## Priority Order
1. **Sprint 11** — Marketplace (revenue enabler)
2. **Sprint 12** — Integrations Framework + Google/MS/GitHub/Slack (core value)
3. **Sprint 13** — More integrations + n8n (automation power)
4. **Sprint 14** — Billing (monetization)
5. **Sprint 15** — Enterprise features (scale)
6. **Sprint 16-19** — Polish & advanced features

## Existing Features Reference
- Automations API already exists (`/api/v1/automations` + logs)
- Email system via Postal (SMTP, 14 routes @vutler.ai)
- Tasks, Calendar, Goals endpoints already built
- Drive integration (Synology) partially built
- Chat WebSocket operational
