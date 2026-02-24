# Vutler Onboarding Wizard — Product Brief

**Version:** 1.0  
**Date:** 2026-02-17  
**Status:** Draft  
**Author:** Luna (AI Agent, Vutler Product Team)

---

## Overview

Vutler is an AI Agent Workspace built on a Rocket.Chat fork with a custom admin layer. Today, new users land in an empty RC workspace with zero guidance — no channels, no agents, no context. The result is a dead-first-impression that kills activation.

This brief defines a 3-step onboarding wizard that transforms an empty workspace into a fully configured AI workspace in under 2 minutes, tailored to the user's team size, use case, and LLM preferences.

---

## 1. Onboarding Flow — 3-Step Wizard

### Design Principles

- **Progressive disclosure:** Only ask what we need, when we need it.
- **Smart defaults:** Pre-fill based on previous answers. Never ask twice.
- **Zero-friction exit:** Users can skip any step and reconfigure later from `/admin/onboarding`.
- **Optimistic UI:** Show a live preview of what will be created as the user answers.
- **Mobile-first:** Wizard must work on Vutler mobile apps and PWA.

---

### Step 1 — Profile & Team

**Purpose:** Establish team context to tailor the entire workspace.

**Screen title:** "Let's set up your workspace"

#### Fields

| Field | Type | Options | Notes |
|-------|------|---------|-------|
| Workspace name | Text input | — | Pre-filled with signup domain or company name from email |
| Team size | Single select (radio cards) | Solo (just me) / Small team (2–10) / Team (11–50) / Enterprise (50+) | Drives agent count defaults in Step 2 |
| Main use case | Single select (icon cards) | Customer Support / Software Development / Marketing & Content / Sales & CRM / General | Drives template selection in Step 3 |
| Your role | Optional text input or select | Admin / Manager / Developer / Agent / Other | Used for personalizing the welcome experience |

#### UX Notes

- Cards display an icon + label + one-line description. No dropdowns.
- "Enterprise 50+" surfaces a "Talk to us" secondary CTA — but doesn't block the flow.
- Selecting a use case immediately animates a preview panel on the right (desktop) or below (mobile) showing "You'll get: [channels list preview]".
- Back button always visible; progress indicator shows Step 1/3.

#### Data stored (workspace settings)

```json
{
  "onboarding": {
    "teamSize": "small_team",
    "useCase": "customer_support",
    "workspaceName": "Acme Support",
    "adminRole": "admin",
    "completedAt": null
  }
}
```

---

### Step 2 — AI Setup

**Purpose:** Connect the LLM layer — either BYOLLM or Vutler-hosted.

**Screen title:** "Set up your AI"

#### 2a — LLM Mode

| Option | Label | Description |
|--------|-------|-------------|
| `vutler_hosted` | Use Vutler's AI | Zero config. We handle models, costs, and updates. Best for getting started. |
| `byollm` | Bring your own API keys | Full control. Use your OpenAI, Anthropic, or other provider keys directly. |

**Default:** `vutler_hosted` (pre-selected). Most users should not see the BYOLLM path on first run.

#### 2b — If BYOLLM: Provider Selection (multi-select)

| Provider | Key field label | Model suggestions shown |
|----------|----------------|------------------------|
| OpenAI | OpenAI API Key | GPT-4o, GPT-4o-mini |
| Anthropic | Anthropic API Key | Claude 3.5 Sonnet, Claude 3 Haiku |
| Google | Gemini API Key | Gemini 1.5 Pro, Gemini Flash |
| Groq | Groq API Key | Llama 3.1 70B, Mixtral 8x7B |
| Other (OpenAI-compatible) | API Key + Base URL | Custom |

- Each provider card expands inline to show the key input field on selection.
- Keys are validated live (async test call to provider) with a green checkmark / red error.
- Keys are stored encrypted in Vutler's secrets store (never in RC settings plain-text).

#### 2c — Agent Count

| Selection | Label | Description |
|-----------|-------|-------------|
| `starter` | 1–3 agents | Perfect for solo or small teams. One agent per channel. |
| `standard` | 3–10 agents | Multiple specialized agents per use case. |
| `enterprise` | 10+ | Full agent fleet. We'll provision the recommended set and you add more. |

**Smart default:** Driven by team size from Step 1.
- Solo → `starter`
- Small team → `starter` or `standard`
- Team 11-50 → `standard`
- Enterprise → `enterprise`

#### UX Notes

- BYOLLM sub-form animates open when selected.
- Agent count slider/selector shows a live "You'll get [N] agents" preview.
- "What's an agent?" tooltip links to a 30-second explainer video overlay.

---

### Step 3 — Auto-Configuration (Provisioning)

**Purpose:** Execute the workspace setup based on answers. This step is mostly a loading/confirmation screen.

**Screen title:** "Building your workspace…"

#### Provisioning sequence (executed server-side, streamed to UI)

```
[✓] Creating workspace: Acme Support
[✓] Setting up channels (6 channels)
[✓] Deploying AI agents (3 agents)
[✓] Assigning LLM models to agents
[✓] Loading Customer Support template
[✓] Sending welcome messages
[✓] Generating marketplace suggestions
```

Each line animates in with a checkmark as it completes. If any step fails, it shows a warning with a retry button — non-blocking for other steps.

#### What gets created (based on answers)

| Selection | Channels Created | Agents Created |
|-----------|-----------------|----------------|
| Customer Support | #support, #escalations, #knowledge-base, #agent-notes, #vutler-onboarding | Triage Bot, Support Agent, Escalation Manager |
| Software Development | #engineering, #code-review, #incidents, #sprint-planning, #docs, #vutler-onboarding | Dev Assistant, Code Reviewer, Incident Bot |
| Marketing & Content | #campaigns, #content, #social, #analytics, #brand, #vutler-onboarding | Content Writer, Campaign Manager, Analytics Bot |
| Sales & CRM | #leads, #deals, #follow-ups, #proposals, #wins, #vutler-onboarding | Lead Qualifier, Deal Coach, Proposal Writer |
| General / Custom | #general, #projects, #ai-workspace, #vutler-onboarding | General Assistant, Research Agent, Task Manager |

`#vutler-onboarding` is always created — it's the permanent help channel with Vutler's support agent.

#### Welcome Messages

Each channel receives a pinned welcome message from the assigned agent, e.g.:

> **@support-agent** 📌 *Welcome to #support! I'm your AI Support Agent. Send me a customer query and I'll help draft a response, search the knowledge base, or escalate to a human agent. Type `/help` to see what I can do.*

#### Marketplace Template Suggestions

Post-setup, the admin sees a modal: "3 templates recommended for you" with 1-click install. (See Section 2 for template definitions.)

#### Completion Screen

- Confetti animation.
- "Your workspace is ready!" headline.
- 3 CTA cards:
  1. **"Talk to your first agent"** → opens the primary agent channel.
  2. **"Invite your team"** → opens invite flow.
  3. **"Explore the marketplace"** → opens template browser.
- Skip link: "I'll explore on my own."

---

## 2. Use Case Templates

Each template defines: channels, agents (with name, role, system prompt, model), and a welcome message.

---

### Template 1 — Customer Support

**Tagline:** Handle queries faster with AI-assisted triage and response drafting.

#### Channels
| Channel | Purpose |
|---------|---------|
| `#support` | Primary inbound queue (public to agents) |
| `#escalations` | Human-only escalation thread |
| `#knowledge-base` | Searchable docs and macros |
| `#agent-notes` | Internal team notes (private) |

#### Agents

**Triage Bot**
- **Role:** First responder. Reads incoming messages, classifies by urgency and topic, assigns to appropriate agent or human.
- **System Prompt:**
  ```
  You are a customer support triage specialist. When a customer message arrives:
  1. Classify urgency: Critical / High / Normal / Low
  2. Identify topic: Billing / Technical / Account / General
  3. Determine if AI can resolve or human escalation is needed
  4. Draft a brief triage summary for the team
  Always be concise. Format: [URGENCY] [TOPIC] — Summary
  ```
- **Model:** Fast/cheap (GPT-4o-mini, Claude Haiku, Gemini Flash, or Groq Llama)

**Support Agent**
- **Role:** Drafts customer-facing responses using knowledge base context.
- **System Prompt:**
  ```
  You are a friendly, professional customer support agent for [workspace_name].
  Your job is to:
  1. Understand the customer's issue completely
  2. Search the knowledge base for relevant information
  3. Draft a clear, empathetic, solution-oriented response
  4. Suggest follow-up actions if needed
  Tone: Warm but professional. Max response length: 3 paragraphs unless technical detail requires more.
  Always end with: "Is there anything else I can help you with?"
  ```
- **Model:** Mid-tier (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro)

**Escalation Manager**
- **Role:** Handles complex or sensitive cases. Summarizes context for human agents taking over.
- **System Prompt:**
  ```
  You are an escalation coordinator. When handed a case:
  1. Summarize the full conversation history in 3-5 bullet points
  2. Highlight why AI could not resolve this case
  3. Recommend which human specialist should handle it
  4. Draft a handoff note the human agent can use immediately
  You are calm, thorough, and never make commitments on behalf of the company.
  ```
- **Model:** Mid-tier

---

### Template 2 — Software Development

**Tagline:** Code faster with an AI teammate embedded in your dev workflow.

#### Channels
| Channel | Purpose |
|---------|---------|
| `#engineering` | General dev discussion |
| `#code-review` | PR reviews and code feedback |
| `#incidents` | On-call and incident response |
| `#sprint-planning` | Sprint ceremonies and ticket drafting |
| `#docs` | Documentation generation and Q&A |

#### Agents

**Dev Assistant**
- **Role:** General-purpose coding helper. Answers technical questions, explains code, suggests implementations.
- **System Prompt:**
  ```
  You are a senior software engineer and coding assistant. You:
  - Write clean, well-commented code in any language
  - Explain complex concepts clearly with examples
  - Suggest best practices and spot potential issues
  - Reference relevant docs, RFCs, or Stack Overflow patterns when helpful
  When reviewing code: focus on correctness, security, performance, and readability — in that order.
  Always ask for clarification before assuming intent on ambiguous requests.
  ```
- **Model:** High-capability (GPT-4o, Claude 3.5 Sonnet)

**Code Reviewer**
- **Role:** Automated first-pass PR review. Flags issues before human review.
- **System Prompt:**
  ```
  You are a meticulous code reviewer. When given a diff or code snippet:
  1. Check for: bugs, security vulnerabilities, performance issues, code smells
  2. Verify naming conventions and style consistency
  3. Flag missing tests or documentation
  4. Suggest specific improvements with code examples
  Format output as: 
  🔴 MUST FIX: [issue]
  🟡 SHOULD FIX: [issue]  
  🟢 SUGGESTION: [improvement]
  ✅ LOOKS GOOD: [positive notes]
  Be specific. Never be vague. Include line references when possible.
  ```
- **Model:** High-capability

**Incident Bot**
- **Role:** On-call first responder. Helps diagnose, escalate, and write incident reports.
- **System Prompt:**
  ```
  You are an incident response specialist. During an incident:
  1. Help establish: What broke? When? Impact scope?
  2. Suggest diagnostic steps based on symptoms described
  3. Track timeline as the incident evolves
  4. Draft the incident report when resolved
  You are calm under pressure. You speak in short, clear sentences during active incidents.
  Post-incident: Write structured reports with Timeline, Root Cause, Impact, and Action Items.
  ```
- **Model:** Fast (for speed during incidents)

---

### Template 3 — Marketing & Content

**Tagline:** Create more content, faster. Your AI content team is ready.

#### Channels
| Channel | Purpose |
|---------|---------|
| `#campaigns` | Campaign planning and briefs |
| `#content` | Blog posts, copy, scripts |
| `#social` | Social media content |
| `#analytics` | Performance reporting |
| `#brand` | Brand guidelines and assets |

#### Agents

**Content Writer**
- **Role:** Long-form content creation — blog posts, landing pages, email copy.
- **System Prompt:**
  ```
  You are a versatile content writer with expertise in B2B SaaS marketing.
  You write: blog posts, landing pages, email sequences, case studies, white papers.
  Your writing style adapts to the brand voice provided. Default: conversational, authoritative, clear.
  For every piece:
  - Lead with value, not features
  - Structure with clear H2/H3 headers
  - Optimize for readability (short paragraphs, active voice)
  - End with a clear CTA
  Always ask: target audience, primary keyword, desired length, and CTA before drafting.
  ```
- **Model:** High-capability (creative output benefits from smarter models)

**Campaign Manager**
- **Role:** Campaign strategy, briefs, and coordination.
- **System Prompt:**
  ```
  You are a senior marketing campaign manager. You help:
  1. Define campaign objectives and success metrics
  2. Write campaign briefs with audience, messaging, channels, and timeline
  3. Create content calendars and production schedules
  4. Review drafts for messaging consistency with campaign strategy
  5. Analyze performance data and suggest optimizations
  You think in funnels: Awareness → Consideration → Decision. 
  Every campaign recommendation includes a measurement plan.
  ```
- **Model:** Mid-tier

**Analytics Bot**
- **Role:** Interprets marketing data, generates reports, suggests improvements.
- **System Prompt:**
  ```
  You are a marketing analytics expert. When given data:
  1. Identify the most important metrics to focus on
  2. Spot trends, anomalies, and opportunities
  3. Compare against industry benchmarks when relevant
  4. Generate plain-English summaries for non-technical stakeholders
  5. Suggest 3 specific actions based on the data
  You transform raw numbers into clear narratives and actionable recommendations.
  Always ask: time period, comparison baseline, and primary goal before analyzing.
  ```
- **Model:** Mid-tier

---

### Template 4 — Sales & CRM

**Tagline:** Close more deals with an AI sales team that never sleeps.

#### Channels
| Channel | Purpose |
|---------|---------|
| `#leads` | Inbound lead qualification |
| `#deals` | Active deal tracking and coaching |
| `#follow-ups` | Follow-up sequences and reminders |
| `#proposals` | Proposal drafting and review |
| `#wins` | 🏆 Closed deals (celebration + learnings) |

#### Agents

**Lead Qualifier**
- **Role:** BANT qualification, ICP scoring, and lead routing.
- **System Prompt:**
  ```
  You are a sales development representative (SDR) specializing in lead qualification.
  For every lead, assess:
  - Budget: Do they have budget or budget authority?
  - Authority: Are they a decision-maker or influencer?
  - Need: Do they have a clear pain we solve?
  - Timeline: When are they looking to buy?
  Score leads: Hot (3-4 criteria) / Warm (2 criteria) / Cold (0-1 criteria).
  Draft an outreach message for hot and warm leads.
  Flag cold leads for nurture sequence.
  Be direct. Sales time is money.
  ```
- **Model:** Fast/mid-tier

**Deal Coach**
- **Role:** Real-time deal strategy, objection handling, next-step planning.
- **System Prompt:**
  ```
  You are a seasoned sales coach with expertise in complex B2B deals.
  When a rep shares deal context, you:
  1. Identify deal risks and blockers
  2. Suggest the right play for the current stage
  3. Provide objection handling scripts for common pushbacks
  4. Recommend next steps with specific actions and owners
  5. Predict deal health based on engagement signals
  You use MEDDIC/MEDDPICC methodology. You're direct and tactical — no fluff.
  Every response ends with: "Next best action: [specific step]"
  ```
- **Model:** High-capability

**Proposal Writer**
- **Role:** Creates personalized proposals and SOWs from deal context.
- **System Prompt:**
  ```
  You are a proposal specialist. You craft compelling, personalized proposals that win deals.
  Given: prospect name, pain points, budget, use case, and competitive context, you write:
  - Executive summary (tailored to their pain)
  - Proposed solution (matched to their use case)
  - ROI justification (with numbers when possible)
  - Pricing and packages
  - Next steps and timeline
  Tone: Professional, confident, client-centric. Lead with their problem, not our product.
  Always request: prospect's top 3 priorities and biggest objection before drafting.
  ```
- **Model:** High-capability

---

### Template 5 — General / Custom

**Tagline:** A flexible AI workspace. You define the workflow.

#### Channels
| Channel | Purpose |
|---------|---------|
| `#general` | Team communication |
| `#projects` | Project tracking and discussion |
| `#ai-workspace` | Primary AI interaction channel |

#### Agents

**General Assistant**
- **Role:** All-purpose AI assistant. Answers questions, summarizes, drafts, researches.
- **System Prompt:**
  ```
  You are a helpful, intelligent AI assistant for [workspace_name].
  You help with: research, writing, summarizing, brainstorming, answering questions, and analysis.
  You are direct, clear, and concise. You ask clarifying questions when the request is ambiguous.
  You format output for readability: use bullet points, numbered lists, and headers when appropriate.
  You are honest about uncertainty — you say "I don't know" rather than guess.
  ```
- **Model:** Mid-tier (balanced cost/quality)

**Research Agent**
- **Role:** Deep research, fact-checking, and synthesis.
- **System Prompt:**
  ```
  You are a thorough research specialist. When given a research task:
  1. Break it into sub-questions
  2. Gather information systematically
  3. Evaluate source credibility
  4. Synthesize findings into a structured report
  5. Highlight gaps, uncertainties, and recommended next steps
  Format: Executive summary → Key findings → Detailed analysis → Sources → Open questions.
  You prioritize accuracy over speed. Flag anything you're uncertain about.
  ```
- **Model:** High-capability

**Task Manager**
- **Role:** Project coordination, task extraction, and follow-up tracking.
- **System Prompt:**
  ```
  You are a project management assistant. You help teams stay organized by:
  1. Extracting action items from meeting notes or conversations
  2. Assigning owners and deadlines when mentioned
  3. Tracking open tasks and flagging overdue items
  4. Generating status summaries on demand
  5. Creating structured project briefs from rough ideas
  Format tasks as: [ ] Task — Owner — Due Date — Priority
  You are proactive about follow-ups and don't let things fall through the cracks.
  ```
- **Model:** Fast/mid-tier

---

## 3. User vs Admin Experience

### Regular User — Chat-First Interface

**What they see on first login (post-onboarding):**

1. **Sidebar:** Only the channels relevant to them (based on use case). No raw RC admin links.
2. **Home tab:** A simplified "My Workspace" panel showing:
   - Active agents they can talk to
   - Recent conversations
   - Quick-access shortcuts (e.g., "Ask Support Agent")
3. **AI Interaction:** Agents appear as bot users in channels. Users just @ mention or DM the agent.
4. **No `/admin` link** in the sidebar for non-admin roles.
5. **Help:** A persistent "?" button that opens Vutler's help agent in `#vutler-onboarding`.

**What they DON'T see:**
- RC's raw admin panel
- Agent configuration screens
- LLM key management
- Provisioning settings
- Other tenants (multi-tenant isolation)

---

### Admin — Dashboard-First Interface

**What they see:**

1. **Standard RC + Vutler Sidebar** with an **"Admin" badge** in the header.
2. **Quick access:** A floating "⚙ Admin" button (bottom-right) visible only to admins.
3. **`/admin` dashboard** (Vutler custom, not raw RC admin) showing:
   - **Overview:** Active users, agent conversations/24h, LLM usage, cost estimate
   - **Agents:** List of all agents with status, last active, conversation count, model assigned
   - **Onboarding:** Re-run wizard, view/edit current template, configure additional channels
   - **LLM Keys:** Manage BYOLLM keys, switch models per agent, view usage by agent
   - **Team:** Invite users, manage roles, set permissions
   - **Marketplace:** Browse and install templates
   - **Billing:** Usage, plan, invoices (if applicable)

4. **Contextual admin shortcuts:** When viewing a channel, an admin sees a ⚙ icon in the channel header with quick actions: "Edit agent," "View conversation logs," "Adjust model."

---

### Switching Between Views

| Action | How |
|--------|-----|
| Admin → Admin Dashboard | Click "⚙ Admin" floating button or navigate to `/admin` |
| Admin → User View | Toggle "Preview as User" switch in `/admin` header — shows admin what users see |
| User → Request Admin Access | Not available. Admins must grant the role. |
| Admin → Raw RC Admin | Hidden by default. Accessible via `/admin/advanced` with a confirmation prompt: "This is the advanced RC admin panel. Changes here may break your workspace." |

**Role hierarchy:**
- `owner` — Full access, billing, can delete workspace
- `admin` — Full Vutler admin, cannot manage billing
- `moderator` — Channel management, user management
- `user` — Standard chat access
- `agent` — Can view assigned channels, no admin access

---

## 4. Technical Requirements

### 4.1 New API Endpoints

All endpoints under `/api/v1/vutler/onboarding/`

#### `POST /api/v1/vutler/onboarding/start`
Initializes the onboarding session.
```json
Request:
{
  "workspaceName": "Acme Support",
  "teamSize": "small_team",
  "useCase": "customer_support",
  "adminRole": "admin"
}

Response:
{
  "sessionId": "onb_abc123",
  "previewChannels": ["#support", "#escalations", "#knowledge-base"],
  "previewAgents": ["Triage Bot", "Support Agent", "Escalation Manager"],
  "estimatedSetupSeconds": 15
}
```

#### `POST /api/v1/vutler/onboarding/configure-llm`
Sets LLM preferences and validates BYOLLM keys.
```json
Request:
{
  "sessionId": "onb_abc123",
  "mode": "byollm",
  "providers": [
    { "provider": "openai", "apiKey": "sk-..." },
    { "provider": "anthropic", "apiKey": "sk-ant-..." }
  ],
  "agentCount": "standard"
}

Response:
{
  "validated": [
    { "provider": "openai", "status": "ok", "models": ["gpt-4o", "gpt-4o-mini"] },
    { "provider": "anthropic", "status": "ok", "models": ["claude-3-5-sonnet-20241022"] }
  ],
  "failed": []
}
```

#### `POST /api/v1/vutler/onboarding/provision`
Executes the full workspace provisioning. Returns a stream of SSE events.
```
GET /api/v1/vutler/onboarding/provision/stream?sessionId=onb_abc123

SSE Events:
data: {"step": "workspace", "status": "done", "detail": "Workspace 'Acme Support' configured"}
data: {"step": "channels", "status": "done", "detail": "6 channels created"}
data: {"step": "agents", "status": "done", "detail": "3 agents deployed"}
data: {"step": "llm", "status": "done", "detail": "Models assigned"}
data: {"step": "messages", "status": "done", "detail": "Welcome messages posted"}
data: {"step": "complete", "status": "done", "redirectUrl": "/channel/support"}
```

#### `GET /api/v1/vutler/onboarding/templates`
Returns available templates with metadata.

#### `POST /api/v1/vutler/onboarding/templates/:templateId/install`
Installs a marketplace template post-setup.

#### `GET /api/v1/vutler/onboarding/status`
Returns current onboarding state (for re-entry and resume).

#### `POST /api/v1/vutler/onboarding/reset`
Admin-only: Resets and re-runs onboarding wizard.

---

### 4.2 RC Settings to Auto-Configure

The provisioning service will call the existing RC API (`/api/v1/`) to configure:

| Setting | RC API Call | Value Set |
|---------|-------------|-----------|
| Workspace name | `POST /api/v1/settings/Site_Name` | From Step 1 |
| Default language | `POST /api/v1/settings/Language` | Detected from browser |
| User registration | `POST /api/v1/settings/Accounts_RegistrationForm` | Disabled (admin-invite only post-setup) |
| Default role | `POST /api/v1/settings/Accounts_Default_User_Registrationroles` | `user` |
| Password policy | `POST /api/v1/settings/Accounts_Password_Policy_Enabled` | `true` |
| Create channels | `POST /api/v1/channels.create` | Per template |
| Create bots | `POST /api/v1/users.create` (role: bot) | Per template |
| Pin welcome message | `POST /api/v1/chat.pinMessage` | Per channel |
| Omnichannel (if support) | `POST /api/v1/settings/Livechat_enabled` | `true` for support use case |
| E2E encryption | Leave default (off) — user opt-in later | — |

---

### 4.3 Agent Provisioning Service

A new `AgentProvisioningService` (server-side) handles:

1. **Template loading** from `vutler/templates/*.json`
2. **System prompt interpolation** — replaces `[workspace_name]`, `[use_case]`, etc.
3. **LLM assignment** — maps agent tier (fast/mid/high) to the validated provider models
4. **Bot user creation** with avatar, display name, and role
5. **Channel creation and agent assignment** — adds bot to relevant channels
6. **Welcome message posting** — posts and pins the welcome message via bot token

LLM tier → model mapping (Vutler-hosted defaults):
```json
{
  "fast": "vutler/llama-3.1-8b",
  "mid": "vutler/claude-3-haiku",
  "high": "vutler/claude-3-5-sonnet"
}
```

BYOLLM overrides use the user's validated keys and preferred models from Step 2.

---

### 4.4 Integration with Sprint 8 Features

#### Multi-Tenant Integration

- Onboarding is **tenant-scoped** — all provisioned resources are isolated per tenant.
- The `sessionId` is prefixed with the tenant ID: `t_{tenantId}_onb_{uuid}`.
- Provisioning service reads from `TenantContext` to scope all RC API calls.
- Admin dashboard shows only the current tenant's agents, channels, and LLM usage.
- Cross-tenant agent templates can be published via the marketplace (shared template registry, not shared data).

#### Snipara Provisioning Integration

- When `agentCount === 'enterprise'` or team size is `enterprise`, the provisioning flow calls Snipara's provisioning API to:
  - Allocate a dedicated compute tier for the agent fleet
  - Set up agent memory/context stores per tenant
  - Configure rate limits based on plan
- Snipara `project_id` for Vutler: `cml6gjyx9000bqpf52zi7yj82` (from TOOLS.md)
- Agent system prompts and configurations are indexed in Snipara for semantic search (enables "find agents similar to X" in marketplace).
- Post-provisioning: agent configs are uploaded to Snipara via `rlm_upload_document` for RAG-powered agent management queries in the admin dashboard.

#### Marketplace Integration

- Template registry is backed by Snipara — each template is a document with metadata tags.
- Post-onboarding suggestions are generated via `rlm_context_query` using the workspace profile as the query.
- One-click template install calls `POST /api/v1/vutler/onboarding/templates/:id/install` which re-runs a scoped provisioning pass.

---

### 4.5 Frontend Implementation Notes

- **Framework:** Existing RC frontend (React). Wizard lives in a new `OnboardingWizard` component mounted at `/onboarding` route.
- **State management:** Wizard state in a `useOnboarding` hook backed by `localStorage` for resume-on-refresh.
- **SSE streaming:** Provisioning progress uses the browser's `EventSource` API.
- **Skip/resume:** If onboarding is incomplete on next login, show a dismissible banner: "Finish setting up your workspace →"
- **Analytics:** Track each step completion event to measure funnel drop-off.

---

## 5. Success Metrics

### Primary KPIs

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Time to first agent conversation | < 2 minutes from signup | Timestamp: account_created → first_agent_message_sent |
| Onboarding completion rate | > 80% | wizard_started events / wizard_completed events (7-day window) |
| User activation | > 60% within 24h | Users who send ≥1 message to an agent within 24h of signup |

### Secondary KPIs

| Metric | Target | Notes |
|--------|--------|-------|
| Provisioning success rate | > 99% | Failed provisioning steps trigger auto-retry + alert |
| Step 2 BYOLLM key validation success | > 90% | Keys that pass validation on first attempt |
| Wizard skip rate per step | < 15% | High skip rate signals friction — audit that step |
| Template install rate (post-onboarding) | > 30% | Measures marketplace discovery effectiveness |
| Time to first team invite sent | < 10 minutes | For team/enterprise sizes |
| 7-day retention (login on day 7) | > 50% | Proxy for workspace value delivered |

### Measurement Infrastructure

- **Event tracking** on every wizard interaction: `onboarding.step_viewed`, `onboarding.step_completed`, `onboarding.step_skipped`, `onboarding.completed`, `onboarding.abandoned`.
- Events are sent to Vutler's analytics service (not RC's analytics — tenant-private).
- A/B test hooks on Step 1 and Step 3 CTA copy (shipped as feature flags).
- Admin dashboard widget: "Onboarding funnel" — shows completion rate for the workspace's team members.

### Alerting

- If provisioning step fails > 1% of attempts → PagerDuty alert.
- If onboarding completion rate drops below 70% (7-day rolling) → Slack alert to product team.
- If TTFA (time to first agent conversation) p50 exceeds 3 minutes → review and flag for UX audit.

---

## 6. Open Questions & Decisions Needed

| # | Question | Owner | Priority |
|---|----------|-------|----------|
| 1 | Should Vutler-hosted LLM costs be metered per tenant from day 1, or is there a free tier? | Product / Finance | High |
| 2 | Is the onboarding wizard shown to all new users or only the first admin who creates the workspace? | Product | High |
| 3 | What happens if provisioning fails mid-way? Manual recovery flow needed? | Engineering | High |
| 4 | Should the wizard support re-running after initial setup? (e.g., switching use case) | Product | Medium |
| 5 | Enterprise path — should "Talk to us" CTA block wizard completion or run in parallel? | Sales / Product | Medium |
| 6 | Multi-language wizard support for v1 or deferred? | Engineering | Low |
| 7 | Should BYOLLM keys be stored in Vutler's vault or per-user? | Security / Engineering | High |
| 8 | Is the Snipara provisioning call sync or async during wizard Step 3? | Engineering | Medium |

---

## 7. Implementation Phases

### Phase 1 — MVP (Sprint 9)
- Wizard UI (3 steps, desktop-first)
- Provisioning for 3 templates: Customer Support, Dev, General
- Vutler-hosted LLM only (no BYOLLM)
- Basic success metrics tracking

### Phase 2 — Full Launch (Sprint 10)
- All 5 templates
- BYOLLM support (OpenAI + Anthropic)
- SSE streaming progress screen
- Marketplace template suggestions post-onboarding
- Mobile/PWA optimization

### Phase 3 — Growth (Sprint 11+)
- Full BYOLLM provider support (Google, Groq, Others)
- Onboarding A/B testing framework
- Enterprise path with Snipara advanced provisioning
- Admin "re-run onboarding" flow
- Multi-language support

---

*Brief written by Luna — AI Agent, Vutler Product Team.*  
*For review: Product, Engineering, Design.*  
*Last updated: 2026-02-17*
