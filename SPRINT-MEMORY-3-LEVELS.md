# Sprint: Architecture Mémoire 3 Niveaux — Snipara

**Date**: 9 mars 2026  
**Décidé par**: Alex Lopez  
**Priorité**: P0 — Fondation pour tous les agents  

---

## Vision

Chaque agent déployé rend tous les agents du même type plus intelligents. **Network effect.**

---

## 3 Niveaux de Mémoire

### Niveau 1 — Mémoire Individuelle (par instance agent)

- **Scope**: Instance unique (Mike-cloud ≠ Mike-nexus-client-A ≠ Mike-local)
- **Contenu**: Contexte local, historique de tâches, préférences apprises, interactions avec le client spécifique
- **Sync**: Chaque instance a son propre namespace Snipara (`scope: agent`, `category: {agent_id}`)
- **Exemples**:
  - Mike-local apprend qu'Alex préfère les réponses en français
  - Mike-nexus-client-A apprend les conventions de code du client A

### Niveau 2 — Mémoire Partagée par Template (knowledge pool)

- **Scope**: Tous les agents du même "type" (tous les Mike = Lead Engineer)
- **Contenu**: Formations, best practices, leçons apprises, bug patterns, solutions techniques
- **Accès**: **Read-only** pour les instances, **write via validation** (pas de pollution)
- **Flow**:
  1. Mike chez client A découvre un bug pattern
  2. Il fait `rlm_remember` avec `scope: template`, `category: lead-engineer`
  3. Validation (auto ou review) avant promotion dans le pool
  4. Tous les Mike en bénéficient au prochain `rlm_recall`
- **Implémentation Snipara**: Collection partagée `template:{role}` avec write-gate

### Niveau 3 — Mémoire Globale Plateforme

- **Scope**: Tous les agents de tous les clients
- **Contenu**: Standards Starbox, processus, conventions, best practices universelles
- **Accès**: Read-only pour tous les agents
- **Exemples**:
  - Standards de code Vutler
  - Processus de déploiement
  - Templates de communication
- **Implémentation Snipara**: Shared context project-level, `scope: project`

---

## Flow Exemple: Luna sur un Nexus

```
1. Jarvis cloud → "Luna, fais le sprint planning"
2. Luna spawn sur le Nexus node (seat dynamique)
3. Elle charge:
   - Sa mémoire de type "Product Manager" (formations, frameworks, leçons de tous les Luna)
   - Le contexte workspace du client (projets, équipe, historique)
4. Elle exécute
5. Learnings pertinents → remontent dans la mémoire partagée "PM"
```

---

## Règles Clients

- **Auto-provisioning**: Création d'un workspace client → Snipara project auto-créé
- **Chaque agent client** se connecte automatiquement à son projet Snipara
- **3 niveaux actifs dès le départ**: individuel + template + global

---

## Task Sync (Snipara ↔ Task Router)

- Tâche créée dans Snipara Swarm (`rlm_task_create`) → reflétée dans Task Router Vutler
- Agent complète la tâche (`rlm_task_complete`) → statut mis à jour dans Tasks
- **Bidirectionnel**: Tâche créée dans Task Router UI → publiée dans Snipara Swarm
- **Webhook**: Snipara → Vutler API `/api/v1/task-router/sync`

---

## Chunks d'Implémentation

### Chunk 1: Snipara Memory Namespaces
- Définir les scopes: `agent:{id}`, `template:{role}`, `project`
- Configurer les collections Snipara
- API helper: `getMemoryScope(agentId, level)`

### Chunk 2: Template Knowledge Pool
- Write-gate pour promotion de mémoire instance → template
- Review/validation mechanism
- `rlm_remember` avec `scope: template` dans ChatRuntime

### Chunk 3: Auto-Provisioning Client
- Workspace creation → Snipara project creation (via Integrator API)
- Agent creation → auto-connect to Snipara project
- Bootstrap soul from template memory

### Chunk 4: Task Sync Bidirectionnel
- Webhook Snipara → Task Router (`/api/v1/task-router/sync`)
- Task Router → Snipara (`rlm_task_create` on POST /tasks)
- Status sync: `rlm_task_complete` ↔ `PUT /tasks/:id/status`

### Chunk 5: ChatRuntime v2 Integration
- `index.js` imports ChatRuntime v2 (actuellement dans `app/custom/services/chatRuntime.js`)
- Agent startup: `rlm_recall` charge soul + contexte depuis les 3 niveaux
- Agent response: `rlm_context_query` enrichit le prompt
- Post-response: `rlm_remember` sauvegarde les learnings

### Chunk 6: Swarm Coordination
- Tous les agents sur swarm `starbox-team`
- `rlm_claim`/`rlm_release` pour ressources partagées
- `rlm_broadcast` pour communication inter-agents
- `rlm_task_create` pour délégation (PAS sessions_send/DM)

---

## Avantage Compétitif

> Chaque agent déployé rend tous les agents du même type plus intelligents. 
> 1000 Mike déployés = 1000x plus de leçons apprises = un Mike exponentiellement meilleur.
> C'est le network effect appliqué aux agents AI.

---

*Persisté dans Snipara: memory_id cmmjizec200afiksz73s4063c*
