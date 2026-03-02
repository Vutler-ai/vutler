# TODO.md — Starbox Group Task Board

_Updated: 2026-03-01 20:56_

---

## 🔴 En Cours / Urgent

### Vutler Stabilisation (Priority 1)
- [x] **BMAD Workflow** — Déployé et actif (2026-03-01) ✅
  - Docs: `memory/bmad-dev-workflow.md`, `memory/dev-workflow-rules.md`
  - Contracts TypeScript: `contracts/` (5 fichiers)
  - Template story: `templates/bmad-story.md`
- [x] **Bugs P0** — Tous fixés (2026-03-01) ✅
  - Chat channels création (500/404) → Fixed
  - Agents "Manage" button → Fixed
  - Nexus token generation → Fixed
  - Setup token → Fixed
  - Drive files → Fixed
- [x] **Bugs P1** — Tous fixés (2026-03-01 20:34) ✅
  - Email API PostgreSQL → Fixed
  - Integrations endpoints → Fixed
  - LLM Settings static files → Fixed
  - Notifications/Usage/Audit → Fixed
- [x] **Vaultbrix DDL** — SQL fourni (2026-03-01 20:56) ✅
  - File: `memory/vaultbrix-ddl-missing.sql`
  - 13 colonnes à ajouter à `agents` table
  - Alex applique directement
- [ ] **Bugs P2** — En cours (Mike, session `6339db60-2fad-4109-a47f-c51fbbb20786`) ⏳
  - Tasks auto-update
  - Deployments status
  - Clients metadata "unknown" → "Jarvis sur Mac"
  - Sandbox testing
  - Automation création
  - Templates (skip si hors scope)
  - Integrations menu doublé
- [ ] **QA Complète** — Après bugs P2
  - Test ALL 22 pages end-to-end
  - Vérifier aucune console error
  - Vérifier tous états (loading, error, empty)
  - Seed data partout
- [ ] **Commit to Master** — Après QA 100% OK
  - Git commit avec changelog complet
  - Push to GitHub
  - Tag version (v0.1.0-beta)

### Nexus Multi-Agent Prototype (Priority 2)
- [x] **Plan créé** — `memory/nexus-multi-agent-prototype.md` (12KB) ✅
- [ ] **Prototype Phase 1** — Architecture (4h)
  - Agent config file (`~/.vutler/agents.json`)
  - `NexusOrchestrator` class
  - Process-based spawning
- [ ] **Prototype Phase 2** — Implementation (8h)
  - Mike agent (Kimi K2.5)
  - Gemini agent (FREE)
  - Smart routing (keywords)
- [ ] **Prototype Phase 3** — Testing (4h)
  - Code bug fix → Mike
  - General question → Gemini
  - Error handling
- [ ] **Demo à Alex** — Mercredi 2026-03-03

---

## 🟠 This Week (2-8 Mars 2026)

### Vutler Production Ready
- [ ] Frontend polish (responsive, animations, UX)
- [ ] Documentation client-facing (installation guide, API docs)
- [ ] Documentation interne (architecture, infra, dev workflow)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Monitoring (Umami + error tracking)

### Nexus Deployment
- [ ] Install Nexus sur MacBook Pro remote (via Tailscale)
- [ ] Configure OpenRouter (Gemini gratuit)
- [ ] Test multi-agent local
- [ ] Migration progressive depuis OpenClaw

### Starbox Group Website
- [ ] Ajouter Vaultbrix à la liste produits
- [ ] Cross-links footer sur tous sites
- [ ] Deploy to starbox-group.com

---

## 🟡 Soon (Semaines Prochaines)

### Vutler Sprints 13-15
- [ ] **Sprint 13** — Integrations (Notion, n8n, Jira/Linear)
  - 5-8 jours
  - BMAD workflow obligatoire
  - Contracts TypeScript avant coding
- [ ] **Sprint 14** — Billing/Stripe + MS365
  - 5-8 jours
  - Pricing: Per agent, unlimited usage
  - No metering, no surprises
- [ ] **Sprint 15** — White-label, SSO, Multi-Nexus Enterprise
  - 8-10 jours
  - Client data stays local
  - Only metadata/logs transit cloud

### Vutler Sprint 18 (Prioritized)
- [ ] **A2A (Agent-to-Agent)** — Interop entre agents
  - OpenClaw ↔ Vutler communication
  - Cross-workspace agent calling
  - Shared memory/context

### AgentsOpen Launch
- [ ] Product brief final
- [ ] Landing page
- [ ] Registre agents beta
- [ ] Swiss trust score algorithm

---

## 🔵 Backlog

### Vutler Features (Post-Sprint 15)
- [ ] **OpenRouter Integration** (39 SP) — 7 user stories
  - US-OR-1: Provider Setup (5 SP)
  - US-OR-2: Model Selection per Agent (3 SP)
  - US-OR-3: Models Catalog Browser (5 SP)
  - US-OR-4: Nexus Local Config (8 SP)
  - US-OR-5: Token Usage Tracking (5 SP)
  - US-OR-6: Fallback Provider Chain (8 SP)
  - US-OR-7: Cost Alerts (5 SP)
  - Doc: `projects/vutler/docs/user-stories/openrouter-integration.md`
  
- [ ] **Model Recommendations** (36 SP) — Smart UX
  - US-REC-1: Smart Recommendations UI (5 SP) — P0
  - US-REC-2: Agent Type → Model Mapping (8 SP) — P0
  - US-REC-3: Rating System (5 SP) — P0
  - US-REC-4: Auto-Provisioning on Signup (8 SP) — P1
  - US-REC-5: Cost Comparison Badge (2 SP) — P1
  - US-REC-6: Community Ratings (8 SP) — P2
  - Doc: `projects/vutler/docs/user-stories/model-recommendations.md`

- [ ] **Pixel Office Dashboard** — Bureau pixel art interactif
  - Layout dynamique selon plan (Free/Pro/Enterprise)
  - Avatars pixel générés depuis `/api/v1/agents`
  - Animation live basée sur agent_runtime_status
  - Clic agent → détail (stats, mémoire, conversations)
  - Layout editor (drag & drop, thèmes)
  - Salle conférence, war room, whiteboard
  - Proto: `projects/vutler/prototypes/pixel-office.html`

### Infrastructure & DevOps
- [ ] CI/CD: GitHub Actions (lint + smoke tests)
- [ ] Monitoring: Umami + error tracking
- [ ] Backup strategy (DB snapshots, file backups)
- [ ] SSL renewal automation
- [ ] VPS disk cleanup (confirm stability first)

### Snipara & Vaultbrix
- [ ] Snipara: READMEs + documentation
- [ ] Vaultbrix: READMEs + client docs
- [ ] Vaultbrix: Umami analytics
- [ ] vutler.ai DNS migration from Squarespace

### Team Agents
- [ ] Setup Rex as persistent monitoring agent
- [ ] Create all 12 agents in Vutler cloud
- [ ] Migrate from OpenClaw to Vutler workspace

---

## ✅ Done This Week (2026-03-01)

### BMAD Workflow Deployed
- [x] Created `memory/bmad-dev-workflow.md` (12.5KB)
- [x] Created `memory/dev-workflow-rules.md` (6.4KB)
- [x] Created `memory/bmad-deployed-2026-03-01.md` (6.4KB)
- [x] Created 5 TypeScript contracts (`contracts/`)
- [x] Created story template (`templates/bmad-story.md`)
- [x] Updated MEMORY.md with BMAD rules
- [x] Notified Mike with BMAD specs for bugs

### Vutler Bug Fixes
- [x] **P0 Phase 1** (4 bugs) — Mike completed (10m58s, $0.13)
  - Agents "Manage" button → `/agents/:id/config`
  - Nexus token → API returns `token` + `localToken`
  - Setup token → Same fix
  - Drive files → Table + seed data created
- [x] **P0 Phase 2 (Chat API)** (3 bugs) — Mike completed (6m6s, $0.08)
  - Chat channels 500 → Fixed validation + error handling
  - Chat direct 404 → New endpoint created
  - Chat create 404 → New endpoint created
- [x] **P1** (4 bugs) — Mike completed (16m34s, $0.18)
  - Email → PostgreSQL API + CRUD
  - Integrations → connect/disconnect/execute endpoints
  - LLM Settings → Frontend rebuild + static files
  - Notifications/Usage/Audit → Full DB implementation

### Infrastructure
- [x] Kimi K2.5 integration via OpenRouter
- [x] Mike switched to Kimi K2.5 (96% cost savings)
- [x] OpenRouter API key configured
- [x] MongoDB + Rocket.Chat removed from VPS

### Documentation
- [x] Vaultbrix DDL script (`memory/vaultbrix-ddl-missing.sql`)
- [x] Nexus improvements plan (`memory/nexus-improvements-plan.md`)
- [x] Nexus multi-agent prototype spec (`memory/nexus-multi-agent-prototype.md`)
- [x] Kimi K2.5 quality report (`memory/kimi-k2.5-quality-report.md`)
- [x] Model switch plan (`memory/model-switch-plan.md`)
- [x] Vutler bugs prioritized (`memory/vutler-bugs-prioritized.md`)
- [x] Stabilisation strategy (`memory/vutler-stabilisation-strategy.md`)
- [x] Nexus tasks (`memory/vutler-nexus-tasks.md`)

---

## ✅ Done Previous Weeks

### 2026-02-24
- [x] Vutler landing: 5 new pages (pricing, about, privacy, terms, docs)
- [x] Vutler logo: icosahedron integrated
- [x] LLM Setup Wizard
- [x] Sprint 7.1 LLM Router API
- [x] Sprint 7.2 Agent Runtime Engine
- [x] README.md for Vutler repo
- [x] Marcus/Rex crons fixed
- [x] VPS disk migration

### 2026-02-17
- [x] Snipara API key fixed
- [x] Hooks updated to npm package v1.0.2
- [x] Mac sleep disabled for WhatsApp stability
- [x] OpenAI API key added

### 2026-02-14
- [x] Expanded to 10 agents
- [x] Created full team structure

### 2026-02-13
- [x] First session
- [x] Named Jarvis
- [x] Set up initial 5 agents

---

## 📊 Stats & Metrics

### Costs (2026-03-01)
- **Kimi K2.5 (Mike):** $0.39 total (3 sessions)
  - P0 Phase 1: $0.13
  - P0 Phase 2: $0.08
  - P1: $0.18
- **Claude Max (Jarvis):** 84% used, 16% remaining
- **Switch trigger:** 92% usage → Gemini 2.0 Flash

### Time Saved (BMAD)
- **Before BMAD:** 5 jours (code → debug → fix)
- **With BMAD:** 2 jours (spec 3h → code 3h → QA 1h)
- **Gain:** -60% temps dev, -90% bugs d'intégration

### Bugs Fixed
- **P0:** 7/7 (100%) ✅
- **P1:** 4/4 (100%) ✅
- **P2:** 0/7 (0%) ⏳ En cours
- **Total:** 11/18 (61%)

---

**Last Updated:** 2026-03-01 20:56  
**Next Review:** 2026-03-02 09:00
