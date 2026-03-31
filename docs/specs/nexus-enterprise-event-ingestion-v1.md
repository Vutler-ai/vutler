# Nexus Enterprise Event Ingestion V1

> **Status:** Draft — 2026-03-31
> **Type:** Architecture Decision Record + Technical Spec
> **Owner:** Codex
> **Scope:** Nexus Enterprise, deployable agent profiles, event-driven enterprise workflows

---

## 1. Problem Statement

Le mode enterprise de Nexus ne doit pas reposer uniquement sur:
- polling
- health checks planifies
- commandes envoyees manuellement depuis Vutler

Pour des agents comme **AV Manager**, il faut aussi pouvoir reagir en temps reel quand:
- un systeme de monitoring declenche une alerte
- un vendor AV emet un evenement de panne
- un outil ITSM cree, met a jour ou escalade un incident
- un systeme client appelle un webhook pour signaler un changement critique

Sans ingestion d'evenements:
- la remediation est plus lente
- les rapports sont incomplets
- les agents restent reactifs mais pas proactifs
- la valeur enterprise est limitee

L'objectif de cette spec est de definir une V1 de l'ingestion d'evenements enterprise pour Vutler + Nexus.

Le `AV Manager` reste le premier profil de reference, mais le modele d'ingestion doit etre reutilisable pour tout `Deployable Agent Profile` qui depend d'evenements.

---

## 2. Goals

### In Scope

- Recevoir des webhooks entrants depuis des systemes tiers ou clients
- Authentifier et valider ces evenements
- Normaliser les payloads dans un format canonique Vutler
- Associer un evenement a un workspace, un client, un site, un node, une room ou un asset
- Evaluer une policy avant toute action
- Router l'evenement vers:
  - une action Nexus
  - une approbation
  - un ticket
  - un rapport
  - une simple journalisation
- Dedoublonner et correler les alertes bruyantes
- Journaliser tout le cycle de vie

### Out of Scope

- Bi-directional sync complet avec tous les vendors
- SIEM complet
- moteur de workflow visuel no-code
- auto-learning autonome des mappings source -> asset
- event bus inter-tenant generaliste

---

## 3. Design Principles

- Default deny.
- Event-driven, mais jamais action-driven sans policy.
- Les webhooks sont des **sources de signal**, pas des ordres absolus.
- La normalisation doit etre stricte et versionnee.
- Le routage doit etre comprehensible et auditable.
- Une tempete d'evenements ne doit pas saturer le node ou le tenant.
- Les actions sensibles doivent pouvoir passer par `dry-run` ou `approval`.

---

## 4. Architecture Overview

```text
External Source
- Monitoring tool
- AV vendor
- ITSM
- Client internal system
        |
        v
Webhook Receiver
- authentication
- validation
- source lookup
        |
        v
Normalization Layer
- source payload -> canonical event
- severity mapping
- asset mapping
        |
        v
Event Pipeline
- deduplication
- debounce
- correlation
- persistence
        |
        v
Policy Engine
- allow / deny / dry-run / approval / action / ticket
        |
        +--------------------+
        |                    |
        v                    v
Action Dispatch         Ticket / Report / Audit
- Nexus node command    - Jira / ServiceNow
- Vutler task           - report generation
- agent execution       - audit log
```

---

## 5. Event Flow

### 5.1 High-Level Flow

1. Une source externe envoie un webhook vers Vutler.
2. Le receiver authentifie la requete.
3. Le payload est valide selon le schema de la source.
4. Le payload est transforme en **canonical event**.
5. L'evenement est enrichi:
   - workspace
   - client
   - site
   - node
   - room
   - asset
   - vendor
6. Le pipeline applique:
   - deduplication
   - debounce
   - correlation
   - event grouping
7. Le policy engine decide:
   - ignore
   - log only
   - create incident
   - queue action
   - call local integration
   - delegate to helper agent
   - request approval
   - open ticket
   - notify operator
8. L'action ou l'incident est journalise.
9. Les effets secondaires sont traces jusqu'au resultat final.

### 5.2 Example Flow

```text
Teams Room monitoring webhook
-> POST /api/v1/webhooks/enterprise/events/:sourceKey
-> verify source secret
-> normalize to canonical event:
   event_type = room.offline
   severity = high
   asset_ref = room:geneva:room-12
-> correlate with recent room.offline events
-> policy says:
   allow dry-run diagnostics
   if confirmed, queue restart_room_system once
   if still failing, open Jira ticket
-> Nexus command queued
-> result stored
-> incident timeline updated
```

---

## 6. Canonical Event Model

La V1 doit imposer un format canonique unique.

```json
{
  "version": "v1",
  "event_id": "evt_01J....",
  "event_type": "room.offline",
  "category": "av",
  "severity": "high",
  "status": "open",
  "occurred_at": "2026-03-31T08:13:22Z",
  "received_at": "2026-03-31T08:13:24Z",
  "workspace_id": "uuid",
  "client_id": "uuid-or-null",
  "site_id": "uuid-or-null",
  "node_id": "uuid-or-null",
  "source": {
    "provider": "teams_rooms",
    "source_key": "acme-geneva-teams",
    "event_name": "device_offline",
    "delivery_id": "vendor-delivery-id"
  },
  "asset": {
    "asset_type": "room",
    "asset_ref": "geneva-room-12",
    "vendor": "microsoft",
    "ip": "10.42.15.18",
    "room_name": "Geneva Room 12"
  },
  "signal": {
    "summary": "Teams Room offline",
    "message": "Device heartbeat missing for 10 minutes",
    "metric": "heartbeat_missing",
    "value": 600,
    "threshold": 300
  },
  "policy_context": {
    "risk_level": "medium",
    "action_mode": "dry_run"
  },
  "raw": {
    "payload": {}
  }
}
```

### Required fields

- `version`
- `event_id`
- `event_type`
- `severity`
- `occurred_at`
- `received_at`
- `workspace_id`
- `source.provider`
- `source.source_key`
- `raw.payload`

### Event types V1

- `room.offline`
- `room.degraded`
- `room.recovered`
- `device.offline`
- `device.unreachable`
- `device.recovered`
- `ticket.created`
- `ticket.updated`
- `incident.created`
- `incident.escalated`
- `monitoring.alert`
- `monitoring.recovered`

---

## 7. Source Model

Chaque source webhook doit etre enregistree et versionnee.

### Entity: `event_source`

```json
{
  "id": "uuid",
  "workspace_id": "uuid",
  "client_id": "uuid-or-null",
  "site_id": "uuid-or-null",
  "name": "Acme Geneva Teams Rooms",
  "provider": "teams_rooms",
  "source_key": "acme-geneva-teams",
  "status": "active",
  "auth_mode": "shared_secret",
  "secret_encrypted": "...",
  "allowed_ips": ["1.2.3.4/32"],
  "node_id": "uuid-or-null",
  "mapping_rules": {},
  "policy_id": "uuid-or-null",
  "created_at": "..."
}
```

### Supported auth modes V1

- `shared_secret`
- `header_secret`
- `query_secret`
- `basic_auth`
- `ip_allowlist`

### Supported providers V1

- `generic`
- `teams_rooms`
- `zoom_rooms`
- `jira`
- `servicenow`
- `monitoring_generic`

`generic` sert de point d'entree rapide pour les clients qui ont deja un systeme custom.

---

## 8. Security Requirements

### 8.1 Request Authentication

Chaque source doit definir explicitement son mode d'authentification.

Regles:
- aucune route publique non scoped pour les webhooks enterprise
- pas de fallback "open endpoint" en production
- secret compare en temps constant quand possible
- IP allowlist optionnelle au niveau proxy ou app
- taille de payload limitee
- rate limiting par source

### 8.2 Replay Protection

Quand la source fournit un `delivery_id`, un `event_id` ou un timestamp:
- stocker la cle d'idempotence
- rejeter ou ignorer les duplicats trop proches

### 8.3 Payload Safety

- parser JSON uniquement
- schema validation stricte par provider
- truncation ou rejet des payloads trop gros
- ne jamais executer directement un champ du payload comme commande

### 8.4 Multi-Tenant Safety

Le mapping `source_key -> workspace_id` doit etre la source d'autorite.  
Le tenant ne doit jamais etre derive du contenu libre du payload.

---

## 9. Normalization Layer

### 9.1 Purpose

Transformer un payload vendor ou client en canonical event.

### 9.2 Interface

```javascript
normalizeEvent({
  provider,
  sourceConfig,
  headers,
  query,
  body,
  receivedAt
}) => canonicalEvent
```

### 9.3 Adapter Responsibilities

- mapper le nom d'evenement source
- mapper la severite
- extraire un identifiant de delivery
- extraire ou reconstruire l'asset_ref
- produire un resume humain lisible
- conserver le payload brut

### 9.4 Example Mapping

```text
provider: teams_rooms
source event: "device_offline"
-> canonical event_type: room.offline
-> severity: high
-> asset.asset_ref: site + room identifier
```

---

## 10. Asset Resolution

La V1 doit resoudre un evenement vers un asset connu quand c'est possible.

### Resolution order

1. mapping explicite dans `event_source.mapping_rules`
2. match sur `asset_ref` source
3. match sur IP
4. match sur hostname
5. match sur vendor device id
6. sinon: evenement non lie a un asset, mais journalise

### Expected outcome

```json
{
  "asset_id": "uuid-or-null",
  "asset_ref": "geneva-room-12",
  "node_id": "uuid-or-null",
  "site_id": "uuid-or-null",
  "confidence": 0.95
}
```

Si la confiance est trop basse:
- pas d'auto-remediation
- log only ou approval only

---

## 11. Deduplication and Correlation

### 11.1 Deduplication

Objectif: eviter les tempetes d'evenements et les actions dupliquees.

Fingerprint V1:

```text
workspace_id
+ source.provider
+ source.source_key
+ event_type
+ asset.asset_ref
+ signal.metric
+ normalized severity
```

### 11.2 Debounce Window

Valeurs par defaut:
- critical: 30s
- high: 60s
- medium: 5 min
- low: 15 min

### 11.3 Correlation

Exemples:
- `room.offline` suivi de `device.unreachable` sur le meme asset
- `monitoring.alert` puis `ticket.created`
- `room.offline` puis `room.recovered`

La V1 doit pouvoir relier ces evenements dans une meme timeline d'incident.

---

## 12. Policy Engine Contract

La policy s'applique **apres normalisation** et **avant action**.

### Input

- canonical event
- source config
- asset resolution
- node capabilities
- client policy

### Output

```json
{
  "decision": "ignore | log_only | dry_run | approval_required | auto_action | create_ticket",
  "action_key": "restart_room_system",
  "ticket_mode": "create",
  "notify": true,
  "reason": "High severity event on managed room, auto-remediation allowed once",
  "constraints": {
    "max_attempts": 1,
    "cooldown_seconds": 1800
  }
}
```

### V1 Policy Dimensions

- by provider
- by event_type
- by severity
- by site
- by asset type
- by asset_ref
- by business hours / maintenance window

---

## 13. Dispatch Model

### 13.1 Dispatch Targets

- **Nexus command** sur un node
- **Vutler task** assignee a un agent
- **Local integration call** vers un systeme local autorise
- **Helper agent task** vers un agent auxiliaire local
- **Approval request**
- **Ticket creation**
- **Notification only**

### 13.2 Auto-Remediation Constraints

En V1:
- une seule remediation automatique par fenetre de cooldown
- jamais de shell brut
- uniquement des actions du catalogue
- fallback ticket si echec

### 13.2.b Seat Accounting Rules

Le modele enterprise etant facture par seats, le dispatch doit respecter ces regles:

- `local_integration`:
  - ne consomme pas de seat supplementaire
  - execute par l'agent deja actif ou par le runtime Nexus

- `helper_agent`:
  - consomme un seat si le helper agent doit etre deploye ou active
  - doit verifier la capacite disponible avant dispatch
  - doit echouer proprement ou passer en approval si aucun seat n'est disponible

- `dispatch_action` vers un agent deja deploye:
  - consomme le seat deja alloue a cet agent

Contraintes V1:
- pas de helper agent "hors compteur"
- pas d'auto-spawn si `available_seats = 0`
- toute consommation de seat doit etre tracable dans l'audit

### 13.3 Action Example

```json
{
  "command_type": "dispatch_action",
  "payload": {
    "action": "restart_room_system",
    "args": {
      "asset_ref": "geneva-room-12",
      "reason": "room.offline high severity event"
    }
  }
}
```

### 13.4 Local Integration Call Example

```json
{
  "dispatch_type": "local_integration",
  "integration_key": "acme-av-api",
  "operation": "get_room_diagnostics",
  "args": {
    "room_ref": "geneva-room-12"
  }
}
```

### 13.5 Helper Agent Delegation Example

```json
{
  "dispatch_type": "helper_agent",
  "helper_agent_key": "network-helper",
  "task_type": "network_diagnostics",
  "payload": {
    "asset_ref": "geneva-room-12",
    "reason": "AV outage requires network verification"
  }
}
```

---

## 14. Persistence Model

### 14.1 New Tables

#### `tenant_vutler.event_sources`

- source configuration
- auth mode
- mapping rules
- policy binding

#### `tenant_vutler.enterprise_events`

- canonical event store
- dedupe key
- correlation id
- status

#### `tenant_vutler.event_actions`

- policy decision
- dispatched action
- approval state
- result
- seat impact

#### `tenant_vutler.event_incidents`

- grouped incident timeline
- linked events
- linked tickets

### 14.2 Minimal enterprise_events columns

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | required |
| source_id | uuid | FK event_sources |
| event_type | text | indexed |
| severity | text | indexed |
| asset_ref | text | indexed |
| dedupe_key | text | indexed |
| correlation_id | text | nullable |
| status | text | open / correlated / ignored / resolved |
| payload | jsonb | canonical event |
| raw_payload | jsonb | original event |
| occurred_at | timestamptz | source time |
| received_at | timestamptz | server time |
| created_at | timestamptz | server time |

---

## 15. API Design

### 15.1 Inbound Webhook

```text
POST /api/v1/webhooks/enterprise/events/:sourceKey
```

Purpose:
- point d'entree unique pour les webhooks enterprise normalises par source

### 15.2 Source Management

```text
GET    /api/v1/event-sources
POST   /api/v1/event-sources
PUT    /api/v1/event-sources/:id
DELETE /api/v1/event-sources/:id
POST   /api/v1/event-sources/:id/test
POST   /api/v1/event-sources/:id/rotate-secret
```

### 15.3 Event Explorer

```text
GET /api/v1/events
GET /api/v1/events/:id
GET /api/v1/incidents
GET /api/v1/incidents/:id
POST /api/v1/events/:id/replay
POST /api/v1/events/:id/approve
POST /api/v1/events/:id/ignore
```

---

## 16. Example Provider Adapters

### 16.1 Generic Monitoring Adapter

Expected payload:

```json
{
  "event_id": "abc-123",
  "event_type": "device.offline",
  "severity": "high",
  "occurred_at": "2026-03-31T08:10:00Z",
  "asset_ref": "geneva-room-12",
  "summary": "Display controller offline",
  "message": "No heartbeat in 5 minutes"
}
```

### 16.2 Jira Adapter

Use case:
- quand un ticket est cree ou mis a jour, enrichir la timeline d'incident
- pas d'auto-remediation shell depuis Jira

Existing baseline:
- `POST /api/v1/webhooks/jira`
- persistance dans `workspace_integration_logs`

V1 evolution:
- Jira passe par la couche de normalisation enterprise pour les tenants qui activent le mode enterprise event ingestion

### 16.3 Teams Rooms Adapter

Use case:
- signaler `room.offline`
- signaler `room.degraded`
- signaler `room.recovered`

---

## 17. Observability

### Metrics

- webhook requests per source
- auth failures per source
- normalization failures
- deduplicated events
- correlated incidents
- policy decisions by type
- auto-actions succeeded / failed
- approval requests created
- ticket creations

### Logs

Chaque evenement doit produire:
- reception
- auth result
- normalization result
- dedupe result
- policy result
- dispatch result

### Alerts

- repeated auth failures on a source
- normalization error spike
- event storm on a tenant
- repeated failed auto-remediation on same asset

---

## 18. UI Requirements

### Client Admin

- enregistrer une source webhook
- choisir auth mode
- generer/rotater le secret
- definir mapping rules
- choisir policy
- tester un payload

### Operations View

- timeline des evenements
- filtre par site, source, asset, severity
- incidents corrEles
- actions declenchees
- tickets lies

### Approval View

- evenements en attente d'approbation
- contexte de policy
- bouton approve / deny / escalate

---

## 19. Chunks of Implementation

### Chunk 1 — Data model

- ajouter `event_sources`
- ajouter `enterprise_events`
- ajouter `event_actions`
- ajouter `event_incidents`

### Chunk 2 — Generic enterprise webhook receiver

- `POST /api/v1/webhooks/enterprise/events/:sourceKey`
- auth
- validation
- rate limiting

### Chunk 3 — Canonical event normalization

- interface adapter
- provider `generic`
- provider `jira`
- provider `monitoring_generic`

### Chunk 4 — Dedupe + correlation

- fingerprint builder
- debounce windows
- incident grouping

### Chunk 5 — Policy engine integration

- decision contract
- `ignore | log_only | dry_run | approval_required | auto_action | create_ticket`
- include seat impact in decision context

### Chunk 6 — Nexus dispatch integration

- queue action commands
- create Vutler tasks
- create incident-linked tickets
- add local integration dispatch path
- add helper agent dispatch path
- enforce seat availability on helper agent dispatch

### Chunk 7 — UI admin + event explorer

- source management
- event explorer
- incident timeline

---

## 20. Validation

- [ ] Une source webhook peut etre enregistree par workspace
- [ ] Un webhook authentifie est accepte
- [ ] Un webhook non authentifie est rejete
- [ ] Le payload est normalise vers le canonical event model
- [ ] Les duplicats proches sont dedoublonnes
- [ ] Les evenements lies sont correles dans une meme timeline
- [ ] Une policy peut produire `auto_action`
- [ ] Une action Nexus peut etre declenchee depuis un evenement
- [ ] Un helper agent ne peut pas etre active sans seat disponible
- [ ] Un appel d'API locale n'augmente pas la consommation de seats
- [ ] Un ticket peut etre cree depuis un evenement
- [ ] L'ensemble du flux est auditable

---

## 21. Risks

### Product

- vouloir supporter trop de sources des la V1
- ne pas definir assez tot le canonical event model
- rendre la facturation par seats incoherente avec la realite runtime

### Technical

- mappings asset trop fragiles
- event storms non controles
- correlation trop naive
- helper agent dispatch sans veritable controle de capacite

### Security

- sources mal authentifiees
- replay attacks
- escalation d'evenements cross-tenant

---

## 22. Recommended V1 Scope

Pour livrer vite et proprement:

1. `generic` webhook source
2. `jira` adapter
3. `monitoring_generic` adapter
4. canonical event model
5. dedupe simple
6. incident grouping minimal
7. policy decision contract
8. dispatch Nexus vers catalogue d'actions borne
9. local integration dispatch minimal
10. helper agent delegation minimale
11. seat accounting minimal pour helper agents

Le support natif `teams_rooms` et `zoom_rooms` peut arriver juste apres, en profitant de la meme couche.

---

## 23. Next Step

Apres cette spec, la priorite technique logique est:

**spec V1 du Policy Engine et du AV Action Catalog**, car l'ingestion d'evenements ne vaut que si la reponse a ces evenements est strictement encadree.
