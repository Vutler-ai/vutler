# Vutler Bug Fixing Sprint — 1er Mars 2026

## Statut Global
- **Bugs identifiés** : 22
- **Fixés** : 1 ✅
- **En cours** : 1 🔄
- **Restants** : 20

---

## 🔴 Critiques (P0 - Bloquants)

### ✅ DONE
1. **Sprites 404** → `agent-customer_support_agent.png` 
   - Fix : Mike (Kimi K2.5), déployé, testé OK

### 🔄 EN COURS
2. **Chat API 500/404** → `GET /api/v1/chat/channels`, `POST /api/v1/chat/channels`, `POST /api/v1/chat/channels/direct`
   - Assigné : Mike (Kimi K2.5), session active

### ⏳ À FAIRE
3. **Marketplace install 500** → `POST /api/v1/marketplace/templates/1/install`
   - Erreur 500, pas de détails
   
4. **Agents deploy 404** → `POST /api/v1/agents/deploy`
   - Route manquante

5. **Agents executions 500** → `GET /api/v1/agents/{id}/executions`
   - Erreur backend

6. **Integrations connect 404** → `GET /api/v1/integrations/undefined/connect`
   - Route + bug `undefined` dans l'URL

---

## 🟠 Moyens (P1 - Fonctionnalités cassées)

7. **Notifications** — Non câblées
8. **Agents manage button** — Ne fait rien
9. **Email** — Aucun email (suspect)
10. **Drive** — Plus de fichiers ni folders
11. **Nexus registration** — N'existe pas
12. **Nexus token generation** — Ne fonctionne pas
13. **Usage** — Pas câblé, no data
14. **Audit logs** — Pas câblé
15. **Templates** — Rien n'est câblé

---

## 🟡 Mineurs (P2 - À tester)

16. **Tasks** — Vérifier auto-update par agents
17. **Deployments** — À vérifier
18. **Clients** — "Unknown" affiché
19. **Sandbox** — À tester
20. **Automations** — Tester création
21. **LLM settings** — 404 sur CSS/JS (turbopack, etc.)

---

## ⚫ Hors Scope

22. **Pixel office** — Mettre de côté (pas prioritaire)

---

## Plan d'Exécution

### Phase 1 : Critiques (Mike + 1 agent)
- Mike : Chat API ✅
- **Nouveau** : Marketplace install + Agents deploy + Executions (spawner un 2e agent ?)

### Phase 2 : Moyens (parallèle, 2-3 agents)
- Backend : Notifications, Email, Drive, Usage, Audit logs
- Frontend : Agents manage, Nexus UI

### Phase 3 : Mineurs (test + fix rapide)
- QA systématique de chaque page

---

## Attribution Proposée

| Bug | Agent | Modèle | Priorité |
|-----|-------|--------|----------|
| Sprites 404 | Mike | Kimi K2.5 | ✅ DONE |
| Chat API | Mike | Kimi K2.5 | 🔄 EN COURS |
| Marketplace + Deploy + Executions | ? | Kimi K2.5 | P0 |
| Backend (Notif/Email/Drive/Usage) | ? | ? | P1 |
| Frontend (Nexus/Agents) | ? | ? | P1 |
| QA (Tasks/Deploy/Clients/Sandbox) | ? | ? | P2 |

---

**Prochaine étape** : Attendre Mike sur Chat, puis spawner 2-3 agents en parallèle sur les critiques restants.
