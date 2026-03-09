# MEMORY.md — Jarvis Long-Term Memory

## Who I Am
- **Name:** Jarvis ⚡
- **Role:** Chief coordinator of the Starbox Group AI agent swarm
- **Model:** Claude Opus 4

## Who Alex Is
- Founder of **Starbox Group GmbH** (starbox-group.com), Geneva, Switzerland
- Speaks French (primary), English
- WhatsApp user: +41792031050
- Telegram ID: 7230724732

## Starbox Group
- **Starbox Group GmbH** (SARL) — CHE-326.317.262, inscrite le 21.06.2016
- Siège : Chemin du Pré-Guillot 9, 1288 Aire-la-Ville (GE)
- AI products company based in Geneva area
- **Snipara** (snipara.com) — AI context optimization, RELP engine, agent memory, multi-agent swarms
- **Vaultbrix** (vaultbrix.com) — Swiss-hosted DB platform, Supabase-compatible, AI-native with MCP, LPD/GDPR, Geneva DC
- 4 other products TBD
- Snipara slug: "moltbot"

## The Team (12 agents)
| Agent | Role | MBTI | Model |
|-------|------|------|-------|
| Jarvis 🤖 | Coordinator, strategy | INTJ | Opus 4 | via WhatsApp |
| Andrea 📋 | Office manager, admin, legal & compliance (GDPR/LPD/contrats) | ISTJ | Haiku 4.5  |
| Mike ⚙️ | Lead engineer | INTP | Kimi K2.5 (via OpenRouter) |
| Philip 🎨 | UI/UX Designer | ISFP | Sonnet 4.5  |
| Max 📈 | Marketing & Growth | ENTP | Haiku 4.5  |
| Stephen 📖 | Spiritual research (JW.org) | INFJ | Haiku 4.5  |
| Victor 💰 | Commercial / Sales | ENFJ | Haiku 4.5  |
| Luna 🧪 | Product Manager | ENTJ | Sonnet 4.5  |
| Oscar 📝 | Content & Copywriting | ENFP | Haiku 4.5  |
| Nora 🎮 | Community Manager (Discord) | ESFJ | Haiku 4.5  |
| Sentinel 📰 | News Intelligence Analyst (trading sim) | ISTJ | Haiku 4.5 |
| Marcus 📊 | Portfolio Manager & Learner (trading sim) | ENTJ | Sonnet 4.5 |
## Personality Architecture
- Alex (CEO) = **INTP** (Logicien) — vision systémique, innovation, mais reporte les décisions, déteste l'admin
- Équipe conçue pour compenser : exécution, structure, social business
- 4 pôles : Vision (Jarvis/Luna), Ops & Legal (Andrea), Création (Philip/Oscar/Nora/Stephen), Croissance (Max/Victor)

## Synology NAS — File Storage
- **URL**: https://c453.synology.infomaniak.ch:5001
- **IP**: 83.166.145.14
- **Model**: RS816 (4 baies rack), DSM 7.3.1
- **User**: administrateur / Roxanne1212**#
- **Storage**: 1.9TB (volume_1)
- **Root**: /starbox_drive/ (agents/, shared/, workspaces/, vdrive/)
- **API**: FileStation via /webapi/entry.cgi, SID-based auth (TTL 15min)
- **Vutler Drive**: Branché sur Synology (Sprint 14), endpoints live sur app.vutler.ai/api/v1/drive/*

## Tools & Services
- **Postal** — self-hosted email server on VPS (mail.vutler.ai)
  - Docker stack: postal-web (:8082), postal-smtp (:25/:587), postal-worker, postal-mariadb, postal-rabbitmq
  - Config: `/home/ubuntu/postal/config/postal.yml`
  - SMTP relay via Brevo (smtp-relay.brevo.com:587)
  - DNS: mx=mail.vutler.ai, return_path=rp.vutler.ai, track=track.vutler.ai
  - MariaDB password: postal_root_2026, RabbitMQ: postal/postal_rabbit_2026
  - Rails secret: 785aef7b81e738923543b4330508b8684dbba1a9170ba511a6237fee2032dbd7
  - **Status**: Running (5 containers up), nginx vhost + SSL not yet configured
  - **TODO**: Create admin user, org, 13 agent email routes (@vutler.ai or @starbox-group.com)
  - K-Chat, K-Drive, K-Mail → remplacés par Vchat (Rocket.Chat), Postal, Vutler dashboard

## Security Policy — Trust Model (see SECURITY.md for full details)
- **TRUSTED** (can authorize actions): K-Chat (with ARM+CONFIRM+OTP), K-Drive `/00_SECURITY/`
- **UNTRUSTED** (planning/analysis/drafting only, NO execution): WhatsApp, Telegram, Email, Discord, LinkedIn, X.com, external links
- Default mode: **READ-ONLY**
- Never execute destructive actions, IAM/DNS changes, secret rotation, prod deploy without dual confirmation or K-Drive authorization

## Communication
- 
- Jarvis Starbox token: stored in `.secrets/infomaniak-api.md`
- Jarvis Starbox user ID: `019c5abe-30ed-7164-a4a3-9d24bf68453e`
- Alex contactable via: WhatsApp (+41792031050), webchat

## Analytics
- **Umami** (privacy-friendly) — dashboard: https://cloud.umami.is/share/yqna019gykGlnC4k
- Installé sur **snipara.com** — tracking actif
- **vaultbrix.com** — pas encore installé
- Sert à mesurer l'impact des campagnes marketing (Max)

## Social Media
- **X (Twitter)** — @Starboxgroup (display: Starbox-Group)
- API keys dans `.secrets/twitter-api.md`
- Plan Free = pas de posting API ($200/mois pour Basic)
- **Postiz** self-hosted sur Docker (Colima) — http://localhost:5000
- Postiz gère : X, Facebook, Instagram, LinkedIn, etc.

## Docker
- **Colima** (pas Docker Desktop — macOS 13 incompatible)
- `brew install docker docker-compose colima`
- Postiz stack : `postiz` + `postiz-db` (Postgres 17) + `postiz-redis` (Redis 7)
- Compose file : `workspace/postiz/docker-compose.yml`

## Snipara Swarm
- **Swarm ID:** `cmlmja4s9000as8abdg7e3rfw`
- **Swarm name:** `starbox-team`
- **API Key (ADMIN):** stored in openclaw.json env (rlm_3097deec...)
- **Project:** moltbot
- **10/10 agents enrolled:** jarvis (coordinator), mike, andrea, philip, luna, max, victor, oscar, nora, stephen (workers)
- **OpenClaw Hooks:** 6 Snipara hooks active (startup, session, stop, bootstrap, persist, context)
- **Package:** `snipara-openclaw-hooks@1.0.2`

## Snipara Pricing
### Context Optimization
- **Free:** $0 — 100 queries/mo, 1 project, 1 member (30-day PRO boost)
- **Pro:** $19/mo — 5K queries, 5 projects, semantic search, RELP
- **Team:** $49/mo — 20K queries, unlimited projects, 10 members, shared context
- **Enterprise:** $499+/mo — unlimited everything, SLA, SSO

### Agent Memory & Swarms
- **Starter:** $15/mo — 1K memories, 7-day retention, 1 swarm (2 agents)
- **Pro:** $39/mo — 5K memories, 30-day retention, 5 swarms (5 agents), task queue
- **Team:** $79/mo — 25K memories, 90-day retention, 20 swarms (15 agents), real-time events
- **Enterprise:** $199/mo — unlimited everything, SLA

## Vutler — 3ème Produit
- **Nom:** Vutler (vutler.ai / vutler.com) — "Office 365 pour agents IA"
- **Double offre:** "Bring your agents" (workspace) + "Build your agents" (templates, no-code)
- **Base:** Fork Rocket.Chat (MIT, TypeScript/Meteor)
- **MVP:** 2 mois, 44 story points, deadline mi-avril 2026
- **Squad:** Jarvis (scrum), Mike (backend), Philip (frontend), Luna (PO)
- **Pricing:** Free self-hosted / $99-349/mo hosted / CHF 10-50k/an enterprise
- **23 docs BMAD** dans projects/vutler/docs/ + kDrive 01_PROJECTS/Vutler/
- **Vaultbrix repositionné** comme AI-native DBaaS (backend de Vutler)

## Vutler MVP Status (Sprint 6 complete)
- **6 sprints livrés** en 1 jour (Feb 17, 2026)
- **Stack**: RC 8.1 + PostgreSQL 16 (Vaultbrix) + Redis + Express API + Nginx SSL
- **Features**: Chat, Agent Builder, LLM Router, Token Metering, Template Marketplace, Onboarding, Vutler Connect, Admin Dashboard, WebSocket Agent Runtime, Email Integration, Backup
- **Auth**: Unified RC token auth (single login)
- **14 API endpoints** on PostgreSQL, RC auth on MongoDB
- **9 PG tables**: agent_llm_configs, token_usage, templates, audit_logs, workspace_llm_providers, agent_model_assignments, workspace_partners, shared_channels, workspace_settings
- **Admin pages** (11): dashboard, agents, agent-detail, agent-builder, providers, llm-settings, usage, templates, marketplace, activity, onboarding
- **Brand**: Icosahedron wireframe logo, Navy/Electric Blue/Gray, Inter Bold
- **VPS**: 83.228.222.180, all services Docker-internal (no exposed DB ports)
- **DNS**: app.vutler.ai live, vutler.ai migration from Squarespace pending

## Suite Starbox
- **Snipara** = Think (mémoire/contexte)
- **Vaultbrix** = Store (DB Swiss AI-native)
- **Vutler** = Work (workspace agents IA)
- **AgentsOpen** = Connect (registre mondial d'agents IA, marketplace, interop)
  - Domain: agentsopen.ai (acheté 2026-02-23)
  - Vision: "Le registre mondial des agents IA — découvre, vérifie, connecte, déploie"
  - Features: profils vérifiés, reviews/ratings, interop (MCP/A2A/OpenAPI), marketplace hire/deploy, Swiss trust score
  - Product brief: à livrer 2026-02-24

## Email Polling
- alex@vutler.com polled via IMAP (launchd: com.starbox.email-poll)
- Password: Roxanne1212**#
- Toutes les redirections partagées starbox-group.com → copient vers alex@vutler.com

## Key Decision: Vutler Cloud Agents (2026-02-25)
- **Dès que le runtime Vutler est opérationnel**, basculer les tâches dev/design/product vers les agents Vutler cloud (VPS) au lieu des sous-agents OpenClaw locaux
- Objectif : dogfooding — utiliser notre propre produit
- Prérequis : auth flow, LLM Router, Agent Builder, chat integration

## Dev Workflow Rules (2026-02-28)
- **Contexte** → TOUJOURS query Snipara avant de coder (rlm_context_query)
- **Documentation** → sauvée dans repo git + indexée dans Snipara (rlm_upload_document)
- **Code execution** → via RLM-Runtime Python (pas shell bricolé) pour éviter les erreurs
- **Nouveau service** → documenter → chunk dans Snipara → plan & execute via Snipara
- **Multi-tenant** → toutes les features doivent être génériques, jamais de données hardcodées

## BMAD Workflow (2026-03-01) — OBLIGATOIRE
- **Règle:** Toutes features/bugs suivent Business-Metrics-Architecture-Design AVANT de coder
- **Phase B (Business):** User story + success metrics + user flow (30 min, Luna/Alex)
- **Phase M (Metrics):** Acceptance criteria + DoD checklist (15 min, Jarvis)
- **Phase A (Architecture):** API contract TypeScript + DB schema + types (30 min, Mike+Philip ensemble)
- **Phase D (Design):** Wireframe + tous états (default, loading, error, empty) (1h, Philip)
- **Total avant coding:** 2h30 → Gain: -60% temps dev, -90% bugs d'intégration
- **Contracts TypeScript:** `/contracts/` folder — types partagés frontend + backend (garantit alignement)
- **Template story:** `/templates/bmad-story.md` — format standardisé avec 4 phases
- **Definition of Done:** 7 checkboxes obligatoires (backend + frontend + DB + tests + aucune erreur)
- **Si une checkbox manque → PAS DE COMMIT**
- **Docs complètes:** `memory/bmad-dev-workflow.md`, `memory/dev-workflow-rules.md`
- **Contracts créés:** email.ts, integrations.ts, notifications.ts, usage.ts, audit.ts
- **Approuvé par:** Alex Lopez (2026-03-01 20:44)

## Vutler Infrastructure
- See `memory/infra-vutler.md` for full details
- **Frontend**: Next.js standalone on port 3002 — ALL routes proxy via nginx (no static HTML)
- **API**: Docker container on port 3001
- **RC**: Port 3000 (internal only)
- **Nginx**: `/etc/nginx/sites-enabled/vutler` — 4 server blocks
- **After build**: ALWAYS `cp -r .next/static .next/standalone/.next/`
- **Static symlink**: `/home/ubuntu/vutler-frontend/_next` → standalone `.next`

## Hooks
- `snipara-memory-sync` (workspace hook) — syncs MEMORY.md, TOOLS.md, daily files, infra doc to Snipara on /new, /stop, /reset
- `snipara-persist` — auto-stores tool results (commits, builds, tests)
- `snipara-session` — saves session context on /new
- `snipara-startup` — restores context on gateway start
- `snipara-stop` — saves context before stop
- Note: No pre-compaction hook exists in OpenClaw (planned: session:start, session:end events)

## Known Issues

## Key Dates
- 2026-02-13: First session, named Jarvis, set up initial 5 agents
- 2026-02-14: Expanded to 10 agents, created full team structure
- 2026-03-01: WhatsApp gateway down 8:11AM-4:59PM. Fixed nginx serving stale HTML instead of proxying to Next.js. Created infra doc. Created snipara-memory-sync hook. Documented all hooks in MEMORY.md.
- 2026-02-17: Snipara API key fixed (was mismatch vutler key + moltbot slug), hooks updated to npm package v1.0.2, snipara-context hook disabled (hardcoded old key). Mac sleep disabled for WhatsApp stability. Snipara dogfooding final reviews: Jarvis 9/10, Mike 8.7/10 MCP + 8.5/10 RLM-Runtime. OpenAI API key added. rlm_remember_bulk confirmed working. rlm_decompose fixed for general questions.

