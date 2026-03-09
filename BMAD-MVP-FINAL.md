# BMAD — Vutler MVP Final Push
**Date:** 9 mars 2026  
**Owner:** Alex Lopez / Starbox Group  
**Target:** MVP Production — 14 avril 2026  
**Score actuel:** ~35% → Target: 100%

---

## 1. Business Mission

Livrer un MVP fonctionnel de Vutler (app.vutler.ai) — plateforme de gestion d'agents AI — où chaque page, bouton, formulaire et toggle est câblé à une vraie API et une vraie base de données. Zéro mock data, zéro "coming soon".

## 2. Architecture

### Stack
- **Frontend:** Static HTML + Tailwind + Vanilla JS (17 pages)
- **Backend:** Node.js Express (`index.js` entry point)
- **Database:** PostgreSQL via Vaultbrix (REDACTED_DB_HOST:6543, schema `tenant_vutler`)
- **Storage:** MinIO S3 via `s3.vaultbrix.com`
- **Email:** Postal SMTP (mail.vutler.ai)
- **Auth:** JWT (SHA-256 HMAC) + GitHub OAuth + Google OAuth
- **Billing:** Stripe
- **AI:** LLM Router (OpenAI, Anthropic, MiniMax)
- **Docker:** `vutler-api-test` container, `--network host`, port 3001

### Key Files
| Component | Path |
|-----------|------|
| Entry point | `/home/ubuntu/vutler/index.js` |
| Custom middleware | `/home/ubuntu/vutler/app/custom/index.js` |
| Auth helper (frontend) | `/home/ubuntu/vutler-frontend/static/auth-helper-v2.js` |
| Auth API | `/home/ubuntu/vutler/api/auth.js` |
| Auth middleware | `/home/ubuntu/vutler/app/custom/lib/auth.js` |
| Nginx config | `/etc/nginx/sites-enabled/vutler` |
| Frontend pages | `/home/ubuntu/vutler-frontend/*.html` |
| Backend APIs | `/home/ubuntu/vutler/api/*.js` |

### Auth Flow
1. Login POST → auth.js generates JWT with `{userId, email, name, role, workspaceId}`
2. Frontend stores in `localStorage('vutler_token')` via `setToken()`
3. `fetchWithAuth()` sends `Authorization: Bearer <JWT>`
4. Global JWT middleware decodes → sets `req.user` + `req.authType = 'jwt'`
5. `authenticateAgent` middleware accepts JWT-authenticated requests

### Known Constraints
- Docker entry = `index.js` (NOT `index-s11.5-integrated.js`)
- Rate limiters DISABLED for beta (index.js + app/custom/index.js)
- `fetchWithAuth()` returns **parsed JSON** (not Response object) — do NOT call `.json()` after it
- Agent avatars = real PNGs at `/static/avatars/{username}.png` — NO ICONS EVER
- localStorage key = `vutler_token` (not `auth_token`)

---

## 3. Sprint Plan

### Sprint 1 — P0: Core Flow + Critical Bugs (3 jours)
**Goal:** Login → Dashboard → Agents → Chat fully functional, zero bugs

| ID | Task | Effort | File(s) |
|----|------|--------|---------|
| S1.1 | Fix `fetchWithAuth` double-parse bugs (agents, CRM, audit) | S | agents.html, crm.html, audit.html |
| S1.2 | Fix CRM `mockClients` ReferenceError | S | crm.html |
| S1.3 | Fix Sandbox JS syntax error | S | sandbox.html |
| S1.4 | Fix Onboarding smart-quote string literal | S | onboarding.html |
| S1.5 | Enable "Create Agent" form (remove coming soon, wire POST /agents) | M | agents.html |
| S1.6 | Wire Chat agent DMs (create DM channel on click) | M | chat.html, api/chat.js |
| S1.7 | Verify LLM auto-response in Chat (message → agent responds) | M | api/chat.js, services/llmRouter.js |
| S1.8 | Wire forgot password flow | S | login.html, api/auth.js |

### Sprint 2 — P1: Business Tools (5 jours)
**Goal:** Mail, Tasks, Calendar, Drive fully operational

| ID | Task | Effort | File(s) |
|----|------|--------|---------|
| S2.1 | Add `alex@starbox-group.com` to Mail compose "From" | M | mail.html, api/mail.js |
| S2.2 | Enable Tasks create button (remove disabled, keep existing createTask()) | S | tasks.html |
| S2.3 | Wire Tasks edit → PUT /api/v1/task-router/:id | M | tasks.html |
| S2.4 | Wire Tasks delete → DELETE /api/v1/task-router/:id | S | tasks.html |
| S2.5 | Wire Calendar edit event → PUT /api/v1/calendar/:id | M | calendar.html |
| S2.6 | Wire Drive file download → GET /api/v1/drive/download/:id | M | drive.html, api/drive.js |
| S2.7 | Wire Drive file delete → DELETE /api/v1/drive/files/:id | S | drive.html, api/drive.js |
| S2.8 | Wire Drive search (client-side filter) | S | drive.html |
| S2.9 | LLM email drafts — replace templates with intelligent responses | L | api/mail.js, services/llmRouter.js |
| S2.10 | Persist inbound emails in PG (currently in-memory) | M | api/mail.js |
| S2.11 | E2E email workflow test (receive → LLM draft → approve → send) | M | api/mail.js |

### Sprint 3 — P2: Platform Features (5 jours)
**Goal:** Settings, Integrations, Billing, Marketplace functional

| ID | Task | Effort | File(s) |
|----|------|--------|---------|
| S3.1 | Wire Settings save → PUT /api/v1/settings | M | settings.html, api/settings.js |
| S3.2 | Wire Settings LLM providers (load/save API keys, test connection) | L | settings.html, api/settings.js |
| S3.3 | Wire Settings API keys (generate, copy, revoke) | M | settings.html, api/settings.js |
| S3.4 | Wire Integrations toggles → PATCH /api/v1/integrations/:provider | M | integrations.html, api/integrations.js |
| S3.5 | Wire Integrations "Connect" → POST /api/v1/integrations/:provider | M | integrations.html, api/integrations.js |
| S3.6 | Wire Integrations search + category filter | S | integrations.html |
| S3.7 | Wire Marketplace "Use Template" → POST /api/v1/agents (create from template) | M | marketplace.html |
| S3.8 | Wire Billing real usage stats (storage, API calls) | M | billing.html, api/billing.js |
| S3.9 | Auto-approval toggle in Settings UI | S | settings.html |

### Sprint 4 — P3: Advanced + Polish (5 jours)
**Goal:** CRM, Audit, Nexus, Sandbox functional + polish

| ID | Task | Effort | File(s) |
|----|------|--------|---------|
| S4.1 | Wire CRM edit client → PUT /api/v1/clients/:id | M | crm.html |
| S4.2 | Wire CRM delete client → DELETE /api/v1/clients/:id | S | crm.html |
| S4.3 | Wire CRM filters (status, plan, industry) | S | crm.html |
| S4.4 | Wire CRM view toggle (grid/list) | S | crm.html |
| S4.5 | Wire Audit Logs filters (date, agent, action, search) | M | audit.html |
| S4.6 | Wire Nexus real data → GET /api/v1/nexus/routes | L | nexus.html, api/nexus.js |
| S4.7 | Wire Nexus smoke test → POST /api/v1/nexus/smoke-test | M | nexus.html, api/nexus.js |
| S4.8 | Wire Sandbox execute → POST /api/v1/sandbox/execute | L | sandbox.html, api/sandbox.js |
| S4.9 | Wire Sandbox real execution history | M | sandbox.html, api/sandbox.js |
| S4.10 | Dashboard sparklines with real trend data | M | dashboard.html |

### Sprint 5 — QA + Production (3 jours)
**Goal:** Beta test score ≥ 8/10, production ready

| ID | Task | Effort | File(s) |
|----|------|--------|---------|
| S5.1 | Full E2E beta test all 17 pages | L | all |
| S5.2 | Light/dark theme verification all pages | M | all |
| S5.3 | Mobile responsive verification | M | all |
| S5.4 | Security audit (auth, XSS, CSRF) | L | all |
| S5.5 | Performance audit (loading, API response times) | M | all |
| S5.6 | Cleanup orphan API files (27+ unused) | M | api/ |
| S5.7 | Re-enable rate limiter with proper config | S | index.js |
| S5.8 | Production Docker build (not volume mount) | M | Dockerfile |

---

## 4. Chunk Execution Order

### Chunk 1: Bug Fixes (S1.1–S1.4) — 1h
Fix all 6 critical bugs identified in audit.

### Chunk 2: Agent CRUD (S1.5) — 2h
Enable create agent form, wire to POST /agents.

### Chunk 3: Chat + LLM (S1.6–S1.7) — 3h
DM channels + verify LLM auto-response pipeline.

### Chunk 4: Tasks CRUD (S2.2–S2.4) — 2h
Enable create, wire edit/delete.

### Chunk 5: Calendar Edit (S2.5) — 1h
Replace alert with edit modal + PUT.

### Chunk 6: Drive Complete (S2.6–S2.8) — 2h
Download, delete, search.

### Chunk 7: Mail Intelligence (S2.1, S2.9–S2.11) — 4h
Human email identity + LLM drafts + persistence + E2E.

### Chunk 8: Settings Full Wire (S3.1–S3.3, S3.9) — 4h
All settings save to DB.

### Chunk 9: Integrations Wire (S3.4–S3.6) — 3h
Toggles, connect, filters.

### Chunk 10: Marketplace + Billing (S3.7–S3.8) — 2h
Template install creates agent, real usage stats.

### Chunk 11: CRM Complete (S4.1–S4.4) — 2h
Edit, delete, filters, view toggle.

### Chunk 12: Audit + Nexus + Sandbox (S4.5–S4.9) — 6h
All advanced pages wired.

### Chunk 13: QA + Production (S5.1–S5.8) — 5h
Full test, security, performance, deploy.

---

## 5. Success Criteria

- [ ] All 17 pages load without JS errors
- [ ] All buttons/toggles/forms call real APIs
- [ ] Zero "coming soon" or mock data
- [ ] Login → full user journey works E2E
- [ ] Agent avatars are real PNGs everywhere
- [ ] Light/dark theme works on all pages
- [ ] Beta test score ≥ 8/10
- [ ] All data persists across page refresh and server restart

---

*BMAD v1.0 — 9 mars 2026*
*Total estimated effort: ~37h across 5 sprints (3 weeks)*
