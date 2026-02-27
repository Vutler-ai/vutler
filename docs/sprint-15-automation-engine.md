# 🧪 Sprint 15 — Automation Engine

> **Product Manager :** Luna · **Date :** 2026-02-27
> **Vutler** — plateforme d'agents IA autonomes · vutler.ai

---

## 1. Sprint Overview

| Champ | Valeur |
|-------|--------|
| **Objectif** | Permettre aux utilisateurs de créer, configurer et exécuter des workflows d'automatisation visuels (style n8n) reliant les agents IA entre eux et à des triggers externes (webhook, cron, événement agent). |
| **Durée estimée** | 2 semaines (10 jours ouvrés) |
| **Story Points totaux** | **55 SP** |
| **Prérequis** | Sprint 14 (Agent Runtime Engine) déployé ✅ |

### North Star

> *"Un utilisateur peut créer une automation en 2 minutes : choisir un trigger, enchaîner des actions d'agents, et la laisser tourner — sans écrire une ligne de code."*

---

## 2. Epics & User Stories

### Epic 1 — Automation CRUD & Core Engine (21 SP)

#### US-1.1 · Créer une automation rule (5 SP)
**Description :** En tant qu'utilisateur, je peux créer une règle d'automatisation avec un nom, une description, un trigger et une séquence d'actions.

**Acceptance Criteria :**
- [ ] Formulaire de création avec champs : name, description, trigger_type, trigger_config (JSON), actions (JSON array), enabled (toggle)
- [ ] Sauvegarde dans `automation_rules` via `POST /api/automations`
- [ ] Validation : au moins 1 trigger + 1 action
- [ ] Confirmation visuelle après création
- [ ] Les 3 agents existants (code_bot, sales_pro, polyglot) sont sélectionnables comme actions

#### US-1.2 · Lister & gérer les automations (3 SP)
**Description :** En tant qu'utilisateur, je peux voir toutes mes automations, les activer/désactiver, les modifier et les supprimer.

**Acceptance Criteria :**
- [ ] Page `/automations` listant toutes les rules avec statut (active/inactive), dernier run, nombre d'exécutions
- [ ] Toggle on/off inline (PATCH `/api/automations/:id`)
- [ ] Actions : edit, duplicate, delete
- [ ] Filtres par statut et recherche par nom
- [ ] Données réelles depuis `automation_rules` — ZERO mock

#### US-1.3 · Éditer une automation existante (3 SP)
**Description :** En tant qu'utilisateur, je peux modifier le trigger, les actions et la config d'une automation existante.

**Acceptance Criteria :**
- [ ] Page `/automations/:id/edit` pré-remplie
- [ ] Mise à jour via `PUT /api/automations/:id`
- [ ] Historique de modification (champ `updated_at`)
- [ ] Impossible d'éditer une automation en cours d'exécution (état `running`)

#### US-1.4 · Moteur d'exécution des automations (8 SP)
**Description :** Le backend exécute les automations déclenchées : évalue le trigger, exécute les actions séquentiellement via les agents, et logge chaque étape.

**Acceptance Criteria :**
- [ ] Service `AutomationExecutor` qui consomme les triggers et exécute les actions
- [ ] Chaque action = appel agent via API interne (`/api/agents/:id/execute`) ou Claude Code SDK CLI
- [ ] Log de chaque étape dans `automation_action_logs` (status, input, output, duration_ms, error)
- [ ] Log global du run dans `automation_logs` (rule_id, started_at, completed_at, status, trigger_data)
- [ ] Gestion des erreurs : retry configurable (1-3), puis marquage `failed`
- [ ] Timeout par action (défaut 60s, configurable)

#### US-1.5 · Exécution manuelle (test run) (2 SP)
**Description :** En tant qu'utilisateur, je peux lancer manuellement une automation pour la tester.

**Acceptance Criteria :**
- [ ] Bouton "Run now" sur la page de détail
- [ ] `POST /api/automations/:id/run` avec payload de test optionnel
- [ ] Résultat affiché en temps réel (polling ou SSE)
- [ ] Le run est loggé dans `automation_logs` avec `trigger_type = manual`

---

### Epic 2 — Triggers (13 SP)

#### US-2.1 · Trigger Webhook (5 SP)
**Description :** En tant qu'utilisateur, je peux déclencher une automation via un webhook HTTP entrant.

**Acceptance Criteria :**
- [ ] Endpoint généré automatiquement : `POST /api/webhooks/:webhook_id`
- [ ] Le `webhook_id` est unique par rule, stocké dans `automation_triggers`
- [ ] Le body du webhook est passé comme input à la première action
- [ ] Sécurité : validation par secret token (header `X-Webhook-Secret`)
- [ ] URL copiable depuis l'UI

#### US-2.2 · Trigger Cron / Planifié (5 SP)
**Description :** En tant qu'utilisateur, je peux planifier une automation sur un schedule cron.

**Acceptance Criteria :**
- [ ] Sélecteur visuel de fréquence : toutes les X minutes, horaire, quotidien, hebdo, cron expression custom
- [ ] Scheduler backend (node-cron ou bull) qui évalue les triggers actifs
- [ ] Stockage du cron pattern dans `automation_triggers.config`
- [ ] Affichage du prochain run prévu dans l'UI
- [ ] Les schedules survivent au redémarrage du serveur (chargés depuis DB au boot)

#### US-2.3 · Trigger Événement Agent (3 SP)
**Description :** En tant qu'utilisateur, je peux déclencher une automation quand un agent termine une tâche ou reçoit un message spécifique.

**Acceptance Criteria :**
- [ ] Types d'événements : `agent.task.completed`, `agent.message.received`, `agent.error`
- [ ] Filtre optionnel sur l'agent source et le contenu (regex ou keyword)
- [ ] Enregistrement dans `automation_triggers` avec `type = agent_event`
- [ ] Le runtime agent (Sprint 14) émet les événements vers le moteur d'automation

---

### Epic 3 — Actions & Chaînage (8 SP)

#### US-3.1 · Action "Appeler un Agent" (5 SP)
**Description :** En tant qu'utilisateur, je peux ajouter une action qui envoie un prompt à un agent et récupère sa réponse.

**Acceptance Criteria :**
- [ ] Sélection de l'agent parmi les agents configurés (code_bot, sales_pro, polyglot)
- [ ] Champ prompt avec support des variables de contexte (`{{trigger.data}}`, `{{previous.output}}`)
- [ ] Exécution via l'API agent runtime ou Claude Code SDK (`claude -p "prompt"`)
- [ ] La sortie de l'agent est disponible pour l'action suivante dans le pipeline
- [ ] Timeout configurable par action

#### US-3.2 · Action "Webhook sortant" (3 SP)
**Description :** En tant qu'utilisateur, je peux ajouter une action qui fait un appel HTTP vers une URL externe.

**Acceptance Criteria :**
- [ ] Config : method (GET/POST/PUT), URL, headers, body template
- [ ] Support des variables de contexte dans URL, headers et body
- [ ] Log de la réponse (status code, body tronqué) dans `automation_action_logs`
- [ ] Timeout 30s par défaut

---

### Epic 4 — Monitoring & Logs (8 SP)

#### US-4.1 · Dashboard des exécutions (5 SP)
**Description :** En tant qu'utilisateur, je peux voir l'historique de toutes les exécutions de mes automations.

**Acceptance Criteria :**
- [ ] Page `/automations/logs` avec table : automation name, trigger type, status, started_at, duration
- [ ] Filtres par automation, statut (success/failed/running), date range
- [ ] Clic sur un run → détail step-by-step depuis `automation_action_logs`
- [ ] Chaque step affiche : action type, agent utilisé, input, output (tronqué), durée, statut
- [ ] Données depuis `automation_logs` + `automation_action_logs` — ZERO mock

#### US-4.2 · Suggestions d'automations (3 SP)
**Description :** Le système suggère des automations pertinentes basées sur l'activité des agents.

**Acceptance Criteria :**
- [ ] Analyse des patterns dans `automation_action_logs` et l'historique agent
- [ ] Suggestions stockées dans `automation_suggestions` (title, description, suggested_config, score)
- [ ] Endpoint `GET /api/automations/suggestions`
- [ ] Affichage dans l'UI avec bouton "Create from suggestion"
- [ ] Au moins 3 templates de suggestions pré-configurées (ex: "Quand sales_pro reçoit un lead → code_bot génère une page")

---

### Epic 5 — UI Visuelle (5 SP)

#### US-5.1 · Éditeur visuel de workflow (5 SP)
**Description :** En tant qu'utilisateur, je peux construire mon automation visuellement avec des blocs connectés (style n8n simplifié).

**Acceptance Criteria :**
- [ ] Canvas React avec blocs draggables : Trigger (entrée) → Action(s) → Output
- [ ] Librairie : React Flow ou équivalent léger
- [ ] Chaque bloc est configurable (clic → panel latéral de config)
- [ ] Le workflow visuel est sérialisé en JSON et sauvegardé dans `automation_rules.actions`
- [ ] Rendu du workflow en lecture seule sur la page de détail
- [ ] Responsive et fonctionnel sur desktop (mobile = liste simple)

---

## 3. Architecture Technique

### 3.1 Tables existantes (réutilisées)

```
tenant_vutler.automation_rules
├── id (uuid, PK)
├── workspace_id (uuid, FK)
├── name (varchar)
├── description (text)
├── trigger_type (varchar) — webhook | cron | agent_event | manual
├── trigger_config (jsonb) — { cron: "0 9 * * *" } | { webhook_id: "..." } | { agent_id, event }
├── actions (jsonb) — [{ type: "agent", agent_id, prompt_template, timeout }, ...]
├── enabled (boolean)
├── created_at, updated_at
└── last_run_at (timestamp)

tenant_vutler.automation_triggers
├── id (uuid, PK)
├── rule_id (uuid, FK → automation_rules)
├── type (varchar)
├── config (jsonb)
├── webhook_id (varchar, unique, nullable)
├── webhook_secret (varchar, nullable)
└── created_at

tenant_vutler.automation_logs
├── id (uuid, PK)
├── rule_id (uuid, FK)
├── trigger_type (varchar)
├── trigger_data (jsonb)
├── status (varchar) — running | success | failed
├── started_at, completed_at
└── error (text, nullable)

tenant_vutler.automation_action_logs
├── id (uuid, PK)
├── log_id (uuid, FK → automation_logs)
├── action_index (int)
├── action_type (varchar)
├── agent_id (varchar, nullable)
├── input (jsonb)
├── output (jsonb)
├── status (varchar)
├── duration_ms (int)
├── error (text, nullable)
└── created_at

tenant_vutler.automation_suggestions
├── id (uuid, PK)
├── workspace_id (uuid)
├── title (varchar)
├── description (text)
├── suggested_config (jsonb) — { trigger: {...}, actions: [...] }
├── score (float)
├── dismissed (boolean, default false)
└── created_at
```

### 3.2 Colonnes à ajouter (migrations)

```sql
-- Si manquantes, ajouter :
ALTER TABLE tenant_vutler.automation_rules ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMP;
ALTER TABLE tenant_vutler.automation_triggers ADD COLUMN IF NOT EXISTS webhook_id VARCHAR(64) UNIQUE;
ALTER TABLE tenant_vutler.automation_triggers ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(128);
ALTER TABLE tenant_vutler.automation_action_logs ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE tenant_vutler.automation_suggestions ADD COLUMN IF NOT EXISTS dismissed BOOLEAN DEFAULT false;
```

### 3.3 Endpoints API (Express, port 3001)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/automations` | Lister les rules (filtres: status, search) |
| `POST` | `/api/automations` | Créer une rule |
| `GET` | `/api/automations/:id` | Détail d'une rule |
| `PUT` | `/api/automations/:id` | Modifier une rule |
| `PATCH` | `/api/automations/:id` | Toggle enabled/disabled |
| `DELETE` | `/api/automations/:id` | Supprimer une rule |
| `POST` | `/api/automations/:id/run` | Exécution manuelle |
| `GET` | `/api/automations/:id/logs` | Logs d'exécution d'une rule |
| `GET` | `/api/automations/logs` | Tous les logs (filtres) |
| `GET` | `/api/automations/logs/:logId` | Détail d'un run + action_logs |
| `GET` | `/api/automations/suggestions` | Suggestions |
| `POST` | `/api/automations/suggestions/:id/dismiss` | Dismiss une suggestion |
| `POST` | `/api/automations/suggestions/:id/create` | Créer une rule depuis suggestion |
| `POST` | `/api/webhooks/:webhook_id` | Réception webhook entrant |

### 3.4 Pages Frontend (Next.js)

| Route | Composant | Description |
|-------|-----------|-------------|
| `/automations` | `AutomationList` | Liste des automations avec filtres et toggle |
| `/automations/new` | `AutomationEditor` | Création avec éditeur visuel |
| `/automations/:id` | `AutomationDetail` | Détail + workflow en lecture + bouton Run |
| `/automations/:id/edit` | `AutomationEditor` | Édition |
| `/automations/logs` | `AutomationLogs` | Dashboard des exécutions |
| `/automations/logs/:logId` | `RunDetail` | Détail step-by-step d'un run |

### 3.5 Services Backend

```
services/
├── automation-engine.js      # AutomationExecutor — exécute les pipelines
├── automation-scheduler.js   # Gère les cron triggers (node-cron)
├── automation-webhook.js     # Router webhook entrant → engine
├── automation-suggestions.js # Génère les suggestions
routes/
├── automations.js            # CRUD routes
├── webhooks.js               # Webhook receiver
```

### 3.6 Flux d'exécution

```
Trigger (webhook/cron/agent_event/manual)
  │
  ▼
AutomationExecutor.run(rule, triggerData)
  │
  ├─ 1. Créer automation_logs (status: running)
  │
  ├─ 2. Pour chaque action dans rule.actions :
  │     ├─ Résoudre les variables ({{trigger.data}}, {{previous.output}})
  │     ├─ Exécuter l'action (appel agent / webhook sortant)
  │     ├─ Logger dans automation_action_logs
  │     └─ Si erreur → retry (max 3) → sinon fail + stop pipeline
  │
  └─ 3. Mettre à jour automation_logs (status: success/failed)
       + automation_rules.last_run_at
```

---

## 4. Dépendances avec Sprint 14

| Dépendance | Description | Statut |
|------------|-------------|--------|
| **Agent Runtime API** | `POST /api/agents/:id/execute` doit être fonctionnel pour que les actions "agent" marchent | ✅ Déployé |
| **3 agents configurés** | code_bot, sales_pro, polyglot doivent être exécutables | ✅ Configurés |
| **LLM Providers** | Anthropic + OpenAI dans `workspace_llm_providers` | ✅ Configurés |
| **Claude Code SDK** | Fallback d'exécution agent via CLI (`claude -p`) | ✅ Installé sur VPS |
| **Agent Events** | Le runtime agent doit émettre des événements (`task.completed`, etc.) pour US-2.3 | ⚠️ À vérifier / ajouter |

---

## 5. Risques & Mitigations

| # | Risque | Impact | Probabilité | Mitigation |
|---|--------|--------|-------------|------------|
| R1 | Les tables automation_* ont un schéma incompatible avec les besoins | 🔴 Haut | Moyenne | Auditer les tables en jour 1, créer les migrations nécessaires |
| R2 | L'exécution agent via API est trop lente (>60s) | 🟡 Moyen | Haute | Timeout configurable + exécution async + feedback polling |
| R3 | Les cron jobs ne survivent pas au restart du serveur | 🟡 Moyen | Faible | Charger les schedules depuis DB au boot + health check |
| R4 | React Flow est trop lourd pour le frontend statique | 🟡 Moyen | Moyenne | Fallback sur éditeur formulaire (liste d'étapes) si perf < seuil |
| R5 | Les webhooks entrants exposent une surface d'attaque | 🔴 Haut | Moyenne | Secret token obligatoire + rate limiting + validation payload |
| R6 | Boucles infinies (automation A trigger automation B trigger A) | 🔴 Haut | Faible | Max depth = 3, circuit breaker, log d'alerte |

---

## 6. Definition of Done

- [ ] **Toutes les US** ont leurs acceptance criteria validés
- [ ] **CRUD complet** des automations fonctionnel (create, read, update, delete, toggle)
- [ ] **3 types de triggers** opérationnels : webhook, cron, agent_event
- [ ] **2 types d'actions** opérationnels : appel agent, webhook sortant
- [ ] **Éditeur visuel** fonctionnel avec React Flow (ou équivalent)
- [ ] **Exécution manuelle** (test run) avec feedback en temps réel
- [ ] **Dashboard des logs** avec détail step-by-step
- [ ] **Données 100% réelles** — ZERO mock data dans l'UI
- [ ] **Migrations SQL** exécutées, schéma validé
- [ ] **Tests API** pour chaque endpoint (au minimum : happy path + error cases)
- [ ] **Déployé sur le VPS** et accessible depuis le frontend
- [ ] **Documentation API** (Swagger ou markdown) à jour
- [ ] **Aucune régression** sur les fonctionnalités Sprint 14

---

*Rédigé par Luna 🧪 — Sprint planning, 27 février 2026*
