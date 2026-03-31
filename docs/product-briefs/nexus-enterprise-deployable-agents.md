# Product Brief: Nexus Enterprise Deployable Agents

**Date:** 2026-03-31  
**Author:** Codex  
**Status:** Draft

---

## Executive Summary

`nexus-enterprise` ne doit pas etre pense comme un produit "AV" avec quelques extensions.
Il doit etre pense comme une **couche d'execution enterprise generique** capable d'heberger plusieurs types d'agents deployables dans le reseau du client.

Le bon objet produit n'est donc pas "un agent AV", mais un:

**Deployable Agent Profile**

Un `Deployable Agent Profile` est un paquet gouverne qui definit:
- ce que fait un agent
- ce qu'il peut voir
- ce qu'il peut executer
- les integrations locales qu'il peut utiliser
- les evenements auxquels il peut reagir
- les policies qui bornent son comportement
- sa consommation de seats

Le `AV Manager` devient alors un **profil vertical de reference**, pas la fondation du systeme.

La these produit reste:

**Vutler orchestre, Nexus execute, le client gouverne.**

---

## Problem Statement

Si on part directement d'un `AV Manager`, on risque deux erreurs:

- sur-specialiser l'architecture trop tot
- reintroduire plus tard des exceptions pour les autres agents

Or le modele enterprise vise plusieurs familles d'agents deployables:

- `AV Manager`
- `IT Helpdesk`
- `Network Operations`
- `Identity Operations`
- `Bid Manager`
- `Report Writer`
- `Compliance Assistant`
- `Site Operations`

Tous n'ont pas les memes besoins d'execution locale, mais ils doivent partager le meme cadre:

- meme modele de seat
- meme policy engine
- meme logique d'integration locale
- meme logique de delegation
- meme audit
- meme gouvernance client

---

## Core Product Model

### 1. Nexus Enterprise Node

Runtime local deploye chez le client.

Responsabilites:
- executer des actions locales bornees
- acceder aux integrations autorisees
- appliquer les policies du client
- recevoir des commandes depuis Vutler
- traiter des evenements entrants
- heberger plusieurs agents actifs selon les seats disponibles

### 2. Deployable Agent Profile

Definition produit et technique d'un agent deployable sur Nexus.

Chaque profil doit declarer:
- `profile_key`
- `name`
- `category`
- `required_capabilities`
- `optional_capabilities`
- `action_catalog`
- `event_subscriptions`
- `local_integrations`
- `helper_agent_permissions`
- `default_policy_bundle`
- `seat_class`
- `deployment_mode`

### 3. Capability Packs

Une capacite est une brique fonctionnelle reutilisable.

Exemples:
- `event_ingestion`
- `ticketing`
- `reporting`
- `device_diagnostics`
- `network_checks`
- `document_generation`
- `identity_lookup`
- `local_api_bridge`

L'objectif est d'eviter de reconstruire chaque agent comme un cas isole.

### 4. Policy Bundle

Chaque profil embarque une base de policies publiee vers le client:
- actions autorisees
- actions soumises a approval
- assets et scopes
- horaires
- plafonds d'execution
- restrictions par source d'evenement ou role

Le client doit pouvoir la restreindre.

### 5. Seat-Aware Runtime

Le modele commercial est par seats.

Donc:
- un agent actif consomme un seat
- un helper agent actif consomme un seat
- une integration locale n'ajoute pas de seat
- aucun spawn ne doit contourner la capacite achetee

---

## Architecture At A Glance

```text
Vutler Control Plane
- agent profile registry
- orchestration
- publishing of policies and profile bundles
- reporting
- operator UI

Client Governance Plane
- RBAC
- approvals
- restrictions
- audit
- seat visibility

Nexus Enterprise Runtime
- principal agents
- helper agents
- local integrations
- event ingestion
- action dispatch
- offline queue

Deployable Agent Profile
- capability packs
- action catalog
- event subscriptions
- local integration registry
- helper delegation rules
- policy bundle
- seat class
```

---

## Generic Agent Families

### Operations Agents

Exemples:
- `AV Manager`
- `IT Helpdesk`
- `Network Ops`
- `Identity Ops`

Caracteristiques:
- forte execution locale
- reaction a des evenements
- actions de remediation
- lien fort avec systems locaux et ITSM

### Knowledge and Delivery Agents

Exemples:
- `Bid Manager`
- `Report Writer`
- `Compliance Assistant`

Caracteristiques:
- moins d'operations locales sensibles
- plus de traitement documentaire
- plus d'acces drive, email, tasks, templates, knowledge bases
- event-driven optionnel

### Hybrid Agents

Exemples:
- `Site Operations`
- `Executive Operations`

Caracteristiques:
- mix de donnees locales et production documentaire
- delegation possible a agents specialises

---

## Agent Levels

Tous les profils deployables ne doivent pas etre traites de la meme facon.

V1 doit introduire des **agent levels** qui conditionnent:
- les tools disponibles
- les integrations autorisees
- le niveau de policy par defaut
- le mode d'approbation
- la posture de risque attendue

La traduction operationnelle de ces niveaux est detaillee dans `Nexus Enterprise Agent Level Capability Matrix V1`.

### Level 1: Administrative

Exemples:
- `Bid Manager`
- `Report Writer`
- `Compliance Assistant`

Caracteristiques:
- faible risque technique
- peu ou pas d'execution locale sensible
- acces prioritaire a documents, email, tasks, drive, knowledge
- integrations locales rares et fortement bornees

Tools typiques:
- document generation
- workspace knowledge access
- email dispatch
- task orchestration
- CRM ou knowledge APIs bornees

Mode de gouvernance attendu:
- `allow` frequent sur actions documentaires
- restrictions surtout sur donnees, confidentialite et scopes documentaires

### Level 2: Operational

Exemples:
- `AV Manager`
- `IT Helpdesk`
- `Site Operations`

Caracteristiques:
- execution locale ou API privee moderee
- remediation bornees
- event ingestion frequente
- besoin d'ITSM, reporting et diagnostics

Tools typiques:
- event ingestion
- ticketing
- reporting
- local API bridge
- diagnostics catalogues

Mode de gouvernance attendu:
- mix de `allow`, `dry_run` et `approval_required`
- restrictions par site, asset, horaire, source d'evenement

### Level 3: Technical Privileged

Exemples:
- `Network Ops`
- `Identity Ops`
- vendor-specific remediation agents a fort impact

Caracteristiques:
- impact potentiel eleve sur l'infrastructure
- usage de credentials sensibles ou de domaines critiques
- risque plus fort de blast radius

Tools typiques:
- privileged local API bridge
- network diagnostics avancees
- identity lookup et remediation bornees
- helper delegation hautement controlee

Mode de gouvernance attendu:
- `default deny` plus strict
- approvals frequentes
- `dry_run` prefere par defaut
- audit renforce

### Rule

Un agent level n'autorise pas automatiquement un tool.
Il fixe une **enveloppe de risque et de gouvernance**.

Le detail reel des droits vient toujours de:
- son profil
- son action catalog
- ses integrations en registry
- la policy client

---

## Design Rules

### Rule 1: Profile First

On deploye un **profil** borne, pas un agent generique vide.

### Rule 2: Capabilities Before Custom Logic

Une nouvelle famille d'agents doit d'abord essayer de recomposer des `capability packs` existants.

### Rule 3: No Freeform Privileged Execution

Aucun profil ne doit reposer sur:
- shell libre
- HTTP libre sans registry
- protocole vendor libre

### Rule 4: One Governance Model For All

Le client ne doit pas apprendre un modele de controle different pour chaque agent.

### Rule 5: Seats Follow Active Runtime

Tout agent actif visible dans le runtime doit avoir un impact seat explicite.

### Rule 6: Local Integrations Are Extensions, Not Hidden Agents

Une integration locale et un helper agent sont deux objets differents.

### Rule 7: Administrative And Technical Agents Must Not Share The Same Default Trust

Un agent administratif ne doit pas heriter par defaut des memes tools ni du meme niveau d'approbation qu'un agent technique.

---

## Example Profile Matrix

| Profile | Level | Local execution | Events | Local APIs | Helper agents | Seat |
|---------|-------|-----------------|--------|------------|---------------|------|
| AV Manager | 2 | High | High | Yes | Yes | 1 |
| IT Helpdesk | 2 | High | Medium | Yes | Yes | 1 |
| Network Ops | 3 | High | High | Yes | Yes | 1 |
| Bid Manager | 1 | Low | Low | Optional | Optional | 1 |
| Report Writer | 1 | Low | Medium | Optional | Optional | 1 |

Ce tableau montre pourquoi l'architecture doit etre generique:
- certains profils sont tres operationnels
- d'autres sont surtout cognitifs ou documentaires
- certains sont franchement privilegies et doivent etre traites comme tels
- mais tous doivent passer par le meme cadre enterprise

---

## Deployment Modes

### Fixed Agent

Agent demarre en permanence sur le node.

### Elastic Agent

Agent active quand necessaire, mais consomme un seat pendant sa periode d'activite.

### Registered Helper

Profil disponible dans le catalogue du node, mais inactif tant qu'il n'est pas active.

Le client peut donc:
- precharger 5 agents fixes sur 5 seats
- ou garder une partie de la capacite pour du spawn controle

---

## Product Implications

Pour rendre `nexus-enterprise` pro-like, il faut un produit construit autour de:

1. un **registry de profils deployables**
2. un **registry de capabilities**
3. un **policy engine commun**
4. un **action catalog par profil**
5. un **event model commun**
6. un **modele de seats unifie**
7. un **UI de gouvernance client coherente**

Sans cela, chaque nouvel agent enterprise deviendra un cas special.

---

## AV Manager Positioning

Le `AV Manager` reste un excellent premier vertical car:
- il justifie l'execution locale
- il justifie les webhooks et event ingestion
- il justifie les integrations API privees
- il justifie les approvals et garde-fous

Mais il doit etre traite comme:

- un **profil pilote**
- un **exemple de capability composition**
- un **cas de validation du framework**

Pas comme la definition meme de `nexus-enterprise`.

---

## Recommended Build Order

1. Definir le modele generique `Deployable Agent Profile`.
2. Definir le registry de capabilities et le contract d'execution.
3. Definir le policy engine commun.
4. Definir le seat accounting commun.
5. Definir les primitives d'event ingestion communes.
6. Implementer `AV Manager` comme premier profil vertical.
7. Implementer `IT Helpdesk` comme deuxieme profil pour verifier que le modele est vraiment generique.

---

## Success Criteria

Le produit est sur la bonne voie si:

- un nouveau profil deployable peut etre ajoute sans nouvelle architecture
- le client comprend la gouvernance de la meme facon quel que soit l'agent
- la consommation de seats reste previsible
- les integrations locales restent bornees
- les helper agents ne deviennent pas un swarm cache
- `AV Manager` et `IT Helpdesk` peuvent coexister sur le meme node sans logique speciale
