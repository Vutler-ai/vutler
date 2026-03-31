# Nexus Enterprise Agent Level Capability Matrix V1

> **Status:** Draft — 2026-03-31
> **Type:** Architecture Decision Record + Technical Spec
> **Owner:** Codex
> **Scope:** Nexus Enterprise, agent levels, capability classes, tool classes, wizard defaults, runtime guardrails

---

## 1. Problem Statement

Le modele `agent_level` pose une bonne separation conceptuelle entre:
- agents administratifs
- agents operationnels
- agents techniques privilegies

Mais sans matrice explicite, on garde encore trop de flou sur:
- quelles capabilities sont autorisees par niveau
- quels tools peuvent etre proposes dans le wizard
- quels defaults de policy doivent s'appliquer
- quelles combinaisons doivent etre bloquees ou fortement restreintes

Cette spec fixe donc la couche de traduction entre:
- le niveau d'agent
- les capabilities candidates
- les classes de tools
- les defaults de gouvernance

---

## 2. Decision Summary

V1 introduit une **Agent Level Capability Matrix** avec les regles suivantes:

1. Chaque `Deployable Agent Profile` declare un `agent_level`.
2. Chaque `capability pack` declare une `risk_class`.
3. Chaque tool ou integration declare une `tool_class`.
4. Le wizard ne propose par defaut que les capabilities et tools compatibles avec le `agent_level`.
5. Le runtime et le policy engine doivent revalider cette compatibilite, meme si le wizard l'a deja fait.
6. Une compatibilite par niveau n'accorde jamais un droit automatique:
   - elle rend la combinaison **eligible**
   - la policy client decide ensuite si elle est **autorisee**

---

## 3. Goals

### In Scope

- definir les classes de capabilities
- definir les classes de tools
- definir la matrice par `agent_level`
- definir les defaults du wizard
- definir les defaults du policy engine
- definir les garde-fous runtime

### Out of Scope

- scoring numerique fin du risque
- moteur de pricing par capability
- custom levels par client en V1

---

## 4. Core Concepts

### 4.1 Agent Level

V1 supporte:
- `1` = `administrative`
- `2` = `operational`
- `3` = `technical_privileged`

### 4.2 Capability Risk Class

Chaque capability declare une `risk_class`:
- `knowledge`
- `coordination`
- `bounded_operations`
- `privileged_operations`

### 4.3 Tool Class

Chaque tool, integration ou action family declare une `tool_class`:
- `document_tool`
- `communication_tool`
- `workspace_tool`
- `ticketing_tool`
- `bounded_local_api`
- `bounded_device_control`
- `privileged_local_api`
- `privileged_infra_control`

### 4.4 Policy Default Mode

Chaque combinaison niveau + classe de tool suggere un mode de policy par defaut:
- `allow`
- `dry_run`
- `approval_required`
- `deny`

---

## 5. Capability Classes

### 5.1 Knowledge

Capabilities a faible risque technique.

Exemples:
- `document_generation`
- `workspace_knowledge_access`
- `reporting`

### 5.2 Coordination

Capabilities de pilotage et de communication.

Exemples:
- `email_dispatch`
- `task_orchestration`
- `ticketing`

### 5.3 Bounded Operations

Capabilities d'execution locale ou API privee avec scope borne.

Exemples:
- `event_ingestion`
- `local_api_bridge`
- `device_diagnostics`
- `helper_delegation`

### 5.4 Privileged Operations

Capabilities liees a des zones critiques ou a des blast radius plus eleves.

Exemples:
- `network_checks`
- `identity_lookup`
- `privileged_local_api_bridge`
- `privileged_remediation`

---

## 6. Tool Classes

### Document Tool

Exemples:
- generation de proposition
- redaction de rapport
- synthese documentaire

### Communication Tool

Exemples:
- email
- tasks
- notification

### Workspace Tool

Exemples:
- drive access borne
- knowledge retrieval
- template retrieval

### Ticketing Tool

Exemples:
- create ticket
- update incident
- sync status

### Bounded Local API

Exemples:
- appel API AV locale bornee
- lecture d'etat d'un systeme prive
- diagnostic scope par asset

### Bounded Device Control

Exemples:
- restart borne d'un codec
- changement d'input d'un display
- runbook de remediation scope a une room

### Privileged Local API

Exemples:
- actions sensibles sur identity, reseau ou infrastructure locale
- operations plus larges qu'un asset unique

### Privileged Infra Control

Exemples:
- remediation infra a rayon d'impact eleve
- changements sensibles sur domaines critiques

---

## 7. Level Matrix

### 7.1 Capability Matrix

| Capability risk class | Level 1 Administrative | Level 2 Operational | Level 3 Technical Privileged |
|-----------------------|------------------------|---------------------|------------------------------|
| `knowledge` | allowed | allowed | allowed |
| `coordination` | allowed | allowed | allowed |
| `bounded_operations` | restricted | allowed | allowed |
| `privileged_operations` | denied | restricted | allowed |

Interpretation:
- `allowed` = peut etre propose par defaut
- `restricted` = non propose par defaut ou demande justification/flag explicite
- `denied` = interdit en V1

### 7.2 Tool Class Matrix

| Tool class | Level 1 | Level 2 | Level 3 | Default policy mode |
|------------|---------|---------|---------|---------------------|
| `document_tool` | allowed | allowed | allowed | `allow` |
| `communication_tool` | allowed | allowed | allowed | `allow` |
| `workspace_tool` | allowed | allowed | allowed | `allow` |
| `ticketing_tool` | allowed | allowed | allowed | `allow` or `dry_run` |
| `bounded_local_api` | restricted | allowed | allowed | `dry_run` |
| `bounded_device_control` | denied | allowed | allowed | `dry_run` or `approval_required` |
| `privileged_local_api` | denied | restricted | allowed | `approval_required` |
| `privileged_infra_control` | denied | denied | allowed | `approval_required` or `deny` |

---

## 8. Level Semantics

### 8.1 Level 1 Administrative

Profils centres sur:
- documents
- coordination
- reporting
- support business

Allowed by default:
- `knowledge`
- `coordination`
- `document_tool`
- `communication_tool`
- `workspace_tool`
- `ticketing_tool`

Restricted:
- `bounded_operations`
- `bounded_local_api`

Denied:
- `bounded_device_control`
- `privileged_local_api`
- `privileged_infra_control`

Examples:
- `bid_manager`
- `report_writer`
- `compliance_assistant`

### 8.2 Level 2 Operational

Profils centres sur:
- diagnostics
- event handling
- ticketing
- bounded remediation

Allowed by default:
- `knowledge`
- `coordination`
- `bounded_operations`
- `bounded_local_api`
- `bounded_device_control`

Restricted:
- `privileged_operations`
- `privileged_local_api`

Denied:
- `privileged_infra_control`

Examples:
- `av_manager`
- `it_helpdesk`
- `site_operations`

### 8.3 Level 3 Technical Privileged

Profils centres sur:
- infra critique
- identity
- reseau
- actions a impact plus large

Allowed by default:
- toutes les classes candidates de V1

Mais avec:
- policy plus stricte
- approvals plus frequentes
- audit renforce
- plus de `dry_run` par defaut

Examples:
- `network_ops`
- `identity_ops`

---

## 9. Wizard Rules

Le wizard enterprise doit appliquer la matrice en amont.

### 9.1 During Profile Creation

Le wizard:
- demande ou derive `agent_level`
- precharge les capabilities compatibles
- masque les capabilities interdites
- marque comme "advanced/restricted" les capabilities restreintes

### 9.2 UI Behavior

`allowed`
- visible et selectionnable normalement

`restricted`
- visible uniquement en mode avance ou avec justification
- affiche son impact risque et governance

`denied`
- non selectionnable en V1

### 9.3 Validation

Le wizard ne doit jamais permettre:
- un profil `Level 1` avec `privileged_infra_control`
- un profil `Level 1` avec `bounded_device_control` par defaut
- un profil `Level 2` avec privileges `Level 3` sans chemin explicite et sans policy durcie

---

## 10. Runtime Guardrails

Le runtime doit revalider la matrice pour eviter:
- un bypass du wizard
- une mauvaise config publiee
- une derive progressive du profil

Checks minimums:
- `profile.agent_level` existe
- chaque capability du profil est compatible avec ce niveau
- chaque integration du profil est compatible avec ce niveau
- chaque action du catalog correspond a une `tool_class` compatible

Si une combinaison est invalide:
- reject au chargement du profil
- audit log explicite
- pas d'activation de l'agent tant que la config n'est pas corrigee

---

## 11. Policy Engine Defaults

Le `Policy Engine` utilise la matrice pour produire des defaults coherents.

### Examples

Level 1 + `document_tool`
- default `allow`

Level 1 + `bounded_local_api`
- default `dry_run` ou `deny` selon le profil

Level 2 + `bounded_device_control`
- default `dry_run`

Level 3 + `privileged_local_api`
- default `approval_required`

Level 3 + `privileged_infra_control`
- default `approval_required` ou `deny` si policy explicite absente

---

## 12. Example Mapping

### AV Manager

```json
{
  "profile_key": "av_manager",
  "agent_level": 2,
  "capabilities": [
    "event_ingestion",
    "ticketing",
    "reporting",
    "device_diagnostics",
    "local_api_bridge"
  ],
  "tool_classes": [
    "ticketing_tool",
    "bounded_local_api",
    "bounded_device_control"
  ]
}
```

### IT Helpdesk

```json
{
  "profile_key": "it_helpdesk",
  "agent_level": 2,
  "capabilities": [
    "ticketing",
    "reporting",
    "local_api_bridge",
    "event_ingestion"
  ],
  "tool_classes": [
    "ticketing_tool",
    "bounded_local_api",
    "communication_tool"
  ]
}
```

### Bid Manager

```json
{
  "profile_key": "bid_manager",
  "agent_level": 1,
  "capabilities": [
    "document_generation",
    "workspace_knowledge_access",
    "email_dispatch"
  ],
  "tool_classes": [
    "document_tool",
    "workspace_tool",
    "communication_tool"
  ]
}
```

### Network Ops

```json
{
  "profile_key": "network_ops",
  "agent_level": 3,
  "capabilities": [
    "event_ingestion",
    "network_checks",
    "ticketing",
    "privileged_local_api_bridge"
  ],
  "tool_classes": [
    "ticketing_tool",
    "privileged_local_api",
    "privileged_infra_control"
  ]
}
```

---

## 13. Data Model Guidance

Chaque capability pack devrait pouvoir declarer:

```json
{
  "capability_key": "local_api_bridge",
  "risk_class": "bounded_operations",
  "default_tool_classes": ["bounded_local_api"]
}
```

Chaque action catalog item devrait pouvoir declarer:

```json
{
  "action_key": "restart_room_system",
  "tool_class": "bounded_device_control",
  "risk_level": "high"
}
```

Chaque local integration registry item devrait pouvoir declarer:

```json
{
  "integration_key": "teams_rooms_local_api",
  "tool_class": "bounded_local_api",
  "required_level": 2
}
```

---

## 14. Anti-Patterns

- donner a un `Level 1` un bridge local privilegie "juste pour depanner"
- traiter `agent_level` comme un label marketing sans effet runtime
- supposer qu'un `Level 3` peut tout faire sans policy explicite
- laisser le wizard et le runtime diverger sur la matrice

---

## 15. Acceptance Criteria

- [ ] Une matrice niveau -> capability classes existe
- [ ] Une matrice niveau -> tool classes existe
- [ ] Le wizard utilise cette matrice pour filtrer les choix
- [ ] Le runtime revalide cette matrice au chargement
- [ ] Le policy engine derive des defaults coherents de cette matrice
- [ ] Les profils `Bid Manager`, `AV Manager` et `Network Ops` se placent proprement dans la matrice

