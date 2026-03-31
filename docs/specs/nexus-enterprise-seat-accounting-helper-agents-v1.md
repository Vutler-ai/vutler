# Nexus Enterprise Seat Accounting + Helper Agent Registry V1

> **Status:** Draft — 2026-03-31
> **Type:** Architecture Decision Record + Technical Spec
> **Owner:** Codex
> **Scope:** Nexus Enterprise, seat accounting, helper agents, local integrations

---

## 1. Problem Statement

Le modele enterprise Nexus est vendu **par seats**.

Le repo couvre deja:
- les nodes enterprise
- le `max_seats`
- le spawn d'agents dans un pool
- l'auto-spawn local cote runtime

Mais il manque encore une definition claire sur:
- ce qui consomme un seat
- quand un seat commence a etre consomme
- comment compter un helper agent
- comment distinguer un **appel d'API locale** d'une **delegation a un helper agent**
- comment exposer cette consommation au client

Sans cette spec, on a deux risques:
- contourner le modele commercial enterprise
- construire une execution multi-agent peu lisible et peu gouvernable

---

## 2. Decision Summary

V1 impose les regles suivantes:

1. Un **agent principal actif** consomme un seat.
2. Un **helper agent actif** consomme egalement un seat.
3. Un **appel d'API locale** ne consomme pas de seat supplementaire.
4. Un **helper agent non deploye et inactif** ne consomme pas de seat tant qu'il n'est pas active.
5. Un **auto-spawn** de helper agent doit echouer ou demander approval si aucun seat n'est disponible.
6. Toute consommation de seat doit etre:
   - visible cote client
   - tracable dans l'audit
   - coherente avec les etats runtime reels

Le bon modele V1 est:

```text
Local API call = extension du seat courant
Helper agent = consommation explicite d'un seat
```

---

## 3. Goals

### In Scope

- definir le modele de consommation des seats
- definir le cycle de vie d'un helper agent
- definir le `helper agent registry`
- definir les transitions d'etat qui modifient la consommation
- definir les regles de capacity check pour spawn / auto-spawn
- definir la visibilite UI et audit
- definir les impacts sur billing et observabilite

### Out of Scope

- pricing public final
- facturation financiere fine
- marketplace complete de helper agents
- capacity planning globale inter-nodes

---

## 4. Design Principles

- Pas de seat cache.
- Pas de helper agent "gratuit".
- Pas de swarm implicite non visible.
- Le billing doit coller au runtime observable.
- Le client doit comprendre pourquoi un seat est utilise.
- Le policy engine doit pouvoir refuser une delegation si la capacite est saturee.

---

## 5. Terminology

### Seat

Unite de capacite enterprise allouee a un node ou a un client pour faire tourner un agent actif.

### Principal Agent

Agent principal assigne a un node enterprise pour coordonner les actions par defaut.

### Helper Agent

Agent auxiliaire specialise, deploye ou active pour aider sur un domaine borne:
- AV diagnostics
- reseau
- ITSM
- identity
- vendor-specific

### Local Integration

Appel borne vers une API locale ou privee du client.  
Ce n'est pas un agent autonome.

### Active Agent

Agent present dans le runtime et comptabilise dans la capacite seat du node.

### Registered Helper

Definition d'un helper agent disponible dans le catalogue d'un node, mais pas encore actif.

---

## 6. Seat Consumption Model

### 6.1 Core Rules

| Capability | Consomme un seat ? | Notes |
|-----------|---------------------|-------|
| Principal agent actif | Oui | Seat reserve sur le node |
| Helper agent actif | Oui | Meme regle qu'un agent principal |
| Helper agent seulement enregistre | Non | Catalogue uniquement |
| Appel d'API locale | Non | Execute dans le seat courant |
| Runbook local dans le runtime Nexus | Non | Execute dans le seat courant |
| Task deleguee a un helper deja actif | Non supplementaire | Seat deja consomme |
| Auto-spawn d'un helper inactif | Oui | Si spawn reussi |

### 6.2 Moment of Consumption

Un helper agent commence a consommer un seat quand:
- il est **spawned**
- ou il est **charge comme actif** dans le runtime

Il arrete de consommer un seat quand:
- il est explicitement **stopped**
- ou il est **evicted**
- ou le node redemarre sans le recharger

### 6.3 Important V1 Rule

La consommation est basee sur les **agents actifs dans le runtime**, pas simplement sur les definitions existantes en base.

---

## 7. Runtime States

### 7.1 Helper Agent Lifecycle

```text
registered
  -> queued_for_spawn
  -> active
  -> busy
  -> idle
  -> stopping
  -> stopped
```

### 7.2 Seat-Relevant States

| State | Seat consumed |
|-------|---------------|
| registered | No |
| queued_for_spawn | No |
| active | Yes |
| busy | Yes |
| idle | Yes |
| stopping | Yes |
| stopped | No |

V1 simplifie:
- `idle` et `busy` restent tous deux comptabilises
- il n'y a pas de state "warm but free"

---

## 8. Helper Agent Registry

Le `helper agent registry` sert a distinguer:
- les agents disponibles pour un node
- les agents effectivement actifs

### 8.1 Registry Responsibilities

- lister les helper agents autorises pour un node ou un client
- decrire leur domaine et leur contrat
- indiquer s'ils peuvent etre auto-spawned
- exposer leur impact seat

### 8.2 Registry Entry

```json
{
  "helper_agent_key": "network-helper",
  "agent_id": "uuid",
  "name": "Network Helper",
  "category": "network",
  "seat_mode": "consumes_seat",
  "spawn_policy": "manual_or_auto",
  "allowed_task_types": ["network_diagnostics", "connectivity_check"],
  "risk_level": "medium",
  "status": "registered"
}
```

### 8.3 Required Registry Fields

- `helper_agent_key`
- `agent_id`
- `category`
- `seat_mode`
- `allowed_task_types`
- `spawn_policy`

`seat_mode` vaut obligatoirement `consumes_seat` en V1 pour tout helper agent.

---

## 9. Local Integration Registry

Le `local integration registry` sert a definir les integrations API locales **sans seat supplementaire**.

### Registry Entry

```json
{
  "integration_key": "acme-av-api",
  "name": "Acme AV Local API",
  "base_url": "https://10.0.5.12:8443",
  "auth_mode": "bearer_token",
  "allowed_operations": [
    "get_room_diagnostics",
    "get_device_status",
    "restart_codec_soft"
  ],
  "seat_mode": "uses_current_seat"
}
```

### V1 Rule

Toute integration locale:
- est bornee par operation
- n'augmente pas `used_seats`
- s'execute dans le contexte de l'agent courant

---

## 10. Capacity Model

### 10.1 Node Capacity

Un node enterprise expose:

```json
{
  "seats": {
    "max": 5,
    "used": 2,
    "available": 3
  }
}
```

### 10.2 Used Seats

`used_seats` = nombre d'agents actifs dans le runtime pour ce node

Inclut:
- principal agents
- helper agents actifs

N'inclut pas:
- registry entries inactives
- integrations API locales
- definitions de helper non spawnées

### 10.3 Capacity Check Contract

Avant toute activation d'un helper agent:
- verifier `available > 0`
- sinon:
  - refuser
  - ou passer en `approval_required`
  - ou fallback vers ticket / notification

---

## 11. Auto-Spawn Rules

### 11.1 Allowed Auto-Spawn Conditions

Un helper agent peut etre auto-spawned uniquement si:
- le helper existe dans le registry
- `spawn_policy` l'autorise
- le policy engine autorise la delegation
- `available_seats > 0`

### 11.2 Forbidden Auto-Spawn Conditions

L'auto-spawn doit etre bloque si:
- aucun seat n'est disponible
- le helper n'est pas explicitement autorise
- la policy exige une approbation
- le helper depasserait le risque autorise

### 11.3 V1 Fallback Order

Si un helper agent ne peut pas etre active:

1. tenter une integration locale si suffisante
2. sinon creer une approval
3. sinon creer un ticket
4. sinon log + notify

---

## 12. Billing Semantics

### 12.1 What Billing Must Reflect

Le billing enterprise doit etre coherent avec:
- les seats maximum vendus
- les seats actifs observes
- la consommation reelle par helper agents

### 12.2 V1 Billing Scope

La V1 ne fait pas de facturation fine a la minute.  
Elle impose surtout:
- la coherence de la capacite
- la visibilite de la consommation
- la prevention des contournements

### 12.3 Product Rule

Le client doit pouvoir repondre a la question:

**"Quels agents utilisent mes seats en ce moment, et pourquoi ?"**

---

## 13. Audit Model

Chaque changement de consommation de seat doit etre journalise.

### Audit Events

- `seat.allocated`
- `seat.released`
- `helper.spawn_requested`
- `helper.spawn_denied_capacity`
- `helper.spawn_completed`
- `helper.stopped`
- `local_integration.called`

### Example Audit Entry

```json
{
  "event": "seat.allocated",
  "node_id": "uuid",
  "agent_id": "uuid",
  "agent_type": "helper",
  "helper_agent_key": "network-helper",
  "used_before": 2,
  "used_after": 3,
  "reason": "Delegated network diagnostics for geneva-room-12",
  "timestamp": "2026-03-31T10:14:11Z"
}
```

---

## 14. API Contract

### 14.1 Seat Status

```text
GET /api/v1/nexus/nodes/:nodeId/seats
```

Response:

```json
{
  "max": 5,
  "used": 3,
  "available": 2,
  "active_agents": [
    {
      "agent_id": "uuid",
      "name": "AV Manager",
      "role": "principal",
      "seat_consumed": true
    },
    {
      "agent_id": "uuid",
      "name": "Network Helper",
      "role": "helper",
      "helper_agent_key": "network-helper",
      "seat_consumed": true
    }
  ]
}
```

### 14.2 Helper Registry

```text
GET    /api/v1/nexus/nodes/:nodeId/helper-agents
POST   /api/v1/nexus/nodes/:nodeId/helper-agents
DELETE /api/v1/nexus/nodes/:nodeId/helper-agents/:helperAgentKey
POST   /api/v1/nexus/nodes/:nodeId/helper-agents/:helperAgentKey/spawn
POST   /api/v1/nexus/nodes/:nodeId/helper-agents/:helperAgentKey/stop
```

### 14.3 Local Integration Registry

```text
GET    /api/v1/nexus/nodes/:nodeId/local-integrations
POST   /api/v1/nexus/nodes/:nodeId/local-integrations
DELETE /api/v1/nexus/nodes/:nodeId/local-integrations/:integrationKey
POST   /api/v1/nexus/nodes/:nodeId/local-integrations/:integrationKey/test
```

---

## 15. Data Model

### 15.1 New Tables

#### `tenant_vutler.nexus_helper_agents`

- registry des helper agents autorises par node

#### `tenant_vutler.nexus_local_integrations`

- registry des integrations API locales

#### `tenant_vutler.nexus_seat_events`

- journal des allocations et releases de seats

### 15.2 Minimal `nexus_helper_agents`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | required |
| node_id | uuid | required |
| agent_id | uuid | required |
| helper_agent_key | text | unique per node |
| category | text | required |
| spawn_policy | text | manual_only / manual_or_auto |
| allowed_task_types | jsonb | required |
| created_at | timestamptz | |

### 15.3 Minimal `nexus_local_integrations`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | required |
| node_id | uuid | required |
| integration_key | text | unique per node |
| base_url | text | required |
| auth_mode | text | required |
| credentials_ref | text | vault ref |
| allowed_operations | jsonb | required |
| created_at | timestamptz | |

### 15.4 Minimal `nexus_seat_events`

| Column | Type | Notes |
|--------|------|-------|
| id | bigserial | PK |
| workspace_id | uuid | required |
| node_id | uuid | required |
| agent_id | uuid | required |
| event_type | text | allocated / released / denied |
| agent_role | text | principal / helper |
| helper_agent_key | text | nullable |
| used_before | int | |
| used_after | int | |
| reason | text | |
| payload | jsonb | |
| created_at | timestamptz | |

---

## 16. Runtime Behavior

### 16.1 Startup

Au demarrage du node:
- charger le principal agent
- charger uniquement les helper agents explicitement marques comme actifs persistants
- recalculer `used_seats`

### 16.2 Spawn Helper

Flow:

1. demander le spawn
2. verifier registry
3. verifier capacity
4. allouer le seat
5. charger l'agent
6. journaliser l'allocation

### 16.3 Stop Helper

Flow:

1. stopper l'agent
2. liberer le seat
3. journaliser la release

### 16.4 Local Integration Call

Flow:

1. verifier registry integration
2. verifier operation autorisee
3. executer l'appel
4. journaliser `local_integration.called`

`used_seats` ne change jamais dans ce flow.

---

## 17. UI Requirements

### Node Detail

Le client doit voir:
- seats max / used / available
- liste des agents actifs
- distinction principal vs helper
- raison d'activation des helper agents

### Admin View

Le client doit pouvoir:
- enregistrer des helper agents
- autoriser ou non l'auto-spawn
- enregistrer des integrations API locales
- tester les integrations

### Audit View

Le client doit pouvoir filtrer:
- allocations de seat
- refus de spawn faute de capacity
- appels d'API locale

---

## 18. Validation

- [ ] Un helper agent enregistre ne consomme pas de seat
- [ ] Un helper agent actif consomme un seat
- [ ] Un helper agent ne peut pas etre spawn si aucun seat n'est disponible
- [ ] Un appel d'API locale n'augmente pas `used_seats`
- [ ] Les allocations et releases de seat sont journalisees
- [ ] L'UI peut expliquer quels agents consomment les seats
- [ ] Le policy engine peut refuser une delegation faute de capacite
- [ ] Le modele reste coherent apres restart du node

---

## 19. Chunks of Implementation

### Chunk 1 — Seat semantics

- definir les regles seat principal/helper/integration
- documenter les transitions d'etat

### Chunk 2 — Helper registry

- table `nexus_helper_agents`
- API CRUD
- contracts de task types

### Chunk 3 — Local integration registry

- table `nexus_local_integrations`
- API CRUD
- allowlist d'operations

### Chunk 4 — Seat event journal

- table `nexus_seat_events`
- logging sur allocation / release / denial

### Chunk 5 — Runtime enforcement

- capacity check avant spawn
- stop / release seat
- recalcul au startup

### Chunk 6 — UI observability

- seat explorer
- active agents list
- helper activation reasons

---

## 20. Risks

### Product

- sous-estimer l'importance de la lisibilite billing pour le client
- vendre des helper agents sans expliquer leur impact seat

### Technical

- divergence entre l'etat DB et l'etat runtime
- release de seat oubliee apres crash
- helper agents persistants mal rehydrates

### Security

- helper agents trop generiques
- integrations locales trop ouvertes
- audit incomplet sur l'usage des seats

---

## 21. Recommended V1 Scope

Pour livrer vite et proprement:

1. seat semantics explicites
2. helper registry minimal
3. local integration registry minimal
4. seat event journal minimal
5. runtime capacity enforcement
6. UI node seat visibility

La planification fine ou billing avance peut arriver ensuite.

---

## 22. Next Step

Apres cette spec, la suite logique est:

**spec V1 du Policy Engine + AV Action Catalog**, pour brancher ces regles de capacity et de delegation sur des actions metier vraiment bornees.
