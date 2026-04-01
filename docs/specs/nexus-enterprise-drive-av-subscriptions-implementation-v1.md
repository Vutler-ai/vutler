# Nexus Enterprise Drive + AV Subscriptions Implementation V1

## Scope

Ce document capture l'etat implemente dans le repo pour trois briques liees:

- provision automatique d'un repo Drive a la creation d'un deployment `nexus-enterprise`
- exploitation d'un inventaire AV fourni en `xlsx`, `csv`, `tsv` ou `json`
- preparation gouvernee des subscriptions / webhooks temps reel pour `Microsoft Graph`, `Zoom`, `Google` ou une source HTTP generique

L'objectif n'est pas encore de faire un `auto-provisioning` complet pour tous les providers.  
L'objectif de cette phase est:

- que le deployment enterprise cree son espace de contexte et de synchro
- que l'`AV Manager` puisse partir d'un fichier client reel
- que Vutler sache preparer, stocker, auditer et verifier les subscriptions live

---

## 1. Implemented Architecture

### 1.1 Enterprise Drive Repo Provisioning

Au moment de `POST /api/v1/nexus/tokens/enterprise`, Vutler cree automatiquement un namespace Drive dedie au deployment enterprise.

Implementation:

- [api/nexus.js](/Users/alopez/Devs/Vutler/api/nexus.js)
- [services/nexusEnterpriseDrive.js](/Users/alopez/Devs/Vutler/services/nexusEnterpriseDrive.js)

Layout cree:

- `/Nexus Enterprise/<client>-<node>/shared/context/`
- `/Nexus Enterprise/<client>-<node>/shared/inventory/`
- `/Nexus Enterprise/<client>-<node>/shared/reports/`
- `/Nexus Enterprise/<client>-<node>/shared/playbooks/`
- `/Nexus Enterprise/<client>-<node>/shared/policies/`
- `/Nexus Enterprise/<client>-<node>/shared/event-subscriptions/`
- `/Nexus Enterprise/<client>-<node>/nodes/<node>/imports/`
- `/Nexus Enterprise/<client>-<node>/nodes/<node>/artifacts/`
- `/Nexus Enterprise/<client>-<node>/nodes/<node>/logs/`

Un `README.md` de contexte est aussi cree dans `shared/context/`.

### 1.2 Wizard Exposure

Le wizard de deployment enterprise affiche desormais le repo Drive provisionne au moment ou le token est genere.

Implementation:

- [frontend/src/app/(app)/nexus/page.tsx](/Users/alopez/Devs/Vutler/frontend/src/app/(app)/nexus/page.tsx)
- [frontend/src/lib/api/types.ts](/Users/alopez/Devs/Vutler/frontend/src/lib/api/types.ts)

Le user voit:

- le `rootPath`
- le chemin `context`
- le chemin `inventory`
- le chemin `node imports`

Ce point est important parce que le repo Drive fait maintenant partie du setup standard du deployment, pas d'une configuration secondaire.

---

## 2. Structured Inventory Parsing

### 2.1 Drive Parsing Endpoint

Le Drive sait maintenant parser du contenu structure:

- `xlsx`
- `xls`
- `csv`
- `tsv`
- `json`

Implementation:

- [api/drive.js](/Users/alopez/Devs/Vutler/api/drive.js)
- [packages/nexus/lib/providers/workspace-drive.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/providers/workspace-drive.js)

New endpoint:

- `GET /api/v1/drive/parsed/:id`

Il retourne:

- `type`
- `tables[]`
- `headers`
- `rows`
- `rowCount`

### 2.2 Search Fallback

Le search Drive a aussi un fallback S3 plus robuste quand l'index ne repond pas ou retourne vide.

Cela rend plus fiable:

- la localisation d'un inventaire AV
- les recherches documentaires enterprise
- le `workspace_document_picker`

Implementation:

- [api/drive.js](/Users/alopez/Devs/Vutler/api/drive.js)

---

## 3. AV Inventory Resolution

### 3.1 Runtime Behavior

L'`AV Manager` peut maintenant resoudre une salle a partir:

- d'un `inventoryPath`
- d'un `inventoryFileId`
- d'un `roomName`
- d'un `room`
- d'un `roomId`
- d'un `host`
- d'un `sourceResource`

Implementation:

- [packages/nexus/lib/enterprise-action-executor.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/enterprise-action-executor.js)

Main runtime helpers:

- `_resolveAvRoom()`
- `_loadAvInventoryRows()`
- `_resolveDriveFileByPath()`
- `_matchAvInventoryRow()`
- `_normalizeRoomInventoryRow()`

### 3.2 Supported Column Mapping

Le normalizer supporte les colonnes usuelles suivantes:

- `room_name`, `room`, `name`
- `room_id`
- `platform`
- `integration_key`
- `source_resource`
- `host`, `ip`, `ip_address`, `hostname`
- `port`
- `mac`
- `protocol`
- `allow_self_signed`
- `status_path`
- `username`, `password`, `token`
- `auth_type`
- `restart_path`, `restart_method`, `restart_body`, `restart_port`
- `snmp_community`, `snmp_oid`
- `extra_http_paths`

### 3.3 AV Actions Now Using Inventory Context

Les actions suivantes peuvent maintenant tirer leurs parametres depuis l'inventaire:

- `check_room_health`
- `get_room_diagnostics`
- `restart_room_system`
- `provision_room_event_subscription`

Implementation:

- [packages/nexus/lib/enterprise-action-executor.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/enterprise-action-executor.js)
- [packages/nexus/lib/providers/av-control.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/providers/av-control.js)

Le provider AV supporte maintenant aussi:

- auth `basic`
- auth `bearer`
- auth via header custom
- mode `https`
- `allowSelfSigned`

Ce point est critique pour les APIs locales AV reelles.

---

## 4. Event Subscription Preparation

### 4.1 Subscription Registry

Vutler stocke maintenant les subscriptions enterprise dans une table dediee.

Implementation:

- [services/nexusEnterpriseEventSubscriptions.js](/Users/alopez/Devs/Vutler/services/nexusEnterpriseEventSubscriptions.js)
- [api/nexus-enterprise.js](/Users/alopez/Devs/Vutler/api/nexus-enterprise.js)

New endpoints:

- `GET /api/v1/nexus-enterprise/event-subscriptions`
- `POST /api/v1/nexus-enterprise/event-subscriptions`

Stored fields:

- `provider`
- `profile_key`
- `agent_id`
- `subscription_type`
- `source_resource`
- `room_name`
- `events`
- `status`
- `delivery_mode`
- `callback_path`
- `verification_secret`
- `config`

### 4.2 Enterprise Webhook Receiver

Vutler expose maintenant un recepteur enterprise dedie.

Implementation:

- [api/webhooks/enterprise.js](/Users/alopez/Devs/Vutler/api/webhooks/enterprise.js)
- [api/webhook-routes.js](/Users/alopez/Devs/Vutler/api/webhook-routes.js)

Route:

- `POST /api/v1/webhooks/enterprise/:token`

Behavior:

- retrouve la subscription via `callback_path`
- verifie le secret
- log l'evenement dans `workspace_integration_logs`
- marque la subscription comme ayant recu un evenement

### 4.3 Runtime Preparation Hints

L'`AV Manager` sait maintenant preparer une subscription gouvernee via:

- `provision_room_event_subscription`

Implementation:

- [packages/nexus/lib/enterprise-action-executor.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/enterprise-action-executor.js)
- [packages/nexus/lib/providers/workspace-event-subscriptions.js](/Users/alopez/Devs/Vutler/packages/nexus/lib/providers/workspace-event-subscriptions.js)
- [packages/nexus/index.js](/Users/alopez/Devs/Vutler/packages/nexus/index.js)

Le resultat contient:

- la subscription creee cote Vutler
- le `callbackUrl`
- le `verificationSecret`
- un `registrationHint` adapte au provider

Providers prepares:

- `microsoft_graph`
- `zoom`
- `google`
- `generic_http`

Le `registrationHint` contient:

- l'endpoint cible du provider
- le payload a soumettre
- les notes de gouvernance / renouvellement

---

## 5. Registry Alignment

Le registry enterprise AV est maintenant aligne avec le runtime.

Implementation:

- [seeds/nexus-enterprise/action-catalogs/catalog.av_manager.v1.json](/Users/alopez/Devs/Vutler/seeds/nexus-enterprise/action-catalogs/catalog.av_manager.v1.json)
- [seeds/nexus-enterprise/local-integrations/local_integrations.av_manager.v1.json](/Users/alopez/Devs/Vutler/seeds/nexus-enterprise/local-integrations/local_integrations.av_manager.v1.json)

New catalog action:

- `provision_room_event_subscription`

New local/workspace integrations:

- `microsoft_graph_room_events`
- `zoom_room_events`
- `google_room_events`

---

## 6. Current Product Position

Le produit est maintenant dans cet etat:

- Vutler cree le repo Drive enterprise
- le client/partenaire peut y deposer les fichiers de contexte et l'inventaire AV
- l'agent peut resoudre une salle a partir du fichier
- l'agent peut surveiller / diagnostiquer / redemarrer avec les parametres issus de l'inventaire
- Vutler peut creer la subscription interne et preparer le provisioning live monitoring

Ce n'est pas encore un `full auto provisioning` externe.

Le bon framing de la phase actuelle est:

- `manual`
- `assisted`

Pas encore:

- `automatic` complet cote provider

---

## 7. Remaining Gaps

Ce qui reste a faire avant de considerer la couche live monitoring complete:

1. Auto-provisioning reel provider par provider
- `Microsoft Graph`
- `Zoom`
- `Google`

2. Lifecycle management des subscriptions
- renewal
- expiration handling
- cleanup
- disable / pause / rotate

3. Event normalization plus riche
- mapping payload provider -> event canonique
- correlation vers `room`, `site`, `asset`
- dedup
- severity mapping

4. Secrets hygiene
- importer les credentials depuis le spreadsheet
- les normaliser ensuite dans un vault ou registry gouverne
- eviter de laisser les secrets durablement dans Drive

5. UI operations
- vue des subscriptions par node / deployment
- statut de derniere reception
- mode `manual / assisted / automatic`

---

## 8. Recommended Next Phases

### Phase A — Assisted Provisioning UX

- afficher `manual / assisted / automatic`
- permettre au partenaire/client de finaliser la registration avec les payloads prepares
- verifier la reception du premier evenement

### Phase B — Microsoft Graph Auto-Provisioning

- premier provider a automatiser reellement
- meilleur ROI enterprise
- surface API plus gouvernable que d'autres connectors

### Phase C — Zoom / Google

- automatisation conditionnelle selon le type d'app et les droits admin disponibles
- fallback `assisted` si le contexte client impose une validation manuelle

---

## 9. Verification Snapshot

Validated during implementation:

- `node --check` sur les nouveaux fichiers backend/runtime
- `cd frontend && pnpm exec tsc --noEmit --pretty false`
- smoke test runtime:
  - resolution de salle depuis `rooms.xlsx`
  - `check_room_health`
  - `restart_room_system`
  - `provision_room_event_subscription`

Le smoke test confirme:

- resolution correcte de la salle depuis l'inventaire
- reprise correcte de `host`, `port`, `auth`, `allowSelfSigned`, `restartRequest`
- generation correcte des hints `Microsoft Graph`
