# Sprint 2 — Vutler Integration & Agent Builder
**Dates:** 2026-03-03 → 2026-03-16 (2 semaines)
**Objectif:** Intégrer le backend dans Rocket.Chat, connecter le dashboard, Docker fonctionnel end-to-end, premiers templates agents
**Capacité:** ~24 SP

---

## État post-Sprint 1

### Ce qu'on a
- **Backend** : 7 fichiers Express custom (`app/custom/`) — agents CRUD, email send/receive, chat post, IMAP poller, auth middleware, rate limiting (1516 lignes)
- **Frontend** : 6 composants React/Fuselage (`apps/meteor/client/views/agents/`) — liste agents + détail (937 lignes)
- **Docker Compose** : app + MongoDB + Redis (pas encore testé end-to-end)
- **Tests** : 4 fichiers de tests unitaires (919 lignes)

### Ce qui manque
- Backend pas intégré dans Meteor/Rocket.Chat (Express standalone)
- Frontend avec mock data (pas connecté aux APIs)
- Docker pas validé (jamais lancé)
- Zéro template agent (Track "Build")

---

## Stories Sprint 2

### 🔴 P0 — Must Ship

#### S2.1 — Docker End-to-End (3 SP) — Mike
- [ ] `docker compose up` → Vutler accessible localhost:3000
- [ ] MongoDB + Redis + app fonctionnels
- [ ] Healthchecks validés
- [ ] `.env.example` complet et documenté
- [ ] Tester manuellement : créer un admin, voir le chat

#### S2.2 — Intégrer Agent API dans Rocket.Chat (5 SP) — Mike
- [ ] Migrer `app/custom/api/agents.js` → route native Rocket.Chat (ou Express middleware monté)
- [ ] Agents stockés en MongoDB via modèle Rocket.Chat Users (avec `type: 'agent'`)
- [ ] Auth middleware intégré au pipeline Rocket.Chat
- [ ] `POST /api/v1/agents` → crée un vrai user Rocket.Chat avec role `agent`
- [ ] Tests d'intégration (pas juste unitaires)

#### S2.3 — Connecter Dashboard au Backend (3 SP) — Philip
- [ ] Remplacer mock data par appels API réels (`/api/v1/agents`, `/api/v1/agents/:id`)
- [ ] Afficher vrais agents dans la liste
- [ ] Page détail avec vraie activité
- [ ] Gestion erreurs (loading states, empty states, error states)

#### S2.4 — Email Send Intégré (3 SP) — Mike
- [ ] SMTP configurable via settings Rocket.Chat (pas juste env vars)
- [ ] Tester envoi réel d'email depuis un agent
- [ ] Logs d'envoi visibles dans l'API activity

#### S2.5 — Email Receive Intégré (3 SP) — Mike
- [ ] IMAP poller qui tourne dans le process Rocket.Chat
- [ ] Emails entrants visibles dans l'inbox agent
- [ ] Webhook push fonctionnel

### 🟡 P1 — Should Ship

#### S2.6 — Agent Templates MVP (5 SP) — Mike + Luna
**Track "Build" — Story 13 du PRD**
- [ ] Modèle `agent_templates` en DB
- [ ] 2 templates seed : "Customer Support" + "Content Writer"
- [ ] `POST /api/v1/agents/from-template` → crée un agent pré-configuré
- [ ] Template = config OpenClaw (system prompt, tools, triggers)
- [ ] Intégration OpenClaw fork pour lancer l'agent

#### S2.7 — Template Deploy UI (3 SP) — Philip
- [ ] Page "Agent Templates" avec les 2 templates
- [ ] Click → formulaire : nom, email, personnalisation basique
- [ ] Deploy → agent créé + confirmation
- [ ] Réutilise Fuselage design system

---

## Total Sprint 2 : 25 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S2.1, S2.2, S2.4, S2.5, S2.6 | 19 SP |
| **Philip** 🎨 | S2.3, S2.7 | 6 SP |
| **Luna** 🧪 | Template specs pour S2.6, acceptance testing | — |
| **Jarvis** ⚡ | Coordination, code review, Docker validation | — |

---

## Critères de succès Sprint 2

✅ `docker compose up` → Vutler tourne, UI accessible
✅ Créer un agent via API → visible dans le dashboard
✅ Agent envoie un email réel via SMTP
✅ Agent reçoit un email via IMAP
✅ Déployer un agent depuis un template "Customer Support"
✅ Tout connecté end-to-end (pas de mock data)

---

## Stack d'exécution (même que Sprint 1)

| Outil | Usage |
|-------|-------|
| **Claude Sonnet** | Mike + Philip coding |
| **MiniMax M2.5** | Backup si tokens Claude épuisés (via RLM-Runtime) |
| **Snipara CONTEXT** | Query docs Rocket.Chat + architecture sans tout charger |
| **Docker** | Dev + tests end-to-end |

---

## Risques Sprint 2

| Risque | Mitigation |
|--------|-----------|
| Intégration Meteor complexe | Option B : monter Express comme middleware, pas réécrire en Meteor |
| OpenClaw integration pour templates | Commencer simple : template = JSON config, pas besoin de full runtime Sprint 2 |
| SMTP/IMAP en Docker | Utiliser Mailhog (dev) ou SMTP externe (Infomaniak) |
