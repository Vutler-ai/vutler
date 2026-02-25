# Sprint 8 — Snipara Auto-Provisioning, Multi-Tenant & Analytics
**Dates:** 2026-05-26 → 2026-06-08 (2 semaines)
**Objectif:** Chaque workspace a son propre Snipara project, multi-tenant isolation, analytics avancés
**Capacité:** ~24 SP

---

## ⚠️ Directives Sprint 8

**ZERO MOCKUP DATA** — Données réelles uniquement.
**Multi-tenant isolation** — Les données d'un workspace ne doivent JAMAIS leak vers un autre.
**Snipara = agent brain** — Chaque agent doit pouvoir stocker/rappeler des memories via Snipara.

---

## Stories Sprint 8

### 🔴 P0 — Must Ship

#### S8.1 — Snipara Auto-Provisioning (5 SP) — Mike
- [ ] Quand un workspace est créé → auto-créer un projet Snipara via API
- [ ] Stocker project_id + API key dans PG `workspace_settings`
- [ ] Agent runtime: utilise le Snipara du workspace pour context/memory
- [ ] `POST /api/v1/agents/:id/remember` — stocker un souvenir pour un agent
- [ ] `GET /api/v1/agents/:id/recall?query=` — rappeler des souvenirs
- [ ] Dashboard: afficher le status Snipara (connected/disconnected/quota)

#### S8.2 — Multi-Tenant Data Isolation (4 SP) — Mike
- [ ] Ajouter `workspace_id` sur toutes les tables PG (migration)
- [ ] Middleware `requireWorkspace()` — extrait workspace_id du token RC
- [ ] Toutes les queries PG filtrées par workspace_id
- [ ] Row-level security policies sur PostgreSQL
- [ ] Test: workspace A ne peut pas voir les données de workspace B

#### S8.3 — Analytics Dashboard (4 SP) — Philip
- [ ] Page `/admin/analytics` — vue d'ensemble
- [ ] Graphique: coûts par jour/semaine/mois (line chart)
- [ ] Graphique: tokens par agent (stacked bar)
- [ ] Graphique: requêtes par provider (pie chart)
- [ ] Top agents par activité
- [ ] Export CSV des données d'usage

#### S8.4 — Agent Memory UI (3 SP) — Philip
- [ ] Section "Memory" dans `/admin/agents/:id`
- [ ] Liste des souvenirs de l'agent (recall)
- [ ] Bouton "Add Memory" — formulaire pour stocker un fait
- [ ] Search dans les memories
- [ ] Indicateur quota Snipara (used/max)

### 🟡 P1 — Should Ship

#### S8.5 — Webhook Integration (3 SP) — Mike
- [ ] Agents peuvent recevoir des webhooks HTTP
- [ ] `POST /api/v1/agents/:id/webhook` — endpoint par agent
- [ ] Payload forwarded au LLM avec context
- [ ] Réponse LLM renvoyée en HTTP response ou postée dans un channel
- [ ] Webhook secret pour validation

#### S8.6 — Agent Logs & Debugging (3 SP) — Philip
- [ ] Page `/admin/agents/:id/logs`
- [ ] Stream des logs de l'agent en temps réel (polling)
- [ ] Filtrable: info/warn/error
- [ ] Chaque log entry: timestamp, type, message, tokens used
- [ ] Bouton "Clear Logs"

#### S8.7 — Rate Limiting & Quotas (2 SP) — Mike
- [ ] Quota par workspace (tokens/mois, configurable)
- [ ] Quota par agent (tokens/mois, configurable)
- [ ] Alert quand 80% atteint (audit_logs entry)
- [ ] Block quand 100% (agent répond "quota exceeded")
- [ ] Admin UI: voir/configurer les quotas

---

## Total Sprint 8 : 24 SP

## Répartition

| Agent | Stories | SP |
|-------|---------|-----|
| **Mike** ⚙️ | S8.1, S8.2, S8.5, S8.7 | 14 SP |
| **Philip** 🎨 | S8.3, S8.4, S8.6 | 10 SP |

---

## Critères de succès Sprint 8

✅ Nouveau workspace → Snipara project auto-créé
✅ Agent peut remember/recall via UI et API
✅ Analytics dashboard avec vrais graphiques de coûts/tokens
✅ Multi-tenant: isolation vérifiée (workspace A ≠ workspace B)
✅ Webhook endpoint fonctionnel par agent
