# Sprint 5 — RC Auth Unification, Vaultbrix Wiring & Snipara Auto-Provisioning
**Dates:** 2026-04-14 → 2026-04-27 (2 semaines)
**Objectif:** Unifier l'auth RC avec l'admin API, câbler le frontend aux nouveaux endpoints PG, préparer Snipara auto-provisioning
**Capacité:** ~24 SP

---

## ⚠️ Directives Sprint 5

**ZERO MOCKUP DATA** — Données réelles uniquement, empty states propres.
**RC Auth = Single Login** — L'admin API utilise les tokens RC pour l'auth. Un seul compte, un seul login.
**PostgreSQL-first** — Toutes les nouvelles features écrivent dans PG, pas MongoDB.

---

## Stories Sprint 5

### 🔴 P0 — Must Ship

#### S5.1 — RC Token Auth for Admin API (5 SP) — Mike
- [ ] Admin API valide les tokens RC (via RC API `/api/v1/me`)
- [ ] Middleware `requireAuth()` vérifie le token RC dans header `X-Auth-Token` + `X-User-Id`
- [ ] Rôle `workspace-admin` vérifié pour les endpoints admin
- [ ] Login flow: user se connecte à RC → token réutilisé pour l'admin API
- [ ] Supprimer l'ancien système d'API keys custom pour l'admin

#### S5.2 — Frontend Auth Integration (3 SP) — Philip
- [ ] Admin pages détectent si l'user est connecté à RC
- [ ] Redirect vers RC login si pas authentifié
- [ ] Token RC stocké et envoyé avec chaque requête API
- [ ] Bouton logout dans l'admin header
- [ ] Lien "Admin" ajouté dans la sidebar RC (via RC admin settings)

#### S5.3 — Workspace LLM Providers UI (4 SP) — Philip
- [ ] Page `/admin/providers` — liste des providers LLM du workspace
- [ ] Formulaire ajout provider : nom, type (api_key/oauth/session), credentials
- [ ] Support : OpenAI, Anthropic, MiniMax, Groq, Ollama, Custom
- [ ] Indicateur de statut (connecté/erreur) avec test connection
- [ ] Gestion quota mensuel par provider

#### S5.4 — Agent Model Assignment UI (3 SP) — Philip
- [ ] Dans `/admin/agents/:id` — section "Model Assignment"
- [ ] Dropdown provider (depuis workspace providers)
- [ ] Dropdown model (auto-populé selon provider)
- [ ] Task profile selector (coding/writing/analysis/chat/general)
- [ ] Recommandation automatique basée sur le rôle de l'agent

#### S5.5 — Snipara Integration Prep (3 SP) — Mike
- [ ] Service `services/snipara.js` — client Snipara avec retry + error handling
- [ ] Endpoint `POST /api/v1/workspace/snipara/provision` — crée un projet Snipara pour le workspace
- [ ] Config Snipara stockée dans PG `workspace_settings` table
- [ ] Agents peuvent query Snipara context via `/api/v1/agents/:id/context`
- [ ] Graceful degradation si Snipara indisponible

### 🟡 P1 — Should Ship

#### S5.6 — Vutler Connect — Read-Only Channels (3 SP) — Mike
- [ ] API endpoint pour créer un "partner link" entre 2 workspaces
- [ ] Channel partagé en mode read-only (un workspace publie, l'autre lit)
- [ ] Schema PG : `workspace_partners`, `shared_channels`
- [ ] Rate limiting par partner

#### S5.7 — Admin Dashboard Upgrade (3 SP) — Philip
- [ ] Dashboard affiche vrais stats depuis PG (providers, agents, usage)
- [ ] Graphiques de coûts par provider (daily/weekly/monthly)
- [ ] Alertes budget (>80% quota)
- [ ] Liste "Recent Activity" depuis `audit_logs`

---

## Total Sprint 5 : 24 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S5.1, S5.5, S5.6 | 11 SP |
| **Philip** 🎨 | S5.2, S5.3, S5.4, S5.7 | 13 SP |
| **Luna** 🧪 | Auth flow acceptance, Snipara integration review | — |
| **Jarvis** ⚡ | Coordination, deploy validation | — |

---

## Critères de succès Sprint 5

✅ Login RC → accès admin automatique (single auth)
✅ Workspace admin peut ajouter ses clés LLM → assigner modèles aux agents
✅ Snipara auto-provision endpoint fonctionnel
✅ Vutler Connect: 2 workspaces peuvent partager un channel read-only
✅ Dashboard affiche données réelles PG (0 mock data)
