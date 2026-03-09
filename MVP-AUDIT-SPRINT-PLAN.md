# Vutler Platform — Complete MVP Audit & Sprint Plan

**Date:** 2026-03-09  
**Auditor:** OpenClaw Subagent  
**Scope:** Full frontend ↔ backend ↔ DB wiring audit + MVP sprint plan

---

## 1. Frontend Page Audit

| # | Page | Backend API | Mounted? | DB | Frontend Wired? | Status |
|---|------|-------------|----------|----|-----------------|--------|
| 1 | **login.html** | `api/auth.js` | ❌ **NOT MOUNTED** | PG (auth.js has queries) | ✅ calls `/api/v1/auth/login`, `/api/v1/auth/signup` | 🔴 **BROKEN** — auth.js exists but is NOT mounted in index. Login cannot work. |
| 2 | **onboarding.html** | `api/onboarding.js` | ✅ at `/api/v1/onboarding` | ✅ PG (13 refs) | ✅ calls `/api/v1/onboarding/status`, `/api/v1/onboarding/complete` | 🟢 Wired |
| 3 | **dashboard.html** | `api/dashboard.js` | ❌ **NOT MOUNTED** | ✅ PG (3 refs) | ⚠️ calls `/agents`, `/tasks`, `/chat/channels` (not dashboard API) | 🟡 Works via other APIs, dedicated dashboard API orphaned |
| 4 | **agents.html** | `api/agents.js` | ✅ | ✅ PG (7 refs) | ✅ full CRUD: list, delete, update status | 🟢 Wired |
| 5 | **chat.html** | `api/chat.js` | ✅ | ✅ PG (11 refs) | ✅ channels, messages, send, delete | 🟢 Wired |
| 6 | **mail.html** | `api/mail.js` | ❌ **NOT MOUNTED** | ⚠️ Mixed (2 PG, 3 mock) | ✅ has own `apiFetch` calling `/api/v1/mail/*` | 🔴 **BROKEN** — mail.js not mounted. Frontend calls dead endpoints. |
| 7 | **drive.html** | `api/drive.js` | ✅ | ✅ PG (12 refs) | ✅ custom fetch (not fetchWithAuth) for upload progress | 🟢 Wired |
| 8 | **tasks.html** | `api/tasks-router.js` | ✅ | ✅ PG (via taskRouter service) | ⚠️ only calls `GET /tasks` — no create/update/delete wired in frontend | 🟡 Read-only in frontend |
| 9 | **calendar.html** | `api/calendar.js` | ❌ **NOT MOUNTED** | ✅ PG (5 refs) | ✅ calls `/calendar`, `/calendar/:id` DELETE | 🔴 **BROKEN** — calendar.js not mounted. |
| 10 | **billing.html** | `api/billing.js` | ✅ | ❌ Mock (0 PG, 2 mock/stub) | ⚠️ calls `/billing/subscription`, `/agents` | 🟡 Mounted but returns hardcoded/mock data |
| 11 | **marketplace.html** | `api/marketplace.js` (via templates-marketplace?) | ✅ (templatesMarketplaceAPI) | ✅ PG (30 refs) | ✅ calls `/marketplace/templates`, `/marketplace/templates/categories` | 🟢 Wired |
| 12 | **integrations.html** | `api/integrations.js` | ❌ **NOT MOUNTED** | ✅ PG (25 refs) | ❌ **Static only** — no fetch calls, hardcoded card data | 🔴 Frontend is pure placeholder |
| 13 | **settings.html** | `api/settings.js` | ❌ **NOT MOUNTED** | ❌ Mock (returns hardcoded defaults) | ❌ **No fetch calls** — pure static HTML | 🔴 Both API and frontend are stubs |
| 14 | **crm.html** | `api/clients.js` | ❌ **NOT MOUNTED** | ✅ PG (11 refs) | ✅ calls `/clients` | 🔴 **BROKEN** — clients.js not mounted |
| 15 | **audit.html** | `api/audit-logs.js` | ❌ **NOT MOUNTED** | ✅ PG (8 refs) | ✅ calls `/audit-logs?limit=200` | 🔴 **BROKEN** — audit-logs.js not mounted |
| 16 | **nexus.html** | `api/nexus.js` | ❌ **NOT MOUNTED** | ✅ PG (7 refs) | ❌ **No fetch calls** — static placeholder | 🔴 Both sides disconnected |
| 17 | **sandbox.html** | `api/sandbox.js` | ❌ **NOT MOUNTED** | ❌ Mock (hardcoded SAMPLE_EXECUTIONS) | ❌ **No fetch calls** — has TODO comment | 🔴 Full placeholder |

---

## 2. Backend API File Audit

| # | API File | Mounted in Index? | DB (PG/Mock) | Frontend Consumer | Orphan? |
|---|----------|-------------------|--------------|-------------------|---------|
| 1 | `agents.js` | ✅ | ✅ PG | agents.html | No |
| 2 | `email.js` | ✅ | ✅ PG | — (old email, not mail.html) | Partial — no dedicated frontend page |
| 3 | `chat.js` | ✅ | ✅ PG | chat.html | No |
| 4 | `templates.js` | ✅ | ✅ (MongoDB) | — (internal) | No |
| 5 | `templates-marketplace` | ✅ | ✅ PG | marketplace.html | No |
| 6 | `llm.js` | ✅ | ✅ PG | — (agent config) | No |
| 7 | `usage.js` | ✅ | Mixed | — | No |
| 8 | `drive.js` | ✅ | ✅ PG | drive.html | No |
| 9 | `openclaw.js` | ✅ | — | — (OpenClaw bridge) | No |
| 10 | `runtime.js` | ✅ | ✅ PG | — (internal) | No |
| 11 | `workspace.js` | ✅ | ✅ PG | — (internal) | No |
| 12 | `tools.js` | ✅ | ✅ PG | — (internal) | No |
| 13 | `memory.js` | ✅ | ✅ (Snipara) | — (internal) | No |
| 14 | `admin.js` | ✅ | ✅ PG | — (admin) | No |
| 15 | `billing.js` | ✅ | ❌ Mock | billing.html | No (but stub) |
| 16 | `analytics-api.js` | ✅ | — | — | Likely orphan |
| 17 | `signatures.js` | ✅ | — | — | Orphan |
| 18 | `onboarding.js` | ✅ | ✅ PG | onboarding.html | No |
| 19 | `tasks-router.js` | ✅ | ✅ PG | tasks.html | No |
| 20 | `health.js` | ✅ | — | — (monitoring) | No |
| 21 | `webhookAPI` | ✅ | ✅ PG | — | No |
| 22 | `crypto.js` | ✅ | — | — | No |
| 23 | `drive-chat.js` | ✅ | — | — | No |
| 24 | `github.js` | ✅ | — | — | No |
| 25 | **`auth.js`** | ❌ | ✅ PG | login.html | **🔴 CRITICAL ORPHAN** |
| 26 | **`mail.js`** | ❌ | Mixed | mail.html | **🔴 ORPHAN** |
| 27 | **`calendar.js`** | ❌ | ✅ PG | calendar.html | **🔴 ORPHAN** |
| 28 | **`clients.js`** | ❌ | ✅ PG | crm.html | **🔴 ORPHAN** |
| 29 | **`audit-logs.js`** | ❌ | ✅ PG | audit.html | **🔴 ORPHAN** |
| 30 | **`integrations.js`** | ❌ | ✅ PG | integrations.html (static) | **🔴 ORPHAN** |
| 31 | **`settings.js`** | ❌ | ❌ Mock | settings.html (static) | **🔴 ORPHAN** |
| 32 | **`nexus.js`** | ❌ | ✅ PG | nexus.html (static) | **🔴 ORPHAN** |
| 33 | **`sandbox.js`** | ❌ | ❌ Mock | sandbox.html (static) | **🔴 ORPHAN** |
| 34 | **`dashboard.js`** | ❌ | ✅ PG | — (dashboard uses other APIs) | **🟡 ORPHAN** |
| 35 | `agent-runtime.js` | ❌ | — | — | Orphan (superseded?) |
| 36 | `agent-sync.js` | ❌ | — | — | Orphan |
| 37 | `api-keys.js` | ❌ | — | — | Orphan |
| 38 | `automations.js` | ❌ | — | — | Orphan |
| 39 | `automation-logs-routes.js` | ❌ | — | — | Orphan |
| 40 | `deployments.js` | ❌ | — | — | Orphan |
| 41 | `email-beta.js` | ❌ | — | — | Orphan |
| 42 | `email-vaultbrix.js` | ❌ | — | — | Orphan |
| 43 | `emails.js` | ❌ | — | — | Orphan |
| 44 | `goals.js` | ❌ | — | — | Orphan |
| 45 | `llm-router.js` | ❌ | — | — | Orphan |
| 46 | `llm-validate.js` | ❌ | — | — | Orphan |
| 47 | `nexus-routing.js` | ❌ | — | — | Orphan |
| 48 | `notifications.js` | ❌ | — | — | Orphan |
| 49 | `providers.js` | ❌ | — | — | Orphan |
| 50 | `task-assignment.js` | ❌ | — | — | Orphan |
| 51 | `tasks.js` | ❌ | — | — | Orphan (superseded by tasks-router) |
| 52 | `usage-pg.js` | ❌ | — | — | Orphan |
| 53 | `vps.js` | ❌ | — | — | Orphan |
| 54 | `webhook-routes.js` | ❌ | — | — | Orphan |
| 55 | `ws-chat.js` | ❌ | — | — | Orphan |

---

## 3. Critical Findings Summary

### 🔴 SHOWSTOPPERS (Nothing works without these)

1. **`auth.js` is NOT MOUNTED** — Login/signup is completely broken. No user can access the platform.
2. **Fake auth middleware** — Line 130 of index: `req.user = { id: 'default', workspace: 'default' }; // TODO: real auth` — ALL requests bypass auth.

### 🔴 BROKEN PAGES (Frontend calls APIs that aren't mounted)

| Page | Missing Mount | Fix |
|------|--------------|-----|
| login.html | auth.js | Mount auth.js, remove fake auth middleware |
| mail.html | mail.js | Mount mail.js at `/api/v1/mail` |
| calendar.html | calendar.js | Mount calendar.js at `/api/v1/calendar` |
| crm.html | clients.js | Mount clients.js at `/api/v1/clients` |
| audit.html | audit-logs.js | Mount audit-logs.js at `/api/v1/audit-logs` |

### 🟡 STUB/PLACEHOLDER PAGES (No real functionality)

| Page | Issue |
|------|-------|
| integrations.html | Static cards, no API calls |
| settings.html | Static HTML, API returns hardcoded data |
| nexus.html | Static HTML, no API calls |
| sandbox.html | Static HTML, API returns mock data |
| billing.html | API mounted but returns mock/stub data |
| tasks.html | Read-only (no create/update/delete in frontend) |

### 🟡 48 ORPHAN API FILES

27 API files in `/api/` are not mounted. Many are superseded or experimental. Recommend cleanup.

---

## 4. MVP Sprint Plan

### Sprint A — P0 Critical Path (Login → Dashboard → Agents → Chat)
**Goal:** Users can log in, see dashboard, manage agents, and chat.  
**Estimated Duration:** 1 week

| # | Task | Type | Effort | Dep | Agent |
|---|------|------|--------|-----|-------|
| A1 | **Mount auth.js** in index — add `app.use('/api/v1/auth', authAPI)` | Backend | S | — | Backend |
| A2 | **Remove fake auth middleware** (line 130) — replace with real JWT validation from auth.js | Backend | M | A1 | Backend |
| A3 | **Test login/signup flow** end-to-end (login.html → auth API → JWT → redirect) | Fullstack | S | A1,A2 | Fullstack |
| A4 | **Wire fetchWithAuth** to send real JWT token (check all pages use same auth header pattern) | Frontend | M | A1 | Frontend |
| A5 | **Verify onboarding flow** works with real auth (currently wired, may break with real JWT) | Fullstack | S | A2 | Fullstack |
| A6 | **Dashboard page** — already works via `/agents`, `/tasks`, `/chat/channels` — verify with real auth | Fullstack | S | A2 | Fullstack |
| A7 | **Agents CRUD** — verify all operations work with real auth + real workspace_id | Fullstack | S | A2 | Fullstack |
| A8 | **Chat** — verify channels, messages, send work with real auth | Fullstack | S | A2 | Fullstack |

### Sprint B — P1 Business Tools (Mail → Drive → Tasks → Calendar)
**Goal:** Core productivity tools functional.  
**Estimated Duration:** 1–2 weeks

| # | Task | Type | Effort | Dep | Agent |
|---|------|------|--------|-----|-------|
| B1 | **Mount mail.js** at `/api/v1/mail` | Backend | S | A1 | Backend |
| B2 | **Replace mock data in mail.js** — wire inbox/send to real PG or Postal | Backend | L | B1 | Backend |
| B3 | **Mount calendar.js** at `/api/v1/calendar` | Backend | S | A1 | Backend |
| B4 | **Calendar frontend** — verify CRUD (create event missing in frontend?) | Frontend | M | B3 | Frontend |
| B5 | **Tasks frontend** — add create/update/delete UI (currently read-only) | Frontend | M | A1 | Frontend |
| B6 | **Drive** — already wired, verify upload/download with real auth | Fullstack | S | A2 | Fullstack |

### Sprint C — P2 Platform (Billing → Marketplace → Integrations → Settings)
**Goal:** Platform features for monetization and configuration.  
**Estimated Duration:** 2 weeks

| # | Task | Type | Effort | Dep | Agent |
|---|------|------|--------|-----|-------|
| C1 | **Billing API** — replace mock with real Stripe integration | Backend | L | A1 | Backend |
| C2 | **Billing frontend** — wire plan selection, checkout flow | Frontend | M | C1 | Frontend |
| C3 | **Mount integrations.js** at `/api/v1/integrations` | Backend | S | A1 | Backend |
| C4 | **Integrations frontend** — replace static cards with real API calls (list, connect, disconnect) | Frontend | L | C3 | Frontend |
| C5 | **Mount settings.js** at `/api/v1/settings` | Backend | S | A1 | Backend |
| C6 | **Settings API** — wire to PG (currently returns hardcoded defaults) | Backend | M | C5 | Backend |
| C7 | **Settings frontend** — add fetchWithAuth calls for load/save | Frontend | M | C6 | Frontend |
| C8 | **Marketplace** — already wired, verify install flow works | Fullstack | S | A2 | Fullstack |

### Sprint D — P3 Polish (CRM → Audit → Nexus → Sandbox)
**Goal:** Secondary features for power users.  
**Estimated Duration:** 2 weeks

| # | Task | Type | Effort | Dep | Agent |
|---|------|------|--------|-----|-------|
| D1 | **Mount clients.js** at `/api/v1/clients` | Backend | S | A1 | Backend |
| D2 | **CRM frontend** — verify CRUD works (currently only calls GET) | Frontend | M | D1 | Frontend |
| D3 | **Mount audit-logs.js** at `/api/v1/audit-logs` | Backend | S | A1 | Backend |
| D4 | **Audit frontend** — verify list/detail display | Fullstack | S | D3 | Fullstack |
| D5 | **Mount nexus.js** at `/api/v1/nexus` | Backend | S | A1 | Backend |
| D6 | **Nexus frontend** — wire API calls (deploy keys, CLI tokens, status) | Frontend | L | D5 | Frontend |
| D7 | **Sandbox** — decide: real sandboxed execution or remove from MVP | Decision | — | — | Product |
| D8 | **Cleanup orphan API files** — archive or delete 20+ unused API files | Backend | M | — | Backend |

---

## 5. Quick Win: Mount All Existing APIs (~30 min)

Many pages are broken simply because the API file exists and works but isn't mounted. A single code change can unblock 5 pages:

```javascript
// Add to index-s11.5-integrated.js after existing app.use() block:
const authAPI = require('./api/auth');
const mailAPI = require('./api/mail');
const calendarAPI = require('./api/calendar');
const clientsAPI = require('./api/clients');
const auditLogsAPI = require('./api/audit-logs');
const integrationsAPI = require('./api/integrations');
const settingsAPI = require('./api/settings');
const nexusAPI = require('./api/nexus');
const sandboxAPI = require('./api/sandbox');

app.use('/api/v1/auth', authAPI);
app.use('/api/v1/mail', mailAPI);
app.use('/api/v1/calendar', calendarAPI);
app.use('/api/v1/clients', clientsAPI);
app.use('/api/v1/audit-logs', auditLogsAPI);
app.use('/api/v1/integrations', integrationsAPI);
app.use('/api/v1/settings', settingsAPI);
app.use('/api/v1/nexus', nexusAPI);
app.use('/api/v1/sandbox', sandboxAPI);
```

⚠️ **But the auth middleware (line 130) MUST be fixed first**, otherwise all routes are unauthenticated.

---

## 6. Scorecard

| Metric | Value |
|--------|-------|
| Total frontend pages | 17 |
| Fully wired (green) | 5 (agents, chat, drive, onboarding, marketplace) |
| Broken — API not mounted (red) | 5 (login, mail, calendar, crm, audit) |
| Stub/placeholder (yellow) | 5 (integrations, settings, nexus, sandbox, tasks) |
| Partial/working-ish | 2 (dashboard, billing) |
| Total API files | 49 |
| Mounted | 22 |
| Orphaned (not mounted) | 27 |
| Using real PG | ~18 |
| Mock/stub | ~4 (settings, sandbox, billing, mail partial) |
| **Overall MVP readiness** | **~30%** |

---

*Generated 2026-03-09 by OpenClaw audit subagent*
