# Vutler Platform Audit Report

**Date**: 2026-03-27
**Auditor**: Claude Code (source code review)
**Scope**: Full platform — frontend pages, backend API, integrations, infrastructure

---

## Executive Summary

Vutler is a comprehensive AI agent office platform with ~20 frontend pages and ~60+ backend API routes. The platform is **largely functional** with real PostgreSQL-backed APIs, real WebSocket chat, and a legitimate authentication system. Production readiness is still gated by a handful of high-priority issues: several secrets and credentials remain hardcoded, authentication still leans on SHA-256 rather than bcrypt/argon2, sandbox code runs without containerization, provider API keys are stored in the clear, and a few integrations are still stubs rather than OAuth flows.

**Overall Health**: **72/100** -- Architecture is solid, recent schema/hardening work paid off, but security polish is still required before we can call the surface fully production-ready.

## Addendum — 2026-03-31

- `api/notifications.js` now ensures `tenant_vutler.notifications` exists and serves notifications directly from PostgreSQL instead of an in-memory cache, while `services/pushService.js` persists subscriptions in a new `tenant_vutler.push_subscriptions` table for durable web-push delivery.
- Manual WhatsApp mirroring artifacts (chunk-002, the mirror flag, and the inbound/outbound live checks) have been retired; the seeding scripts no longer copy the chunk documentation and the live-cutover checklist no longer toggles `VUTLER_WHATSAPP_MIRROR_ENABLED`, so the mirror endpoint is no longer part of the product surface.
- The VPS deployment audit now points to `scripts/vps-retention.sh` (documented in `docs/runbooks/vps-retention.md`) to keep disk pressure under control, and `docs/recent-2026-04.md` keeps the release snapshot aligned with the latest commits.
- Despite these wins, encrypted provider keys, rotation of hardcoded Postal/Stripe secrets, bcrypt-style password hashing, real OAuth for integrations, and a sandbox isolation plan are still outstanding before the product can be called fully production-ready.

---

## 1. Authentication & Authorization

### Login / Register
- **Status**: ✅ Working
- **Frontend**: `/login`, `/register`, `/forgot-password` pages exist. Use `useAuth` context with JWT.
- **Backend**: `api/auth.js` — SHA-256 password hashing with per-user salt, JWT generation, 24h TTL.
- **Issues**:
  - Password hashing uses SHA-256 (not bcrypt/argon2) — weak by modern standards.
  - `JWT_SECRET` defaults to `'MISSING-SET-JWT_SECRET-ENV'` — insecure if env not set.
- **Fix needed**: Migrate to bcrypt. Fail hard if JWT_SECRET is missing.

### OAuth (GitHub / Google)
- **Status**: ⚠️ Partial
- **Frontend**: Login page handles `?token=` callback from OAuth redirect.
- **Backend**: `api/auth.js` has GitHub and Google OAuth flows implemented.
- **Issues**: OAuth redirect URIs hardcoded to `https://app.vutler.ai`. Works in prod, not in dev.
- **Fix needed**: Make redirect URI configurable via env var (already done for Google, not for GitHub).

---

## 2. Dashboard

### Dashboard Page
- **Status**: ⚠️ Partial (workspace scoping)
- **Frontend**: `(app)/dashboard/page.tsx` — Calls `/api/v1/dashboard`, `/api/v1/agents`, `/api/v1/marketplace/templates`, `/api/v1/tasks`, `/api/v1/audit-logs`.
- **Backend**: `api/dashboard.js` — Queries the schema-qualified `tenant_vutler` tables, but the current implementation aggregates across every tenant and workspace.
- **Issues**:
  - The dashboard response is not scoped by `workspace_id`, so tenants see platform-wide statistics unless the route is gated to admins. This can leak usage metrics across workspaces.
- **Fix needed**: Apply `workspace_id` filters or guard the endpoint with a tenant-scoped admin check before shipping to production.

---

## 3. Chat

### Chat Page
- **Status**: ✅ Working
- **Frontend**: `(app)/chat/page.tsx` — Full-featured chat UI with channels, DMs, messages, file attachments, agent DM channels. Calls real API endpoints.
- **Backend**: `api/chat.js` — PostgreSQL-backed (`tenant_vutler.chat_channels`, `chat_messages`, `chat_channel_members`). Agent auto-response via LLM router.
- **WebSocket**: Two WS servers:
  - `websocket.js` at `/ws/chat` — API-key-authenticated (for agents)
  - `api/ws-chat.js` at `/ws/chat-pro` — JWT-authenticated (for browser UI)
- **Notes**:
  - Browser clients already connect to `/ws/chat-pro`, so no current WebSocket mismatches are outstanding.

---

## 4. Email

### Email Inbox/Compose
- **Status**: ✅ Working
- **Frontend**: `(app)/email/page.tsx` — Inbox, sent, compose, delete, mark read. Uses lucide icons.
- **Backend**: `api/email-vaultbrix.js` — PostgreSQL-backed (`tenant_vutler.emails`). Postal SMTP for sending.
- **Issues**:
  - API key for Postal is hardcoded in source: `'aa91f11a58ea9771d5036ed6429073f709a716bf-v2'`. Should be env-only.
  - `email.js` (legacy MongoDB) still exists and redirects to `/api/v1/email/inbox` which may double-mount.
- **Fix needed**: Remove hardcoded Postal API key. Clean up legacy `email.js`.

### Email Domains (Settings > Email)
- **Status**: ✅ Working
- **Frontend**: `(app)/settings/email/page.tsx` — Domain management with DNS verification UI, agent email routes, notification settings.
- **Backend**: `api/email-domains.js` — Full DNS verification (MX, SPF, DKIM, DMARC) via Node.js `dns` module. `api/email-routes.js` — Agent email assignment.
- **Issues**: None significant. Well-implemented.
- **Fix needed**: None.

---

## 5. Drive

### Drive Page
- **Status**: ✅ Working
- **Frontend**: `(app)/drive/page.tsx` — File listing, upload, download, delete, create folder, grid/list view, breadcrumb navigation, search, sorting.
- **Backend**: `api/drive.js` — **Filesystem-based** (not S3). Reads/writes to `VUTLER_DRIVE_ROOT` with tenant isolation. Path traversal protection implemented.
- **Issues**:
  - Drive is filesystem-based — won't scale in multi-node deployments without shared storage.
  - Alternative `drive-s3` route exists but is a separate mount.
- **Fix needed**: Consider migrating to S3/R2 for production. The S3 driver exists but is not the default.

---

## 6. Calendar

### Calendar Page
- **Status**: ✅ Working
- **Frontend**: `(app)/calendar/page.tsx` — Monthly calendar view, create/edit/delete events, color picker, location, time display.
- **Backend**: `api/calendar.js` — PostgreSQL-backed (`tenant_vutler.calendar_events`). Full CRUD with date range filtering.
- **Issues**: None significant.
- **Fix needed**: None.

---

## 7. Tasks

### Tasks Page
- **Status**: ✅ Working
- **Frontend**: `(app)/tasks/page.tsx` — Kanban board + table view, create/edit/delete tasks, subtasks, priority badges, assignee dropdown, Snipara sync button.
- **Backend**: `api/tasks.js` — Uses `taskRouter` service which is PostgreSQL-backed. Full CRUD + subtask support.
- **Issues**:
  - Frontend has hardcoded agent names: `["Mike", "Philip", "Luna", ...]` for assignee dropdown instead of fetching from API.
- **Fix needed**: Fetch agent names from `/api/v1/agents` for the assignee dropdown.

---

## 8. Agents

### Agent List
- **Status**: ✅ Working
- **Frontend**: `(app)/agents/page.tsx` — Table view with status badges, avatars, search, delete, templates tab for creating from marketplace.
- **Backend**: `api/agents.js` — PostgreSQL-backed. Full CRUD with workspace scoping.
- **Issues**: None.

### Agent Config (`/agents/[id]/config`)
- **Status**: ✅ Working
- **Frontend**: Config page with LLM model selection, permissions toggles, system prompt editor, secrets management, skills.
- **Backend**: `GET/PUT /api/v1/agents/:id/config` exists.
- **Issues**: None.

### Agent Executions (`/agents/[id]/executions`)
- **Status**: ✅ Working
- **Frontend**: Execution history table with status badges, detail modal.
- **Backend**: `GET /api/v1/agents/:id/executions` exists.
- **Issues**: None.

### Agent Memory (`/agents/[id]/memory`)
- **Status**: ⚠️ Partial (depends on Snipara)
- **Frontend**: Memory recall, remember, promote, delete UI. Instance/template/global scopes.
- **Backend**: `api/memory.js` — Calls Snipara API (external service). If Snipara is down, returns empty.
- **Issues**: Entirely dependent on external Snipara API. No local fallback.
- **Fix needed**: Add graceful degradation when Snipara is unavailable.

### Agent Integrations (`/agents/[id]/integrations`)
- **Status**: ⚠️ Partial
- **Frontend**: Toggle integrations (Slack, Google, GitHub) per agent.
- **Backend**: Reads from integrations API and agent config. Only 3 hardcoded providers.
- **Issues**: Limited to 3 providers. No actual integration functionality.
- **Fix needed**: Expand integration catalog or remove placeholder entries.

### Agent Publish (`/agents/[id]/publish`)
- **Status**: ⚠️ Partial
- **Frontend**: Publish agent as marketplace template with category selection.
- **Backend**: `POST /api/v1/marketplace/templates` exists.
- **Issues**: Publishing flow exists but marketplace consumption is unclear.

### Create New Agent (`/agents/new`)
- **Status**: ✅ Working
- **Frontend**: Multi-step form with name, description, model, tools, emoji selector.
- **Backend**: `POST /api/v1/agents` creates agent with auto-generated email.
- **Issues**: None.

---

## 9. Nexus

### Nexus Dashboard
- **Status**: ✅ Working
- **Frontend**: `(app)/nexus/page.tsx` — Node list with status, deploy modals (local + enterprise), client management, auto-spawn rules.
- **Backend**: `api/nexus.js` + `index.js` inline routes — PostgreSQL-backed. Token generation, node registration, heartbeat, task dispatch.
- **Issues**: None significant. Well-implemented.

### Nexus Node Detail (`/nexus/[id]`)
- **Status**: ✅ Working
- **Frontend**: Node detail with agent management, dispatch commands, spawn agents, activity log.
- **Backend**: `GET /api/v1/nexus/nodes/:id`, various action endpoints.
- **Issues**: None.

### Nexus Setup (`/nexus/setup`)
- **Status**: ✅ Working
- **Frontend**: Setup wizard page exists.
- **Issues**: None.

---

## 10. Settings

### Profile Tab
- **Status**: ✅ Working
- **Frontend**: Display name, avatar URL editing.
- **Backend**: `GET/PUT /api/v1/settings/me` — PostgreSQL-backed.
- **Issues**: None.

### Security Tab
- **Status**: ✅ Working
- **Frontend**: Password change form.
- **Backend**: `PUT /api/v1/auth/password` exists.
- **Issues**: Uses SHA-256 for password hashing (see Auth section).

### Workspace Tab
- **Status**: ✅ Working
- **Frontend**: Workspace name, description, timezone, language, default provider, LLM providers config.
- **Backend**: `api/settings.js` — Handles both KV and flat layout for `workspace_settings`. Well-implemented.
- **Issues**: None.

### Email Tab (`/settings/email`)
- **Status**: ✅ Working
- **Frontend**: Domain management, DNS records display, verification checks, agent email routes, notification preferences.
- **Backend**: `api/email-domains.js` + `api/email-routes.js` — Full implementation.
- **Issues**: None.

### Integrations Tab (`/settings/integrations`)
- **Status**: ⚠️ Partial
- **Frontend**: `(app)/settings/integrations/page.tsx` — Lists integrations with connect/disconnect, per-provider detail pages, activity log.
- **Backend**: `api/integrations.js` — PostgreSQL-backed with internal catalog (Slack, Google, GitHub). OAuth flows exist.
- **Issues**: Only 3 integrations available. No real OAuth token storage/refresh.
- **Fix needed**: Implement actual OAuth token management for connected integrations.

### API Keys Tab
- **Status**: ✅ Working
- **Frontend**: Create/list/revoke API keys with role selection (developer/admin/agent).
- **Backend**: `api/settings.js` — Full CRUD with SHA-256 key hashing, prefix display.
- **Issues**: None.

---

## 11. Billing

### Billing Page
- **Status**: ✅ Working
- **Frontend**: `(app)/billing/page.tsx` — Plan grid (Office/Agents/Full tiers), current subscription display, Stripe checkout, customer portal.
- **Backend**: `api/billing.js` — Stripe integration with real checkout session creation, webhook handling, subscription management. Feature gate middleware.
- **Issues**:
  - Hardcoded `STRIPE_ACCOUNT_ID` in source code.
  - Fallback plan data hardcoded in frontend (acceptable for offline resilience).
- **Fix needed**: Move `STRIPE_ACCOUNT_ID` to env var.

---

## 12. Memory Page (`/memory`)

- **Status**: ⚠️ Partial (depends on Snipara)
- **Frontend**: `(app)/memory/page.tsx` — Workspace knowledge editor (SOUL.md/MEMORY.md/USER.md), template scopes viewer, memory search, per-agent memory recall.
- **Backend**: `api/memory.js` — Calls Snipara MCP API for all operations.
- **Issues**: Entirely dependent on external Snipara service. Returns empty when unavailable.
- **Fix needed**: Add PostgreSQL fallback for basic memory storage.

---

## 13. Usage Page

- **Status**: ✅ Working
- **Frontend**: `(app)/usage/page.tsx` — Token usage tracking with per-agent breakdown, cost estimation, time period filtering.
- **Backend**: `api/usage-pg.js` — PostgreSQL-backed. Tries multiple table layouts. Returns zeros when empty.
- **Issues**: Legacy `api/usage.js` still exists and redirects (harmless).
- **Fix needed**: None.

---

## 14. Sandbox Page

- **Status**: ✅ Working
- **Frontend**: `(app)/sandbox/page.tsx` — Code execution (JS, Python, Shell) with syntax highlighting, execution history, batch mode.
- **Backend**: `api/sandbox.js` — Real code execution via `child_process` with timeout enforcement. PostgreSQL persistence.
- **Issues**:
  - **SECURITY**: Executes arbitrary code via `child_process` with no sandboxing beyond timeouts. This is a serious security risk in multi-tenant environments.
- **Fix needed**: Run code execution in Docker containers or firejail.

---

## 15. Integrations Page (`/integrations`)

- **Status**: ⚠️ Partial
- **Frontend**: `(app)/integrations/page.tsx` — Displays Slack, Google, GitHub with connect buttons. Uses `authFetch` directly.
- **Backend**: `api/integrations.js` — Internal catalog mode. PostgreSQL-backed connection records.
- **Issues**:
  - Only 3 integrations.
  - Connecting is just a DB record — no actual OAuth flow for most providers.
  - Frontend has default providers hardcoded.
- **Fix needed**: Implement real OAuth flows or mark as "coming soon".

---

## 16. Providers Page

- **Status**: ⚠️ Partial (key encryption)
- **Frontend**: `(app)/providers/page.tsx` — LLM provider management (add, edit, delete, toggle active). Supports OpenAI, Anthropic, Groq, Mistral, OpenRouter, Ollama.
- **Backend**: `api/providers.js` — Reads and writes `tenant_vutler.llm_providers` with schema-qualified queries, but new rows inherit `api_key` in the clear since encryption is only triggered when decrypting the legacy `workspace_llm_providers` table.
- **Issues**:
  - `api_key` is stored in the clear and replayed into provider requests; `CryptoService` is only used when migrating legacy rows.
  - Any database user with read privileges can retrieve working provider secrets.
- **Fix needed**: Encrypt provider API keys on write, enforce `ENCRYPTION_KEY`, and rotate existing credentials before declaring this component production-ready.

---

## 17. Notifications

- **Status**: ✅ Working (PostgreSQL)
- **Frontend**: `(app)/notifications/page.tsx` exists.
- **Backend**: `api/notifications.js` — Ensures `tenant_vutler.notifications` table exists, returns rows scoped by user/workspace, and emits updates through `services/pushService.js` when VAPID keys are configured.
- **Notes**:
  - `services/pushService.js` now persists subscriptions in `tenant_vutler.push_subscriptions`, so web-push tokens survive restarts and the table/indexes are created on startup.
- **Fix needed**: None; monitor push-delivery errors and keep VAPID keys current.

---

## 18. Audit Logs

- **Status**: ✅ Working
- **Frontend**: `(app)/audit-logs/page.tsx` exists.
- **Backend**: `api/audit-logs.js` — PostgreSQL-backed (`tenant_vutler.audit_logs`). Pagination, workspace scoping.
- **Issues**: None.

---

## 19. Onboarding

- **Status**: ✅ Working
- **Frontend**: `(app)/onboarding/page.tsx` exists.
- **Backend**: `api/onboarding.js` exists and is mounted.
- **Issues**: Not audited in detail.

---

## 20. Landing Page

- **Status**: ✅ Working
- **Frontend**: `(landing)/page.tsx` + `(landing)/pricing/page.tsx` — Marketing landing page with pricing.
- **Backend**: N/A (static).
- **Issues**: None.

---

## Bug Summary

### HIGH (Security & Stability)

| Issue | File | Impact |
|-------|------|--------|
| Postal API key hardcoded | `api/email-vaultbrix.js:14` | Key exposed in source code |
| Stripe account ID hardcoded | `api/billing.js:13` | Account ID in source |
| SHA-256 password hashing | `api/auth.js` | Weak against rainbow tables |
| Unsandboxed code execution | `api/sandbox.js` | RCE vulnerability in multi-tenant |
| LLM API keys stored as plain text | `api/providers.js` | Keys readable from DB |
| Missing JWT_SECRET guard | `api/auth.js` | Defaults to placeholder when env var is absent |

### MEDIUM (Functionality & Reliability)

| Issue | File | Impact |
|-------|------|--------|
| Hardcoded agent names in tasks | `frontend/src/app/(app)/tasks/page.tsx` | Assignee list doesn't reflect real agents |
| Integrations page is stubbed | `api/integrations.js` | OAuth flow only flips a DB flag |
| Drive storage tied to local filesystem | `api/drive.js` | Hard to scale across nodes |
| Memory depends solely on Snipara | `api/memory.js` | Features fail when Snipara is down |
| Dashboard response is platform-wide | `api/dashboard.js` | Workspace metrics leak across tenants |
| Legacy routes linger | `api/email.js`, `api/usage.js` | Extra surface area to maintain |

## Prioritized TODO List

### 1. HIGH (Security & Data Integrity)

- [ ] **Remove hardcoded Postal API key** from `api/email-vaultbrix.js` — keep secrets in env vars only
- [ ] **Remove hardcoded Stripe account ID** from `api/billing.js` — read via env var and rotate
- [ ] **Migrate password hashing** from SHA-256 to bcrypt/argon2 in `api/auth.js`
- [ ] **Sandbox code execution** in `api/sandbox.js` (containers/firejail) to avoid RCE
- [ ] **Encrypt LLM API keys** in `api/providers.js` and require `ENCRYPTION_KEY`
- [ ] **Fail hard on missing JWT_SECRET** — do not default to `MISSING-SET-JWT_SECRET-ENV`

### 2. MEDIUM (Functionality & Reliability)

- [ ] **Replace the hardcoded assignee list** in `frontend/src/app/(app)/tasks/page.tsx` with a call to `/api/v1/agents`
- [ ] **Implement real OAuth/token management** for integrations (Slack, Google, GitHub)
- [ ] **Add a PostgreSQL fallback or degrade gracefully** when Snipara memory is unavailable
- [ ] **Scope dashboard queries** to `workspace_id` (or gate the endpoint) before exposing to tenants
- [ ] **Migrate drive storage** to S3/R2 or another shared layer for multi-node deployments
- [ ] **Clean up legacy routes** such as `api/email.js` and `api/usage.js`

### 3. LOW (Polish)

- [ ] **Add input validation** on all API routes (Joi/Zod) instead of ad-hoc checks
- [ ] **Standardize API response format** to `{ success, data, error? }`
- [ ] **Remove duplicate route mounts** (some routes registered multiple times)
- [ ] **Add rate limiting** to sandbox execution endpoints
- [ ] **Add CSRF protection** for state-changing operations when cookies are used
- [ ] **Document production deployment checklist updates** (retention script, mirror removal, new smoke tests)


## Architecture Notes

**What's good:**
- Clean monorepo structure with packages/office and packages/agents separation
- Feature gating via `featureGate` middleware allows plan-based access control
- PostgreSQL-first approach (migrated from MongoDB) with consistent `tenant_vutler` schema
- Real WebSocket implementation with auto-reconnect and keepalive
- Proper auth middleware with JWT + API key support
- Rate limiting on auth and LLM endpoints
- CORS properly configured
- Helmet security headers

**What needs attention:**
- No TypeScript on backend (all CommonJS `.js`)
- No test suite visible for backend APIs
- Error handling is inconsistent — some routes catch and return JSON, others may crash
- No request validation library (like Joi/Zod) — routes manually check `req.body` fields
- Some routes have `try { } catch (_) {}` silencing real errors
