# Nexus Enterprise Backend Rollout Plan V1

> **Status:** Draft — 2026-03-31
> **Type:** Rollout Plan
> **Owner:** Codex
> **Scope:** SQL migrations, registry services, API rollout, wizard integration, Nexus runtime validation

---

## 1. Purpose

Ce document transforme les specs precedentes en **plan d'execution concret** pour le repo actuel.

Le principe est simple:
- ne pas rewriter tout `api/nexus.js` d'un coup
- introduire les registries et validations par couches
- garder la compatibilite avec le flow Nexus existant
- brancher progressivement le wizard et le runtime sur le nouveau modele

---

## 2. Current Repo Anchors

Les points d'entree actuels a utiliser sont:

### Backend API

- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)

Ce fichier gere deja:
- creation des nodes enterprise
- gestion des seats
- spawn/stop/create agent
- dispatch
- heartbeat runtime
- agent config fetch

### Backend Services

- [services/](/Users/alopez/Devs/Vutler/services)

Il faut y ajouter les services de registry et de validation plutot que d'alourdir `api/nexus.js`.

### Frontend Wizard and Node UI

- [frontend/src/app/(app)/nexus/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/nexus/page.tsx)
- [frontend/src/app/(app)/nexus/[id]/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/nexus/[id]/page.tsx)
- [frontend/src/lib/api/endpoints/nexus.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/endpoints/nexus.ts)

### Nexus Runtime

- [packages/nexus/lib/agent-manager.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/agent-manager.js)
- [packages/nexus/lib/agent-worker.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/agent-worker.js)
- [packages/nexus/](/Users/alopez/Devs/Vutler/packages/nexus)

### Seeds

- [seeds/](/Users/alopez/Devs/Vutler/seeds)

Le nouveau pack doit vivre sous `seeds/nexus-enterprise/`.

---

## 3. Rollout Strategy

Le rollout doit suivre trois contraintes:

1. **Backward compatible first**
   - les nodes enterprise existants doivent continuer a fonctionner

2. **Registry before enforcement**
   - on introduit les registres avant de bloquer le runtime

3. **Validation before privilege**
   - aucun nouveau pouvoir profile-driven ne doit etre active sans garde-fou

### Current Implementation Status

Les chunks suivants sont maintenant implementes dans le repo:

- **Chunk A**
  - SQL registry layer
  - seed loader
  - read APIs

- **Chunk B**
  - validation API wizard
  - selection `profile_key` cote frontend

- **Chunk C**
  - binding runtime `enterprise_profile`
  - validation runtime profile-driven

- **Chunk D**
  - `EnterprisePolicyEngine`
  - enterprise dispatch pour:
    - `enterprise_action`
    - `enterprise_local_api`
    - `enterprise_helper`

- **Chunk E**
  - approval requests
  - audit trail
  - process-scoped approvals
  - email de validation client via Vutler mail
  - bypass explicite `full_access`

---

## 4. Phase 0: Prep

### Goal

Poser les constantes de projet et les points de branchement sans changer encore le comportement produit.

### Work

- creer le dossier `seeds/nexus-enterprise/`
- ajouter les docs/specs comme source de reference implementation
- identifier les fonctions de `api/nexus.js` a extraire progressivement

### Deliverables

- arborescence seed vide ou initiale
- liste des nouveaux services backend
- plan SQL confirme

### Files

- [seeds/](/Users/alopez/Devs/Vutler/seeds)
- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)

---

## 5. Phase 1: SQL Registry Layer

### Goal

Creer les tables de registry minimales sans impacter les routes existantes.

### Work

Ajouter des migrations ou `ensure*Tables()` pour:
- `enterprise_agent_profiles`
- `enterprise_capability_packs`
- `enterprise_agent_level_matrix`
- `enterprise_action_catalogs`
- `enterprise_policy_bundles`
- `enterprise_local_integration_registries`
- `enterprise_helper_agent_rules`

### Recommendation

Dans le repo actuel, la voie la plus pragmatique est:
- une fonction `ensureEnterpriseRegistryTables()` appelee depuis `api/nexus.js`
- puis migration vers vraies migrations plus tard si besoin

### File Targets

- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)

### Exit Criteria

- les tables existent
- aucun endpoint existant n'est casse
- le boot API reste stable

---

## 6. Phase 2: Seed Loader

### Goal

Pouvoir charger les profils et registries platform-managed depuis `seeds/nexus-enterprise/`.

### Work

Creer un service backend, par exemple:
- `services/nexusEnterpriseRegistry.js`

Responsabilites:
- charger les fichiers seed
- parser et valider les references croisees
- upsert en base
- resoudre `key + version`

### Suggested Functions

```js
loadEnterpriseSeedPack()
upsertEnterpriseRegistryRecord(kind, record)
getEnterpriseProfile(profileKey, version)
getEnterpriseCapability(capabilityKey, version)
getEnterpriseLevelMatrix(matrixKey, version)
getEnterpriseActionCatalog(profileKey, version)
getEnterprisePolicyBundle(profileKey, version)
getEnterpriseLocalIntegrationRegistry(profileKey, version)
getEnterpriseHelperRules(profileKey, version)
```

### File Targets

- [services/](/Users/alopez/Devs/Vutler/services)
- [seeds/](/Users/alopez/Devs/Vutler/seeds)

### Exit Criteria

- le seed pack V1 se charge sans references brisees
- `av_manager`, `it_helpdesk`, `bid_manager`, `report_writer` sont resolvables

---

## 7. Phase 3: Read APIs

### Goal

Exposer les registries au frontend et aux outils internes.

### Work

Ajouter des endpoints en lecture dans [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js):

```text
GET /api/v1/nexus-enterprise/profiles
GET /api/v1/nexus-enterprise/profiles/:profileKey
GET /api/v1/nexus-enterprise/capabilities
GET /api/v1/nexus-enterprise/agent-level-matrix
GET /api/v1/nexus-enterprise/action-catalogs/:profileKey
GET /api/v1/nexus-enterprise/policy-bundles/:profileKey
GET /api/v1/nexus-enterprise/local-integrations/:profileKey
GET /api/v1/nexus-enterprise/helper-rules/:profileKey
```

### Recommendation

Ne pas surcharger `api/v1/nexus/...` existant avec trop de semantics nouvelles.
Introduire plutot un sous-espace clair:

- `api/v1/nexus-enterprise/...`

### Frontend Additions

Ajouter des clients API dans:
- [frontend/src/lib/api/endpoints/nexus.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/endpoints/nexus.ts)

ou creer:
- `frontend/src/lib/api/endpoints/nexus-enterprise.ts`

### Exit Criteria

- le frontend peut lister les profils et lire la matrice
- aucune route Nexus existante n'est modifiee a risque

---

## 8. Phase 4: Wizard Validation API

### Goal

Rendre le wizard profile-driven sans encore imposer les blocages runtime les plus durs.

### Work

Ajouter un endpoint:

```text
POST /api/v1/nexus-enterprise/agents/validate-profile-selection
```

Input attendu:

```json
{
  "nodeId": "uuid-or-null",
  "profileKey": "av_manager",
  "deploymentMode": "fixed",
  "selectedCapabilities": ["event_ingestion", "ticketing"],
  "selectedLocalIntegrations": ["teams_rooms_local_api"],
  "selectedHelperProfiles": ["it_helpdesk"],
  "startActive": true
}
```

Validation:
- profil connu
- capabilities compatibles avec `agent_level`
- integrations compatibles
- helper rules compatibles
- impact seat calcule

### Suggested Service

- `services/nexusEnterpriseProvisioning.js`

### Exit Criteria

- le wizard peut afficher:
  - `agent_level`
  - restrictions
  - impact seat
  - erreurs de compatibilite

---

## 9. Phase 5: Wizard UI Rollout

### Goal

Brancher le wizard enterprise existant sur le modele de profils deployables.

### Work

Modifier [frontend/src/app/(app)/nexus/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/nexus/page.tsx):

- remplacer la logique trop libre de pool/primary par une selection de profils
- ajouter une etape `Select profile`
- ajouter une etape `Review level and risk posture`
- ajouter une etape `Review seat impact`

### Important Constraint

Le wizard actuel repose deja sur:
- `seats`
- `primaryAgentId`
- `poolAgentIds`
- `autoSpawnRules`

Il ne faut pas tout casser d'un coup.

Approche V1:
- garder le flow enterprise existant
- enrichir la selection d'agents avec `profile_key`
- garder compatibilite avec agents existants sans profil

### File Targets

- [frontend/src/app/(app)/nexus/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/nexus/page.tsx)
- [frontend/src/lib/api/endpoints/nexus.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/endpoints/nexus.ts)
- [frontend/src/lib/api/types.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/types.ts)

### Exit Criteria

- un nouveau node enterprise peut etre provisionne avec un profil explicite
- le wizard affiche les niveaux et warnings de risque

---

## 10. Phase 6: Agent Metadata Binding

### Goal

Attacher le `profile_key` et les references registry aux agents deployes.

### Work

Etendre le payload d'agent dans les routes existantes:
- `POST /api/v1/nexus/nodes/:nodeId/agents`
- `GET /api/v1/nexus/:nodeId/agent-configs/:agentId`
- `GET /api/v1/nexus/:nodeId/agent-configs`

Champs a ajouter en metadata/config:
- `profile_key`
- `profile_version`
- `agent_level`
- `deployment_mode`
- `capabilities`
- `action_catalog_ref`
- `policy_bundle_ref`
- `local_integrations_ref`
- `helper_rules_ref`

### File Targets

- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)

### Exit Criteria

- le runtime peut recevoir la definition profile-driven complete
- les agents existants sans `profile_key` continuent a fonctionner en mode legacy

---

## 11. Phase 7: Runtime Validation

### Goal

Ajouter des garde-fous dans le runtime Nexus avant execution.

### Work

Modifier [packages/nexus/lib/agent-manager.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/agent-manager.js) pour:
- verifier `profile_key` si present
- verifier la compatibilite seats/profile au spawn
- distinguer helper activation et simple integration locale

Ajouter un service runtime, par exemple:
- `packages/nexus/lib/profile-registry.js`
- `packages/nexus/lib/profile-validator.js`

Validation minimale:
- profil resolvable
- actions dans catalog
- integrations dans registry
- helper profile autorise
- compatibilite `agent_level`

### Important Rule

V1 doit etre progressive:
- si `profile_key` absent => mode legacy autorise
- si `profile_key` present mais invalide => reject de l'agent profile-driven

### Exit Criteria

- le runtime n'execute pas d'agent profile-driven invalide
- les nodes legacy restent stables

---

## 12. Phase 8: Dispatch Enforcement

### Goal

Bloquer les actions hors catalog et preparer le vrai policy-driven dispatch.

### Work

Brancher [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js) et le runtime sur ce pipeline:

1. identifier agent cible
2. lire `profile_key`
3. resoudre action catalog
4. verifier que l'action existe
5. determiner `tool_class`
6. verifier compatibilite matrix
7. evaluer policy
8. verifier seats si helper spawn
9. dispatch

### File Targets

- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)
- [packages/nexus/lib/agent-manager.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/agent-manager.js)
- [packages/nexus/lib/agent-worker.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/agent-worker.js)

### Exit Criteria

- un agent profile-driven ne peut pas sortir de son catalog
- un helper non autorise ne peut pas etre spawn
- une integration hors registry ne peut pas etre appelee

---

## 13. Phase 9: Policy Wiring

### Goal

Faire converger profils, matrix et policy engine.

### Work

Ajouter un service backend, par exemple:
- `services/nexusEnterprisePolicy.js`

Responsabilites:
- charger le `policy_bundle`
- appliquer les restrictions client futures
- produire un `decision`:
  - `allow`
  - `dry_run`
  - `approval_required`
  - `deny`

### Minimal V1

Commencer par:
- defaults platform-managed
- decisions derivees de `agent_level + tool_class + risk_level`

Puis seulement ensuite:
- policies custom client

### Exit Criteria

- les actions sensibles de `AV Manager` et futurs profils operations ne passent plus en execution libre

---

## 14. Phase 10: Observability and Audit

### Goal

Rendre le rollout lisible et exploitable.

### Work

Ajouter dans les journaux et retours API:
- `profile_key`
- `profile_version`
- `agent_level`
- `tool_class`
- `policy_decision`
- `seat_impact`
- `validation_error_code`

### File Targets

- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)
- [packages/nexus/lib/logger.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/logger.js)

### Exit Criteria

- un echec de config ou dispatch est compréhensible sans lire le code

---

## 15. Suggested New Service Files

Backend:
- [services/nexusEnterpriseRegistry.js](/Users/alopez/Devs/Vutler/services/nexusEnterpriseRegistry.js)
- [services/nexusEnterpriseProvisioning.js](/Users/alopez/Devs/Vutler/services/nexusEnterpriseProvisioning.js)
- [services/nexusEnterpriseMatrix.js](/Users/alopez/Devs/Vutler/services/nexusEnterpriseMatrix.js)
- [services/nexusEnterprisePolicy.js](/Users/alopez/Devs/Vutler/services/nexusEnterprisePolicy.js)

Runtime:
- [packages/nexus/lib/profile-registry.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/profile-registry.js)
- [packages/nexus/lib/profile-validator.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/profile-validator.js)

Ces chemins sont recommandes pour garder `api/nexus.js` et `agent-manager.js` sous controle.

---

## 16. SQL Rollout Order

Ordre recommande:

1. create registry tables
2. deploy API with seed loader
3. load seed pack
4. expose read APIs
5. ship wizard read-only support
6. ship validation API
7. ship provisioning metadata binding
8. ship runtime validation in soft mode
9. ship runtime enforcement for profile-driven agents

Pourquoi:
- les dependances de lecture doivent exister avant l'enforcement
- le frontend doit pouvoir lire avant d'ecrire
- le runtime doit pouvoir verifier avant de bloquer

---

## 17. Compatibility Rules

### Legacy Nodes

Les nodes enterprise existants sans `profile_key`:
- restent supportes
- restent visibles
- ne passent pas par les nouveaux blocages profile-driven

### New Profile-Driven Nodes

Les nouveaux nodes/agents profile-driven:
- doivent passer par validation
- doivent embarquer leur metadata de profil
- doivent etre soumis aux nouveaux garde-fous

### Migration Rule

Pas de migration destructive immediate des agents existants.

---

## 18. Risks

### Risk 1

Mettre toute la logique dans [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js) et recréer un monolithe difficile a maintenir.

### Risk 2

Faire diverger le wizard, le backend et le runtime sur la meme matrice.

### Risk 3

Bloquer trop tot les nodes legacy et casser l'existant.

### Risk 4

Laisser du `profile_key` cosmetique sans enforcement runtime reel.

---

## 19. Recommended Delivery Chunks

### Chunk A

Registry SQL + seed loader + read APIs

### Chunk B

Wizard profile selection + validation API

### Chunk C

Agent metadata binding + runtime profile resolution

### Chunk D

Dispatch enforcement + policy defaults

Chaque chunk doit pouvoir etre merge et deploye independamment.

---

## 20. Acceptance Criteria

- [ ] Les tables registry existent
- [ ] Le seed pack V1 peut etre charge
- [ ] Les profils peuvent etre lus via API
- [ ] Le wizard peut valider une selection de profil
- [ ] Un agent peut etre provisionne avec `profile_key`
- [ ] Le runtime peut resoudre et verifier un profil
- [ ] Les agents legacy continuent a fonctionner
- [ ] Les agents profile-driven sont bloques si invalides
- [ ] Le dispatch refuse les actions hors catalog

---

## 21. Recommended Next Step

Le prochain document utile n'est plus un brief produit.
C'est un backlog d'implementation executable, par fichier:

**`Nexus Enterprise Chunk A Implementation Checklist`**

avec:
- statements SQL exacts
- signatures des services backend
- routes a ajouter
- types frontend a introduire
