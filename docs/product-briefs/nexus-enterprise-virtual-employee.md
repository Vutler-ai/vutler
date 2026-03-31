# Product Brief: Nexus Enterprise Virtual Employee

**Date:** 2026-03-31  
**Author:** Codex  
**Status:** Draft

---

## Executive Summary

Objectif: faire de Nexus la couche d'execution enterprise de Vutler pour deployer un "employe virtuel" chez un client, dans son reseau, avec un cadre de securite et de gouvernance acceptable par une DSI.

Le cas d'usage de reference est un **Agent AV Manager** capable de:
- surveiller l'etat de Teams Rooms, Zoom Rooms, codecs, ecrans, projecteurs et peripheriques AV
- lancer des actions de remediation autorisees
- produire des rapports d'exploitation
- ouvrir ou enrichir des tickets dans les outils du client
- rester pilotable depuis Vutler sans donner a Vutler un acces illimite a l'environnement client

La these produit est simple: **Vutler orchestre, Nexus execute, le client gouverne**.

---

## Architecture At A Glance

```text
Vutler Cloud
- orchestration des agents
- UI operateur
- reporting transverse
- politiques et audit centralises

Nexus Enterprise Node (chez le client)
- runtime local
- providers locaux et reseau
- policy engine
- execution des runbooks
- queue offline
- integration avec systemes locaux via API
- delegation vers agents auxiliaires sur site

Client Control Plane
- permissions
- approbations
- restrictions par site, asset, action, horaire
- journal d'audit exploitable

Enterprise Integrations
- Teams Rooms
- Zoom Rooms
- AV vendors (Crestron, Extron, PJLink, SNMP)
- ITSM (Jira, ServiceNow, Freshservice)
- Webhooks entrants depuis les systemes clients
- Identity (SSO / SAML)
```

---

## Problem Statement

Aujourd'hui, Vutler sait deja deployer des Nexus nodes et executer des actions a distance, mais cela ne suffit pas encore pour une offre enterprise credible.

Le vrai besoin client n'est pas seulement:
- "faire tourner un agent chez nous"

Le vrai besoin est:
- "faire tourner un agent chez nous sans perdre le controle"
- "savoir exactement ce qu'il peut faire"
- "pouvoir restreindre, approuver, auditer et couper"
- "avoir des actions metier stables plutot qu'un acces shell generique"

Sans cette couche de gouvernance, Nexus reste tres bon pour une demo ou un usage power-user, mais reste fragile pour un deploiement DSI, MSP ou integrateur AV.

---

## Vision Produit

### Positionnement

**Nexus Enterprise** n'est pas un simple agent desktop.  
C'est un **runtime d'execution sur site** pour des agents Vutler specialistes.

### Proposition de valeur

Pour les clients enterprise et les integrateurs:
- les actions sensibles restent executees dans le reseau client
- le client garde le controle sur les droits et les restrictions
- Vutler garde la valeur d'orchestration, de collaboration et de supervision
- le time-to-value est meilleur qu'une integrale d'integrations cloud custom

### Message cle

**Un employe virtuel dans le reseau du client, avec des permissions explicites, des actions bornees, et une supervision Vutler.**

---

## Current-State Repo Audit

### Ce qui existe deja

| Domaine | Etat | Notes |
|--------|------|-------|
| Wizard de deploiement enterprise | Bon | node, client, seats, primary agent, pool, auto-spawn |
| Backend Nexus enterprise | Bon | nodes, commands, spawn/stop/create agent, dispatch, observabilite |
| Runtime local Nexus | Bon | polling, execution locale, dashboard, queue offline |
| Permissions locales | Moyen | ACL locale simple par dossiers/actions |
| AV provider | Moyen | scan, SNMP, Teams Room, Zoom Room, projector, TV |
| Skills AV / IT Ops | Moyen | taxonomie presente, execution locale encore generique |
| Tests e2e Nexus | Bon | dispatch, claim/retry/expire, runtime end-to-end |
| Gouvernance client | Faible | pas encore de vrai control plane client |
| Securite enterprise end-to-end | Faible a moyen | base presente, durcissement incomplet |
| Packaging / fleet ops | Moyen | base de deploiement, pas encore niveau fleet enterprise |

### Lecture produit

Le repo contient deja le noyau de l'offre.  
Ce qui manque pour etre "pro-like" n'est pas l'idee, mais:
- la gouvernance
- les garde-fous
- les actions metier bornees
- l'operabilite multi-clients

---

## Target Use Case: AV Manager

### Mission

Un agent dedie au parc AV et visioconference d'un client.

### Responsabilites

- verifier la sante des salles Teams et Zoom
- detecter les equipements offline ou en erreur
- lancer des remediations simples autorisees
- s'abonner aux evenements critiques provenant des systemes existants
- appeler des systemes locaux du client via API quand c'est le bon chemin d'integration
- deleguer a un agent auxiliaire local si le besoin depasse son domaine
- documenter les incidents
- ouvrir un ticket si la remediation depasse le scope autorise
- envoyer un rapport journalier ou hebdomadaire

### Exemples de jobs

- "Check toutes les Teams Rooms du site Geneve a 07:00"
- "Quand un systeme tiers signale une panne, creer immediatement un incident AV dans Vutler"
- "Si une salle reste offline 10 minutes, ouvrir un ticket"
- "Si le codec ne repond plus, tenter un restart soft une seule fois"
- "Si le systeme AV local expose une API, recuperer le diagnostic complet avant de decider"
- "Si l'incident depasse le scope AV, deleguer a un helper agent IT local"
- "Envoyer un rapport des incidents AV de la semaine"

### Limite importante

L'agent ne doit pas etre expose comme un "shell intelligent".  
Il doit agir via un **catalogue d'actions autorisees**, comprehensible par le client et auditable.

---

## Do / Don't

### Do

- Encadrer l'execution par politiques explicites.
- Exposer des actions metier stables plutot que des primitives brutes.
- Permettre au client de restreindre par site, asset, protocole et horaire.
- Journaliser qui a demande quoi, quand, pourquoi, et avec quel resultat.
- Prevoir un mode `dry-run` pour les actions sensibles.
- Mettre des approbations humaines pour certaines actions.
- Faire du reporting exploitable par operations et IT.
- Supporter l'offline et la reprise propre.
- Isoler les clients et les sites de maniere stricte.

### Don't

- Ne pas vendre un acces shell generique comme feature principale.
- Ne pas laisser le LLM construire librement des commandes SNMP, Telnet ou shell en prod.
- Ne pas melanger orchestration Vutler et autorisations client dans une seule couche opaque.
- Ne pas remonter des secrets ou des payloads sensibles au cloud sans necessite.
- Ne pas deployer sans rotation de credentials, audit et kill switch.
- Ne pas lancer un MVP enterprise sans parcours de restriction cote client.

---

## Target Architecture

### 1. Vutler Control Plane

Responsabilites:
- creation et orchestration des agents
- supervision transverse
- reporting consolide
- gestion des policies publiees vers Nexus
- UI operateur Vutler

### 2. Nexus Enterprise Runtime

Responsabilites:
- execution locale
- acces reseau local et providers AV
- queue de commandes
- runbooks deterministes
- collecte d'etat et remontes d'evenements
- appels a des API locales ou privees du client
- coordination avec des agents auxiliaires locaux

### 3. Client Policy Plane

Responsabilites:
- definir ce qui est autorise
- activer ou bloquer certaines categories d'actions
- limiter par room, subnet, asset tag, vendor, horaire
- exiger une approbation pour certaines actions
- visualiser l'audit trail

### 4. Action Catalog

Exemples:
- `check_room_health`
- `check_device_connectivity`
- `get_room_diagnostics`
- `restart_room_system`
- `switch_display_input`
- `reboot_display`
- `query_snmp_status`
- `open_incident_ticket`
- `send_daily_report`

Chaque action doit definir:
- prerequis
- parametres acceptes
- garde-fous
- timeout
- politique d'approbation
- format de resultat

### 4.b Local Integration and Helper-Agent Model

Le runtime enterprise doit supporter deux modes d'extension sur site:

1. **Local API Integration**
- appeler une API locale ou privee du client
- utiliser des credentials stockes localement ou dans le vault
- transformer la reponse dans un format exploitable par l'agent principal

2. **Helper Agent Delegation**
- deployer un agent auxiliaire specialise sur le meme node ou sur un node proche
- lui deleguer une tache borne par policy
- recuperer un resultat structure

Exemples de helper agents:
- `av-diagnostics-helper`
- `network-helper`
- `itsm-helper`
- `identity-helper`

Regle produit:
- l'agent principal reste le coordinateur
- les helper agents restent specialises, limites et auditables
- les helper agents consomment des seats du client

### 4.c Seat Consumption Model

Le modele enterprise doit rester coherent avec une facturation **par seats**.

Regles:
- un **agent principal** deploye sur un node consomme un seat
- un **helper agent** deploye ou active pour aider consomme aussi un seat
- un **appel d'API locale** ne consomme pas de seat supplementaire
- un **helper agent inactif non deploye** ne consomme pas de seat tant qu'il n'est pas active
- l'**auto-spawn** d'un helper agent doit etre bloque si aucun seat n'est disponible

Implication produit:
- on ne doit pas contourner le modele enterprise en cachant des helper agents "gratuits"
- chaque capacite multi-agent visible pour le client doit etre refletee dans le compteur de seats
- le client doit pouvoir voir quels agents consomment ses seats et pourquoi

### 5. Event Ingestion Layer

Le runtime enterprise ne doit pas dependre uniquement du polling.

Il faut une couche d'ingestion d'evenements capable de recevoir:
- webhooks de systemes de monitoring
- alertes provenant de Teams Rooms / Zoom / vendors AV
- evenements ITSM
- callbacks d'outils internes du client

Cette couche doit:
- verifier l'authenticite de la source
- normaliser les payloads en evenements Vutler
- router l'evenement vers le bon node, site, asset ou agent
- dedoublonner les alertes bruyantes
- enrichir l'evenement avec le contexte client
- declencher soit une action automatique, soit une approbation, soit un ticket

---

## Security Model

### Principes

- Default deny.
- Le client doit pouvoir couper un node ou une categorie d'actions instantanement.
- Les credentials sont lies au node et rotatifs.
- Les actions sont bornees par policy, pas seulement par UX.
- Les secrets restent au plus pres du runtime.
- Les logs d'audit sont exportables.

### Controles minimums avant go-to-market enterprise

1. Enrollment unifie et signe.
Le deploy token et l'API key doivent etre rationalises dans un vrai flow d'enrollment avec verification forte et rotation.

2. Policy engine central + local.
La policy doit etre decidee cote cloud, materialisee cote node, et enforcee localement a l'execution.

3. RBAC et separation des roles.
Vutler operator, client admin, site admin, auditor.

4. Approval flows.
Certaines actions doivent rester en `pending approval`.

5. Audit trail complet.
Demande, policy appliquee, execution, resultat, erreur, approbation, ticket cree.

6. Webhook security.
Tous les webhooks entrants doivent etre signes ou proteges par secret, scopes, allowlist IP ou proxy client selon le systeme source.

7. Kill switch.
Desactivation immediate du node, du tenant ou d'une famille d'actions.

8. Signed updates.
Pour le runtime Nexus et ses providers.

---

## Functional Scope

### MVP V1

- deploiement enterprise par client/site
- AV Manager de reference
- policy de base par action et par asset
- catalogue d'actions bornees
- ingestion webhook pour incidents et alertes critiques
- support d'integrations API locales bornees
- support de delegation vers helper agents bornees
- reporting quotidien
- ouverture de tickets Jira ou ServiceNow
- mode dry-run
- audit trail
- consommation de seats visible et explicable

### V1.5

- approbations humaines
- maintenance windows
- escalation multi-niveaux
- fleet view multi-sites
- templates de policy par type de client
- dedoublonnage et correlation d'evenements

### V2

- SSO / SAML
- policy-as-code
- signed runbooks
- evidence exports pour compliance
- auto-remediation avec score de confiance
- marketplace de vertical agents on-prem

---

## 30 / 60 / 90 Days

### 30 jours

Objectif: rendre le socle vendable en demo enterprise.

- figer la vision produit et le vocabulaire
- definir le modele `tenant -> client -> site -> node -> asset`
- definir le catalogue MVP d'actions AV
- interdire les actions brutes non cataloguees pour le parcours AV
- ajouter un modele de policy simple
- ajouter le mode `dry-run`
- produire un scenario demo AV Manager de bout en bout

### 60 jours

Objectif: rendre le produit pilotable par le client.

- UI client admin pour restrictions et approvals
- policies par room / subnet / vendor / action
- ticketing enterprise
- reporting journalier et hebdomadaire
- audit trail exportable
- hardening enrollment / secret rotation / revoke

### 90 jours

Objectif: rendre le produit deployable chez plusieurs clients.

- fleet management multi-sites
- observabilite operations
- health scoring
- signed updates runtime
- runbooks versionnes
- SLA / alerting / support workflow

---

## MVP Backlog: AV Manager

### P0

- Definir `asset inventory` minimal: rooms, devices, IP, vendor, protocol, criticality.
- Creer un `AVActionCatalog` borne.
- Mapper les primitives existantes vers actions metier.
- Definir un `EventCatalog` borne pour les alertes et incidents.
- Definir un `LocalIntegrationCatalog` pour les systemes locaux exposes en API.
- Definir un `HelperAgentCatalog` pour les delegations autorisees.
- Definir un `SeatConsumptionModel` explicite pour principal agents et helper agents.
- Ajouter `dry-run` sur les actions de remediation.
- Ajouter `policy check` avant execution.
- Ajouter un recepteur webhook enterprise generique avec normalisation d'evenements.
- Ajouter `ticket connector` Jira.
- Ajouter `daily summary report`.

### P1

- Teams Rooms diagnostics plus fiables.
- Zoom Rooms diagnostics plus fiables.
- SNMP profils vendors.
- PJLink / displays / codec playbooks.
- Incident templates par type de panne.
- Client approval workflow.
- Connecteurs webhook par source critique.
- Dedoublonnage et correlation d'alertes.
- Connecteurs API locaux par type de client ou de vendor.
- Delegation vers helper agents locaux avec retour structure.
- Observabilite de consommation des seats par site et par agent.

### P2

- ServiceNow connector.
- Maintenance windows.
- Room health score.
- Root cause hints.
- Playbooks vendor-specific.

---

## Technical Backlog

### Platform

- Unifier deploy token et API key dans un vrai flow d'enrollment enterprise.
- Signer et verifier les deploy tokens cote CLI et runtime.
- Introduire un `policy engine` versionne.
- Introduire un `event ingestion pipeline` versionne.
- Introduire un `local integration registry`.
- Introduire un `helper agent registry`.
- Introduire un `seat accounting` explicite pour les agents deployes et auto-spawned.
- Ajouter `command categories` et `risk levels`.
- Ajouter `approval states` aux commandes Nexus.
- Ajouter revocation et rotation automatiques des credentials node.

### Runtime

- Remplacer les primitives shell brutes par des adapters plus stricts.
- Encapsuler SNMP/Telnet/HTTP AV dans des action handlers versionnes.
- Ajouter timeouts, retries et idempotency par action.
- Ajouter inventories et state cache locaux.
- Ajouter health collectors planifies.
- Ajouter des webhooks entrants normalises avec mapping `source event -> Vutler event`.
- Ajouter correlation, debounce et suppression des doublons.
- Ajouter un client d'API locale avec allowlist d'endpoints et auth borne.
- Ajouter la delegation inter-agents locale avec contrats de taches stricts.
- Ajouter le blocage d'auto-spawn quand aucun seat n'est disponible.

### Product / UX

- Vue client enterprise.
- Vue site / room / device.
- Configuration policy.
- Configuration des webhooks et des sources d'evenements.
- Journal d'audit lisible.
- Wizard AV Manager.

---

## Risks

### Produit

- Vendre trop large trop tot au lieu de verticaliser sur AV/IT ops.
- Confondre "agent intelligent" et "acces non borne au reseau client".
- Confondre "helper agents" et "swarm libre sans gouvernance".
- Diluer le modele par seats avec des helper agents non comptes.

### Technique

- Trop de dependance au shell ou aux commandes libres.
- Providers AV heterogenes selon les vendors.
- Faux positifs de sante si les checks restent trop superficiels.
- Tempete d'evenements si les webhooks entrants ne sont pas dedoublonnes.
- Integrations API locales trop ad hoc si elles ne passent pas par un catalogue borne.
- Surconsommation implicite des seats si les helper agents sont spawned sans visibilite.

### Securite

- Enrollment incomplet.
- Policies non enforcees localement.
- Logs insuffisants pour un audit client.
- Webhooks entrants mal autentifies ou mal scopes.

---

## Recommended Product Sequence

1. **Verticaliser sur AV Manager** comme use case reference.
2. **Transformer les primitives techniques en actions metier bornees**.
3. **Construire le control plane client** avant de multiplier les use cases.
4. **Durcir l'enrollment et la policy** avant tout roll-out enterprise.
5. **Etendre ensuite vers IT Ops, facilities, local service desk, network assistant**.

---

## Definition Of Done For "Enterprise-Ready MVP"

- Un client peut deployer un node sur son site.
- Le client peut limiter ce que l'agent peut faire.
- L'agent peut monitorer et remedier un scope AV borne.
- L'agent peut recevoir des evenements temps reel depuis des systemes existants.
- L'agent peut appeler des API locales autorisees du client.
- L'agent peut deleguer a des helper agents locaux autorises.
- Chaque helper agent actif consomme un seat visible cote client.
- Les actions sensibles sont en dry-run ou approval.
- Chaque action est auditable.
- Les incidents peuvent creer des tickets.
- Les rapports sont exploitables.
- Les credentials peuvent etre revoques sans casser toute la plateforme.
- Le produit est presentable a une DSI sans devoir expliquer des contournements.

---

## Open Questions

- Quel est le premier buyer: integrateur AV, MSP, DSI interne ou office manager enterprise ?
- Quel est le niveau d'autonomie acceptable sans approval humaine ?
- Quel est le premier ITSM a supporter officiellement ?
- Quelles sources webhook doivent etre supportees des la V1 ?
- Faut-il viser Linux comme runtime principal pour les deploiements client site ?
- Quelle politique de support et de mise a jour pour les nodes chez le client ?

---

## Recommended Next Step

Produire immediatement une **spec technique V1 de Nexus Enterprise Policy + AV Action Catalog**.  
Sans cela, le produit restera impressionnant en demo mais ambigu en securite et en exploitation.
