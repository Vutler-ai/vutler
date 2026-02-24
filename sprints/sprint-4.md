# Sprint 4 — Polish, E2E Tests & Launch Prep
**Dates:** 2026-03-31 → 2026-04-13 (2 semaines)
**Objectif:** Tout connecter end-to-end, polish UI, tests E2E, docs deploy, landing page ready
**Capacité:** ~24 SP

---

## Stories Sprint 4

### 🔴 P0 — Must Ship

#### S4.1 — E2E Integration Tests (5 SP) — Mike
- [ ] Docker Compose up → tous les services healthy
- [ ] Test script complet : create agent → config LLM → send email → post chat → upload file → check usage
- [ ] Test BYOKEY flow (OpenAI mock)
- [ ] Test Managed LLM flow (MiniMax)
- [ ] Test template deploy → OpenClaw agent starts → responds to messages
- [ ] CI script : `make test-e2e`

#### S4.2 — Frontend-Backend Integration (5 SP) — Philip + Mike
- [ ] Dashboard agents connecté aux vrais APIs (pas de mock)
- [ ] LLM Config UI sauvegarde et charge depuis le backend
- [ ] Usage Dashboard affiche les vraies données token_usage
- [ ] Template deploy flow complet : choisir template → configurer → deploy → voir dans liste
- [ ] Agent detail : status live (online/offline), dernière activité réelle

#### S4.3 — WebSocket Chat (3 SP) — Mike
**Story 6 du PRD** : Agent subscribes to WebSocket events
- [ ] WebSocket endpoint pour les agents
- [ ] Agent reçoit les messages en temps réel (pas polling)
- [ ] Agent peut répondre via WebSocket
- [ ] Intégration avec le chat Rocket.Chat existant

#### S4.4 — Deploy Documentation (2 SP) — Mike
- [ ] README.md complet (installation, config, API reference)
- [ ] `docker compose up` guide step-by-step
- [ ] `.env.example` documenté avec tous les params
- [ ] API reference auto-générée (ou manuelle)

### 🟡 P1 — Should Ship

#### S4.5 — Landing Page Vutler (3 SP) — Philip
- [ ] Page statique : hero, features, pricing, CTA
- [ ] Responsive, rapide (HTML/CSS/JS, pas de framework lourd)
- [ ] Sections : "Build your AI workforce" + "Bring your agents"
- [ ] Pricing cards (Free / Hosted / Enterprise)
- [ ] CTA : "Get Started" → lien GitHub + "Request Demo" → formulaire email

#### S4.6 — Agent Activity Feed (3 SP) — Philip
**Story 9 du PRD** : Human views agent activity dashboard
- [ ] Page `/agents/:id/activity` : feed chronologique
- [ ] Actions : email envoyé, message posté, fichier uploadé, LLM call
- [ ] Filtrable par type d'action
- [ ] Icônes : 📧 💬 📁 🤖

#### S4.7 — Security Hardening (3 SP) — Mike
- [ ] Rate limiting global (pas juste par agent)
- [ ] CORS configuré
- [ ] Helmet.js pour les headers HTTP
- [ ] Input validation sur tous les endpoints
- [ ] API key rotation endpoint

---

## Total Sprint 4 : 24 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S4.1, S4.2 (backend), S4.3, S4.4, S4.7 | 18 SP |
| **Philip** 🎨 | S4.2 (frontend), S4.5, S4.6 | 11 SP |
| **Luna** 🧪 | E2E acceptance, landing page review | — |
| **Jarvis** ⚡ | Coordination, Docker validation, deploy test | — |

---

## ⚠️ Directives Sprint 4

**ZERO MOCKUP DATA** — Toutes les pages doivent afficher uniquement des données réelles du backend. Si aucune donnée n'existe encore, afficher un état vide propre (empty state). Pas de fake data, pas de demo data, pas de placeholders avec des chiffres inventés. Le dashboard doit refléter la réalité : si 0 agents → afficher 0, si pas de tokens utilisés → afficher 0.

---

## Critères de succès Sprint 4

✅ `docker compose up` → tout tourne → créer agent → LLM répond → email envoyé → visible dans dashboard
✅ Template deploy → agent OpenClaw démarre → répond aux messages automatiquement
✅ Landing page vutler.ai live (ou preview)
✅ README complet pour un nouveau user
✅ 0 bugs critiques sur le happy path
