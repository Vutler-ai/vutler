# Sprint 6 — Agent Runtime, Vutler Connect R/W & Polish
**Dates:** 2026-04-28 → 2026-05-11 (2 semaines)
**Objectif:** Agents fonctionnels end-to-end, Vutler Connect read/write, polish UI, préparation launch
**Capacité:** ~24 SP

---

## ⚠️ Directives Sprint 6

**ZERO MOCKUP DATA** — Données réelles uniquement.
**Agent must work E2E** — Un agent configuré doit pouvoir recevoir un message chat → appeler un LLM → répondre automatiquement.
**Launch-ready polish** — Ce sprint prépare le soft launch.

---

## Stories Sprint 6

### 🔴 P0 — Must Ship

#### S6.1 — Agent Runtime E2E (5 SP) — Mike
- [ ] Agent écoute les messages RC via WebSocket
- [ ] Message reçu → route vers le LLM configuré (via workspace provider)
- [ ] Réponse LLM → postée dans le channel RC
- [ ] Token usage enregistré dans PG à chaque call
- [ ] Agent status visible en temps réel (online/offline/processing)
- [ ] Graceful error handling (LLM timeout, rate limit, bad config)

#### S6.2 — Agent Builder UI (5 SP) — Philip
- [ ] Page `/admin/agents/new` — créer un agent step-by-step
- [ ] Step 1: Nom, avatar, description, personality prompt
- [ ] Step 2: Assigner un LLM provider + model (depuis workspace providers)
- [ ] Step 3: Assigner des channels RC où l'agent écoute
- [ ] Step 4: Configurer tools (email, drive, webhooks) — checkboxes
- [ ] Step 5: Review + Deploy → agent démarre et écoute
- [ ] Template quick-start : choisir un template → pré-rempli

#### S6.3 — Vutler Connect Read/Write (4 SP) — Mike
- [ ] Upgrade shared channels: partenaire peut aussi poster (bi-directionnel)
- [ ] Permission model: read-only / read-write configurable par channel
- [ ] Message relay entre workspaces via API (pas WebSocket direct)
- [ ] Rate limiting par partenaire + par channel
- [ ] Audit log de tous les messages cross-workspace

#### S6.4 — Template Marketplace (3 SP) — Philip
- [ ] Page `/admin/marketplace` — browse templates disponibles
- [ ] Cards: nom, description, catégorie, preview
- [ ] "Deploy" button → crée un agent pré-configuré
- [ ] Catégories: Customer Support, Sales, Content, Dev, Custom
- [ ] Search + filter par catégorie

### 🟡 P1 — Should Ship

#### S6.5 — Email Integration for Agents (3 SP) — Mike
- [ ] Agent peut envoyer des emails via SMTP configuré
- [ ] Agent reçoit des emails (IMAP polling) et les traite
- [ ] Config email par agent dans PG
- [ ] Email templates (welcome, notification, reply)

#### S6.6 — Onboarding Flow (2 SP) — Philip
- [ ] First-time user: wizard d'onboarding après premier login
- [ ] Step 1: "Welcome to Vutler" — intro
- [ ] Step 2: Connect LLM provider (API key)
- [ ] Step 3: Deploy first agent (from template)
- [ ] Skippable, shown only once (flag in localStorage)

#### S6.7 — Production Hardening (2 SP) — Mike
- [ ] Health check dashboard endpoint (all services: RC, PG, Redis, Snipara)
- [ ] Structured logging (JSON) avec request IDs
- [ ] Error tracking (catch unhandled rejections)
- [ ] Backup script: PG dump + MongoDB dump → S3/local

---

## Total Sprint 6 : 24 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S6.1, S6.3, S6.5, S6.7 | 14 SP |
| **Philip** 🎨 | S6.2, S6.4, S6.6 | 10 SP |
| **Luna** 🧪 | E2E agent testing, onboarding review | — |
| **Jarvis** ⚡ | Coordination, launch prep | — |

---

## Critères de succès Sprint 6

✅ Créer un agent via UI → il écoute un channel → répond automatiquement via LLM
✅ Template deploy → agent fonctionnel en 2 clics
✅ Vutler Connect: 2 workspaces communiquent en read/write
✅ Onboarding: nouveau user → premier agent en < 5 min
✅ Backup automatisé fonctionnel
