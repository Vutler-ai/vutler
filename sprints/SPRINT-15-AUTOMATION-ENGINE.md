# Sprint 15 — Automation Engine (n8n-style)

**Version:** 1.0  
**Date:** 2026-02-27  
**Owner:** Luna 🧪 (Product Manager)  
**Sprint Goal:** Permettre aux agents de créer et exécuter des automations sans intervention humaine

---

## 🎯 Vision

Les agents Vutler doivent pouvoir automatiser leurs tâches récurrentes via un système de workflows visuels. Inspiré de n8n, Zapier, Make.com — mais conçu pour les agents AI, pas les humains.

**Différence clé:** Les humains cliquent pour créer des workflows. Les agents les *génèrent* via prompts et les exécutent via l'Automation Engine.

---

## 📊 User Stories

### US-15.1 : Création de Workflow par un Agent (Agent-Generated Automation)
**En tant qu'** agent Vutler,  
**Je veux** créer un workflow d'automation via une simple description textuelle,  
**Pour** automatiser mes tâches récurrentes sans intervention humaine.

**Exemple:**
> Agent: "Chaque fois qu'un email arrive avec le mot 'urgent' dans le sujet, créer une tâche dans Notion et m'envoyer une notification Slack."

**Acceptance Criteria:**
- [ ] API `POST /api/v1/automations/create` accepte une description textuelle
- [ ] Le système parse la description et identifie : trigger, conditions, actions
- [ ] LLM génère un workflow JSON avec nodes/edges (format n8n-compatible)
- [ ] Le workflow est sauvegardé dans `automation_rules` (table Vaultbrix existante)
- [ ] L'agent reçoit un `automation_id` et peut le gérer (pause/resume/delete)
- [ ] Logs de création stockés dans `automation_logs` (nouvelle table)

**Estimation:** **13 story points**  
**Priorité:** P0 (Must-Have)  
**Tech Stack:** TypeScript, PostgreSQL (Vaultbrix), Snipara MCP (rlm_orchestrate)

---

### US-15.2 : Triggers (Webhook, Schedule, Event)
**En tant qu'** agent Vutler,  
**Je veux** définir des triggers variés (webhook externe, schedule CRON, event interne),  
**Pour** déclencher mes automations dans différents contextes.

**Acceptance Criteria:**
- [ ] **Webhook Trigger:** Endpoint unique par automation (`/webhooks/{automation_id}`)
- [ ] **Schedule Trigger:** Syntaxe CRON (ex: `0 9 * * 1` = tous les lundis 9h)
- [ ] **Event Trigger:** Écoute d'events Redis (ex: `agents:email:received`, `agents:task:created`)
- [ ] Chaque trigger peut avoir des conditions (ex: webhook doit contenir `{"severity": "high"}`)
- [ ] Triggers enregistrés dans `automation_triggers` (nouvelle table)
- [ ] Background worker (`automation-runner`) poll les schedules et écoute Redis events
- [ ] Logs de déclenchement dans `automation_logs` avec timestamp, trigger_type, payload

**Estimation:** **8 story points**  
**Priorité:** P0 (Must-Have)  

---

### US-15.3 : Actions (Email, Task Creation, API Calls, Agent Messaging)
**En tant qu'** agent Vutler,  
**Je veux** exécuter des actions variées dans mes workflows,  
**Pour** interagir avec des systèmes externes et d'autres agents.

**Actions supportées (MVP):**
1. **Send Email** — Via SMTP ou Vutler Mail API
2. **Create Task** — Notion, Trello, Linear (via API keys)
3. **HTTP Request** — POST/GET vers une API externe (avec auth)
4. **Send Message to Agent** — Via AgentBus (Redis pub/sub)
5. **Store in Memory** — Snipara `rlm_remember` (pour learnings)
6. **Conditional Branching** — Si/Alors/Sinon logic

**Acceptance Criteria:**
- [ ] Chaque action = module pluggable (pattern Strategy)
- [ ] Actions configurables via JSON (ex: `{"type": "email", "to": "user@example.com", "subject": "..."}`)
- [ ] Gestion des secrets (API keys) via `agent_secrets` (nouvelle table, encrypted)
- [ ] Retry logic : 3 tentatives avec exponential backoff
- [ ] Timeout par action : 30s max
- [ ] Logs d'exécution dans `automation_action_logs` (status, duration, error)

**Estimation:** **13 story points**  
**Priorité:** P0 (Must-Have)  

---

### US-15.4 : Visual Workflow Builder (UI pour Debugging)
**En tant qu'** utilisateur Vutler,  
**Je veux** visualiser les workflows créés par mes agents,  
**Pour** comprendre ce qu'ils automatisent et débugger en cas d'erreur.

**Note:** Les agents *créent* les workflows via prompts. L'UI est pour *visualisation* et *debugging* uniquement (pas d'édition drag-and-drop MVP).

**Acceptance Criteria:**
- [ ] Page `/automations` liste tous les workflows d'un agent
- [ ] Click sur un workflow → vue graphique (nodes + edges) via React Flow
- [ ] Affiche : trigger node, action nodes, branches conditionnelles
- [ ] Indicateurs de santé : ✅ last run success, ❌ last run failed, 🕒 scheduled next run
- [ ] Logs d'exécution affichés en sidebar (dernières 50 runs)
- [ ] Boutons : Pause, Resume, Delete, View JSON

**Estimation:** **8 story points**  
**Priorité:** P1 (Should-Have)  
**Tech Stack:** React, React Flow, Fuselage Design System

---

### US-15.5 : Execution Engine (Background Worker)
**En tant que** système Vutler,  
**Je veux** exécuter les automations de manière fiable en background,  
**Pour** garantir que les workflows tournent même quand les agents sont inactifs.

**Acceptance Criteria:**
- [ ] Service Node.js `automation-runner` (worker séparé)
- [ ] Poll `automation_triggers` toutes les 10s pour les schedules dus
- [ ] Subscribe aux Redis channels pour les event triggers
- [ ] Webhook endpoint `/webhooks/:automation_id` (Express)
- [ ] Pour chaque trigger déclenché :
  - [ ] Load le workflow JSON depuis `automation_rules`
  - [ ] Exécute les actions séquentiellement (ou en parallèle si spécifié)
  - [ ] Gère les erreurs et retry logic
  - [ ] Log dans `automation_logs` (start, end, status, duration)
- [ ] Health check : `/health` retourne status + nb d'automations actives
- [ ] Déployé en Docker container (restart policy: always)

**Estimation:** **13 story points**  
**Priorité:** P0 (Must-Have)  

---

### US-15.6 : Agent Auto-Suggest Automations
**En tant qu'** agent Vutler,  
**Je veux** recevoir des suggestions d'automations basées sur mes tâches répétitives,  
**Pour** optimiser mon workflow sans effort cognitif.

**Exemple:**
> Agent détecte qu'il répond aux mêmes questions FAQ par email 10x/jour.  
> → Suggestion : "Créer une automation pour auto-répondre aux questions FAQ."

**Acceptance Criteria:**
- [ ] Agent analyse ses logs d'activité via Snipara (`rlm_context_query`)
- [ ] Détecte les patterns répétitifs (ex: même action >5x/jour)
- [ ] Génère une suggestion d'automation (texte + workflow JSON pré-rempli)
- [ ] Stocke dans `automation_suggestions` (nouvelle table)
- [ ] UI affiche les suggestions avec bouton "Create Automation"
- [ ] Click → workflow pré-rempli, agent peut ajuster et confirmer

**Estimation:** **8 story points**  
**Priorité:** P2 (Nice-to-Have)  

---

## 🗂️ Database Schema (Nouvelles Tables)

```sql
-- Automation rules (existe déjà dans tenant_vutler schema)
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    name TEXT NOT NULL,
    description TEXT,
    workflow_json JSONB NOT NULL, -- n8n-compatible format
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Triggers
CREATE TABLE automation_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('webhook', 'schedule', 'event')),
    config JSONB NOT NULL, -- {"cron": "0 9 * * *"} ou {"event": "email:received"}
    webhook_url TEXT, -- Generated for webhook triggers
    is_enabled BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Execution logs
CREATE TABLE automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    trigger_id UUID REFERENCES automation_triggers(id),
    status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed', 'timeout')),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    error_message TEXT,
    payload JSONB, -- Input data qui a déclenché l'automation
    result JSONB -- Output de l'automation
);

-- Action logs (détail de chaque action dans un workflow)
CREATE TABLE automation_action_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_log_id UUID NOT NULL REFERENCES automation_logs(id) ON DELETE CASCADE,
    action_node_id TEXT NOT NULL, -- ID du node dans le workflow JSON
    action_type TEXT NOT NULL, -- 'email', 'http_request', 'task_create', etc.
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    input_data JSONB,
    output_data JSONB
);

-- Secrets (API keys, auth tokens)
CREATE TABLE agent_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    key_name TEXT NOT NULL, -- Ex: "notion_api_key", "slack_webhook_url"
    encrypted_value BYTEA NOT NULL, -- AES-256-GCM encrypted
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(agent_id, key_name)
);

-- Automation suggestions (auto-generated par agents)
CREATE TABLE automation_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    suggestion_text TEXT NOT NULL,
    workflow_json JSONB, -- Pre-filled workflow
    confidence_score FLOAT, -- 0.0-1.0, basé sur fréquence du pattern
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_automation_rules_agent ON automation_rules(agent_id);
CREATE INDEX idx_automation_rules_status ON automation_rules(status);
CREATE INDEX idx_automation_triggers_type ON automation_triggers(trigger_type);
CREATE INDEX idx_automation_logs_automation ON automation_logs(automation_id);
CREATE INDEX idx_automation_logs_status ON automation_logs(status);
CREATE INDEX idx_automation_logs_started ON automation_logs(started_at DESC);
```

---

## 🔧 API Endpoints

### Automation Management
```bash
POST   /api/v1/automations/create            # Créer un workflow (agent prompt → JSON)
GET    /api/v1/automations                   # Liste des automations d'un agent
GET    /api/v1/automations/:id               # Détail d'une automation
PUT    /api/v1/automations/:id/pause         # Pause
PUT    /api/v1/automations/:id/resume        # Resume
DELETE /api/v1/automations/:id               # Delete
GET    /api/v1/automations/:id/logs          # Logs d'exécution (derniers 100 runs)
```

### Triggers
```bash
POST   /api/v1/automations/:id/triggers      # Ajouter un trigger
DELETE /api/v1/automations/:id/triggers/:tid # Supprimer un trigger
POST   /webhooks/:automation_id              # Webhook endpoint (public)
```

### Suggestions
```bash
GET    /api/v1/automations/suggestions       # Suggestions d'automations
POST   /api/v1/automations/suggestions/:id/accept  # Accepter une suggestion
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Vutler Frontend                         │
│  React + React Flow (visual workflow viewer)                │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTP API
┌────────────────────────┴─────────────────────────────────────┐
│              Vutler Backend (Express/TypeScript)             │
│  - Automation Management API                                 │
│  - LLM workflow generation (prompt → JSON)                   │
│  - Webhook router                                            │
└────────────────────────┬─────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
┌─────────────┐  ┌──────────────┐  ┌─────────────────┐
│  Vaultbrix  │  │ Redis Pub/Sub│  │ Automation      │
│ PostgreSQL  │  │ (AgentBus)   │  │ Runner Worker   │
│             │  │              │  │ (Node.js)       │
│ automation_ │  │ - Events     │  │                 │
│ tables      │  │ - Triggers   │  │ - Poll schedules│
└─────────────┘  └──────────────┘  │ - Execute flows │
                                   │ - Retry logic   │
                                   └─────────────────┘
```

---

## ⚙️ Workflow JSON Format (n8n-compatible)

```json
{
  "id": "automation-uuid",
  "name": "Auto-respond FAQ emails",
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "triggerType": "event",
      "config": { "event": "agents:email:received" },
      "position": { "x": 100, "y": 100 }
    },
    {
      "id": "condition-1",
      "type": "condition",
      "config": {
        "field": "subject",
        "operator": "contains",
        "value": "pricing"
      },
      "position": { "x": 300, "y": 100 }
    },
    {
      "id": "action-1",
      "type": "action",
      "actionType": "email",
      "config": {
        "to": "{{ trigger.from }}",
        "subject": "Re: {{ trigger.subject }}",
        "body": "Our pricing starts at $99/mo. Details: https://vutler.team/pricing"
      },
      "position": { "x": 500, "y": 100 }
    }
  ],
  "edges": [
    { "from": "trigger-1", "to": "condition-1" },
    { "from": "condition-1", "to": "action-1", "condition": "true" }
  ]
}
```

---

## 📦 Dépendances

### Techniques
- **Vaultbrix PostgreSQL** — Tables automation_* déjà créées (migration)
- **Redis** — Pour event triggers (AgentBus)
- **Snipara MCP** — `rlm_orchestrate` pour workflows complexes
- **Node-cron** — Scheduling engine
- **Docker** — Isolation du worker automation-runner

### Business
- **Sprint 2** — Agent templates (pour pré-remplir automations)
- **Sprint 9** — AgentBus (Redis pub/sub pour event triggers)

---

## ⚠️ Risques

### R1 — Complexité des Workflows Génératifs (PROBABILITÉ: Moyenne, IMPACT: Élevé)
**Risque:** Le LLM génère des workflows invalides ou inefficaces.  
**Mitigation:**
- Validation schema stricte du JSON généré (JSON Schema)
- Tests unitaires avec 20+ exemples de prompts → workflows attendus
- Fallback : si génération échoue, proposer templates pré-définis

### R2 — Scalabilité du Runner (PROBABILITÉ: Faible, IMPACT: Élevé)
**Risque:** Le worker `automation-runner` ne scale pas avec 1000+ automations actives.  
**Mitigation:**
- Architecture horizontale : plusieurs workers (load balancing Redis)
- Queue system (BullMQ) pour distribuer les executions
- Monitoring : alertes si latency >5s ou queue size >100

### R3 — Secrets Management (PROBABILITÉ: Faible, IMPACT: Critique)
**Risque:** API keys d'agents exposées ou volées.  
**Mitigation:**
- AES-256-GCM encryption pour `agent_secrets.encrypted_value`
- Master key rotation tous les 90 jours
- Audit log : qui accède à quels secrets, quand
- Isolation : un agent ne peut pas accéder aux secrets d'un autre agent

### R4 — Infinite Loops (PROBABILITÉ: Moyenne, IMPACT: Moyen)
**Risque:** Un workflow mal configuré boucle à l'infini (ex: action A trigger event B qui re-trigger A).  
**Mitigation:**
- Max 100 exécutions/heure par automation (rate limit)
- Timeout global : 5 minutes max par workflow
- Circuit breaker : si 10 échecs consécutifs, pause auto l'automation

### R5 — UX Confusion (PROBABILITÉ: Moyenne, IMPACT: Moyen)
**Risque:** Les utilisateurs ne comprennent pas ce que leurs agents automatisent.  
**Mitigation:**
- Notifications : "Votre agent a créé une automation : [nom]"
- Daily digest : "Vos agents ont exécuté 47 automations aujourd'hui"
- UI claire avec descriptions human-readable des workflows

---

## 🎯 Definition of Done

- [ ] Agent peut créer un workflow via prompt (US-15.1)
- [ ] 3 types de triggers fonctionnels : webhook, schedule, event (US-15.2)
- [ ] 6 types d'actions fonctionnels : email, task, HTTP, agent message, memory, condition (US-15.3)
- [ ] UI visualise les workflows avec React Flow (US-15.4)
- [ ] Worker `automation-runner` exécute les workflows en background (US-15.5)
- [ ] Agent reçoit des suggestions d'automations (US-15.6)
- [ ] Tests E2E : 10 scénarios end-to-end (trigger → actions → logs)
- [ ] Documentation : README automation-engine, API reference, workflow format spec
- [ ] Monitoring : Grafana dashboard avec nb executions/heure, success rate, latency P95

---

## 📊 Total Story Points : **63 SP**

**Recommandation Luna:**  
Sprint trop gros pour 2 semaines. Découper en 2 mini-sprints :
- **Sprint 15A (35 SP)** — US-15.1, 15.2, 15.3, 15.5 (Core Engine)
- **Sprint 15B (28 SP)** — US-15.4, 15.6 + polish + tests

Ou **prioriser P0 uniquement** et déplacer US-15.6 (suggestions) au Sprint 17.

---

**Signature:** Luna 🧪  
**Next:** Sprint 16 — Marketplace d'Agents (20-30 templates)
