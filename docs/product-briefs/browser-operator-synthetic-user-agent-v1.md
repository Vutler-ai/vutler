# Product Brief: Browser Operator / Synthetic User Agent V1

**Date:** 2026-04-01  
**Author:** Codex  
**Status:** Draft

---

## Executive Summary

Vutler peut gagner une capability produit tres forte avec un **Browser Operator** capable de:
- naviguer sur le web
- creer un compte
- se connecter
- simuler un vrai user
- tester un onboarding
- verifier un dashboard
- relever des problemes UI/UX
- produire un rapport structure avec preuves

Cette capability ne doit pas etre pensee uniquement comme une feature `enterprise`.

Le bon modele est:
- **une meme capability produit**
- **plusieurs modes d'execution**
- **plusieurs niveaux de gouvernance**

En pratique:
- **Cloud Browser Mode** pour les apps publiques et les audits rapides
- **Enterprise Governed Browser Mode** pour les environnements plus sensibles
- **Nexus Local Browser Mode** pour les apps internes ou accessibles uniquement depuis le reseau du client

---

## Product Thesis

Le Browser Operator n'est pas "un agent avec un navigateur libre".

C'est:
- un **operateur web gouverne**
- capable de rejouer ou explorer des parcours utilisateur
- avec collecte de preuves
- avec garde-fous
- et avec niveau de risque explicite

La proposition de valeur est forte sur trois surfaces:
- **QA / regression**
- **product review / UX review**
- **synthetic user simulation**

---

## Core Use Cases

### 1. App Review

L'agent:
- ouvre une app
- parcourt les ecrans cle
- teste les flows principaux
- releve les problemes
- produit un rapport

Exemples:
- friction onboarding
- CTA peu visibles
- erreurs formulaire
- incoherences mobile / desktop
- problemes d'etat ou de navigation

### 2. Synthetic User Testing

L'agent:
- cree un compte
- valide un email
- se connecte
- complete un onboarding
- teste un parcours metier

Exemples:
- signup + verification email
- login + mot de passe oublie
- creation d'un workspace
- creation d'un ticket
- ajout d'un utilisateur

### 3. Enterprise Workflow Monitoring

L'agent:
- se connecte a un portail interne
- verifie un workflow borne
- capture les anomalies
- alerte ou produit un rapport

Exemples:
- portail RH
- portail IT interne
- dashboard operations
- extranet partenaire

---

## Mode Strategy

## 1. Cloud Browser Mode

### Best for

- apps publiques
- onboarding produit
- UX audits
- signup / login classiques
- regression checks
- product review

### Benefits

- infra plus simple
- aucun deploiement client
- time-to-value rapide
- parfait pour lancer la capability

### Constraints

- domaines publics ou explicitement allowlistes
- pas d'acces reseau prive client
- pas de dependance a un VPN ou SSO interne

---

## 2. Enterprise Governed Browser Mode

### Best for

- entreprises voulant utiliser la capability sur des apps sensibles
- workflows metiers avec exigences d'audit
- scenarios de validation humaine necessaires
- environnements ou certaines actions doivent etre bornees

### Required posture

Ce mode doit etre plus strict que le cloud:

- domain allowlist stricte
- sessions isolees
- credentials stockes dans un vault
- actions bornees
- audit complet
- approvals si necessaire
- grants de process reutilisables
- mode `full_access` optionnel mais trace

### Typical examples

- login sur un portail client
- verification d'un workflow interne
- simulation d'un employe sur une application metier
- test d'un parcours SSO borne

---

## 3. Nexus Local Browser Mode

### Best for

- apps internes
- intranet
- portails accessibles seulement depuis le reseau client
- outils lies a l'IP locale, au VPN ou a l'environnement on-prem

### Positioning

Ce mode n'est pas le point de depart ideal du produit, mais c'est la bonne extension pour:
- enterprise
- apps privees
- synthetic users dans le reseau client

### Key principle

Le runtime change, pas le produit.

Le meme catalogue d'actions browser doit pouvoir etre execute:
- soit en cloud
- soit via Nexus local

---

## Capability Levels

Pour eviter un navigateur "libre", il faut des niveaux.

### Level A: `observe_only`

L'agent peut:
- ouvrir une page
- naviguer
- lire du contenu
- capturer screenshots
- verifier des elements visuels ou textuels

Risque:
- faible

### Level B: `authenticated_read`

L'agent peut:
- se connecter
- naviguer dans une session authentifiee
- verifier des workflows sans mutation

Risque:
- moyen

### Level C: `bounded_workflow_execution`

L'agent peut:
- remplir des formulaires
- suivre un workflow borne
- creer un compte
- soumettre un ticket
- simuler un parcours user predefini

Risque:
- moyen a eleve selon le flow

### Level D: `privileged_browser_ops`

L'agent peut:
- acceder a des consoles admin
- faire des actions sensibles
- operer sur des workflows plus critiques

Risque:
- eleve

Ce niveau doit etre tres cadre et rarement active.

---

## Browser Action Catalog

Le Browser Operator doit passer par un catalogue d'actions bornees.

### Core actions

- `browser.open`
- `browser.wait_for`
- `browser.click`
- `browser.fill`
- `browser.select`
- `browser.check`
- `browser.assert_text`
- `browser.assert_element`
- `browser.capture_screenshot`
- `browser.capture_dom_snapshot`
- `browser.extract_structured_data`
- `browser.download_artifact`

### Auth actions

- `browser.signup`
- `browser.login`
- `browser.logout`
- `browser.consume_magic_link`
- `browser.consume_reset_password`

### Workflow actions

- `browser.run_flow`
- `browser.submit_form`
- `browser.complete_onboarding`
- `browser.execute_synthetic_journey`

### Reporting actions

- `browser.generate_report`
- `browser.compare_expected_vs_actual`
- `browser.export_evidence_pack`

---

## Evidence Model

La valeur produit ne vient pas seulement de "faire le flow", mais de prouver ce qui s'est passe.

Chaque run doit pouvoir produire:
- screenshots
- etapes executees
- assertions passees / echouees
- temps par etape
- erreurs
- URL visitees
- artefacts telecharges
- eventuellement video courte ou trace de session

Le resultat final doit etre un **evidence pack** exploitable.

---

## Security and Governance

## 1. Credentials

Les credentials ne doivent jamais vivre dans le prompt.

Ils doivent etre:
- stockes dans un vault
- scopes par workspace / client / app
- injectes au runtime seulement
- auditables

## 2. Domain Controls

Toujours:
- allowlist des domaines autorises
- blocage des domaines non approuves
- scopes differents pour cloud et enterprise

## 3. Session Isolation

Chaque app / flow / tenant doit pouvoir etre isole:
- profil navigateur distinct
- cookies distincts
- storage distinct

## 4. Risk Controls

Actions a bloquer par defaut:
- paiements reels
- changements de securite
- deletion destructive
- actions admin larges
- domaines inconnus

## 5. Governance Modes

Le Browser Operator doit reutiliser le meme modele de gouvernance que Nexus enterprise:
- `allow`
- `dry_run`
- `approval_required`
- `deny`

Et aussi:
- `process-scoped approval`
- `full_access` explicite

Exemple important:
- approuver une fois le process "tester l'onboarding de app.client.com chaque nuit"
- ne pas revalider chaque run

---

## Product Architecture Recommendation

Le bon design est:

### 1. Unified Product Layer

Un seul produit logique:
- `Browser Operator`

### 2. Multiple Runtimes

Deux backends d'execution:
- `cloud-browser`
- `nexus-browser`

### 3. Shared Contracts

Le catalogue d'actions, les preuves, les policies et les rapports doivent etre communs.

Cela permet:
- cloud first
- extension enterprise ensuite
- compatibilite produit propre

---

## MVP Recommendation

### Phase 1: Cloud-first MVP

Profils:
- `App Reviewer`
- `Synthetic User QA`

Scope:
- apps publiques
- signup/login
- onboarding
- rapport UX / bugs
- screenshots + evidence pack

### Phase 2: Governed Enterprise Mode

Scope:
- domain allowlist
- vault credentials
- approvals
- process grants
- audit
- approval emails

### Phase 3: Nexus Local Execution

Scope:
- apps internes
- portails prives
- SSO / reseau client
- synthetic user local

---

## Recommended Positioning

Message simple:

**Un agent qui agit comme un vrai utilisateur web, teste des applications, documente ce qu'il voit, et produit un rapport exploitable.**

Version enterprise:

**Le meme agent, mais gouverne, borne et auditable.**

---

## Build Recommendation

Je ne lancerais pas cette feature comme `nexus-enterprise first`.

Je lancerais:

1. **Cloud Browser Operator first**
2. **Policy-compatible from day one**
3. **Enterprise governed mode second**
4. **Nexus local runtime third**

C'est le meilleur compromis entre:
- vitesse produit
- valeur immediate
- extensibilite enterprise
- discipline de securite
