# Nexus Enterprise Policy Engine + AV Action Catalog V1

> **Status:** Draft — 2026-03-31
> **Type:** Architecture Decision Record + Technical Spec
> **Owner:** Codex
> **Scope:** Nexus Enterprise, deployable agent profiles, policy enforcement, action catalogs

---

## 1. Problem Statement

Les specs precedentes posent trois briques:
- l'employe virtuel enterprise
- l'ingestion d'evenements
- le seat accounting et les helper agents

Il manque maintenant la brique qui rend le systeme **gouvernable**:
- quelles actions sont autorisees
- dans quelles conditions
- avec quels parametres
- avec quel niveau de risque
- avec quel mode d'execution

Le `AV Manager` reste le premier vertical documente, mais le `Policy Engine` doit s'appliquer a tout profil deployable, avec un catalogue d'actions propre a chaque profil.

Sans un `Policy Engine` et un `Action Catalog` stricts:
- l'agent reste trop proche d'un "shell intelligent"
- les integrations AV restent ad hoc
- les approvals et restrictions sont difficiles a appliquer
- la posture enterprise reste fragile face a une DSI

---

## 2. Decision Summary

V1 impose les regles suivantes:

1. Toute action executee par Nexus doit appartenir a un **catalogue borne**.
2. Une action ne peut jamais etre construite librement depuis le prompt du LLM.
3. Chaque action doit avoir:
   - un schema d'entree
   - un schema de sortie
   - un risk level
   - un mode par defaut
   - des garde-fous
4. Le `Policy Engine` decide pour chaque demande:
   - `deny`
   - `log_only`
   - `dry_run`
   - `approval_required`
   - `allow`
5. Les actions AV sensibles ne peuvent pas passer directement en `allow` sans policy explicite.
6. Les helper agents et integrations locales passent eux aussi par le `Policy Engine`.

---

## 3. Goals

### In Scope

- definir le contrat du `Policy Engine`
- definir le `AV Action Catalog`
- definir les niveaux de risque
- definir les modes d'execution
- definir les garde-fous par action
- definir les dimensions de policy
- definir le contrat de dispatch vers Nexus
- definir les points d'audit

### Out of Scope

- workflow builder visuel
- natural language policy authoring
- policy-as-code avance
- support complet de tous les vendors AV

---

## 4. Design Principles

- Default deny.
- Le LLM choisit une action, mais n'invente pas le protocole.
- Les actions doivent etre lisibles par un humain non dev.
- Les policies doivent etre comprises par un client enterprise.
- Les actions les plus risquées doivent passer par approval ou dry-run.
- Le systeme doit preferer une reponse sure a une reponse "impressive".

---

## 5. Policy Engine Overview

```text
Request source
- chat operator
- event ingestion
- scheduled run
- helper agent request
        |
        v
Intent resolution
- target action
- args candidate
        |
        v
Policy Engine
- action lookup
- asset scope checks
- site/window checks
- risk checks
- seat checks
- mode decision
        |
        v
Decision
- deny
- log_only
- dry_run
- approval_required
- allow
        |
        v
Dispatch / Audit / Ticket / Notification
```

---

## 6. Policy Engine Contract

### 6.1 Input

```json
{
  "workspace_id": "uuid",
  "client_id": "uuid-or-null",
  "site_id": "uuid-or-null",
  "node_id": "uuid",
  "request_source": "chat | event | schedule | helper_agent",
  "requested_action": "restart_room_system",
  "args": {
    "asset_ref": "geneva-room-12"
  },
  "context": {
    "event_type": "room.offline",
    "severity": "high",
    "requester_role": "operator",
    "maintenance_window": false
  }
}
```

### 6.2 Output

```json
{
  "decision": "allow | dry_run | approval_required | log_only | deny",
  "reason": "Restart allowed on Geneva Room assets during business hours for AV incidents",
  "effective_mode": "dry_run",
  "risk_level": "high",
  "seat_impact": "none",
  "constraints": {
    "max_attempts": 1,
    "cooldown_seconds": 1800,
    "timeout_ms": 15000
  },
  "audit_tags": ["av", "restart", "room", "policy-evaluated"]
}
```

### 6.3 Decision Types

#### `deny`

Action interdite.  
Exemple:
- asset hors scope
- action non autorisee pour ce client
- helper agent non autorise

#### `log_only`

L'evenement est journalise mais aucune action n'est executee.

#### `dry_run`

Le systeme produit le plan d'action sans l'executer.

#### `approval_required`

Une demande d'approbation est creee.  
Pas d'execution immediate.

V1 ajoute trois sous-cas importants:

- **single approval**
  - approbation ponctuelle pour une execution

- **process-scoped approval**
  - approbation reusable pour un `approvalScopeKey`
  - permet d'eviter une validation client a chaque evenement identique

- **full_access bypass**
  - si l'utilisateur choisit explicitement `governanceMode = full_access`, une decision `approval_required` peut etre transformee en execution immediate
  - le bypass doit etre audite
  - `deny` n'est jamais contourne

#### `allow`

L'action peut etre executee directement dans les contraintes imposees.

---

## 7. Policy Dimensions

V1 doit supporter:

- by `agent_level`
- by `action_key`
- by `action_category`
- by `provider`
- by `request_source`
- by `site`
- by `asset_type`
- by `asset_ref`
- by `severity`
- by `business_hours`
- by `maintenance_window`
- by `requester_role`

---

## 8. Risk Levels

### 8.1 Risk Model

Chaque action du catalogue recoit un `risk_level`.

| Risk | Meaning | Typical default |
|------|---------|-----------------|
| `low` | lecture seule ou effet operationnel minime | `allow` |
| `medium` | action reversible ou scope borne | `allow` ou `dry_run` |
| `high` | impact service probable | `dry_run` ou `approval_required` |
| `critical` | impact fort / irreversible / broad blast radius | `approval_required` ou `deny` |

### 8.2 V1 Rule

Par defaut:
- `critical` ne peut jamais passer en `allow` sans policy explicite
- `high` doit preferer `dry_run` si aucune policy plus forte n'existe

### 8.3 Level-Aware Defaults

Le `Policy Engine` doit pouvoir utiliser `agent_level` comme signal de gouvernance:

- `administrative`:
  - defaults plus permissifs sur actions documentaires
  - presque aucune action locale privilegiee
- `operational`:
  - mix d'actions autorisees et bornees
  - recours frequent a `dry_run`
- `technical_privileged`:
  - defaults plus restrictifs
  - approvals plus frequentes
  - restrictions plus fortes sur blast radius et credentials

Ces defaults doivent etre alignes avec la `Agent Level Capability Matrix`, afin d'eviter que le wizard, le runtime et la policy evaluent des modeles differents.

---

## 9. AV Action Catalog

### 9.1 Why a Catalog

Le catalogue remplace:
- commandes shell libres
- requetes SNMP/Telnet/HTTP construites ad hoc
- actions inventees au runtime

### 9.2 Required Fields per Action

```json
{
  "action_key": "restart_room_system",
  "category": "remediation",
  "provider": "av_control",
  "risk_level": "high",
  "default_mode": "dry_run",
  "requires_asset": true,
  "requires_site": false,
  "seat_mode": "uses_current_seat",
  "allowed_request_sources": ["event", "chat", "schedule"],
  "input_schema": {},
  "output_schema": {},
  "guardrails": {},
  "timeouts": {},
  "side_effects": ["room_restart"],
  "audit_tags": ["av", "restart"]
}
```

### 9.3 V1 Catalog

#### Read-only / diagnostics

- `check_room_health`
- `get_room_diagnostics`
- `check_device_connectivity`
- `query_snmp_status`
- `get_display_status`
- `get_projector_status`
- `get_teams_room_status`
- `get_zoom_room_status`

#### Remediation

- `restart_room_system`
- `restart_codec_soft`
- `reboot_display`
- `switch_display_input`
- `set_room_volume`
- `wake_display`

#### Incident / reporting

- `create_av_incident`
- `open_incident_ticket`
- `append_incident_note`
- `send_daily_report`
- `send_weekly_report`

#### Delegation / extension

- `call_local_integration`
- `delegate_network_diagnostics`
- `delegate_itsm_followup`

---

## 10. Action Definitions

### 10.1 `check_room_health`

- category: `diagnostics`
- risk: `low`
- default_mode: `allow`
- seat_mode: `uses_current_seat`

Input:

```json
{
  "asset_ref": "geneva-room-12"
}
```

Output:

```json
{
  "status": "healthy | degraded | offline",
  "checks": [],
  "summary": "..."
}
```

Guardrails:
- asset required
- no side effect

### 10.2 `get_room_diagnostics`

- category: `diagnostics`
- risk: `medium`
- default_mode: `allow`
- may use local integration if configured

Guardrails:
- asset required
- timeout <= 15s
- only allowed operations from local integration registry

### 10.3 `restart_room_system`

- category: `remediation`
- risk: `high`
- default_mode: `dry_run`

Guardrails:
- asset required
- max_attempts = 1 per cooldown window
- cooldown_seconds = 1800
- blocked outside authorized windows unless override policy
- must not fan out to multiple rooms in V1

### 10.4 `reboot_display`

- category: `remediation`
- risk: `high`
- default_mode: `approval_required`

Guardrails:
- single device only
- explicit asset required
- no wildcard target

### 10.5 `open_incident_ticket`

- category: `incident`
- risk: `medium`
- default_mode: `allow`

Guardrails:
- ticket connector must be configured
- dedupe against existing open incident if possible

### 10.6 `call_local_integration`

- category: `integration`
- risk: inherited from operation
- default_mode: `allow` only if operation explicitly whitelisted
- seat_mode: `uses_current_seat`

Guardrails:
- `integration_key` required
- `operation` must exist in local integration registry
- args validated per operation
- peut etre couple a un `approvalScopeKey` de type process pour les integrations event-driven bornees

### 10.7 `delegate_network_diagnostics`

- category: `delegation`
- risk: `medium`
- default_mode: `approval_required` or `allow` depending on client policy
- seat_mode: `consumes_helper_seat_if_spawn_needed`

Guardrails:
- helper agent must be in helper registry
- seat capacity required if helper not already active
- output must be structured

---

## 11. Guardrails Model

### Common Guardrails

- `single_asset_only`
- `single_site_only`
- `max_attempts`
- `cooldown_seconds`
- `requires_approval_above_severity`
- `allowed_business_hours_only`
- `blocked_during_blackout`
- `requires_ticket_link`

### Example

```json
{
  "single_asset_only": true,
  "max_attempts": 1,
  "cooldown_seconds": 1800,
  "requires_approval_above_severity": "high"
}
```

### Governance Reuse

V1 doit permettre de revalider automatiquement un process borne sans repasser par une approbation humaine a chaque run.

Contract:

```json
{
  "approvalScopeKey": "av-interface-sync-geneva",
  "approvalScopeMode": "process"
}
```

Semantics:
- si un scope actif existe deja, la decision effective peut repasser en `allow`
- l'audit doit indiquer `scope_validated`
- le scope doit etre revocable et potentiellement expirable

---

## 12. Execution Modes

### `allow`

Execute directement.

### `dry_run`

Retourner:
- action choisie
- cible
- impact attendu
- controles appliques
- plan de rollback si pertinent

### `approval_required`

Creer une demande:

```json
{
  "approval_type": "action_execution",
  "action_key": "restart_room_system",
  "asset_ref": "geneva-room-12",
  "reason": "High-risk room restart outside maintenance window"
}
```

---

## 13. Dispatch Contract

Une fois la policy evaluee, le dispatch ne recoit plus une "intention libre", mais une action resolue.

### 13.1 Resolved Action Payload

```json
{
  "action_key": "restart_room_system",
  "provider": "av_control",
  "mode": "dry_run",
  "args": {
    "asset_ref": "geneva-room-12"
  },
  "constraints": {
    "timeout_ms": 15000,
    "max_attempts": 1
  }
}
```

### 13.2 Dispatch Types

- `nexus_action`
- `local_integration`
- `helper_agent`
- `ticket`
- `approval`
- `notify`

---

## 14. Policy Storage Model

### 14.1 New Tables

#### `tenant_vutler.nexus_policies`

- policy definitions

#### `tenant_vutler.nexus_policy_bindings`

- policy attachments to workspace / client / site / node

#### `tenant_vutler.nexus_action_catalog`

- action definitions versionnees

### 14.2 Minimal `nexus_policies`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| workspace_id | uuid | required |
| name | text | required |
| status | text | active / draft / archived |
| rules | jsonb | required |
| created_at | timestamptz | |

### 14.3 Minimal `nexus_action_catalog`

| Column | Type | Notes |
|--------|------|-------|
| action_key | text | PK |
| version | text | required |
| category | text | required |
| provider | text | required |
| risk_level | text | required |
| default_mode | text | required |
| definition | jsonb | required |
| active | boolean | required |

---

## 15. Evaluation Order

V1 evaluation order:

1. action exists in catalog
2. source allowed for action
3. args validate against schema
4. asset/site scope checks
5. maintenance / time window checks
6. severity / risk checks
7. helper seat checks if delegation
8. build final decision

Evaluation stops at first hard `deny`.

---

## 16. Examples

### 16.1 Event -> Dry Run

Input:
- event `room.offline`
- action candidate `restart_room_system`

Policy:
- restarts allowed for Geneva rooms
- but only as `dry_run` during business hours

Output:
- decision `dry_run`
- no side effect
- operator sees proposed restart

### 16.2 Event -> Helper Delegation

Input:
- event `room.offline`
- policy says: run network diagnostics before restart

Output:
- decision `allow`
- dispatch type `helper_agent`
- helper `network-helper`
- seat check required

### 16.3 Chat -> Deny

Input:
- user asks: "reboot all displays on all sites"

Output:
- decision `deny`
- reason: broad blast radius, wildcard target not allowed in V1

---

## 17. UI Requirements

### Policy Admin

Le client doit pouvoir:
- voir le catalogue d'actions
- choisir un mode par action
- restreindre par site / asset / severity
- activer approval ou dry-run

### Action Catalog UI

Pour chaque action, afficher:
- description
- risk level
- default mode
- side effects
- constraints

### Approval UI

Pour une demande d'approbation, afficher:
- action
- asset cible
- raison
- impact attendu
- policy appliquee

---

## 18. Validation

- [ ] Une action hors catalogue est rejetee
- [ ] Une action cataloguee mais hors scope est rejetee
- [ ] Une action `high` passe au minimum en `dry_run` sans policy explicite
- [ ] Une action `critical` ne passe pas en `allow` par defaut
- [ ] Un appel d'integration locale respecte le registry
- [ ] Une delegation helper respecte le helper registry et le seat check
- [ ] Une approval peut etre generee pour une action AV
- [ ] Le payload de dispatch est strictement structure
- [ ] Le resultat est auditablе

---

## 19. Chunks of Implementation

### Chunk 1 — Action catalog schema

- table `nexus_action_catalog`
- seed du catalogue AV V1

### Chunk 2 — Policy schema

- table `nexus_policies`
- bindings
- JSON schema de rules

### Chunk 3 — Policy evaluator

- evaluation order
- decision builder
- guardrails support

### Chunk 4 — Dispatch hardening

- resolved action payload only
- no free-form shell path

### Chunk 5 — Approval integration

- approval state
- approval UI payload

### Chunk 6 — Admin UI

- policy editor V1
- action catalog explorer

---

## 20. Risks

### Product

- trop de complexite policy trop tot
- action catalog trop large des la V1

### Technical

- policy evaluator trop implicite
- contraintes non alignees entre cloud et runtime
- catalogue non versionne

### Security

- bypass via args trop libres
- broad actions non correctement bornees
- approvals contournables

---

## 21. Recommended V1 Scope

Pour livrer vite et proprement:

1. catalogue AV V1 borne
2. risk levels simples
3. modes `deny | dry_run | approval_required | allow`
4. policy evaluation deterministe
5. helper + local integration passent par la meme policy
6. audit systematique

---

## 22. Next Step

Apres cette spec, la prochaine etape naturelle est l'implementation en chunks:

1. seed du catalogue d'actions
2. moteur d'evaluation
3. payloads de dispatch resolus
4. UI policy admin minimale
