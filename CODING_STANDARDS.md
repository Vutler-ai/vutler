# CODING_STANDARDS.md

## Objectif

Ce document définit les standards de développement de Vutler pour la stack actuelle.  
Son objectif est de garantir :

- une base de code cohérente ;
- des conventions claires entre backend, frontend et infrastructure ;
- une meilleure maintenabilité ;
- un niveau de sécurité adapté aux données et intégrations manipulées ;
- une intégration simple pour les nouveaux développeurs.

Ce document remplace les anciennes conventions liées à Meteor, DDP, MongoDB, Rocket.Chat, Mongoose, Prisma et autres patterns désormais obsolètes.

---

# 1. Stack technique

## Technologies de référence

| Composant | Technologie |
|-----------|-------------|
| Runtime | Node.js 18+ |
| Language | JavaScript (backend en CommonJS) / TypeScript (frontend) |
| API | Express.js |
| Base de données | PostgreSQL via Supabase |
| Real-time | WebSocket natif |
| Container | Docker |
| Frontend | Next.js 14, Tailwind CSS, shadcn/ui |

## Principes

- Le backend repose sur **Node.js + Express**, en **JavaScript CommonJS**.
- Le frontend repose sur **Next.js 14**, en **TypeScript strict**.
- La base de données de référence est **PostgreSQL**, exposée via **Supabase**.
- Le temps réel repose sur des **WebSockets natifs**, pas sur DDP ni des abstractions héritées de Meteor.
- Le code doit rester compatible avec l’architecture Docker du projet.

## Obsolète / interdit

Les technologies ou patterns suivants ne doivent plus apparaître dans le code ou dans la documentation standard :

- MongoDB
- Mongoose
- Prisma
- DDP
- Meteor patterns
- conventions Rocket.Chat
- Redis comme dépendance d’architecture centrale, sauf cas explicitement justifié et documenté

Si Redis existe encore à la marge dans certaines briques historiques, il ne doit pas être présenté comme standard de la plateforme.

---

# 2. Structure des dossiers

## Structure cible

Les conventions de structuration suivantes servent de référence :

- `api/` — routes Express, idéalement **1 fichier = 1 domaine fonctionnel**
- `services/` — logique métier, orchestration, services applicatifs
- `frontend/src/app/(app)/` — pages de l’application
- `frontend/src/lib/api/` — client API, types, helpers d’accès backend

## Règles de découpage

### Backend

- Les fichiers dans `api/` ne doivent contenir que :
  - définition de routes ;
  - validation légère ;
  - appel aux services ;
  - transformation éventuelle de la réponse HTTP.
- La logique métier ne doit pas vivre dans les routes.
- La logique réutilisable doit être déplacée vers `services/`.

### Frontend

- Les pages et layouts vivent dans `frontend/src/app/`.
- Les appels réseau, helpers API, types DTO et wrappers de fetch doivent vivre dans `frontend/src/lib/api/`.
- Les composants UI doivent rester découplés de la logique de requête autant que possible.

## Bonne pratique

Un fichier doit avoir une responsabilité claire et unique.  
Si un fichier mélange route HTTP, accès SQL, logique métier, transformation de données et gestion d’erreur détaillée, il est probablement trop gros.

---

# 3. Conventions API

## Format de réponse standard

Toutes les routes HTTP doivent retourner un format homogène :

```json
{
  "success": true,
  "data": {}
}
```

ou en cas d’erreur :

```json
{
  "success": false,
  "error": "Message d'erreur"
}
```

## Règles

- `success` est **obligatoire**.
- `data` est présent en cas de succès.
- `error` est présent en cas d’échec.
- Éviter les formats de réponse ad hoc selon les endpoints.
- Un seul format de réponse API doit être utilisé dans tout le projet.

## Versionning

Les routes doivent être versionnées :

- préfixe standard : `/api/v1/...`

Exemples :

- `/api/v1/users`
- `/api/v1/integrations`
- `/api/v1/tasks/:id`

## Authentification

Les endpoints doivent accepter l’un des mécanismes suivants selon le cas d’usage :

- `Authorization: Bearer <token>` pour les tokens Supabase
- `X-API-Key: <key>` pour les intégrations serveur à serveur ou usages techniques

## Compatibilité frontend

Pour certains endpoints de configuration, les champs doivent être retournés **au top-level** si cela est requis pour la compatibilité frontend existante.

Exemple :

```json
{
  "success": true,
  "theme": "dark",
  "features": ["a", "b"]
}
```

au lieu de forcer systématiquement :

```json
{
  "success": true,
  "data": {
    "theme": "dark",
    "features": ["a", "b"]
  }
}
```

Cette exception doit rester limitée aux endpoints explicitement identifiés comme contraintes de compatibilité.

## Statuts HTTP

Les statuts HTTP doivent correspondre à la réalité métier :

- `200` : succès standard
- `201` : ressource créée
- `204` : succès sans contenu
- `400` : requête invalide
- `401` : non authentifié
- `403` : interdit
- `404` : ressource introuvable
- `409` : conflit métier
- `422` : données valides syntaxiquement mais rejetées fonctionnellement
- `500` : erreur serveur
- `502/503/504` : dépendance externe ou indisponibilité infrastructure

Ne pas retourner `200` pour masquer une erreur métier.

---

# 4. Base de données

## Standard

La base de données de référence est **PostgreSQL via Supabase**.

## Schéma

Le schéma principal utilisé est :

- `tenant_vutler`

Les requêtes SQL doivent cibler explicitement les tables du schéma attendu lorsque nécessaire.

## Connexion

Il doit exister **un seul pool de connexion partagé** pour l’application, via :

- `lib/vaultbrix.js`

## Règles obligatoires

- Utiliser exclusivement des **requêtes paramétrées**.
- Interdiction absolue de concaténer des entrées utilisateur dans les requêtes SQL.
- Pas d’ORM.
- Accès SQL en **raw SQL** via `pool.query()`.

## Exemples

### Correct

```js
const result = await pool.query(
  'SELECT * FROM tenant_vutler.users WHERE id = $1',
  [userId]
);
```

### Interdit

```js
const result = await pool.query(
  `SELECT * FROM tenant_vutler.users WHERE id = '${userId}'`
);
```

## Migrations

Les évolutions de schéma doivent être gérées via des **scripts SQL**.

Règles :

- chaque migration doit être explicite, relisible et idempotente si possible ;
- éviter les changements manuels non tracés ;
- documenter tout changement de schéma impactant l’API ou le frontend.

## Accès aux données

- Les accès SQL doivent être regroupés de manière logique.
- Éviter de disséminer les requêtes partout dans les routes.
- Les opérations complexes doivent être isolées dans des services ou modules dédiés.

---

# 5. Sécurité

## Principe général

Les routes sont **protégées par défaut**.

Toute route non protégée doit être un choix explicite, justifié et documenté.

## Auth guards

Un guard d’authentification est obligatoire pour les routes sensibles, notamment :

- sandbox
- intégrations
- exécution de tâches
- accès à des données utilisateur
- endpoints d’administration ou de configuration

## Validation des entrées

Toutes les entrées doivent être validées **avant traitement** :

- `req.params`
- `req.query`
- `req.body`
- headers utiles

Ne jamais supposer qu’une donnée reçue est correcte.

## Secrets

- Les secrets doivent être stockés en variables d’environnement.
- Les fichiers `.env` doivent être ignorés par Git.
- Aucun secret ne doit être hardcodé dans le code.

## Tokens sensibles

Les tokens OAuth doivent être :

- stockés chiffrés en base ;
- récupérés de manière sécurisée ;
- jamais exposés inutilement aux logs ou au frontend.

## Logging

Il est interdit de logger :

- mots de passe
- access tokens
- refresh tokens
- secrets applicatifs
- clés API complètes
- payloads sensibles non filtrés

Si un identifiant technique doit être tracé, préférer une version partiellement masquée.

## Surface d’attaque

- Limiter les permissions accordées aux clés et tokens.
- Vérifier les accès aux ressources par utilisateur, tenant ou contexte.
- Refuser par défaut ce qui n’est pas explicitement autorisé.

---

# 6. Intégration LLM

## Principe de séparation

Dans `llmRouter`, distinguer clairement :

- **provider** : fournisseur (ex. Anthropic, OpenAI/Codex, autre)
- **model** : modèle cible
- **transport** : mode d’appel ou de streaming

Ces notions ne doivent pas être mélangées dans une seule abstraction floue.

## Convention provider Codex

Pour le provider Codex :

- utiliser le champ `instructions` plutôt que `messages` lorsque requis ;
- forcer `store: false` ;
- utiliser `stream: true` lorsque le flux est prévu.

## Streaming

Le streaming de réponse pour Codex doit être géré en **SSE** lorsque ce mode est utilisé.

## Fallback

Le `taskExecutor` doit prévoir un **fallback automatique vers Anthropic** lorsque le provider principal échoue ou n’est pas disponible, selon les règles métier définies.

## OAuth et résolution de tokens

La résolution des tokens OAuth nécessaires aux providers ou intégrations doit passer par le **pool DB partagé**.

Aucune logique parallèle de récupération de secrets ne doit contourner les conventions de sécurité et d’accès aux données.

## Règles de robustesse

- Toujours gérer les timeouts, erreurs réseau et réponses incomplètes.
- Ne pas supposer qu’un provider répond de façon homogène avec un autre.
- Journaliser le contexte utile sans exposer les secrets ni le contenu sensible.

---

# 7. Gestion des erreurs

## Standardisation

Les erreurs doivent être structurées et prévisibles.

## Classes d’erreurs métier

Créer et utiliser des classes dédiées quand cela a du sens, par exemple :

- `ValidationError`
- `NotFoundError`
- `UnauthorizedError`
- `ForbiddenError`
- `ConflictError`

## Handler centralisé

Le backend doit utiliser un **handler d’erreur centralisé**.

Objectifs :

- éviter la duplication ;
- garantir une réponse homogène ;
- contrôler précisément les statuts HTTP ;
- centraliser les logs serveur.

## Distinction 4xx / 5xx

- Les erreurs **4xx** représentent une erreur côté client, appelant ou données fournies.
- Les erreurs **5xx** représentent une erreur côté serveur, infrastructure ou dépendance.

Il ne faut pas transformer arbitrairement une erreur serveur en erreur client, ni l’inverse.

## Logging des erreurs

Les erreurs 5xx doivent être loggées avec suffisamment de contexte pour être investiguées :

- route concernée ;
- identifiant de requête si disponible ;
- utilisateur ou tenant si pertinent ;
- provider externe si concerné ;
- stack trace côté serveur.

Mais sans exposer de secrets ni de données sensibles.

## Messages d’erreur

- Les messages retournés au client doivent être utiles mais sûrs.
- Ne pas exposer les détails internes SQL, stack traces ou secrets dans les réponses HTTP.

---

# 8. TypeScript

## Frontend

Le frontend doit être en **TypeScript strict**.

Règles :

- `strict` activé ;
- types explicites pour les entités métier ;
- éviter les types implicites fragiles ;
- ne pas utiliser `any` sauf exception rare, documentée et temporaire.

## Entités métier

Les types des objets métier doivent être nommés, centralisés et réutilisables :

- utilisateurs
- tâches
- intégrations
- providers
- configurations
- réponses API

## Backend JavaScript

Le backend restant en JavaScript CommonJS, les fichiers JS existants doivent utiliser au minimum :

- `@ts-check`
- JSDoc utiles sur les fonctions publiques ou sensibles

## Exemple

```js
// @ts-check

/**
 * @param {string} userId
 * @returns {Promise<{ id: string, email: string | null } | null>}
 */
async function findUserById(userId) {
  // ...
}
```

## Règle

Même en JavaScript, le code doit tendre vers une lisibilité de type suffisante pour limiter les erreurs.

---

# 9. Async / Await

## Standard

Utiliser **async/await partout**.

## Interdit sauf cas particulier justifié

- chaînes `.then().catch()` en logique applicative courante ;
- promesses imbriquées difficiles à lire ;
- gestion implicite d’erreurs asynchrones.

## Bonnes pratiques

- Utiliser `Promise.all()` pour les opérations parallèles indépendantes.
- Utiliser `Promise.allSettled()` si certaines erreurs sont acceptables sans faire échouer l’ensemble.
- Toujours gérer explicitement les erreurs asynchrones.
- Ne jamais laisser une promesse rejetée sans traitement.

## Règle forte

Ne jamais ignorer un `.catch()` quand une promesse n’est pas `await`ée.

## Exemple recommandé

```js
const [user, settings] = await Promise.all([
  getUser(userId),
  getUserSettings(userId)
]);
```

## Exemple à éviter

```js
getUser(userId).then((user) => {
  getUserSettings(userId).then((settings) => {
    // ...
  });
});
```

---

# 10. Organisation du code

## Principes

### Pas de code mort

- Supprimer les fonctions, fichiers, branches conditionnelles et imports inutilisés.
- Ne pas laisser de vieux patterns “au cas où”.
- Toute compatibilité legacy doit être explicitement justifiée.

### Un seul format de réponse API

Le projet doit converger vers un format de réponse unifié.  
Les exceptions doivent être rares, documentées et motivées par une contrainte réelle.

### SRP — Single Responsibility Principle

Chaque fichier, module ou service doit avoir **une seule responsabilité principale**.

Exemples :

- une route expose une ressource ;
- un service applique une logique métier ;
- un module SQL gère un accès de données cohérent ;
- un composant UI affiche une responsabilité visuelle claire.

## Règles de lisibilité

- Préférer du code simple à du code “malin”.
- Préférer des noms explicites à des abréviations obscures.
- Limiter la profondeur d’imbrication.
- Factoriser ce qui est réellement partagé, pas ce qui pourrait l’être un jour.

## Imports et dépendances

- Éviter les dépendances inutiles.
- Avant d’ajouter une librairie, vérifier si le besoin peut être couvert proprement avec l’existant.
- Toute nouvelle dépendance structurante doit être cohérente avec cette stack cible.

## Cohérence avant préférence personnelle

Les développeurs peuvent avoir des préférences différentes, mais la cohérence du codebase passe avant les styles individuels.

---

# 11. Checklist de revue

Avant de valider un changement, vérifier au minimum :

## Backend

- [ ] route placée dans le bon domaine sous `api/`
- [ ] logique métier extraite dans `services/` si nécessaire
- [ ] format de réponse API respecté
- [ ] route versionnée en `/api/v1/...`
- [ ] auth vérifiée si endpoint non public
- [ ] entrées validées
- [ ] requêtes SQL paramétrées
- [ ] aucune concaténation SQL
- [ ] pas de secret dans les logs
- [ ] erreurs correctement classées en 4xx/5xx

## Frontend

- [ ] types explicites
- [ ] pas de `any` non justifié
- [ ] appels API centralisés de façon cohérente
- [ ] compatibilité avec les formats de réponse backend
- [ ] composants et logique métier raisonnablement découplés

## LLM / intégrations

- [ ] séparation claire provider / model / transport
- [ ] conventions Codex respectées
- [ ] fallback géré si nécessaire
- [ ] tokens résolus de manière sécurisée
- [ ] streaming géré proprement si utilisé

## Global

- [ ] pas de code mort
- [ ] responsabilité du fichier claire
- [ ] async/await utilisé proprement
- [ ] changement cohérent avec la stack actuelle
- [ ] aucune réintroduction de patterns obsolètes

---

# 12. Résumé exécutable

En cas de doute, appliquer ces règles simples :

1. Utiliser la stack actuelle, pas l’historique.
2. Express + services côté backend.
3. PostgreSQL via Supabase, avec `pool.query()` paramétré uniquement.
4. Routes sécurisées par défaut.
5. Réponses API homogènes.
6. TypeScript strict côté frontend.
7. `async/await` partout.
8. Erreurs centralisées et propres.
9. LLMs intégrés avec séparation provider / model / transport.
10. Aucun retour aux conventions Mongo / Meteor / DDP / Rocket.Chat.

---

# 13. Ce qui n’est plus un standard

Les éléments ci-dessous ne doivent plus être présentés comme conventions Vutler :

- MongoDB comme base principale
- Mongoose
- Prisma
- DDP
- patterns Meteor
- conventions Rocket.Chat
- abstraction temps réel héritée de Meteor
- logique métier directement couplée au transport
- formats de réponse API hétérogènes
- concaténation SQL
- stockage non chiffré de tokens OAuth
- usage de `any` sans justification
- chaînes `.then().catch()` comme style principal
```

Si tu veux, je peux aussi te faire une **version “prête à commit” plus concise et plus normative**, avec un ton plus sec de documentation interne, ou une **diff structurée section par section** pour faciliter le remplacement de l’ancien fichier.
