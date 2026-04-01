# Nexus Enterprise Agent Tooling Gap Matrix V1

> **Status:** Draft - 2026-04-01
> **Type:** Product + Implementation Matrix
> **Owner:** Codex
> **Scope:** `AV Manager`, `IT Helpdesk`, `Bid Manager`, `Report Writer`

---

## 1. Decision Summary

Un agent specialise ne doit pas etre considere comme "pro-like" uniquement parce qu'il a:
- un template
- un profil
- un action catalog

Il doit aussi avoir un **tooling metier reellement executable**.

V1 fixe donc une lecture simple:

- **profile** = identite produit et gouvernance
- **action catalog** = surface d'actions autorisees
- **tools / integrations** = moyens d'execution reels
- **agent ready level** = niveau de maturite commercialisable

---

## 2. Ready Levels

### Level A — Catalog Only

Le profil existe, les actions existent sur le papier, mais les integrations ne sont pas assez branchees.

Le template peut etre visible en `beta`, mais ne doit pas etre presente comme pleinement operationnel.

### Level B — MVP Ready

Le profil a:
- un runtime clair
- au moins un connecteur metier reel
- un flux de reporting
- un flux de ticketing ou de delivery si le use case l'exige

Le template peut etre vendu comme premier MVP specialise.

### Level C — Pro Ready

Le profil a:
- plusieurs connecteurs reels
- evidences/audit
- erreurs et retries propres
- UX/wizard specialise
- garde-fous et policies coherents

---

## 3. Existing Runtime Inventory

### 3.1 Deja present dans le repo

#### AV / local device runtime

Existant dans `packages/nexus/lib/providers/av-control.js`:
- network scan
- SNMP GET / SET
- HTTP control
- telnet command
- Teams Room diagnostics endpoint
- Zoom Room status endpoint
- TV / projector control helpers

#### Enterprise dispatch and policy

Existant dans:
- `packages/nexus/lib/enterprise-policy-engine.js`
- `packages/nexus/lib/local-integration-bridge.js`

Le runtime enterprise sait deja gerer:
- `catalog_action`
- `local_integration`
- `helper_delegation`

Mais le bridge local est encore limite a:
- HTTP `GET`
- HTTP `POST`

#### Ticketing

Existant dans `api/jira.js` et `services/integrations/jira.js`:
- list/search issues
- create issue
- update issue
- comment
- transitions

#### Reporting / delivery

Existant dans:
- `services/postalMailer.js`
- Browser Operator evidence/reporting stack dans `services/browserOperator/*`

#### Workspace knowledge / documents

Existant partiellement dans:
- `api/memory.js` pour `workspace-knowledge` en lecture
- `services/agentConfigPolicy.js` + tool surface `workspace_drive_*`
- document readers dans `packages/nexus/lib/providers/documents/*`

### 3.2 Deja modele mais pas encore assez branche

Existant dans `seeds/nexus-enterprise/*`:
- profiles
- action catalogs
- local integrations
- helper rules
- policy bundles

Donc la **gouvernance et le catalogue** existent deja pour:
- `av_manager`
- `it_helpdesk`
- `bid_manager`
- `report_writer`

Le vrai gap est surtout dans les **connecteurs et runtimes metier**.

---

## 4. Matrix By Agent

## 4.1 AV Manager

### Product status

- **Current:** `Level B-` / beta
- **Can be exposed now:** oui, comme profil specialise `Nexus Enterprise`
- **Can be sold as fully ready:** pas encore

### Existing

- profil enterprise seeded
- action catalog seeded:
  - `check_room_health`
  - `get_room_diagnostics`
  - `restart_room_system`
  - `open_incident_ticket`
  - `send_daily_report`
- local integrations seeded:
  - `teams_rooms_local_api`
  - `zoom_rooms_local_api`
- provider AV reel dans `packages/nexus/lib/providers/av-control.js`
- policy / approvals / helper delegation existants
- ticketing Jira existe
- email reporting existe

### Missing tools

- vrai connecteur enterprise `teams_rooms_local_api` branche au runtime policy-driven
- vrai connecteur `zoom_rooms_local_api` branche au runtime policy-driven
- mapping asset/room/site propre
- connecteur AV plus normalise:
  - Crestron
  - Extron
  - PJLink
  - generic display / codec operations
- event ingestion specialise AV:
  - webhook payload normalization
  - dedupe
  - correlation par room
- reporting salle/site plus propre

### MVP must-have

- `check_room_health`
- `get_room_diagnostics`
- `restart_room_system`
- `open_incident_ticket` via Jira
- `send_daily_report` via Postal
- au moins 1 ou 2 integrations reelles:
  - Teams Rooms
  - Zoom Rooms

### Later

- ServiceNow
- SNMP profiles packages par constructeur
- room inventory sync
- SLA / trend reports

---

## 4.2 IT Helpdesk

### Product status

- **Current:** `Level B-` / beta
- **Can be exposed now:** oui, comme profil specialise `Nexus Enterprise`
- **Can be sold as fully ready:** pas encore

### Existing

- profil enterprise seeded
- action catalog seeded:
  - `triage_incident`
  - `create_helpdesk_ticket`
  - `update_helpdesk_ticket`
  - `collect_endpoint_context`
  - `send_incident_summary`
- helper delegation vers `report_writer`
- Jira existe deja
- Postal existe deja
- governance/approvals existent deja

### Missing tools

- vrai connecteur `endpoint_status_api`
- connecteur endpoint diagnostics plus concret:
  - device health
  - service status
  - logs de base
  - network reachability
- connecteurs identity / directory:
  - user lookup
  - group lookup
  - password reset borne
- connecteurs MDM / EDR / ITSM
- runbooks bornees de remediation

### MVP must-have

- `triage_incident`
- `create_helpdesk_ticket`
- `update_helpdesk_ticket`
- `collect_endpoint_context` branche a un endpoint local reel
- `send_incident_summary`

### Later

- ServiceNow
- Entra ID / Google Workspace admin read-only
- password reset borne
- endpoint actions bornees

---

## 4.3 Bid Manager

### Product status

- **Current:** `Level A+`
- **Can be exposed now:** oui, mais surtout comme profile catalogue / beta
- **Can be sold as real MVP:** presque, si on branche correctement documents + workspace knowledge + email

### Existing

- profil enterprise seeded
- action catalog seeded:
  - `draft_bid_outline`
  - `summarize_rfp`
  - `assemble_bid_sources`
  - `draft_bid_email`
- workspace knowledge read existe
- workspace drive/read/search existe dans la stack agent
- email delivery existe via Postal

### Missing tools

- retrieval de knowledge vraiment branche dans le runtime enterprise profile-driven
- bibliotheque de templates de reponse / proposals
- source assembler sur dossiers/drive
- structured bid workspace:
  - RFP
  - annexes
  - boilerplate
  - previous answers
- export package propre
- CRM / deal context optionnel

### MVP must-have

- `summarize_rfp`
- `assemble_bid_sources`
- `draft_bid_outline`
- `draft_bid_email`
- acces workspace drive/knowledge fiable

### Later

- Salesforce / HubSpot
- proposal template packs
- redline / compare versions
- collaborative review workflow

---

## 4.4 Report Writer

### Product status

- **Current:** `Level A+`
- **Can be exposed now:** oui, comme profil specialise
- **Can be sold as real MVP:** oui plus vite que les autres, car le tooling requis est moins risqué

### Existing

- profil enterprise seeded
- action catalog seeded:
  - `draft_report`
  - `summarize_inputs`
  - `compile_sections`
  - `prepare_delivery_email`
- workspace knowledge / workspace drive existent partiellement
- Postal existe
- document readers existent

### Missing tools

- report template registry
- structured section compiler
- export propre:
  - markdown
  - html
  - pdf / docx ensuite
- source picker plus borne
- delivery workflow plus clair

### MVP must-have

- `draft_report`
- `summarize_inputs`
- `compile_sections`
- `prepare_delivery_email`
- read/search workspace documents

### Later

- PDF / DOCX export
- branded report packs
- scheduled report jobs
- multi-source evidence sections

---

## 5. Priority Order

### P0

Le meilleur ordre de build n'est pas "finir tous les agents en parallele".

Il faut partir des agents qui demandent le moins de tooling nouveau pour devenir vraiment utiles.

### Recommended order

1. `Report Writer`
2. `Bid Manager`
3. `AV Manager`
4. `IT Helpdesk`

### Why

- `Report Writer` a le plus faible blast radius et reutilise beaucoup de briques deja presentes
- `Bid Manager` est surtout un probleme de retrieval + templates + delivery
- `AV Manager` demande de vrais connecteurs metier mais le use case est tres fort
- `IT Helpdesk` est potentiellement le plus large et le plus tentant a sur-promettre

---

## 6. Tool Backlog By Agent

## 6.1 Report Writer

### Build first

- `workspace_knowledge_retriever`
- `workspace_document_picker`
- `report_template_renderer`
- `report_delivery_mailer`

### Nice to have

- `report_export_pdf`
- `report_export_docx`

## 6.2 Bid Manager

### Build first

- `rfp_parser`
- `proposal_source_assembler`
- `bid_outline_generator`
- `bid_submission_mailer`

### Nice to have

- `crm_deal_context`
- `proposal_diff`

## 6.3 AV Manager

### Build first

- `teams_rooms_connector`
- `zoom_rooms_connector`
- `av_ticketing_bridge`
- `av_room_reporter`

### Nice to have

- `crestron_connector`
- `extron_connector`
- `pjlink_connector`

## 6.4 IT Helpdesk

### Build first

- `endpoint_context_connector`
- `helpdesk_ticket_bridge`
- `incident_summary_mailer`

### Nice to have

- `identity_lookup_connector`
- `password_reset_connector`
- `servicenow_bridge`

---

## 7. Product Rule

Un template specialise peut etre **visible** avant que tous ses tools soient finis.

Mais:

- si les tools metier sont encore incomplets:
  - il doit etre marque `beta`
  - il doit ouvrir une surface specialisee
  - il ne doit pas etre cree comme simple agent generique

- si le runtime metier minimum est branche:
  - il peut etre positionne `MVP ready`

---

## 8. Recommended Next Implementation Chunk

Le meilleur prochain chunk est:

### Chunk F — Knowledge + Reporting Tools

Objectif:
- faire passer `Report Writer` en vrai `Level B / MVP Ready`
- faire passer `Bid Manager` en quasi-MVP

Contenu:
- tool `workspace_knowledge_retriever`
- tool `workspace_document_picker`
- tool `report_template_renderer`
- tool `report_delivery_mailer`
- binding enterprise action -> real tool execution

Ensuite:

### Chunk G — AV Connectors

- `teams_rooms_connector`
- `zoom_rooms_connector`
- `av_ticketing_bridge`
- `av_room_reporter`

Ensuite:

### Chunk H — IT Helpdesk Connectors

- `endpoint_context_connector`
- `helpdesk_ticket_bridge`
- `incident_summary_mailer`

