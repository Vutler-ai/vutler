# Nexus Enterprise Deployable Agents Implementation V1

> **Status:** Draft — 2026-03-31
> **Type:** Implementation Spec
> **Owner:** Codex
> **Scope:** Backend, frontend wizard, runtime validation, registry persistence, policy wiring

---

## 1. Purpose

Cette spec traduit les briques de conception deja posees en objets implementables dans Vutler:

- `Deployable Agent Profile`
- `Agent Level Capability Matrix`
- `Seat Accounting`
- `Policy Engine`
- `Local Integration Registry`
- `Helper Agent Registry`

Le but est d'obtenir une V1 implementable sans reouvrir l'architecture a chaque nouveau profil enterprise.

---

## 2. Implementation Goals

### In Scope

- definir les structures de donnees minimales
- definir les endpoints backend minimaux
- definir les champs wizard minimaux
- definir les validations runtime minimales
- definir l'ordre de resolution profile -> capability -> action -> policy -> runtime
- definir un plan d'implementation par tranche

### Out of Scope

- UI finale polish
- billing finance detaille
- visual policy builder
- marketplace complete de profils

---

## 3. Target Implementation Shape

V1 doit reposer sur quatre couches:

1. **Registry Layer**
   - stocke les profils, capabilities, matrices, catalogs et registries

2. **Provisioning Layer**
   - wizard frontend + API backend
   - cree ou met a jour un agent enterprise a partir d'un `profile_key`

3. **Validation Layer**
   - verifie la compatibilite niveau/capabilities/tools
   - verifie la policy, les seats, les integrations et les helper rules

4. **Execution Layer**
   - runtime Nexus
   - dispatch event/chat/schedule
   - audit et observabilite

---

## 4. Data Model

V1 peut etre implemente soit par tables SQL dediees, soit par documents JSON versionnes stockes dans des tables registry.

Pour limiter le cout V1, la meilleure approche est:

- tables SQL minces pour l'indexation
- payload JSONB pour les definitions versionnees

### 4.1 `enterprise_agent_profiles`

But:
- stocker les profils deployables versionnes

Suggested columns:

```sql
id uuid primary key
workspace_id uuid null
profile_key text not null
version text not null
name text not null
category text not null
agent_level smallint not null
seat_class text not null default 'standard_agent'
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

Notes:
- `workspace_id = null` pour profils platform-managed globaux
- `workspace_id != null` pour overrides workspace-specific futurs

### 4.2 `enterprise_capability_packs`

But:
- stocker les capability packs versionnes

Suggested columns:

```sql
id uuid primary key
capability_key text not null
version text not null
risk_class text not null
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.3 `enterprise_agent_level_matrix`

But:
- stocker la matrice officielle niveau -> capabilities/tools/default modes

Suggested columns:

```sql
id uuid primary key
matrix_key text not null
version text not null
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.4 `enterprise_action_catalogs`

But:
- stocker les catalogs d'actions par profil

Suggested columns:

```sql
id uuid primary key
catalog_key text not null
version text not null
profile_key text not null
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.5 `enterprise_policy_bundles`

But:
- stocker les defaults de policy par profil

Suggested columns:

```sql
id uuid primary key
bundle_key text not null
version text not null
profile_key text not null
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.6 `enterprise_local_integration_registries`

But:
- stocker les integrations locales autorisees par profil

Suggested columns:

```sql
id uuid primary key
registry_key text not null
version text not null
profile_key text not null
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.7 `enterprise_helper_agent_rules`

But:
- stocker les regles de delegation entre profils

Suggested columns:

```sql
id uuid primary key
rules_key text not null
version text not null
profile_key text not null
status text not null default 'active'
definition jsonb not null
created_at timestamptz not null
updated_at timestamptz not null
```

### 4.8 Agent Runtime Binding

Les agents concrets deployes doivent porter ces champs minimaux dans leur config runtime ou metadata:

```json
{
  "profile_key": "av_manager",
  "profile_version": "1.0.0",
  "agent_level": 2,
  "deployment_mode": "fixed",
  "seat_class": "standard_agent",
  "capabilities": [
    "event_ingestion",
    "ticketing",
    "device_diagnostics",
    "local_api_bridge"
  ]
}
```

### 4.9 Governance Persistence

V1 implemente aussi deux tables de gouvernance runtime:

- `nexus_enterprise_approval_requests`
- `nexus_enterprise_audit_log`

But:
- persister les demandes d'approbation
- persister les grants de process
- conserver un audit trail exploitable par le client

---

## 5. Backend API Surface

Les endpoints V1 doivent rester simples et admin-oriented.

### 5.1 Registry Read APIs

Examples:

```text
GET /api/nexus-enterprise/profiles
GET /api/nexus-enterprise/profiles/:profileKey
GET /api/nexus-enterprise/capabilities
GET /api/nexus-enterprise/agent-level-matrix
GET /api/nexus-enterprise/action-catalogs/:profileKey
GET /api/nexus-enterprise/policy-bundles/:profileKey
GET /api/nexus-enterprise/local-integrations/:profileKey
GET /api/nexus-enterprise/helper-rules/:profileKey
```

### 5.2 Provisioning APIs

Examples:

```text
POST /api/nexus-enterprise/agents/validate-profile-selection
POST /api/nexus-enterprise/agents/provision
POST /api/nexus-enterprise/agents/:agentId/update-profile-config
POST /api/nexus-enterprise/agents/:agentId/activate
POST /api/nexus-enterprise/agents/:agentId/deactivate
```

### 5.3 Runtime Validation APIs

Examples:

```text
POST /api/nexus-enterprise/runtime/validate-agent-config
POST /api/nexus-enterprise/runtime/evaluate-dispatch
```

### 5.4 Governance APIs

V1 ajoute une surface de gouvernance cote runtime et cote client:

```text
POST /api/v1/nexus/:nodeId/governance/approvals
GET  /api/v1/nexus/:nodeId/governance/approvals/:approvalId
POST /api/v1/nexus/:nodeId/governance/approvals/:approvalId/runtime-status
POST /api/v1/nexus/:nodeId/governance/audit
GET  /api/v1/nexus/:nodeId/governance/scopes/resolve

GET  /api/v1/nexus/nodes/:nodeId/governance/approvals
GET  /api/v1/nexus/nodes/:nodeId/governance/scopes
GET  /api/v1/nexus/nodes/:nodeId/governance/audit
POST /api/v1/nexus/nodes/:nodeId/governance/approvals/:approvalId/approve
POST /api/v1/nexus/nodes/:nodeId/governance/approvals/:approvalId/reject
POST /api/v1/nexus/nodes/:nodeId/governance/approvals/:approvalId/revoke-scope
```

### 5.4 Expected API Response Shape

Conformement au projet:

```json
{
  "success": true,
  "data": {}
}
```

or

```json
{
  "success": false,
  "error": "Profile level 1 cannot use privileged_infra_control"
}
```

---

## 6. Validation Contract

La validation se fait a trois moments:

### 6.1 Wizard-Time Validation

Verifie:
- `profile_key` existe
- `agent_level` est coherent avec le profil
- capabilities choisies compatibles avec la matrice
- tools/integrations choisies compatibles avec la matrice
- deployment mode supporte par le profil

### 6.2 Provision-Time Validation

Verifie en plus:
- references `action_catalog`, `policy_bundle`, `local_integrations`, `helper_rules`
- seat availability si activation immediate
- node compatibility
- workspace/client permissions

### 6.3 Runtime-Time Validation

Verifie au chargement:
- agent config complete
- `profile_key` resolvable
- matrix compatibility toujours valide
- registries resolvables

Verifie au dispatch:
- action du catalogue resolvable
- policy bundle resolvable
- local integration autorisee
- helper profile autorise
- approval ponctuelle ou scope grant valide si necessaire
- bypass `full_access` demande explicitement
- pas de capability inconnue
- pas d'action hors catalog

---

## 7. Wizard Implementation

Le wizard doit devenir **profile-driven**.

### 7.1 New Wizard Steps

1. `Select profile`
2. `Review level and risk posture`
3. `Choose deployment mode`
4. `Review allowed capabilities`
5. `Review local integrations`
6. `Review helper delegation`
7. `Review seat impact`
8. `Confirm and provision`

### 7.2 Required Frontend Fields

```ts
type EnterpriseAgentProvisionInput = {
  nodeId: string
  profileKey: string
  profileVersion?: string
  deploymentMode: 'fixed' | 'elastic'
  selectedCapabilities?: string[]
  selectedLocalIntegrations?: string[]
  selectedHelperProfiles?: string[]
  startActive?: boolean
}
```

### 7.3 Wizard Behavior Rules

- `agent_level` est affiche, pas librement editable si derive du profil
- les capabilities `allowed` sont preselectionnables
- les capabilities `restricted` demandent un mode avance
- les capabilities `denied` ne s'affichent pas comme choix valides
- le wizard montre explicitement le `seat impact`

### 7.4 UX Warnings

Examples:
- `This profile is Level 3 and requires stricter approvals by default`
- `Activating this helper profile consumes one additional seat`
- `This local integration is restricted for the selected profile level`

---

## 8. Backend Service Responsibilities

### 8.1 `enterpriseProfileRegistry`

Responsable de:
- charger les profils
- resoudre la bonne version
- merger un override workspace futur si besoin

### 8.2 `enterpriseCapabilityRegistry`

Responsable de:
- charger les capability packs
- exposer `risk_class`
- resoudre `tool_class` candidates

### 8.3 `enterpriseLevelMatrixService`

Responsable de:
- charger la matrice active
- repondre aux checks de compatibilite
- calculer les defaults de policy mode

### 8.4 `enterpriseProvisioningService`

Responsable de:
- valider la selection du wizard
- resoudre les registries necessaires
- preparer la config finale de l'agent
- passer au `seat accounting`

### 8.5 `enterpriseRuntimeValidationService`

Responsable de:
- revalider au chargement runtime
- refuser une activation invalide
- produire des erreurs explicites et auditables

---

## 9. Runtime Wiring

Le runtime Nexus doit charger un agent enterprise dans cet ordre:

1. charger config agent
2. resoudre `profile_key`
3. charger profile definition
4. charger matrix active
5. verifier compatibilite capabilities/tools
6. charger action catalog
7. charger policy bundle
8. charger local integration registry
9. charger helper rules
10. verifier seat state si activation
11. activer agent

Si une etape echoue:
- activation rejetee
- raison d'echec journalisee
- etat agent visible comme `invalid_config` ou equivalent

---

## 10. Dispatch Resolution Flow

Toute execution event/chat/schedule doit suivre ce pipeline:

1. identifier l'agent actif
2. lire `profile_key` et `agent_level`
3. resoudre l'action cible
4. verifier que l'action existe dans le catalog du profil
5. determiner la `tool_class`
6. verifier compatibilite matrice
7. evaluer la policy
8. verifier les seats si helper activation
9. executer ou demander approval
10. auditer

V1 interdit:
- action hors catalog
- integration hors registry
- helper hors rules
- escalade implicite de niveau

---

## 11. Storage Strategy

Pour accelerer V1:

- les definitions officielles peuvent vivre d'abord dans `seeds/` ou `docs/specs/` puis etre chargees vers SQL
- le backend doit exposer une couche de lecture stable meme si les sources changent plus tard

Recommendation V1:
- seed platform-managed profiles and registries
- allow DB-backed resolution in production
- avoid hardcoding profile logic in route handlers

---

## 12. Suggested Seeded Profiles For V1

Platform-managed:
- `av_manager`
- `it_helpdesk`
- `bid_manager`
- `report_writer`

Optional V1.1:
- `network_ops`
- `identity_ops`

---

## 13. Suggested Implementation Order

### Phase 1: Registries

- create registry tables
- add seed loaders
- add read APIs

### Phase 2: Wizard and Provisioning

- add profile-driven wizard steps
- add validation API
- add provisioning API

### Phase 3: Runtime Validation

- add runtime profile resolution
- add matrix validation
- reject invalid configs

### Phase 4: Dispatch and Policy Wiring

- enforce action catalog checks
- enforce tool class checks
- enforce helper/local integration checks

### Phase 5: UX and Observability

- surface level/risk/seat impact in UI
- add audit fields and failure reasons

---

## 14. Minimal Audit Fields

Chaque activation ou execution devrait journaliser au minimum:

```json
{
  "agent_id": "uuid",
  "profile_key": "av_manager",
  "profile_version": "1.0.0",
  "agent_level": 2,
  "deployment_mode": "fixed",
  "action_key": "restart_room_system",
  "tool_class": "bounded_device_control",
  "policy_decision": "dry_run",
  "seat_impact": "none",
  "result": "blocked_or_executed",
  "reason": "policy_evaluated"
}
```

---

## 15. Frontend/Backend File Targets

### Frontend

Likely touch points:
- `frontend/src/app/(app)/nexus/`
- `frontend/src/lib/api/`

Expected additions:
- profile list types
- level matrix types
- provisioning validation client
- wizard UI sections

### Backend

Likely touch points:
- `api/nexus.js`
- `services/`
- `seeds/`

Expected additions:
- registry readers
- validation services
- provisioning helpers
- seed data for profiles/capabilities/matrix

### Nexus Runtime

Likely touch points:
- `packages/nexus/`
- `packages/nexus/lib/`

Expected additions:
- profile resolution at startup
- matrix validation before activation
- dispatch gating before local execution

---

## 16. Acceptance Criteria

- [ ] Des registres versionnes existent pour profiles, capabilities et matrix
- [ ] Un agent enterprise ne peut pas etre provisionne sans `profile_key`
- [ ] Le wizard est profile-driven
- [ ] Le wizard montre `agent_level` et `seat impact`
- [ ] Le backend valide la compatibilite niveau/capabilities/tools
- [ ] Le runtime refuse une config invalide
- [ ] Le dispatch refuse toute action hors catalog
- [ ] Les integrations locales et helper delegations sont bornees par registry
- [ ] `AV Manager`, `IT Helpdesk`, `Bid Manager` et `Report Writer` peuvent etre provisionnes via le meme flux

---

## 17. Recommended Next Step

Apres cette spec, la prochaine vraie brique d'implementation est:

**`Nexus Enterprise Registry Schema + Seed Pack V1`**

C'est elle qui permettra de commencer a coder sans retomber dans des constantes ou if/else disperses dans le backend et le runtime.
