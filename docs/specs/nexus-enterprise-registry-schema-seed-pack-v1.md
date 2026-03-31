# Nexus Enterprise Registry Schema + Seed Pack V1

> **Status:** Draft — 2026-03-31
> **Type:** Implementation Spec
> **Owner:** Codex
> **Scope:** Registry payloads, seed structure, versioning, seeded profiles and catalogs

---

## 1. Purpose

Cette spec fige la forme minimale des objets qui doivent exister pour demarrer l'implementation de `nexus-enterprise` sans hardcoder la logique des profils dans:
- le backend
- le wizard
- le runtime Nexus

Elle definit:
- le schema logique des registries
- la structure des payloads seedes
- le premier `seed pack` platform-managed

---

## 2. V1 Principles

- Les profils enterprise sont resolves depuis un registry.
- Les capabilities sont resolvees depuis un registry.
- La matrice de niveaux est resolue depuis un registry.
- Les catalogs d'actions, policy bundles, integrations locales et helper rules sont resolves depuis un registry.
- Les seeds V1 sont **platform-managed**.
- Les overrides client-specifiques peuvent venir plus tard, sans casser le modele.

---

## 3. Registry Keys

Tous les objets V1 doivent avoir:
- une cle logique stable
- une version explicite
- un statut
- une definition JSON serialisable

### Required Common Fields

```json
{
  "key": "av_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {}
}
```

### Status Values

V1:
- `draft`
- `active`
- `deprecated`
- `disabled`

### Managed By Values

V1:
- `platform`
- `workspace`

---

## 4. Seed File Layout

V1 devrait utiliser un layout simple dans `seeds/`:

```text
seeds/nexus-enterprise/
  profiles/
  capabilities/
  matrices/
  action-catalogs/
  policy-bundles/
  local-integrations/
  helper-rules/
```

Suggested filenames:

```text
seeds/nexus-enterprise/profiles/av_manager.v1.json
seeds/nexus-enterprise/profiles/it_helpdesk.v1.json
seeds/nexus-enterprise/profiles/bid_manager.v1.json
seeds/nexus-enterprise/profiles/report_writer.v1.json
seeds/nexus-enterprise/capabilities/document_generation.v1.json
seeds/nexus-enterprise/capabilities/event_ingestion.v1.json
seeds/nexus-enterprise/matrices/default-agent-level-matrix.v1.json
```

---

## 5. Registry Object Schemas

### 5.1 Agent Profile Schema

```json
{
  "key": "av_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "av_manager",
    "name": "AV Manager",
    "category": "operations",
    "agent_level": 2,
    "description": "Monitors AV rooms and executes bounded remediation",
    "deployment_modes": ["fixed", "elastic"],
    "seat_class": "standard_agent",
    "required_capabilities": [
      "event_ingestion",
      "ticketing",
      "device_diagnostics",
      "local_api_bridge"
    ],
    "optional_capabilities": [
      "reporting",
      "helper_delegation"
    ],
    "action_catalog_ref": "catalog.av_manager",
    "policy_bundle_ref": "policy.av_manager.default",
    "local_integrations_ref": "local_integrations.av_manager",
    "helper_rules_ref": "helper_rules.av_manager",
    "supported_event_sources": ["webhook", "schedule", "operator_chat"]
  }
}
```

### 5.2 Capability Schema

```json
{
  "key": "ticketing",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "capability_key": "ticketing",
    "name": "Ticketing",
    "risk_class": "coordination",
    "provides": [
      "create_ticket",
      "update_ticket",
      "link_incident"
    ],
    "default_tool_classes": ["ticketing_tool"],
    "requires": ["policy_engine"],
    "optional_with": ["event_ingestion", "reporting"]
  }
}
```

### 5.3 Level Matrix Schema

```json
{
  "key": "default_agent_level_matrix",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "levels": {
      "1": {
        "name": "administrative",
        "allowed_capability_risk_classes": ["knowledge", "coordination"],
        "restricted_capability_risk_classes": ["bounded_operations"],
        "denied_capability_risk_classes": ["privileged_operations"]
      },
      "2": {
        "name": "operational",
        "allowed_capability_risk_classes": ["knowledge", "coordination", "bounded_operations"],
        "restricted_capability_risk_classes": ["privileged_operations"],
        "denied_capability_risk_classes": []
      },
      "3": {
        "name": "technical_privileged",
        "allowed_capability_risk_classes": [
          "knowledge",
          "coordination",
          "bounded_operations",
          "privileged_operations"
        ],
        "restricted_capability_risk_classes": [],
        "denied_capability_risk_classes": []
      }
    },
    "tool_classes": {
      "document_tool": {
        "1": "allow",
        "2": "allow",
        "3": "allow"
      },
      "bounded_local_api": {
        "1": "restricted",
        "2": "allow",
        "3": "allow"
      },
      "bounded_device_control": {
        "1": "deny",
        "2": "dry_run",
        "3": "dry_run"
      },
      "privileged_local_api": {
        "1": "deny",
        "2": "restricted",
        "3": "approval_required"
      },
      "privileged_infra_control": {
        "1": "deny",
        "2": "deny",
        "3": "approval_required"
      }
    }
  }
}
```

### 5.4 Action Catalog Schema

```json
{
  "key": "catalog.av_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "av_manager",
    "actions": [
      {
        "action_key": "check_room_health",
        "category": "diagnostics",
        "tool_class": "bounded_local_api",
        "risk_level": "low",
        "default_mode": "allow",
        "allowed_request_sources": ["event", "schedule", "chat"]
      },
      {
        "action_key": "restart_room_system",
        "category": "remediation",
        "tool_class": "bounded_device_control",
        "risk_level": "high",
        "default_mode": "dry_run",
        "allowed_request_sources": ["event", "chat"]
      }
    ]
  }
}
```

### 5.5 Policy Bundle Schema

```json
{
  "key": "policy.av_manager.default",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "av_manager",
    "default_rules": [
      {
        "match": {
          "tool_class": "bounded_local_api"
        },
        "decision": "dry_run"
      },
      {
        "match": {
          "tool_class": "bounded_device_control"
        },
        "decision": "approval_required"
      }
    ]
  }
}
```

### 5.6 Local Integration Registry Schema

```json
{
  "key": "local_integrations.av_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "av_manager",
    "integrations": [
      {
        "integration_key": "teams_rooms_local_api",
        "name": "Teams Rooms Local API",
        "tool_class": "bounded_local_api",
        "required_level": 2,
        "operations": [
          "get_room_status",
          "get_room_diagnostics",
          "restart_room_system"
        ]
      }
    ]
  }
}
```

### 5.7 Helper Rules Schema

```json
{
  "key": "helper_rules.av_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "av_manager",
    "allowed_helpers": [
      {
        "profile_key": "it_helpdesk",
        "mode": "restricted",
        "seat_mode": "consumes_seat",
        "allowed_reasons": [
          "incident_out_of_scope",
          "ticket_escalation"
        ]
      }
    ]
  }
}
```

---

## 6. Seed Pack V1

Le premier seed pack doit rester volontairement petit.

### 6.1 Seeded Profiles

V1 mandatory:
- `av_manager`
- `it_helpdesk`
- `bid_manager`
- `report_writer`

### 6.2 Seeded Capabilities

V1 mandatory:
- `document_generation`
- `workspace_knowledge_access`
- `email_dispatch`
- `ticketing`
- `reporting`
- `event_ingestion`
- `local_api_bridge`
- `device_diagnostics`
- `helper_delegation`

V1.1 candidates:
- `network_checks`
- `identity_lookup`
- `privileged_local_api_bridge`

### 6.3 Seeded Matrix

V1 mandatory:
- `default_agent_level_matrix`

### 6.4 Seeded Action Catalogs

V1 mandatory:
- `catalog.av_manager`
- `catalog.it_helpdesk`
- `catalog.bid_manager`
- `catalog.report_writer`

### 6.5 Seeded Policy Bundles

V1 mandatory:
- `policy.av_manager.default`
- `policy.it_helpdesk.default`
- `policy.bid_manager.default`
- `policy.report_writer.default`

### 6.6 Seeded Integration Registries

V1 mandatory:
- `local_integrations.av_manager`
- `local_integrations.it_helpdesk`

V1 optional:
- `local_integrations.bid_manager`
- `local_integrations.report_writer`

### 6.7 Seeded Helper Rules

V1 mandatory:
- `helper_rules.av_manager`
- `helper_rules.it_helpdesk`
- `helper_rules.bid_manager`
- `helper_rules.report_writer`

---

## 7. Seeded Profile Examples

### 7.1 `av_manager`

```json
{
  "key": "av_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "av_manager",
    "name": "AV Manager",
    "category": "operations",
    "agent_level": 2,
    "deployment_modes": ["fixed", "elastic"],
    "seat_class": "standard_agent",
    "required_capabilities": [
      "event_ingestion",
      "ticketing",
      "device_diagnostics",
      "local_api_bridge"
    ],
    "optional_capabilities": ["reporting", "helper_delegation"],
    "action_catalog_ref": "catalog.av_manager",
    "policy_bundle_ref": "policy.av_manager.default",
    "local_integrations_ref": "local_integrations.av_manager",
    "helper_rules_ref": "helper_rules.av_manager"
  }
}
```

### 7.2 `it_helpdesk`

```json
{
  "key": "it_helpdesk",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "it_helpdesk",
    "name": "IT Helpdesk",
    "category": "operations",
    "agent_level": 2,
    "deployment_modes": ["fixed", "elastic"],
    "seat_class": "standard_agent",
    "required_capabilities": [
      "ticketing",
      "reporting",
      "local_api_bridge"
    ],
    "optional_capabilities": [
      "event_ingestion",
      "helper_delegation"
    ],
    "action_catalog_ref": "catalog.it_helpdesk",
    "policy_bundle_ref": "policy.it_helpdesk.default",
    "local_integrations_ref": "local_integrations.it_helpdesk",
    "helper_rules_ref": "helper_rules.it_helpdesk"
  }
}
```

### 7.3 `bid_manager`

```json
{
  "key": "bid_manager",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "bid_manager",
    "name": "Bid Manager",
    "category": "knowledge",
    "agent_level": 1,
    "deployment_modes": ["fixed", "elastic"],
    "seat_class": "standard_agent",
    "required_capabilities": [
      "document_generation",
      "workspace_knowledge_access",
      "email_dispatch"
    ],
    "optional_capabilities": ["reporting"],
    "action_catalog_ref": "catalog.bid_manager",
    "policy_bundle_ref": "policy.bid_manager.default",
    "local_integrations_ref": "local_integrations.bid_manager",
    "helper_rules_ref": "helper_rules.bid_manager"
  }
}
```

### 7.4 `report_writer`

```json
{
  "key": "report_writer",
  "version": "1.0.0",
  "status": "active",
  "managed_by": "platform",
  "definition": {
    "profile_key": "report_writer",
    "name": "Report Writer",
    "category": "knowledge",
    "agent_level": 1,
    "deployment_modes": ["fixed", "elastic"],
    "seat_class": "standard_agent",
    "required_capabilities": [
      "document_generation",
      "workspace_knowledge_access"
    ],
    "optional_capabilities": ["email_dispatch", "reporting"],
    "action_catalog_ref": "catalog.report_writer",
    "policy_bundle_ref": "policy.report_writer.default",
    "local_integrations_ref": "local_integrations.report_writer",
    "helper_rules_ref": "helper_rules.report_writer"
  }
}
```

---

## 8. Minimal Action Catalog Coverage

### `catalog.av_manager`

Mandatory actions:
- `check_room_health`
- `get_room_diagnostics`
- `restart_room_system`
- `open_incident_ticket`
- `send_daily_report`

### `catalog.it_helpdesk`

Mandatory actions:
- `triage_incident`
- `create_helpdesk_ticket`
- `update_helpdesk_ticket`
- `collect_endpoint_context`
- `send_incident_summary`

### `catalog.bid_manager`

Mandatory actions:
- `draft_bid_outline`
- `summarize_rfp`
- `assemble_bid_sources`
- `draft_bid_email`

### `catalog.report_writer`

Mandatory actions:
- `draft_report`
- `summarize_inputs`
- `compile_sections`
- `prepare_delivery_email`

---

## 9. Versioning Rules

### 9.1 Minor Safe Evolution

Exemples:
- ajout d'une action non obligatoire
- ajout d'une capability optionnelle
- ajout d'un champ non requis

=> version mineure

### 9.2 Breaking Evolution

Exemples:
- suppression d'une action
- changement de `agent_level`
- changement de `risk_class`
- changement de semantics d'une integration

=> nouvelle version majeure

### 9.3 Runtime Rule

Un agent actif doit rester lie a:
- un `profile_key`
- une `profile_version`
- des registries resolvables pour cette version

---

## 10. Seed Loading Rules

V1 devrait charger les seeds dans cet ordre:

1. capability packs
2. level matrix
3. profiles
4. action catalogs
5. policy bundles
6. local integration registries
7. helper rules

Reason:
- les profils referencent les autres registries
- la validation doit pouvoir s'executer apres chargement

### Idempotency Rule

Le seed loader doit:
- creer si absent
- mettre a jour si meme `key + version`
- refuser d'ecraser une version active incompatible sans flag explicite

---

## 11. Validation Rules For Seed Pack

Avant activation d'un seed:

- chaque `profile_key` reference un catalog existant
- chaque `profile_key` reference un policy bundle existant
- chaque capability referencee existe
- chaque capability est compatible avec la matrix pour le `agent_level`
- chaque action declare une `tool_class`
- chaque integration declare un `required_level`
- chaque helper rule pointe vers un profil connu

---

## 12. Suggested Backend Loader Contract

```ts
type EnterpriseRegistrySeedRecord = {
  key: string
  version: string
  status: 'draft' | 'active' | 'deprecated' | 'disabled'
  managed_by: 'platform' | 'workspace'
  definition: Record<string, unknown>
}
```

Suggested loader responsibilities:
- discover seed files
- parse and validate
- upsert into registry tables
- report invalid references
- expose a boot summary

---

## 13. Anti-Patterns

- coder `av_manager` ou `bid_manager` en dur dans le runtime
- laisser un profil sans `action_catalog_ref`
- laisser une integration locale sans `required_level`
- laisser le wizard proposer un profil dont les seeds sont invalides
- faire diverger les seeds, la matrix et les policy bundles

---

## 14. Acceptance Criteria

- [ ] Un layout `seeds/nexus-enterprise/` est defini
- [ ] Les objets de registry ont un schema commun minimal
- [ ] Les 4 profils V1 sont seedes
- [ ] Les capability packs V1 sont seedes
- [ ] La level matrix V1 est seedee
- [ ] Chaque profil pointe vers catalog, bundle, integrations et helper rules
- [ ] Le loader peut valider les references croisees
- [ ] Le runtime peut resoudre un profil par `key + version`

---

## 15. Recommended Next Step

Apres ce document, la meilleure suite est:

**`Nexus Enterprise Backend Rollout Plan V1`**

avec:
- fichiers backend a toucher
- ordre de migration SQL
- ordre d'ajout des services de registry
- ordre de branchement dans `api/nexus.js` et `packages/nexus`

