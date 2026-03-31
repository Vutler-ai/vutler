# Nexus Enterprise Deployable Agent Profile V1

> **Status:** Draft — 2026-03-31
> **Type:** Architecture Decision Record + Technical Spec
> **Owner:** Codex
> **Scope:** Nexus Enterprise, generic deployable profiles, capability composition, runtime contracts

---

## 1. Problem Statement

Les specs existantes traitent deja:
- l'employe virtuel enterprise
- l'ingestion d'evenements
- le seat accounting
- le policy engine

Mais elles restent encore trop centrees sur le `AV Manager`.

Il faut maintenant definir la brique generique qui permet a `nexus-enterprise` d'heberger:
- des agents operationnels
- des agents documentaires
- des agents hybrides

Sans reouvrir l'architecture a chaque nouveau profil.

---

## 2. Decision Summary

V1 introduit le concept central de:

**Deployable Agent Profile**

Un `Deployable Agent Profile` est une definition versionnee qui declare:
- les capabilities necessaires
- les actions autorisees
- les integrations locales autorisees
- les helper agents delegables
- les sources d'evenements supportees
- les policies par defaut
- le comportement de seat
- le niveau de risque et de gouvernance du profil

Regles V1:

1. Tout agent deploye sur `nexus-enterprise` doit referencer un `profile_key`.
2. Un profil ne donne jamais acces directement a des primitives brutes hors registry.
3. Les privileges viennent du profil + policy client, pas du prompt.
4. Un profil peut composer des `capability packs`.
5. `AV Manager` n'est qu'un profil parmi d'autres.

---

## 3. Goals

### In Scope

- definir le contrat d'un `Deployable Agent Profile`
- definir le modele de composition par capabilities
- definir les registres minimaux a maintenir
- definir les invariants runtime communs
- definir les interactions avec event ingestion, policy engine et seat accounting

### Out of Scope

- marketplace UI complete
- DSL de profil finale
- heritages multiples complexes
- migration de tous les profils existants en une passe

---

## 4. Design Principles

- Profile first.
- Default deny.
- Capability composition over ad hoc branching.
- No hidden privileged path.
- Seat impact must be explicit.
- Client governance must stay coherent across profiles.
- Administrative and technical profiles must not share the same default trust.

---

## 5. Core Entities

### 5.1 Deployable Agent Profile

Objet logique representant un agent deployable sur un node enterprise.

Champs minimaux V1:

```json
{
  "profile_key": "av_manager",
  "version": "1.0.0",
  "name": "AV Manager",
  "category": "operations",
  "agent_level": 2,
  "description": "Monitors AV rooms and runs bounded remediation",
  "deployment_modes": ["fixed", "elastic"],
  "seat_class": "standard_agent",
  "required_capabilities": ["event_ingestion", "ticketing", "device_diagnostics"],
  "optional_capabilities": ["reporting", "helper_delegation"],
  "action_catalog_ref": "catalog.av_manager.v1",
  "policy_bundle_ref": "policy.av_manager.default.v1",
  "local_integrations_ref": "local_integrations.av_manager.v1",
  "helper_agent_rules_ref": "helper_rules.av_manager.v1",
  "supported_event_sources": ["webhook", "schedule", "operator_chat"],
  "status": "active"
}
```

### 5.2 Capability Pack

Brique fonctionnelle reutilisable par plusieurs profils.

Exemples:
- `event_ingestion`
- `ticketing`
- `reporting`
- `document_generation`
- `network_checks`
- `identity_lookup`
- `local_api_bridge`

### 5.3 Action Catalog

Catalogue d'actions bornees disponibles pour un profil.

### 5.4 Policy Bundle

Base de gouvernance appliquee a un profil avant personnalisation client.

### 5.5 Local Integration Registry

Liste des integrations API locales ou privees utilisables par le profil.

### 5.6 Helper Delegation Rules

Regles qui disent quels helper agents un profil peut invoquer, et sous quelles conditions.

### 5.7 Agent Level

Classification de risque et de gouvernance attachee au profil.

V1 supporte:
- `1` = administrative
- `2` = operational
- `3` = technical_privileged

---

## 6. Runtime Invariants

V1 impose les invariants suivants:

1. Un agent actif sans `profile_key` valide est interdit.
2. Un profil ne peut utiliser que:
   - ses capabilities declarees
   - ses actions cataloguees
   - ses integrations en registry
   - ses helper agents autorises
3. Toute execution passe par le `Policy Engine`.
4. Toute activation d'agent actif passe par le `Seat Accounting`.
5. Toute source d'evenement doit etre normalisee avant dispatch.
6. Le `agent_level` influence les defaults de gouvernance, mais ne remplace jamais la policy explicite.
7. La compatibilite exacte entre `agent_level`, capabilities et tools doit suivre la `Agent Level Capability Matrix`.

---

## 7. Capability Composition Model

### 7.1 Why Capabilities

Sans capabilities partagees:
- chaque nouveau profil duplique sa logique
- la gouvernance diverge
- le runtime se fragmente

### 7.2 Capability Contract

Chaque `capability pack` doit declarer:

```json
{
  "capability_key": "ticketing",
  "version": "1.0.0",
  "provides": [
    "create_ticket",
    "update_ticket",
    "link_incident"
  ],
  "requires": [
    "policy_engine"
  ],
  "optional": [
    "event_ingestion"
  ]
}
```

### 7.3 V1 Capability Families

- `event_ingestion`
- `ticketing`
- `reporting`
- `local_api_bridge`
- `helper_delegation`
- `device_diagnostics`
- `network_checks`
- `document_generation`
- `workspace_knowledge_access`
- `email_dispatch`

---

## 8. Profile Categories

### 8.1 Operations

Profils fortement lies a des systemes locaux.

Exemples:
- `av_manager`
- `it_helpdesk`
- `network_ops`

### 8.2 Knowledge

Profils principalement cognitifs et documentaires.

Exemples:
- `bid_manager`
- `report_writer`
- `compliance_assistant`

### 8.3 Hybrid

Profils melangeant execution locale et production documentaire.

Exemples:
- `site_operations`
- `executive_operations`

La categorie aide l'UI et le packaging, mais ne remplace pas les controls fins.

---

## 8.b Agent Levels

### Level 1: Administrative

Profils centres sur:
- documents
- reporting
- knowledge work
- coordination

Defaults V1:
- capabilities a faible risque
- peu ou pas d'integrations locales privilegiees
- action catalogs surtout documentaires
- approvals rares hors sujets data/compliance

### Level 2: Operational

Profils centres sur:
- diagnostics
- remediation bornees
- ITSM
- event handling

Defaults V1:
- support des integrations locales bornees
- support des helper agents si policy explicite
- mix de `allow`, `dry_run`, `approval_required`

### Level 3: Technical Privileged

Profils centres sur:
- domaines infra critiques
- identite
- reseau
- actions avec blast radius plus fort

Defaults V1:
- governance plus stricte
- policies plus restrictives
- approvals frequentes
- audit renforce
- support des credentials sensibles uniquement via integrations bornees

### V1 Rule

`agent_level` sert a:
- preconfigurer les capabilities candidates
- orienter les defaults du policy bundle
- informer l'UI de gouvernance et de risque

`agent_level` ne sert pas a:
- bypass la policy
- accorder des privileges automatiques
- remplacer le catalogue d'actions

---

## 9. Deployment Modes

### 9.1 Fixed

Agent lance de facon persistante au demarrage du node.

### 9.2 Elastic

Agent active a la demande ou sur evenement.

### 9.3 Registered

Profil connu du node mais non actif.

Un profil peut supporter plusieurs modes.  
Le mode reel d'activation reste borne par les seats disponibles.

---

## 10. Registry Model

V1 requiert au minimum:

- `deployable_agent_profiles`
- `capability_packs`
- `action_catalogs`
- `policy_bundles`
- `local_integration_registries`
- `helper_delegation_rules`

### 10.1 Minimal Profile Registry Record

```json
{
  "profile_key": "it_helpdesk",
  "version": "1.0.0",
  "name": "IT Helpdesk",
  "category": "operations",
  "agent_level": 2,
  "status": "active",
  "deployment_modes": ["fixed", "elastic"],
  "seat_class": "standard_agent"
}
```

---

## 11. Interaction With Other Specs

### 11.1 Event Ingestion

Un profil declare:
- quelles sources d'evenements il supporte
- quels types d'evenements il sait traiter
- quelles actions ou routes de sortie il peut declencher

### 11.2 Seat Accounting

Le `Deployable Agent Profile` ne contourne jamais les regles seat:
- actif = consomme un seat
- helper actif = consomme un seat
- integration locale = pas de seat supplementaire

### 11.3 Policy Engine

Le `Policy Engine` evalue:
- le profil
- le `agent_level`
- l'action
- la source
- le contexte
- le scope client

### 11.4 Local Integrations

Une integration locale est une extension technique d'un profil, pas un agent cache.

---

## 12. Example Profiles

### 12.1 AV Manager

```json
{
  "profile_key": "av_manager",
  "category": "operations",
  "agent_level": 2,
  "required_capabilities": ["event_ingestion", "ticketing", "device_diagnostics", "local_api_bridge"],
  "optional_capabilities": ["reporting", "helper_delegation"]
}
```

### 12.2 IT Helpdesk

```json
{
  "profile_key": "it_helpdesk",
  "category": "operations",
  "agent_level": 2,
  "required_capabilities": ["ticketing", "reporting", "local_api_bridge"],
  "optional_capabilities": ["event_ingestion", "helper_delegation", "identity_lookup"]
}
```

### 12.3 Bid Manager

```json
{
  "profile_key": "bid_manager",
  "category": "knowledge",
  "agent_level": 1,
  "required_capabilities": ["document_generation", "workspace_knowledge_access", "email_dispatch"],
  "optional_capabilities": ["reporting"]
}
```

### 12.4 Report Writer

```json
{
  "profile_key": "report_writer",
  "category": "knowledge",
  "agent_level": 1,
  "required_capabilities": ["document_generation", "workspace_knowledge_access"],
  "optional_capabilities": ["email_dispatch", "reporting"]
}
```

Ces profils montrent que le meme framework doit couvrir des besoins tres differents.

---

## 13. UX and Governance Implications

Le client doit voir, pour chaque profil:
- sa mission
- son `agent_level`
- ses capabilities
- ses actions disponibles
- ses integrations locales
- ses helper agents autorises
- son mode de deploiement
- son impact seat

Le client ne doit jamais avoir l'impression d'activer:
- une boite noire
- un shell habille
- un swarm non borne

---

## 14. Implementation Guidance

### 14.1 V1 Build Order

1. Introduire le `profile_key` comme identifiant obligatoire des agents enterprise.
2. Ajouter un registry minimal des profils deployables.
3. Relier chaque profil a:
   - un action catalog
   - un policy bundle
   - un local integration registry
   - des helper delegation rules
4. Faire de `AV Manager` le premier profil officiel.
5. Faire de `IT Helpdesk` le deuxieme profil officiel pour valider la genericite du modele.
6. Faire apparaitre `agent_level` dans l'UI de gouvernance et dans les defaults de profile creation.
7. Brancher le wizard et le runtime sur la `Agent Level Capability Matrix`.

### 14.2 Migration Rule

Tout nouveau profil enterprise doit etre ajoute via le registry et non par logique ad hoc dans le runtime.

---

## 15. Non-Goals and Anti-Patterns

### Non-Goals

- laisser chaque agent definir ses propres privileges au prompt
- multiplier les exceptions profile-specific dans le runtime
- faire des helper agents hors policy ou hors seat

### Anti-Patterns

- "profil" qui n'est qu'un shell libre avec un nom marketing
- "integration locale" qui spawn en realite un agent non compte
- "profil knowledge" qui obtient des privileges operations sans catalog explicite

---

## 16. Acceptance Criteria

- [ ] Tout agent enterprise a un `profile_key`
- [ ] Le registry de profils existe
- [ ] Un profil declare ses capabilities et son action catalog
- [ ] Les integrations locales sont profile-scoped
- [ ] Les helper agents sont profile-scoped et seat-aware
- [ ] `AV Manager` et `IT Helpdesk` peuvent etre ajoutes sans changer l'architecture
- [ ] `Bid Manager` et `Report Writer` peuvent etre modeles sans privilege operations implicite
