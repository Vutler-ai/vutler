# BMAD Phase B — Business Analysis
# Feature: Mail Approval Workflow
# Product: Vutler (app.vutler.ai)
# Author: Luna (Product Owner)
# Date: 2026-03-08
# Status: DRAFT → Ready for Architecture Review

---

## 1. Executive Summary

Vutler's Mail Approval Workflow enables AI agents to auto-draft email replies to incoming messages while keeping a human (Alex) in the loop for review, editing, and final approval before sending. The system also supports manual composition — as oneself or on behalf of any agent — and routes group inboxes (terms@, support@, sales@, etc.) to the appropriate agent for drafting.

**Core principle**: No email leaves the system without explicit human approval.

---

## 2. Personas

### 2.1 Alex — Admin / Owner (Primary User)

| Attribute | Detail |
|-----------|--------|
| Role | Founder & sole operator of Starbox Group |
| Email identity | alex@starbox-group.com (personal), alex@vutler.com |
| Technical level | High — comfortable with dev tools, APIs, infrastructure |
| Pain points | Manually replying to repetitive emails (legal, compliance, support); context-switching between agents |
| Goals | Delegate routine email replies to AI agents; maintain quality & brand voice; reduce response time from hours to minutes |
| Trust model | Wants to see every draft before it goes out (MVP); may relax to auto-send for low-risk categories later |
| Device usage | Primarily desktop (macOS); occasional mobile (iPhone) for urgent approvals |

### 2.2 Future Team Member — Restricted User (Post-MVP)

| Attribute | Detail |
|-----------|--------|
| Role | Employee or contractor with limited inbox access |
| Permissions | View/approve only assigned group inboxes; cannot send as Alex or unassigned agents |
| Goals | Handle their domain's emails efficiently without seeing unrelated traffic |
| Trust model | Admin-defined approval rules per user |

### 2.3 External Sender (Implicit Persona)

Not a system user, but important to model: anyone emailing alex@, terms@, support@, etc. They expect timely, coherent, professional replies. They must never perceive they are talking to a bot unless explicitly disclosed.

---

## 3. User Stories

### US-1: View Unified Inbox
**As** Alex,
**I want** to see all incoming emails across my personal and group addresses in a single inbox view,
**so that** I don't need to check multiple mailboxes and can triage everything from one place.

**Acceptance Criteria:**
- Inbox displays emails to alex@starbox-group.com, alex@vutler.com, and all group addresses
- Each email shows: sender, subject, timestamp, target address, read/unread status
- Emails are sorted by most recent first (default)
- Unread count is visible in the sidebar

### US-2: Read Email Threads
**As** Alex,
**I want** to view a full email thread (all messages in a conversation) in a clean reading pane,
**so that** I have full context before reviewing or replying.

**Acceptance Criteria:**
- Clicking an email opens the thread view with all related messages
- Messages are displayed chronologically (oldest first)
- Original sender, CC, BCC, and attachments are visible
- HTML emails render correctly; plain-text fallback available

### US-3: Agent Auto-Drafts Reply
**As** Alex,
**I want** the assigned AI agent to automatically generate a draft reply when a new email arrives in a group inbox,
**so that** I have a ready-to-review response without writing from scratch.

**Acceptance Criteria:**
- When an email arrives at a group address (e.g., terms@vutler.ai), the mapped agent (e.g., Andrea) generates a draft
- The draft is saved with status `pending_approval`
- The draft appears in the thread view with a visible "HUMAN APPROVAL REQUIRED" banner
- The draft includes the agent's name as author (e.g., "Drafted by Andrea")
- Auto-drafting happens within 60 seconds of email ingestion
- If no agent is mapped to the address, no draft is generated (email awaits manual handling)

### US-4: Approve, Edit, or Reject Agent Draft
**As** Alex,
**I want** to review an agent's draft and either approve it as-is, edit it before sending, or reject it entirely,
**so that** I maintain full control over outbound communication quality.

**Acceptance Criteria:**
- Three actions available on pending drafts: **Send Now**, **Edit Draft**, **Regenerate**
- "Send Now" sends the draft immediately via Postal SMTP and marks it as `sent`
- "Edit Draft" opens an inline editor; after editing, user can Send or save as draft
- "Regenerate" asks the agent to produce a new draft (previous draft is archived, not deleted)
- Rejected/regenerated drafts are kept in history for audit
- Confirmation dialog before "Send Now" to prevent accidental sends

### US-5: Compose New Email as Self
**As** Alex,
**I want** to compose and send a new email as myself (alex@starbox-group.com),
**so that** I can initiate conversations that come directly from me.

**Acceptance Criteria:**
- "Compose" button opens a new email form
- Default sender is alex@starbox-group.com
- Standard fields: To, CC, BCC, Subject, Body (rich text)
- Email is sent via Postal SMTP with correct From/Reply-To headers
- Sent email appears in the Sent folder

### US-6: Compose Email as Agent
**As** Alex,
**I want** to compose and send an email on behalf of a specific AI agent (using the agent's voice/persona),
**so that** the recipient receives a response consistent with that agent's role and style.

**Acceptance Criteria:**
- Sender selector dropdown lists all 13 agents + personal addresses
- When composing as an agent, the From address uses the group address the agent is mapped to
- The agent's system prompt / persona is available as context (optional: "Generate draft" button that uses the agent's LLM to write the body)
- Reply-To is set appropriately (group address, not agent-specific)

### US-7: Filter and Search Emails
**As** Alex,
**I want** to filter emails by status (All / Unread / Flagged / Agent-handled) and search by keyword,
**so that** I can quickly find specific conversations or focus on items needing attention.

**Acceptance Criteria:**
- Filter tabs: All, Unread, Flagged, Agent-handled (has pending or sent draft)
- Search bar searches across: sender, subject, body text
- Results update in real-time (or < 500ms)
- Active filter is visually indicated

### US-8: Group Email Routing
**As** Alex,
**I want** emails to group addresses (terms@, privacy@, support@, etc.) to be automatically routed to the correct AI agent for drafting,
**so that** each domain-specific inquiry gets a contextually appropriate response.

**Acceptance Criteria:**
- Routing table is configurable (admin settings)
- Current mappings (from HEARTBEAT.md) are pre-loaded:
  - terms@ → Andrea (Legal)
  - privacy@ → Andrea (Legal)
  - soc2@ → Andrea (Legal)
  - contact@ → Mia (Comms)
  - support@ → Rex (Support)
  - sales@ → Mia (Comms)
  - legal@ → Andrea (Legal)
  - info@ → Mia (Comms)
  - hr@ → Sophia (HR)
  - security@ → Rex (Support)
- If a group address has no mapping, email lands in inbox without auto-draft
- Routing changes take effect immediately (no restart required)

### US-9: Mobile-Friendly Approval
**As** Alex,
**I want** to review and approve agent drafts from my phone,
**so that** urgent emails don't wait until I'm at my desk.

**Acceptance Criteria:**
- Email UI is responsive (works on 375px+ screens)
- Approval actions (Send Now / Edit / Regenerate) are accessible on mobile
- Thread view is readable on small screens
- Page loads in < 3 seconds on 4G

### US-10: Draft Audit Trail
**As** Alex,
**I want** a history of all drafts generated for each email thread (including regenerated and rejected versions),
**so that** I can review agent performance and improve prompts over time.

**Acceptance Criteria:**
- Each thread shows draft history (collapsed by default)
- Each draft entry shows: agent name, timestamp, status (sent/rejected/regenerated), content
- Drafts are never hard-deleted

---

## 4. Success Metrics

### 4.1 Quantitative KPIs

| Metric | Baseline (current) | MVP Target | Measurement |
|--------|-------------------|------------|-------------|
| **Avg. email response time** | 4-24 hours (manual) | < 30 minutes (with approval) | Timestamp: email received → reply sent |
| **Draft approval rate** | N/A | > 70% approved as-is or with minor edits | `sent` drafts / total drafts generated |
| **Draft regeneration rate** | N/A | < 20% | `regenerated` / total drafts |
| **Auto-draft generation time** | N/A | < 60 seconds | Timestamp: email ingested → draft created |
| **Emails processed per day** | ~10 manual | 30+ with agent assist | Count of sent replies per day |
| **UI load time (inbox)** | N/A | < 2 seconds | First contentful paint |
| **Mobile approval rate** | 0% | > 15% of approvals | Approvals from mobile viewport |

### 4.2 Qualitative Goals

| Goal | How to Assess |
|------|--------------|
| **Alex trusts agent drafts** | Approval rate trends upward over 4 weeks; fewer edits per draft |
| **Brand voice consistency** | Spot-check sent emails weekly; no recipient complaints about tone |
| **Reduced cognitive load** | Alex self-reports less time/stress on email (monthly check-in) |
| **No "oops" sends** | Zero unintended emails sent in first 30 days |
| **Clear audit trail** | Alex can answer "what did we reply to X?" in < 30 seconds |

---

## 5. User Flow Diagrams

### Flow 1: Incoming Email → Agent Auto-Draft → Human Approval → Send

```
┌─────────────┐
│ External     │
│ sender sends │
│ email to     │
│ support@     │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Postal receives  │
│ email on         │
│ mail.vutler.ai   │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ IMAP poller      │
│ fetches new      │
│ email            │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ API ingests      │
│ email into       │
│ PostgreSQL       │
│ (status: new)    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐     ┌──────────────┐
│ Routing engine   │────▶│ No mapping?  │──▶ Email sits in inbox
│ looks up agent   │     │ Skip draft   │    (manual handling)
│ for support@     │     └──────────────┘
└──────┬──────────┘
       │ Agent found: Rex
       ▼
┌─────────────────┐
│ Rex (LLM) reads  │
│ thread context + │
│ agent persona    │
│ → generates      │
│   draft reply    │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Draft saved      │
│ status:          │
│ pending_approval │
│ + notification   │
│   to Alex        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Alex opens       │
│ inbox, sees      │
│ "APPROVAL        │
│  REQUIRED"       │
│ banner           │
└──────┬──────────┘
       │
       ▼
   ┌───┴────┐
   │ Action │
   └───┬────┘
       │
  ┌────┼──────────┐
  ▼    ▼          ▼
SEND  EDIT     REGENERATE
NOW   DRAFT    (new draft)
  │    │          │
  │    ▼          │
  │  Edit text    │
  │  then SEND    │
  │    │          │
  ▼    ▼          ▼
┌─────────────┐  ┌──────────────┐
│ Postal SMTP │  │ Rex generates │
│ sends email │  │ new draft     │
│ status:sent │  │ (loop back)   │
└─────────────┘  └──────────────┘
```

### Flow 2: User Composes New Email (as Self or as Agent)

```
┌─────────────────┐
│ Alex clicks      │
│ "Compose"        │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Compose form     │
│ opens            │
│                  │
│ Sender: dropdown │
│ [alex@starbox..] │
│ [Agent: Andrea]  │
│ [Agent: Rex]     │
│ [Agent: Mia]     │
│ ...              │
└──────┬──────────┘
       │
  ┌────┴────┐
  ▼         ▼
AS SELF   AS AGENT
  │         │
  │         ▼
  │    ┌──────────────┐
  │    │ Optional:     │
  │    │ "Generate     │
  │    │  Draft" btn   │
  │    │ Agent LLM     │
  │    │ writes body   │
  │    └──────┬───────┘
  │           │
  ▼           ▼
┌─────────────────┐
│ Fill To/CC/BCC   │
│ Subject, Body    │
│ (rich text)      │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Click Send       │
│                  │
│ From: selected   │
│ sender identity  │
│ Via: Postal SMTP │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ Saved to Sent    │
│ folder with      │
│ sender metadata  │
└─────────────────┘
```

### Flow 3: Group Email Routing (terms@ → Andrea)

```
┌──────────────────┐
│ Incoming email    │
│ To: terms@        │
│    vutler.ai      │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Routing table     │
│ lookup            │
│                   │
│ terms@ ──► Andrea │
│ privacy@ ► Andrea │
│ support@ ► Rex    │
│ sales@ ──► Mia    │
│ hr@ ─────► Sophia │
│ contact@ ► Mia    │
│ security@► Rex    │
│ soc2@ ───► Andrea │
│ legal@ ──► Andrea │
│ info@ ───► Mia    │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Andrea receives   │
│ thread context:   │
│ - Original email  │
│ - terms@ persona  │
│ - Legal templates │
│ - Company context │
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Andrea generates  │
│ draft reply       │
│                   │
│ From: terms@      │
│   vutler.ai       │
│ Drafted-by:       │
│   Andrea (Legal)  │
│ Status:           │
│   pending_approval│
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│ Alex reviews in   │
│ inbox             │
│ (same as Flow 1)  │
└──────────────────┘
```

---

## 6. Scope Definition

### 6.1 MVP (v1) — In Scope

| # | Feature | Priority |
|---|---------|----------|
| 1 | Unified inbox view (all addresses) | P0 |
| 2 | Email thread reading pane | P0 |
| 3 | Agent auto-draft on incoming group emails | P0 |
| 4 | Approval workflow (Send Now / Edit / Regenerate) | P0 |
| 5 | "HUMAN APPROVAL REQUIRED" banner on pending drafts | P0 |
| 6 | Compose new email as self (alex@starbox-group.com) | P0 |
| 7 | Compose/send as agent (via group address) | P1 |
| 8 | Group email → agent routing (configurable table) | P0 |
| 9 | Filters: All / Unread / Flagged / Agent-handled | P1 |
| 10 | Basic search (sender, subject) | P1 |
| 11 | Responsive layout (mobile-friendly approval) | P1 |
| 12 | Draft audit trail (history per thread) | P2 |
| 13 | Sidebar: Inbox / Sent / Drafts / Archive folders | P0 |
| 14 | Sidebar: AI Agents list with status | P1 |
| 15 | Email sending via Postal SMTP (mail.vutler.ai) | P0 |

**MVP Technical Constraints:**
- Single user (Alex) — no multi-user auth in v1
- IMAP polling (existing launchd job) — not real-time push
- PostgreSQL as email store (existing schema)
- Frontend integrated into app.vutler.ai (not a separate app)

### 6.2 Post-MVP — Out of Scope for v1

| Feature | Rationale |
|---------|-----------|
| Auto-send (no approval) for low-risk categories | Requires trust calibration; too risky for v1 |
| Multi-user access with role-based permissions | Alex is sole user for now |
| Email signatures per agent/identity | Nice-to-have; manual workaround sufficient |
| Attachment handling in drafts | Complexity; text-only replies in v1 |
| Calendar invites / meeting scheduling | Separate feature domain |
| Email analytics dashboard | Need data first; build after 30 days |
| Spam/junk filtering | Postal handles basic filtering already |
| Real-time push (webhook from Postal) | IMAP polling is sufficient for MVP volume |
| Bulk actions (archive/delete multiple) | Low priority for single user |
| Email templates library | Agents handle templating via prompts |
| Integration with Rocket.Chat notifications | Separate channel; in-app notifications sufficient |
| Custom domain sender addresses | Postal config; defer until needed |
| Full-text body search | Requires search index; basic search sufficient |
| Draft quality scoring (automated) | Needs baseline data; track manually first |
| Agent prompt tuning UI | Use existing agent config for now |

---

## 7. Data Model (High-Level)

For architecture handoff — key entities:

```
emails
├── id (uuid)
├── workspace_id
├── message_id (SMTP Message-ID)
├── thread_id (conversation grouping)
├── from_address
├── to_addresses[] 
├── cc_addresses[]
├── subject
├── body_text
├── body_html
├── direction (inbound / outbound)
├── status (new / read / archived)
├── target_group_address (which group inbox received it)
├── created_at
└── attachments (jsonb, metadata only in v1)

email_drafts
├── id (uuid)
├── email_id (FK → emails, the email being replied to)
├── thread_id
├── agent_id (which agent drafted it)
├── body_text
├── body_html
├── status (pending_approval / approved / sent / rejected / regenerated)
├── approved_by (user_id)
├── approved_at
├── sent_at
├── version (incrementing per regeneration)
└── created_at

agent_email_routing
├── group_address (e.g., terms@vutler.ai)
├── agent_id (FK → agents)
├── is_active (boolean)
└── updated_at
```

---

## 8. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Agent sends inappropriate/incorrect reply | High | Medium | Mandatory human approval in MVP; no auto-send |
| IMAP polling misses emails or has delays | Medium | Low | Poll every 30s; add health check; post-MVP move to webhooks |
| Postal SMTP deliverability issues | High | Low | SPF/DKIM/DMARC already configured; monitor bounce rates |
| Agent draft quality is poor → high rejection rate | Medium | Medium | Track regeneration rate; tune prompts iteratively |
| Alex overwhelmed by approval queue | Medium | Medium | Prioritize by group address; post-MVP add auto-send for trusted categories |
| Email thread grouping is incorrect | Medium | Medium | Use In-Reply-To + References headers; fallback to subject matching |

---

## 9. Dependencies

| Dependency | Status | Owner |
|------------|--------|-------|
| Postal SMTP (mail.vutler.ai) | ✅ Running | Infra |
| IMAP polling (com.starbox.email-poll) | ✅ Running | Infra |
| PostgreSQL email tables | ✅ Exists (basic) | Backend |
| API endpoints /api/v1/email(s) | ✅ Exists (basic) | Backend |
| 13 AI agents configured | ✅ Exists | Platform |
| Agent routing table (HEARTBEAT.md) | ✅ Defined | Config |
| LLM access (OpenAI/Anthropic) | ✅ Active | Platform |
| Frontend framework (app.vutler.ai) | ✅ Exists | Frontend |

---

## 10. Open Questions

1. **Notification mechanism**: How should Alex be notified of pending approvals? In-app badge? Browser notification? Push to mobile?
2. **Draft editing**: Should the editor support rich text (HTML) or plain text only in v1?
3. **CC/BCC handling**: When an agent drafts a reply, should CC recipients from the original email be preserved by default?
4. **Thread detection**: Should we rely solely on SMTP headers (In-Reply-To/References) or also use subject-line matching?
5. **Rate limiting**: Should agents be limited in how many drafts they generate per hour (to prevent LLM cost spikes)?

---

## 11. Handoff Checklist

- [x] User stories defined (10 stories)
- [x] Success metrics defined (quantitative + qualitative)
- [x] User flows diagrammed (3 flows)
- [x] Personas documented (2 + implicit)
- [x] MVP scope defined with priorities
- [x] Post-MVP backlog outlined
- [x] High-level data model sketched
- [x] Risks identified with mitigations
- [x] Dependencies catalogued
- [x] Open questions listed

**Next Phase**: BMAD Phase C (Architecture) — System design, API contracts, database schema, integration patterns.

---

*Document prepared by Luna (Product Owner) — 2026-03-08*
*For: Vutler Mail Approval Workflow — Starbox Group*
