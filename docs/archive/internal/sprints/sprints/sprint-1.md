# Sprint 1 — Vutler MVP Foundation
**Dates:** 2026-02-17 → 2026-03-02 (2 semaines)
**Objectif:** Fork Rocket.Chat, agent identity API, deploy Docker, premier agent fonctionnel
**Capacité:** ~22 SP (Team: Mike, Philip, Luna + Jarvis coordination)

---

## Stack d'exécution

| Outil | Usage |
|-------|-------|
| **Claude (Opus/Sonnet)** | Coordination Jarvis, décisions architecture, code review |
| **MiniMax M2.5** | Coding lourd via RLM-Runtime (300 prompts/5h) |
| **Snipara CONTEXT** | Optimisation tokens — les agents query la doc au lieu de tout charger |
| **RLM-Runtime (Docker)** | Exécution code isolée, tests, builds |
| **Docker Compose** | Environnement de dev local (Rocket.Chat fork + Postgres + Redis + MinIO) |

---

## Stories Sprint 1

### 🔴 P0 — Must Ship

#### S1.1 — Fork & Docker Setup (3 SP) — Mike
**Story 1 du PRD** : Deploy Vutler in <30 min
- [ ] Fork Rocket.Chat (MIT) → `github.com/starbox-group/vutler`
- [ ] Docker Compose : app + MongoDB + Redis
- [ ] `docker compose up` → Vutler UI accessible sur `localhost:3000`
- [ ] README avec instructions de setup
- [ ] CI basique (GitHub Actions : build + lint)

#### S1.2 — Agent Identity API (2 SP) — Mike
**Story 2 du PRD** : Create agent identity via API
- [ ] `POST /api/v1/agents` → crée un agent (name, email, avatar, description)
- [ ] `GET /api/v1/agents` → liste les agents
- [ ] `GET /api/v1/agents/:id` → détails agent
- [ ] API key générée à la création (Bearer auth)
- [ ] Agent stocké en DB avec `type: 'agent'` (distinct de `type: 'human'`)

#### S1.3 — Agent Email Send (5 SP) — Mike
**Story 3 du PRD** : Agent sends email via API
- [ ] `POST /api/v1/email/send` avec `to`, `subject`, `body`, `from` (agent email)
- [ ] SMTP intégré (Postfix container ou service externe configurable)
- [ ] Email envoyé avec identité agent (`support@vutler-instance.com`)
- [ ] Logs d'envoi visibles dans l'API
- [ ] Rate limiting basique (10 emails/min/agent)

#### S1.4 — Agent Email Receive (5 SP) — Mike
**Story 4 du PRD** : Agent receives email
- [ ] IMAP polling ou webhook (configurable)
- [ ] `GET /api/v1/email/inbox?agent_id={id}` → emails reçus
- [ ] Webhook push : `POST {agent_webhook_url}` quand email arrive
- [ ] Email parsé (from, to, subject, body, attachments metadata)

#### S1.5 — Agent Chat Post (3 SP) — Mike
**Story 5 du PRD** : Agent posts message to chat
- [ ] `POST /api/v1/chat/send` avec `channel_id`, `text`, `agent_id`
- [ ] Message visible dans le chat Rocket.Chat avec avatar/nom agent
- [ ] Support markdown basique
- [ ] Utilise l'API Rocket.Chat existante (adapter auth pour agents)

**Sous-total P0 : 18 SP**

### 🟡 P1 — Should Ship

#### S1.6 — Agent Dashboard (Basic) (3 SP) — Philip
**Story 9 du PRD** (simplifié)
- [ ] Page `/agents` : liste des agents avec status (online/offline)
- [ ] Page `/agents/:id` : détails + dernière activité
- [ ] UI propre, responsive (React, design system Rocket.Chat)

#### S1.7 — Dev Environment & CI (1 SP) — Mike
- [ ] `.env.example` avec toutes les variables
- [ ] `make dev` / `make test` / `make build`
- [ ] Tests unitaires pour agent identity API
- [ ] Docker healthchecks

**Sous-total P1 : 4 SP**

---

## Total Sprint 1 : 22 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S1.1, S1.2, S1.3, S1.4, S1.5, S1.7 | 19 SP |
| **Philip** 🎨 | S1.6 | 3 SP |
| **Luna** 🧪 | Acceptance testing, story refinement | — |
| **Jarvis** ⚡ | Coordination, code review, blockers | — |

---

## Definition of Done

- [ ] Code mergé sur `main`
- [ ] Tests passent (unit + intégration basique)
- [ ] Docker Compose fonctionne (`docker compose up` → tout tourne)
- [ ] Agent créé via API → peut envoyer un email + poster dans le chat
- [ ] Dashboard affiche la liste des agents
- [ ] README à jour

---

## Setup Technique (Jour 1)

### 1. Repos (DONE ✅)
- **Vutler (Rocket.Chat fork):** `github.com/alopez3006/vutler` → cloned to `projects/vutler/app/`
- **OpenClaw fork:** `github.com/alopez3006/openclaw` → cloned to `projects/vutler/openclaw/`

### 2. Docker Compose (dev)
```yaml
services:
  vutler:
    build: .
    ports: ["3000:3000"]
    depends_on: [mongo, redis]
  mongo:
    image: mongo:6
    volumes: [mongo-data:/data/db]
  redis:
    image: redis:7-alpine
```

### 3. Snipara Context Setup
```bash
npx create-snipara --team-key rlm_e4fe04c335330563e03bbb9e15f2a8aeb49443c7a53995d20626afb8c7017708 --slug vutler
# Configure RLM-Runtime en mode docker
rlm init  # → choisir "docker"
```

### 4. MiniMax Backup
```bash
export MINIMAX_API_KEY="sk-cp-sfzukKGIRVRQ-w-onEZaw6HRYUnmMuv-F2TxLDYHAuro37b15nu9_NbZV3jnKo73VtdrfYPL0WMVzFet9ZyguD5LlFEZ4c_sBFM7y5STCKu_V--u1B-gMjI"
# Utilisable via RLM-Runtime: rlm run --model minimax
```

---

## Risques Sprint 1

| Risque | Mitigation |
|--------|-----------|
| Rocket.Chat codebase massive (Meteor) | Focus sur l'API, ne pas toucher au frontend core |
| MongoDB vs PostgreSQL (ADR-002 dit Postgres) | Sprint 1 : garder MongoDB natif. Migration → Sprint 2 |
| SMTP complexité | Utiliser un service SMTP externe (Infomaniak, Postmark) d'abord |
| Token burn élevé | Snipara CONTEXT + MiniMax backup |

---

## Critères de succès Sprint 1

✅ `docker compose up` → Vutler tourne
✅ `curl POST /api/v1/agents` → agent créé
✅ Agent envoie un email via API
✅ Agent poste un message dans le chat
✅ Dashboard liste les agents
✅ Tout ça en 2 semaines
