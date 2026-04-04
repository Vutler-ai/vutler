# Production Patching Plan — April 2026

Plan de patching exécutable par phases, avec livraison attendue sous la forme:

- code
- tests ciblés
- documentation de phase
- commit séparé par phase

## Scope

Ce plan couvre les écarts relevés pendant l’audit pré-production d’avril 2026:

- avatars agent non alignés entre création et édition
- dashboard non suffisamment durci côté multi-tenant
- token usage dashboard partiellement branché
- onboarding trial et crédits managés pas assez cohérents
- secrets providers encore trop exposés dans le chemin nominal

Je n’ai pas d’accès direct à une instance Snipara depuis cet environnement. Le chunking et le suivi de phase sont donc matérialisés dans ce repo.

## Phase Map

### P0 — Avatars

Objectif:

- permettre à un utilisateur de choisir une image d’agent uniquement depuis la bibliothèque locale Vutler
- aligner la création d’agent et l’édition d’agent sur la même source d’avatars
- supprimer les écarts entre slug, chemin statique et sprite fallback

Livrables:

- librairie locale d’avatars partagée côté frontend
- picker local-only dans la config agent
- picker local-only dans le wizard de création
- test de normalisation d’avatar

Critères d’acceptation:

- pas d’upload
- pas d’image externe
- pas d’image perso
- les avatars existants sauvegardés sur `/static/avatars/*` restent correctement sélectionnés après reload

### P1 — Dashboard Hardening

Objectif:

- scoper le dashboard par workspace
- brancher la carte token usage sur les vraies sources de consommation

Livrables:

- patch API dashboard
- test multi-tenant
- doc de phase

Implémentation du 4 avril 2026:

- `api/dashboard.js` refuse désormais toute requête sans `workspaceId`, scope `agents` et `chat_messages` par `workspace_id`, et compte les agents `online` ou `active` comme actifs.
- `api/usage-pg.js` expose le helper de totalisation utilisé par la page usage et ajoute un fallback `credit_transactions(type='usage')` pour que le dashboard lise la même vérité que le runtime managé.
- tests ciblés:
  - `tests/dashboard-api.test.js`
  - `tests/usage-pg-summary.test.js`

Critères d’acceptation:

- aucun agent/message cross-tenant dans `/api/v1/dashboard`
- la carte `Token Usage` reflète les vraies tables de consommation et non une table legacy non alimentée
- absence de `workspaceId` => `401`

### P2 — Trial / Credits Wiring

Objectif:

- rendre le trial réellement utilisable au runtime
- rendre les crédits managés auditables

Livrables:

- provisioning trial cohérent au signup/onboarding
- écriture ledger usage/achat sur le chemin managé
- tests ciblés

### P3 — Provider Secret Hardening

Objectif:

- réduire l’exposition des secrets providers dans le chemin principal

Livrables:

- écriture chiffrée ou enveloppée des secrets providers
- résolution transparente au runtime
- tests ciblés

### P4 — Dashboard / Usage UX Cleanup

Objectif:

- aligner le wording BYOK, trial, crédits managés et OpenRouter auto

Livrables:

- UI usage/billing alignée avec le runtime réel
- doc opératoire

## Delivery Rule

Chaque phase doit sortir avec:

1. changements de code
2. tests exécutés
3. doc mise à jour
4. commit dédié
