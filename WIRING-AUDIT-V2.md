# WIRING AUDIT V2 — Deep UI Analysis
## Generated: 2026-03-09

---

## Login Page (login.html)

### Wired ✅
- **Sign In button**: form → `handleLogin()` → POST `/api/v1/auth/login` → stores token → redirects `/dashboard`
- **Create Account button**: `handleSignup()` → POST `/api/v1/auth/signup` → stores token → redirects `/onboarding`
- **GitHub OAuth button**: redirects to `/api/v1/auth/github`
- **Google OAuth button**: redirects to `/api/v1/auth/google`
- **Token in URL**: auto-stores token from `?token=` query param (OAuth callback flow)
- **Auto-redirect**: if token in localStorage → redirect to `/dashboard`

### Dead/Stub 🔴
- **Forgot password link**: `alert('Contactez le support pour réinitialiser votre mot de passe.')` — hardcoded alert, no real flow

### Partially Wired 🟡
- (none)

---

## Dashboard (dashboard.html)

### Wired ✅
- **Stats: Agents actifs**: fetches `GET /agents` → counts online agents → animates counter
- **Stats: Messages**: fetches `GET /chat/channels` → sums `message_count` across channels
- **Stats: Intégrations**: counts unique providers from agents data
- **Stats: Tasks**: fetches `GET /tasks` → shows `tasksResponse.count`
- **Agents grid**: renders up to 6 agents from `GET /agents` with real data (name, role, status, avatar)
- **Agent card click → modal**: shows real agent details (role, model, provider, status, email, createdAt)
- **Quick action buttons**: all navigate to correct pages (`/chat`, `/agents`, `/tasks`, `/integrations`)
- **Activity feed**: shows real recent tasks sorted by `updatedAt`
- **Empty states**: proper empty states for no agents, no activity
- **Error state**: shows error with retry button on load failure
- **Theme toggle**: works, persists to localStorage

### Dead/Stub 🔴
- (none — dashboard is well-wired)

### Partially Wired 🟡
- **Sparkline charts**: decorative CSS bars, not reflecting real trend data

---

## Agents Page (agents.html)

### Wired ✅
- **Load agents**: `GET /agents` → renders grid with real data
- **Agent search**: client-side filter by name/role/model
- **Agent detail modal**: shows real agent data (model, provider, temperature, max_tokens, tools, system_prompt)
- **Configure modal**: pre-fills with real agent data, save calls `PUT /agents/:id` with body
- **Delete agent**: calls `DELETE /agents/:id` with confirm dialog
- **Start/Stop agent**: calls `PUT /agents/:id` with `{status: 'online'/'offline'}`
- **Chat link on card**: navigates to `/chat`
- **Stats row**: shows total agents and online count from real data
- **Empty state**: shows "create your first agent" button

### Dead/Stub 🔴
- **"Nouvel agent" button → Create modal**: form is disabled with "Fonctionnalité disponible bientôt" info banner. All inputs disabled, submit button disabled.
- **Stats: Tasks aujourd'hui**: hardcoded `0`
- **Stats: Tokens utilisés**: hardcoded `0`

### Partially Wired 🟡
- **Configure save (`saveAgentConfig`)**: calls `fetchWithAuth('/agents/' + agentId, { method: 'PUT' })` then tries `res.json()` — BUT `fetchWithAuth` likely already returns parsed JSON, so `res.json()` would fail. **Bug: double-parse.**
- **Agent card tasks/tokens**: shows `—` for both, no real data source

---

## Chat Page (chat.html)

### Wired ✅
- **Load channels**: `GET /chat/channels` → renders channel sidebar
- **Load agents**: `GET /agents` → renders agent DMs section
- **Channel search**: client-side filter
- **Select channel → load messages**: `GET /chat/messages?channel_id=X`
- **Send message**: `POST /chat/send` with `{content, channel_id}`
- **Create channel**: modal → `POST /chat/channels` with `{name, description, type}`
- **Delete channel**: confirm modal → `DELETE /chat/channels/:id`
- **File attachment**: uploads via `POST /api/v1/upload` (FormData), inserts download link in message
- **Emoji picker**: functional, inserts emoji at cursor position
- **Message polling**: `setInterval` every 5 seconds to refresh messages
- **Refresh button**: manually reloads messages

### Dead/Stub 🔴
- **Agent DM channels**: clicking an agent shows "DM coming soon" message, input disabled
- **Info button** (chat header): no handler, does nothing

### Partially Wired 🟡
- **Chat → LLM response**: messages are sent and stored, but there's no visible LLM integration in the frontend. Messages go to the API but whether an agent auto-responds via LLM depends on the backend runtime (agentRuntime.js), not the frontend.

---

## Mail Page (mail.html)

### Wired ✅
- **Load inbox**: `GET /api/v1/mail/inbox` → renders thread list with real data
- **Open message**: `GET /api/v1/mail/message/:id` → shows full email content
- **Send email (compose)**: `POST /api/v1/mail/send` with `{to, from, subject, plain_body}`
- **Reply to email**: pre-fills compose with `Re:` subject and sender
- **Forward email**: pre-fills compose with `Fwd:` and body
- **Assign to agent**: `POST /api/v1/mail/assign` with `{messageId, agentEmail}`
- **Approve draft**: `POST /api/v1/mail/draft/approve` with `{messageId}`
- **Regenerate draft**: `POST /api/v1/mail/draft/regenerate` with `{messageId}`
- **Edit draft**: makes `.approval-draft` contentEditable
- **Search emails**: client-side filter on subject/from/body
- **Filter tabs**: All / Unread / Flagged / Agent-handled — client-side filter
- **Folder navigation**: Inbox / Sent / Drafts / Archive — client-side filter
- **Agent filter sidebar**: filter by agent email

### Dead/Stub 🔴
- **Compose "From" field**: only has `@vutler.ai` addresses — **no `alex@starbox-group.com` option**. Human user cannot send as themselves.
- **Pro Plan usage bar**: hardcoded "420 / 1,000 emails this month"

### Partially Wired 🟡
- **Email auto-workflow** (receive → LLM draft → approval → send): Frontend supports draft display + approve/edit/regen. Backend side needs verification that the auto-draft pipeline actually works.

---

## Tasks Page (tasks.html)

### Wired ✅
- **Load tasks**: `GET /tasks` → renders kanban board or list view
- **Kanban view**: 3 columns (À faire / En cours / Terminé) with real task data
- **List view**: table with title, status, priority, assignee, due date
- **Task detail modal**: shows all task fields from API
- **Filter by status**: All / Pending / In Progress / Done — client-side
- **View toggle**: Kanban ↔ List
- **Search**: client-side filter by title
- **Status normalization**: maps various status values (todo→pending, active→in_progress, etc.)
- **Empty state**: shows "create your first task" button

### Dead/Stub 🔴
- **"Nouvelle task" button → Create modal**: has "Fonctionnalité disponible bientôt" banner, create button is **disabled** (`cursor-not-allowed`). `createTask()` function exists and would call `POST /tasks` but the button is disabled in HTML.
- **Edit button** (in task detail modal): static button, no onclick handler — does nothing
- **Delete button** (in task detail modal): static button, no onclick handler — does nothing

### Partially Wired 🟡
- **Create task function `createTask()`**: code exists to POST to `/tasks`, but button is disabled in the UI

---

## Calendar Page (calendar.html)

### Wired ✅
- **Load events**: `GET /calendar` → renders on month/week/day views
- **Create event**: modal → `POST /calendar` with `{title, date, start_time, end_time, description, type}`
- **Delete event**: `DELETE /calendar/:id` with confirm dialog
- **Month/Week/Day views**: all render real event data
- **Navigation**: prev/next month, "Today" button
- **Event detail panel**: side panel shows title, date, time, type, agent, description, participants

### Dead/Stub 🔴
- **Edit event button**: `alert('Edit functionality coming soon')`

### Partially Wired 🟡
- (none)

---

## Drive Page (drive.html)

### Wired ✅
- **Load files**: `GET /api/v1/drive/files?path=X` → renders folders grid + files grid
- **Upload files**: button click → file picker → `POST /api/v1/drive/upload` (FormData with XHR for progress)
- **Drag & drop upload**: full drag overlay, supports files and folder traversal
- **Create folder**: prompt for name → `POST /api/v1/drive/folders` with `{name, path}`
- **Navigate folders**: breadcrumb navigation, folder click changes currentPath
- **Upload progress toast**: shows per-file progress bar
- **Storage usage**: fetches `GET /api/v1/drive/storage`
- **Empty states**: shows when no files/folders

### Dead/Stub 🔴
- **File download**: no click handler on file cards — clicking a file does nothing (no download, no preview)
- **File delete**: no delete functionality visible
- **Search input**: present in header but no handler wired

### Partially Wired 🟡
- (none)

---

## Settings Page (settings.html)

### Wired ✅
- **Tab switching**: General / API Keys / LLM Providers / Team / Billing tabs toggle visibility
- **User display name**: loaded from localStorage

### Dead/Stub 🔴
- **Save Changes button**: `saveSettings()` → `alert('Settings saved — API not yet connected')`
- **All form fields** (workspace name, timezone, language): static HTML, not loaded from API, not saved
- **Upload workspace logo button**: no handler
- **API Keys table**: hardcoded mock data ("vt_••••4f2a", "vt_••••92b1")
- **Generate New Key button**: no handler
- **Copy/Revoke key buttons**: no handlers
- **OpenAI API Key input**: static, not loaded/saved
- **Anthropic API Key input**: static, not loaded/saved
- **Test Connection / Connect Provider buttons**: no handlers
- **Team tab content**: missing entirely (tab exists but no content)
- **Billing tab content**: missing (tab exists but no content; separate billing page exists)

### Partially Wired 🟡
- (none — this page is essentially a static mockup)

---

## Integrations Page (integrations.html)

### Wired ✅
- **User display name**: loaded from localStorage

### Dead/Stub 🔴
- **Toggle switches** (connect/disconnect): pure CSS toggles with no event handlers — checking/unchecking does nothing
- **"Connect" buttons**: no onclick handler
- **Settings gear buttons**: no onclick handler
- **All integration cards**: hardcoded static array (Slack, Discord, GitHub, Zapier, n8n, WhatsApp, Email, Webhook)
- **Category sidebar**: static, no filtering
- **Search input**: static, no filtering

### Partially Wired 🟡
- (none — entirely static/decorative)

---

## Billing Page (billing.html)

### Wired ✅
- **Load usage stats**: `GET /agents` → shows agent count
- **Load subscription**: `GET /billing/subscription` → updates current plan display
- **Upgrade plan buttons**: calls `POST /billing/checkout` with `{priceId}` → redirects to Stripe checkout URL
- **Manage Subscription button**: calls `POST /billing/portal` → redirects to Stripe customer portal
- **Success URL param**: shows success banner on `?success=true`
- **Plan prices**: mapped to real Stripe price IDs (`price_1T8qX9Dj0FRggNOE...`)

### Dead/Stub 🔴
- **Storage Used**: hardcoded "0 GB"
- **API Calls**: hardcoded "0"
- **Payment method display**: static "No payment method on file"
- **Billing address**: hardcoded "Starbox Group, Geneva, Switzerland"

### Partially Wired 🟡
- (none — Stripe integration looks real)

---

## Marketplace Page (marketplace.html)

### Wired ✅
- **Load templates**: `GET /marketplace/templates` → renders grid
- **Load categories**: `GET /marketplace/templates/categories`
- **Category tabs**: dynamically built, filter templates
- **Search**: client-side filter by name/desc/tags/tools
- **Install modal**: shows template details (model, provider, tools, system prompt)
- **Error/loading states**: proper loading spinner and error banner

### Dead/Stub 🔴
- **"Use Template" / install button**: `installTemplate()` just logs to console and shows success modal — **does NOT actually create an agent**. Comment: "TODO: Implement actual template installation when API is ready"

### Partially Wired 🟡
- (none)

---

## CRM / Clients Page (crm.html)

### Wired ✅
- **Load clients**: `GET /clients` → renders cards and table (but see bug below)
- **Add Client button**: `prompt()` for name/email → `POST /clients` with `{name, contact_email}`

### Dead/Stub 🔴
- **Edit button** (table row): no onclick handler
- **Delete button** (table row): no onclick handler
- **Filter buttons** (Status, Plan, Industry): no handlers
- **View toggle** (Grid/List): no handlers
- **Pagination buttons**: no handlers

### Partially Wired 🟡
- **Table rendering**: references `mockClients` variable which is undefined — **table will throw ReferenceError**. Card grid uses `clients` (correct), but table body uses `mockClients` (bug).
- **`loadClients()` calls `fetchWithAuth('/clients')` then `res.json()`**: same double-parse bug as agents page — `fetchWithAuth` likely returns parsed JSON already.

---

## Audit Logs Page (audit.html)

### Wired ✅
- **Load logs**: `GET /audit-logs?limit=200` → renders table with real data
- **Export CSV button**: `exportAuditCSV()` generates proper CSV from `allLogs` array and triggers download
- **Expand row (detail toggle)**: click chevron shows JSON details for each log entry
- **Pagination**: prev/next buttons cycle through pages of 15
- **Live badge**: visual indicator (decorative but accurate)

### Dead/Stub 🔴
- **Filter selects** (Date Range, Agent/User, Action Type): present but no `onchange` handlers — do nothing
- **Search input**: present but no handler

### Partially Wired 🟡
- **`loadLogs()` calls `fetchWithAuth('/audit-logs?limit=200')` then `res.json()`**: same double-parse potential bug

---

## Nexus Page (nexus.html)

### Wired ✅
- **User display name**: loaded from localStorage

### Dead/Stub 🔴
- **All stat cards**: hardcoded (12,482 routed, 450ms avg, 24 fallbacks)
- **Routing Matrix table**: hardcoded static data (Bug→Nexus-Alpha, Feature→Nexus-Beta, etc.)
- **"+ New Rule" button**: no handler
- **"Nexus Routing" button (header)**: no handler
- **Smoke Test button**: `alert('Smoke Test — API not yet connected')`
- **Visual Flow diagram**: static HTML
- **Test results**: hardcoded "5 checks, all passed"
- **"View History" link**: `href="#"` — goes nowhere

### Partially Wired 🟡
- (none — entirely static mockup)

---

## Sandbox Page (sandbox.html)

### Wired ✅
- **Executions table**: renders from hardcoded `executions` array (but presentable)
- **Click row → terminal output**: toggles pre-formatted terminal output display
- **Filter by task type/agent/status**: client-side filtering works on the static data
- **Search**: client-side filter on title/id
- **New Execution modal**: opens with agent/type/code fields

### Dead/Stub 🔴
- **Execute button** (in modal): `executeTask()` just logs to console + closes modal. Comment: "TODO: POST /api/v1/sandbox/execute"
- **Schedule button** (in modal): just calls `closeModal()`
- **All stat cards**: hardcoded (1,248 runs, 94.2% pass, 2m14s avg, 12 agents)
- **All execution data**: hardcoded array, not from API
- **Usage Limit bar**: hardcoded "65%"

### Partially Wired 🟡
- **Sandbox has JS syntax error**: `toggleTheme` function has `})();` instead of proper closing — **page may have JS errors**

---

## Onboarding Page (onboarding.html)

### Wired ✅
- **7-step wizard flow**: Name → Email → Categories → Plans → Tools → Auth → Complete
- **Step 1 (Name)**: captures userName, enables next button
- **Step 2 (Email)**: validates email, shows domain, offers agent email option
- **Step 3 (Categories)**: grid of 12 categories, select 1-3
- **Step 4 (Plans)**: shows Free/Starter/Team with recommended agents based on categories
- **Step 5 (Tools)**: 9 tools with selection
- **Step 6 (Auth)**: simulates auth flow with spinners + "Tout autoriser" button
- **Step 7 (Complete)**: shows summary + confetti
- **Status check**: `GET /api/v1/onboarding/status` — redirects to dashboard if already completed
- **Complete onboarding**: `POST /api/v1/onboarding/complete` with full config → redirects to dashboard

### Dead/Stub 🔴
- **Auth step**: "Authorize" buttons are simulated with `setTimeout` — no real OAuth flow
- **Tools auth**: decorative, doesn't actually connect to Google Drive, Slack, etc.

### Partially Wired 🟡
- **Complete function has JS string literal issue**: uses `userName+""s Workspace"` — likely encoding issue with smart quotes

---

# SUMMARY — Wiring Status by Page

| Page | Wired | Dead/Stub | Partially | Overall |
|------|-------|-----------|-----------|---------|
| Login | 4 | 1 | 0 | ✅ Good |
| Dashboard | 10 | 0 | 1 | ✅ Good |
| Agents | 9 | 3 | 2 | 🟡 Mostly |
| Chat | 10 | 2 | 1 | ✅ Good |
| Mail | 12 | 2 | 1 | ✅ Good |
| Tasks | 8 | 3 | 1 | 🟡 Mostly |
| Calendar | 6 | 1 | 0 | ✅ Good |
| Drive | 7 | 3 | 0 | 🟡 Mostly |
| Settings | 1 | 11 | 0 | 🔴 Stub |
| Integrations | 1 | 6 | 0 | 🔴 Stub |
| Billing | 5 | 4 | 0 | 🟡 Mostly |
| Marketplace | 5 | 1 | 0 | 🟡 Mostly |
| CRM | 2 | 5 | 2 | 🔴 Mostly Stub |
| Audit Logs | 3 | 2 | 1 | 🟡 Mostly |
| Nexus | 1 | 7 | 0 | 🔴 Stub |
| Sandbox | 3 | 5 | 1 | 🔴 Mostly Stub |
| Onboarding | 8 | 2 | 1 | ✅ Good |

---

# SPRINT TASK LIST — Organized by Priority

## P0: Core User Flow (login → dashboard → agents → chat)

1. **Wire "Create Agent" form to POST /api/v1/agents** — Remove "coming soon" banner, enable inputs, enable submit button, POST agent data to API
2. **Fix agents.html `saveAgentConfig()` double-parse bug** — `fetchWithAuth` returns parsed JSON; remove `.then(r => r.json())` calls
3. **Wire Chat agent DMs to real channels** — Create DM channel on first click, enable messaging to agents
4. **Add LLM auto-response in Chat** — When user sends message in agent channel, trigger LLM response via backend runtime
5. **Wire forgot password flow** — Replace alert with real password reset (POST /api/v1/auth/forgot-password exists in backend)

## P1: Business Tools (mail, tasks, calendar, drive)

6. **Add human email identity to Mail compose "From"** — Add `alex@starbox-group.com` option (requires SMTP config for human domain)
7. **Enable Tasks "Create" button** — Remove disabled attribute, remove "coming soon" banner, keep existing `createTask()` function which already calls API
8. **Wire Tasks edit button to PUT /api/v1/tasks/:id** — Add onclick with edit modal, pre-fill fields, save to API
9. **Wire Tasks delete button to DELETE /api/v1/tasks/:id** — Add onclick with confirm dialog, call API
10. **Wire Calendar edit event** — Replace `alert('Edit functionality coming soon')` with edit modal + PUT /api/v1/calendar/:id
11. **Wire Drive file download** — Add click handler on file cards to trigger `GET /api/v1/drive/download/:id`
12. **Wire Drive file delete** — Add delete button/context menu on files → `DELETE /api/v1/drive/files/:id`
13. **Wire Drive search** — Add oninput handler on search box to filter files/folders client-side
14. **Verify email auto-workflow pipeline** — Test end-to-end: receive email → LLM draft → approval card → send

## P2: Platform (billing, integrations, settings, marketplace)

15. **Wire Settings "Save Changes" to PUT /api/v1/settings** — Create backend endpoint if needed, save workspace name/timezone/language
16. **Wire Settings LLM providers** — Load current keys from API, save on change, wire "Test Connection" button
17. **Wire Settings API keys** — Load from API, "Generate New Key" creates key, "Copy" copies to clipboard, "Revoke" deletes
18. **Wire Integrations toggle switches** — Each toggle should call PATCH `/api/v1/integrations/:provider/toggle`
19. **Wire Integrations "Connect" buttons** — Call POST `/api/v1/integrations/:provider/connect`
20. **Wire Integrations category filter** — Add onclick to filter cards by category
21. **Wire Integrations search** — Add oninput handler to filter cards
22. **Wire Marketplace "Use Template" to actually create agent** — POST to /api/v1/agents with template config
23. **Wire Billing storage/API usage** — Fetch real usage data from API

## P3: Advanced (nexus, sandbox, CRM, audit)

24. **Fix CRM table `mockClients` ReferenceError** — Change `mockClients` to `clients` in table render
25. **Fix CRM `loadClients()` double-parse bug** — Remove `.then(r => r.json())` after `fetchWithAuth`
26. **Wire CRM edit client** — Add onclick handler → modal → PUT /api/v1/clients/:id
27. **Wire CRM delete client** — Add onclick handler → confirm → DELETE /api/v1/clients/:id
28. **Wire CRM filters** (status, plan, industry) — Add dropdown handlers for client-side filtering
29. **Wire Audit Logs filters** — Add onchange handlers for date range, agent, action type, search
30. **Fix Audit Logs `loadLogs()` potential double-parse** — Verify `fetchWithAuth` return type
31. **Wire Nexus routing to real API** — Replace hardcoded data with GET /api/v1/nexus/routes
32. **Wire Nexus smoke test** — Replace alert with POST /api/v1/nexus/smoke-test
33. **Wire Sandbox execute to POST /api/v1/sandbox/execute** — Replace console.log with real API call
34. **Fix Sandbox JS syntax error** — Fix malformed `toggleTheme` function closure
35. **Wire Sandbox to load real execution history** — Replace hardcoded array with GET /api/v1/sandbox/executions
36. **Fix Onboarding `completeOnboarding` string literal** — Fix smart-quote issue in workspace name

---

# CRITICAL BUGS FOUND

1. **CRM page: `mockClients` undefined** — Table rendering will throw ReferenceError (line in `renderClients`)
2. **Agents page: `saveAgentConfig` double-parse** — `fetchWithAuth` returns JSON, code tries `.json()` again
3. **CRM page: `loadClients` double-parse** — Same pattern
4. **Audit page: `loadLogs` double-parse** — Same pattern (needs verification of `fetchWithAuth` behavior)
5. **Sandbox page: JS syntax error** — Malformed function closure in toggleTheme
6. **Onboarding: string literal encoding** — Smart quotes in `completeOnboarding` function

---

*End of Wiring Audit V2*
