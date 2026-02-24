# Sprint S18 — Vutler Mail — Technical Specification

## Overview

Integrated email system leveraging the existing Postal mail server on the VPS. Each agent gets a dedicated mailbox (e.g., andrea@starbox-group.com), with automatic routing rules so agents process emails matching their assigned addresses. Full inbox management via API and frontend panel with threading, labels, compose, reply, and forward.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Frontend    │────▶│  Express API │────▶│  PostgreSQL   │
│  /mail SPA   │◀────│  :3001       │◀────│  (vaultbrix)  │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
         Redis Bus    Postal SMTP   Postal HTTP API
         (agentBus)   :25/:587      :8082
                      (localhost)   (localhost)
                           │
                    ┌──────┴───────┐
                    │ imapPoller.js │  (existing service - extend)
                    │ + webhook    │
                    └──────────────┘
```

**Key files:**
- `api/mail.js` — REST endpoints (new, replaces/extends `api/email.js`)
- `services/mailManager.js` — send/receive logic, routing, threading
- `services/imapPoller.js` — existing; extend for mailbox polling
- `frontend/mail.html` — inbox/compose/thread SPA panel
- `migrations/s18-mail.sql` — schema migration

**Existing infrastructure:**
- `services/imapPoller.js` — already polls IMAP; extend for multi-mailbox
- `api/email.js` + `api/agentEmail.js` — existing email endpoints; S18 replaces with full system
- `agent_email_configs` + `agent_emails` + `email_signatures` tables — existing; S18 extends

## Database Schema

```sql
-- S18: Vutler Mail System

CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE email_status AS ENUM ('unread', 'read', 'archived', 'trashed');

CREATE TABLE mailboxes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    owner_id        VARCHAR(64) NOT NULL,          -- agent_id or user_id
    owner_type      assignee_type NOT NULL,
    email_address   VARCHAR(255) NOT NULL UNIQUE,   -- andrea@starbox-group.com
    display_name    VARCHAR(255),                    -- Andrea Lopez
    postal_server_id VARCHAR(128),                   -- Postal internal server key
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    signature_html  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_threads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    mailbox_id      UUID NOT NULL REFERENCES mailboxes(id),
    subject         VARCHAR(1000),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_count   INTEGER NOT NULL DEFAULT 1,
    snippet         VARCHAR(500),                    -- preview text
    is_starred      BOOLEAN NOT NULL DEFAULT FALSE,
    status          email_status NOT NULL DEFAULT 'unread',
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE emails (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id       UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    mailbox_id      UUID NOT NULL REFERENCES mailboxes(id),
    direction       email_direction NOT NULL,
    message_id_header VARCHAR(500),                  -- RFC Message-ID header
    in_reply_to     VARCHAR(500),                    -- for threading
    from_address    VARCHAR(255) NOT NULL,
    from_name       VARCHAR(255),
    to_addresses    JSONB NOT NULL DEFAULT '[]',     -- [{email, name}]
    cc_addresses    JSONB DEFAULT '[]',
    bcc_addresses   JSONB DEFAULT '[]',
    subject         VARCHAR(1000),
    body_text       TEXT,
    body_html       TEXT,
    attachments     JSONB DEFAULT '[]',              -- [{filename, size, content_type, storage_key}]
    postal_message_id VARCHAR(128),                  -- Postal tracking ID
    raw_headers     JSONB,
    sent_at         TIMESTAMPTZ,
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE email_labels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    name            VARCHAR(100) NOT NULL,
    color           VARCHAR(7) NOT NULL DEFAULT '#6366f1',
    system_label    BOOLEAN NOT NULL DEFAULT FALSE,  -- inbox, sent, drafts, trash
    UNIQUE(workspace_id, name)
);

CREATE TABLE email_label_assignments (
    thread_id       UUID NOT NULL REFERENCES email_threads(id) ON DELETE CASCADE,
    label_id        UUID NOT NULL REFERENCES email_labels(id) ON DELETE CASCADE,
    PRIMARY KEY (thread_id, label_id)
);

CREATE TABLE email_routing_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    VARCHAR(64) NOT NULL DEFAULT 'default',
    match_address   VARCHAR(255) NOT NULL,           -- legal@starbox-group.com or *@starbox-group.com
    target_agent_id VARCHAR(64) NOT NULL,             -- agent that processes matching emails
    auto_reply      BOOLEAN NOT NULL DEFAULT FALSE,
    priority        INTEGER NOT NULL DEFAULT 0,       -- higher = checked first
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_mailboxes_owner ON mailboxes(owner_id, owner_type);
CREATE INDEX idx_mailboxes_email ON mailboxes(email_address);
CREATE INDEX idx_threads_mailbox ON email_threads(mailbox_id, last_message_at DESC);
CREATE INDEX idx_threads_status ON email_threads(mailbox_id, status);
CREATE INDEX idx_emails_thread ON emails(thread_id, received_at);
CREATE INDEX idx_emails_message_id ON emails(message_id_header);
CREATE INDEX idx_emails_in_reply_to ON emails(in_reply_to);
CREATE INDEX idx_routing_match ON email_routing_rules(workspace_id, match_address);
```

## API Endpoints

Base: `http://localhost:3001/api/mail`  
Auth: `X-Auth-Token` + `X-User-Id`

### Mailboxes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mail/mailboxes` | List mailboxes (user's + agents they manage) |
| `POST` | `/api/mail/mailboxes` | Create mailbox (admin) |
| `PUT` | `/api/mail/mailboxes/:id` | Update mailbox settings |

### Threads & Emails

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mail/threads` | List threads (query: mailbox, status, label, search, page) |
| `GET` | `/api/mail/threads/:id` | Get thread with all emails |
| `PATCH` | `/api/mail/threads/:id` | Update thread (status, starred) |
| `DELETE` | `/api/mail/threads/:id` | Trash thread |
| `POST` | `/api/mail/threads/:id/labels` | Add label |
| `DELETE` | `/api/mail/threads/:id/labels/:labelId` | Remove label |

### Compose & Send

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/mail/send` | Compose and send email |
| `POST` | `/api/mail/reply` | Reply to email in thread |
| `POST` | `/api/mail/forward` | Forward email |

### Labels & Routing

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mail/labels` | List labels |
| `POST` | `/api/mail/labels` | Create label |
| `GET` | `/api/mail/routing` | List routing rules |
| `POST` | `/api/mail/routing` | Create routing rule |
| `PUT` | `/api/mail/routing/:id` | Update rule |
| `DELETE` | `/api/mail/routing/:id` | Delete rule |

### Search

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/mail/search` | Full-text search across emails (query, mailbox, date range) |

### Request/Response Examples

**POST /api/mail/send**
```json
// Request
{
  "from_mailbox_id": "uuid-andrea-mailbox",
  "to": [{"email": "client@example.com", "name": "Client"}],
  "cc": [],
  "subject": "Contract Review Complete",
  "body_html": "<p>Dear Client, ...</p>",
  "body_text": "Dear Client, ...",
  "attachments": []  // future: multipart upload
}
// Response 201
{
  "id": "...",
  "thread_id": "...",
  "postal_message_id": "msg_abc123",
  "status": "sent"
}
```

**POST /api/mail/reply**
```json
{
  "thread_id": "uuid-thread",
  "in_reply_to_email_id": "uuid-email",
  "from_mailbox_id": "uuid-andrea-mailbox",
  "body_html": "<p>Thank you for...</p>",
  "body_text": "Thank you for..."
}
```

**GET /api/mail/threads?mailbox_id=xxx&status=unread&page=1&limit=50**

## Frontend Panel

**File:** `frontend/mail.html`

### Component Structure
```
mail.html
├── MailApp
│   ├── MailSidebar
│   │   ├── ComposeButton
│   │   ├── MailboxSelector (dropdown: my inbox, andrea@, mike@...)
│   │   ├── LabelList (inbox, sent, drafts, trash, custom labels)
│   │   └── UnreadBadges
│   ├── ThreadList
│   │   ├── SearchBar
│   │   ├── BulkActions (archive, trash, label, mark read)
│   │   └── ThreadRow[] (from, subject, snippet, date, labels, starred)
│   ├── ThreadView
│   │   ├── ThreadHeader (subject, labels)
│   │   ├── EmailMessage[] (expandable, from/to/date, body)
│   │   └── ReplyBox (inline reply/forward)
│   └── ComposeModal
│       ├── FromSelector (mailbox picker)
│       ├── ToField (autocomplete)
│       ├── CcBccToggle + Fields
│       ├── SubjectInput
│       ├── RichTextEditor (basic: bold, italic, links, lists)
│       └── AttachButton + SendButton
```

### UI Details
- **Three-column layout:** Sidebar (labels) | Thread list | Thread view (or two-column on narrow)
- **Thread list:** Gmail-style rows: checkbox, star, from, subject+snippet, date
- **Thread view:** Stacked email cards, newest at bottom, previous collapsed
- **Compose:** Floating modal, rich text via contenteditable with toolbar
- **Agent indicator:** 🤖 badge on agent mailboxes in selector
- **Real-time:** Poll for new emails every 30s; agentBus notification on inbound

## Integration Points

### Postal Mail Server
- **SMTP send:** `nodemailer` transport to `localhost:587` (or port 25)
- **Inbound:** Two options (implement both, prefer webhook):
  1. **Postal HTTP webhook** → POST to `/api/mail/webhook/inbound` on new email
  2. **IMAP polling** via existing `imapPoller.js` as fallback
- **Postal HTTP API** (`:8082`): query delivery status, manage routes

### Redis agentBus
- **Channel:** `agents:mail` — email notifications
- **Events:**
  - `mail.inbound` — new email received, includes routing match
  - `mail.sent` — outbound email sent
  - `mail.agent_assigned` — email routed to agent for processing

### Email Routing & Agent Processing
- On inbound email, `mailManager.js` checks `email_routing_rules`:
  1. Match `to` address against rules (exact match first, then wildcard)
  2. Publish `mail.agent_assigned` to matched agent's agentBus channel
  3. Agent processes email in next heartbeat/autonomy cycle
  4. Agent can reply via API (agentRuntime calls `/api/mail/reply`)

### Snipara / Agent Tools
- `vutler_mail_inbox` — list unread emails for agent's mailbox
- `vutler_mail_read` — read specific email/thread
- `vutler_mail_reply` — compose reply
- `vutler_mail_send` — send new email

### Existing Tables Bridge
- Migrate data from `agent_email_configs` → `mailboxes`
- Migrate from `agent_emails` → `emails` + `email_threads`
- Keep `email_signatures` → move to `mailboxes.signature_html`

## Migration Script

```sql
-- File: migrations/s18-mail.sql
BEGIN;

DO $$ BEGIN CREATE TYPE email_direction AS ENUM ('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE email_status AS ENUM ('unread', 'read', 'archived', 'trashed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE assignee_type AS ENUM ('human', 'agent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables (full CREATE TABLE statements as in schema section)

-- System labels
INSERT INTO email_labels (workspace_id, name, color, system_label) VALUES
    ('default', 'inbox', '#6366f1', TRUE),
    ('default', 'sent', '#22c55e', TRUE),
    ('default', 'drafts', '#f59e0b', TRUE),
    ('default', 'trash', '#ef4444', TRUE),
    ('default', 'spam', '#dc2626', TRUE)
ON CONFLICT DO NOTHING;

-- Migrate existing agent email configs to mailboxes
INSERT INTO mailboxes (workspace_id, owner_id, owner_type, email_address, display_name)
SELECT 'default', agent_id, 'agent', email_address, display_name
FROM agent_email_configs
WHERE email_address IS NOT NULL
ON CONFLICT (email_address) DO NOTHING;

COMMIT;
```

## Test Plan

1. **Unit tests** (`tests/mail.test.js`):
   - Send email → SMTP call + DB records created
   - Receive email webhook → thread created/updated correctly
   - Threading logic: in_reply_to matching
   - Routing rules: exact match, wildcard, priority ordering
   - Label operations

2. **Integration tests**:
   - End-to-end: send email via API → Postal delivers → webhook fires → appears in inbox
   - Agent routing: inbound email to legal@ → routed to Andrea → agentBus event fired
   - Reply threading: reply to thread → message appended, thread updated

3. **Frontend tests** (manual):
   - Browse inbox, click thread, read emails
   - Compose and send email
   - Reply inline
   - Star, archive, trash, label operations
   - Search by keyword

4. **Postal integration**:
   - Verify webhook endpoint receives Postal payloads
   - Verify SMTP auth with Postal credentials
   - Test with real external email (send to/from external address)

## Story Breakdown

| # | Story | Points |
|---|-------|--------|
| 1 | Database migration: tables, types, indexes, data migration from existing | 3 |
| 2 | API: Mailbox management (CRUD) | 2 |
| 3 | API: Thread listing with filters, pagination, search | 5 |
| 4 | API: Thread detail (load all emails in thread) | 3 |
| 5 | API: Compose + send email via Postal SMTP | 5 |
| 6 | API: Reply + forward with threading | 5 |
| 7 | API: Labels CRUD + thread-label assignment | 2 |
| 8 | Service: mailManager.js — threading logic (Message-ID/In-Reply-To) | 5 |
| 9 | Service: Inbound webhook handler (Postal → DB) | 5 |
| 10 | Service: Extend imapPoller.js for multi-mailbox fallback | 3 |
| 11 | Service: Email routing rules engine | 3 |
| 12 | Service: agentBus integration (mail events) | 2 |
| 13 | Frontend: Mail layout (sidebar + thread list + thread view) | 5 |
| 14 | Frontend: Thread list with search, filters, bulk actions | 5 |
| 15 | Frontend: Thread view (stacked emails, expand/collapse) | 5 |
| 16 | Frontend: Compose modal with rich text | 5 |
| 17 | Frontend: Reply/forward inline | 3 |
| 18 | Agent tools: mail_inbox, mail_read, mail_reply, mail_send | 3 |
| 19 | Routing rules admin UI | 3 |
| 20 | Tests + documentation | 3 |

**Total: 72 story points**

## Dependencies & Risks

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| Postal server stability | Single point of failure for all email | Monitor via health check; existing server is production-ready |
| Postal webhook config | Need to configure Postal to POST to Express | Document Postal route config; test in staging first |
| SMTP auth credentials | Need Postal API key for sending | Store encrypted in `mailboxes` or env var |
| Email threading | RFC threading (In-Reply-To, References) is complex | Start with In-Reply-To matching; fall back to subject matching |
| Attachment storage | Large files could bloat PG | Store attachments in VDrive; only metadata in PG |
| Existing email tables | Migration from agent_emails must preserve data | Run migration in transaction; backup first |
| Rich text compose | ContentEditable is notoriously buggy | Keep it simple: bold/italic/links only; no custom editor |
| Spam handling | Agent mailboxes may receive spam | Postal handles spam scoring; add spam label auto-assign |
| `assignee_type` enum | Shared with S16/S17 | Migration creates if not exists |
