# Agent Runtime v3 — Plan d'implémentation

> Vision Alex : "Les agents Vutler doivent être de vrais agents autonomes, pas des chatbots."

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Vutler Platform                 │
├─────────────────────────────────────────────────┤
│  Agent Process Manager (APM)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ Agent 1  │ │ Agent 2  │ │ Agent N  │        │
│  │ Worker   │ │ Worker   │ │ Worker   │        │
│  │          │ │          │ │          │        │
│  │ • LLM    │ │ • LLM    │ │ • LLM    │        │
│  │ • Tools  │ │ • Tools  │ │ • Tools  │        │
│  │ • Memory │ │ • Memory │ │ • Memory │        │
│  │ • Sched  │ │ • Sched  │ │ • Sched  │        │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘        │
│       │            │            │               │
│  ┌────┴────────────┴────────────┴────┐          │
│  │         Message Bus (Redis)        │          │
│  └────────────────────────────────────┘          │
│       │            │            │               │
│  ┌────┴──┐   ┌─────┴──┐  ┌────┴───┐            │
│  │ Tool  │   │ Memory │  │ Skill  │            │
│  │Registry│  │ Layer  │  │ System │            │
│  │       │   │(Snipara)│  │        │            │
│  └───────┘   └────────┘  └────────┘            │
├─────────────────────────────────────────────────┤
│  Channels: RC Chat │ Email │ API │ Webhooks     │
└─────────────────────────────────────────────────┘
```

## Composants

### 1. Agent Process Manager (APM)
**Quoi :** Un orchestrateur qui spawne un worker isolé par agent actif.
**Comment :** Node.js worker threads ou child processes. Chaque worker a son propre event loop, ses tools, sa config.
**Fichier :** `services/agent-manager.js`

```
- startAgent(agentId) → spawn worker
- stopAgent(agentId) → graceful shutdown
- restartAgent(agentId)
- getStatus() → { agentId, uptime, lastActivity, toolsLoaded }
```

### 2. Tool Registry
**Quoi :** Système de plugins. Chaque tool = un module avec interface standard.
**Interface :**
```js
module.exports = {
  name: 'email',
  description: 'Send and read emails via Resend',
  schema: { /* JSON schema for params */ },
  execute: async (params, context) => { /* ... */ }
}
```

**Tools MVP :**
| Tool | Description | Existe déjà ? |
|------|-------------|---------------|
| `email` | Envoyer/lire emails (Resend) | ✅ API existe |
| `drive` | Upload/download fichiers (VDrive) | ✅ API existe |
| `knowledge` | Chercher dans les docs (Snipara) | ✅ API existe |
| `memory` | Remember/recall (Snipara) | ✅ API existe |
| `web_search` | Recherche web | ❌ À créer (Brave/SearXNG) |
| `calendar` | Lire/créer events | ❌ À créer (Google Calendar API) |
| `webhook` | Appeler des APIs externes | ❌ À créer |

**Fichier :** `services/tool-registry.js` + `tools/*.js`

### 3. Memory Layer (renforcé)
**Quoi :** Auto-store intelligent. Pas juste recall quand demandé — l'agent stocke automatiquement les infos importantes.
**Comment :**
- Après chaque conversation, extraction auto des faits/décisions/préférences
- Classification : `fact`, `decision`, `preference`, `todo`, `learning`
- Rétention par tier (Free=7j, Starter=30j, Pro=90j, Business=∞)
- Contexte auto-injecté au début de chaque conversation

**Fichier :** `services/memory-manager.js`

### 4. Scheduler
**Quoi :** Chaque agent peut avoir des tâches planifiées.
**Exemples :**
- "Vérifie les emails entrants toutes les heures"
- "Envoie un rapport hebdomadaire le lundi à 9h"
- "Rappelle-moi de relancer le client dans 3 jours"

**Comment :** `node-cron` ou table PG `agent_schedules` + polling.
**Fichier :** `services/agent-scheduler.js`

```sql
CREATE TABLE agent_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  name TEXT,
  cron_expr TEXT,        -- '0 9 * * 1' = lundi 9h
  task_type TEXT,        -- 'system_prompt' | 'tool_call' | 'message'
  task_config JSONB,     -- { tool: 'email', params: {...} }
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. Message Bus
**Quoi :** Les agents se parlent programmatiquement (pas via RC chat).
**Comment :** Redis pub/sub. Channels par agent + broadcast.
**Use cases :**
- Agent A demande à Agent B de faire une tâche
- Coordination multi-agents sur un workflow
- Notifications système

**Fichier :** `services/message-bus.js`

### 6. Skill System
**Quoi :** Compétences packagées assignables par agent.
**Skills MVP :**
| Skill | Tools requis | Description |
|-------|-------------|-------------|
| Customer Support | email, knowledge | Répondre aux questions clients |
| Research | web_search, knowledge, memory | Recherche et synthèse |
| Writing | memory, drive | Rédaction de contenu |
| Scheduling | calendar, email, memory | Gestion d'agenda |
| Sales Assistant | email, knowledge, memory | Suivi prospects |

**Structure :**
```
skills/
├── customer-support/
│   ├── skill.json          # metadata + required tools
│   ├── system-prompt.md    # prompt spécialisé
│   └── workflows.json      # séquences d'actions
├── research/
│   └── ...
```

**Fichier :** `services/skill-manager.js`

## Sprint Plan

### Sprint 1 — Foundation (3-5 jours)
- [ ] APM : spawn/stop/restart workers
- [ ] Tool Registry : interface standard + 2 tools (email, knowledge)
- [ ] Memory Manager : auto-store post-conversation
- [ ] PG tables : `agent_schedules`, `agent_tools`, `agent_skills`
- [ ] Tests unitaires

### Sprint 2 — Autonomie (3-5 jours)
- [ ] Scheduler : cron par agent + UI config
- [ ] Tools : drive, web_search, webhook
- [ ] Message Bus : Redis pub/sub
- [ ] Skill System : 2 skills (customer support, research)
- [ ] Agent Settings page (/agents/:id/settings)

### Sprint 3 — Polish & Ship (2-3 jours)
- [ ] UX : config tools/skills dans admin
- [ ] Monitoring : dashboard agent activity
- [ ] Rate limiting per agent
- [ ] Documentation utilisateur
- [ ] Beta test avec agents internes

## Effort total estimé : 8-13 jours

## Différenciation marché
Ce qui rend Vutler unique vs Chatbase/CustomGPT/etc :
1. **Agents qui AGISSENT** (pas juste répondent) — envoient des emails, uploadent des fichiers
2. **Mémoire persistante** — l'agent se souvient de tout, cross-conversation
3. **Proactivité** — l'agent fait des choses sans qu'on lui demande
4. **Multi-agents coordonnés** — un workflow distribué entre spécialistes
5. **Self-hosted option** — données en Suisse, RGPD/LPD natif

## Risques
- **Complexité VPS** : Workers multiples = plus de RAM/CPU. Actuel : 1 vCPU, 2GB RAM → probablement insuffisant pour 10 workers.
- **Coûts LLM** : Agents proactifs = plus d'appels API. Besoin de quotas stricts par tier.
- **Sécurité** : Agents avec tools = surface d'attaque plus grande. Sandboxing requis.
- **UX** : Configurer un agent autonome est complexe. Faut des templates simples.
