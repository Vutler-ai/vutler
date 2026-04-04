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

Implémentation du 4 avril 2026:

- nouveau service `services/managedProviderService.js` pour unifier le provider managé `vutler-trial` avec résolution de profil par source:
  - `trial` privilégie `Anthropic Haiku` si disponible, sinon fallback vers un provider partagé existant
  - `credits` privilégie `OpenRouter auto` pour le mode managé payant
- `api/auth.js` provisionne désormais le provider managé avant la création de `Jarvis`, le marque par défaut si aucun BYOK ne le remplace, et inscrit le grant initial dans le ledger.
- `api/onboarding.js` crée les agents du wizard sur le runtime managé provisionné lorsqu’il existe, au lieu de dériver implicitement vers `openai/gpt-4o-mini`; les vieux modèles d’onboarding sont aussi normalisés vers des références courantes.
- `services/llmRouter.js` résout maintenant `vutler-trial` vers son vrai upstream provider/model, débite les tokens consommés, et écrit chaque usage dans `credit_transactions`.
- `api/billing.js` enregistre les achats de packs en `credit_transactions`, crédite le quota workspace et bascule/maintient le provider managé sur le profil `credits`.
- migration ajoutée: `scripts/migrations/20260404_credit_transactions.sql`

Critères d’acceptation:

- un workspace fraîchement inscrit avec clé partagée disponible peut réellement exécuter `Jarvis` et les agents onboarding sans BYOK
- les achats de packs génèrent une écriture positive auditée
- les appels runtime managés génèrent une écriture négative auditée
- le trial reste limité et rate-limité, tandis que les crédits payants n’héritent pas du rate limit trial

### P3 — Provider Secret Hardening

Objectif:

- réduire l’exposition des secrets providers dans le chemin principal

Livrables:

- écriture chiffrée ou enveloppée des secrets providers
- résolution transparente au runtime
- tests ciblés

Implémentation du 4 avril 2026:

- nouveau helper `services/providerSecrets.js` pour centraliser:
  - chiffrement à l’écriture via `CryptoService`
  - déchiffrement transparent au runtime
  - compatibilité ascendante pour les lignes legacy encore en clair
- writers modernisés:
  - `api/providers.js`
  - `api/llm.js`
  - `api/integrations.js` pour le marqueur `codex`
  - `api/settings.js` pour le vieux blob `workspace_settings.llm_providers`
  - `services/managedProviderService.js`
  - `services/llmProviderCompat.js`
- readers runtime modernisés:
  - `services/llmRouter.js`
  - `api/llm.js` sur le test de connexion provider
- tests ciblés:
  - `tests/provider-secrets.test.js`
  - `tests/llm-provider-compat.test.js`

Critères d’acceptation:

- une nouvelle clé provider n’est plus écrite en clair dans `tenant_vutler.llm_providers`
- le runtime continue à fonctionner avec les lignes legacy déjà présentes
- les endpoints UI continuent à retourner uniquement des clés masquées

### P4 — Dashboard / Usage UX Cleanup

Objectif:

- aligner le wording BYOK, trial, crédits managés et OpenRouter auto

Livrables:

- UI usage/billing alignée avec le runtime réel
- doc opératoire

Implémentation du 4 avril 2026:

- `frontend/src/app/(app)/usage/page.tsx` explique maintenant que l’analytics couvre à la fois `BYOK` et `Vutler-managed credits`, sans continuer à affirmer que tout est exclusivement BYOK.
- `frontend/src/app/(app)/billing/page.tsx` remplace les mentions produit `Bring Your Own Key` par `BYOK or Vutler Credits` sur les plans et sur la carte du plan courant.
- `api/llm.js` retire les références de catalogues obsolètes (`gpt-4o`, `gpt-4o-mini`, `claude-3.5-haiku-latest`) au profit des modèles courants déjà utilisés ailleurs dans le repo.

Critères d’acceptation:

- l’application n’annonce plus un modèle BYOK-only alors que le runtime gère désormais du trial et des crédits managés
- le catalogue modèles exposé par `api/llm.js` n’affiche plus de références explicitement obsolètes dans le repo

### P5 — `/ws/chat` PG Refactor

Objectif:

- retirer la dépendance restante à l’ancien modèle Mongo/auth dans `api/websocket.js`
- faire pointer `/ws/chat` uniquement sur l’auth API key actuelle et les tables PostgreSQL workspace-scopées

Livrables:

- auth WebSocket branchée sur `resolveApiKey`
- résolution d’agent via `tenant_vutler.agents`
- persistance `chat.message` et `message.send` via `chat_messages`
- tests ciblés

Implémentation du 4 avril 2026:

- `api/middleware/auth.js` exporte désormais `resolveApiKey` pour les transports non-Express comme le WebSocket upgrade handler.
- `api/websocket.js` n’utilise plus `app.locals.db.collection(...)` ni le faux `verifyApiKey(db, key)`.
- la connexion `/ws/chat`:
  - valide la clé via le resolver API key actuel
  - récupère le workspace depuis cette identité
  - charge l’agent demandé depuis `tenant_vutler.agents`
  - met à jour le statut agent `online/offline` en best-effort
- `chat.message`:
  - charge l’agent via PG
  - exécute `llmRouter.chat()` sur le pool PG courant
  - persiste le tour dans `chat_messages` quand `conversation_id` correspond à un channel existant
- `message.send` persiste directement un message agent dans `chat_messages` avec `metadata.attachments`
- test ajouté: `tests/websocket-pg.test.js`

Critères d’acceptation:

- plus aucune dépendance Mongo dans le chemin nominal `/ws/chat`
- plus d’appel du middleware auth comme s’il s’agissait d’un resolver
- les messages socket sont désormais limités au workspace porté par la clé API

## Delivery Rule

Chaque phase doit sortir avec:

1. changements de code
2. tests exécutés
3. doc mise à jour
4. commit dédié
