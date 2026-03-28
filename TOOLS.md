# TOOLS.md

# Outils internes & intégrations MCP

Ce document décrit les principaux outils internes utilisés par Vutler, ainsi que les intégrations MCP disponibles pour le contexte, la mémoire, la délégation de tâches et certaines capacités agents.

> Ne jamais stocker de secrets, API keys, tokens ou credentials dans ce fichier.

---

## 1. Snipara MCP (Context & Memory)

Snipara est utilisé comme couche de **context retrieval** et de **mémoire persistante** pour les agents.

- **Project**: `vutler`
- **Team**: `alopez-nevicom`

### Rôle
Snipara permet de :
- rechercher efficacement dans la documentation interne,
- poser des questions simples sur la base documentaire,
- stocker des souvenirs persistants,
- rappeler des informations apprises précédemment,
- partager du contexte entre collections,
- uploader ou mettre à jour des documents de référence.

### Outils principaux

| Tool | Usage |
|------|-------|
| `rlm_context_query` | Query optimisé pour chercher dans les docs avec récupération de contexte pertinente |
| `rlm_ask` | Question simple sur la documentation |
| `rlm_search` | Regex / text search dans les documents |
| `rlm_remember` | Stocker un souvenir persistant (`fact`, `decision`, `learning`) |
| `rlm_recall` | Rappeler des souvenirs de manière sémantique |
| `rlm_shared_context` | Accéder à du contexte partagé entre collections |
| `rlm_upload_document` | Uploader ou mettre à jour un document |

### Recommandations d’usage
- Utiliser `rlm_context_query` en priorité pour les recherches documentaires.
- Utiliser `rlm_ask` pour des questions directes sur un corpus bien indexé.
- Utiliser `rlm_remember` uniquement pour des informations durables et utiles à long terme.
- Éviter de stocker des informations sensibles ou temporaires dans la mémoire.
- Utiliser `rlm_upload_document` pour garder la base documentaire synchronisée.

---

## 2. MCP Nexus Bridge (Task Delegation)

Le **MCP Nexus Bridge** permet de déléguer des tâches aux agents Vutler depuis Claude Code ou tout autre client compatible MCP.

- **Package npm**: `@vutler/mcp-nexus`

### Rôle
Le bridge sert d’adaptateur entre :
- un client MCP (ex. Claude Code),
- et l’API Vutler.

En pratique, il **traduit les appels MCP en requêtes API Vutler**.

### Authentification
- Auth via header `X-API-Key`
- Clé générée dans **Settings > API Keys**

> Ne jamais committer une API key dans le repo.

### Configuration
Le bridge peut être configuré dans :
- `.mcp.json`
- ou les settings du client MCP / Claude Code

### Cas d’usage
- déléguer une tâche à un agent Vutler depuis Claude Code,
- exposer les agents Vutler comme outils MCP dans un environnement externe,
- centraliser l’exécution agent via l’API Vutler.

---

## 3. Snipara Config dans Settings

La configuration Snipara est **gérée par workspace** dans les Settings.

### Impact
Cette configuration influence :
- la **task execution**,
- le **context enrichment**,
- la qualité de récupération documentaire,
- les capacités de mémoire des agents.

### Paramètres typiques
- `project ID`
- `API key`
- `collection`

### Notes
- Chaque workspace peut avoir sa propre configuration.
- Une mauvaise config Snipara dégrade fortement la qualité du contexte injecté dans les tâches.
- Les secrets doivent rester dans les Settings / variables sécurisées, jamais dans la doc.

---

## 4. Claude Code Integration

Les agents Vutler sont accessibles depuis **Claude Code** via le **MCP Nexus Bridge**.

### Ce que ça permet
Depuis une session Claude Code, on peut :
- appeler un agent Vutler,
- déléguer une tâche spécialisée,
- s’appuyer sur les workflows ou capacités déjà exposés par Vutler.

### Cas d’usage
- déléguer une tâche à **Jarvis** ou **Mike** depuis Claude Code,
- orchestrer une session locale avec des agents Vutler distants,
- utiliser Claude Code comme client MCP pour piloter des agents métier.

### Produit / UX
- Une section ou tab dédiée **MCP** existe sur la landing page pour présenter cette intégration.

---

## 5. Post for Me (Social Media)

`Post for Me` est l’intégration social media de Vutler.

### Rôle
Elle permet à certains agents de :
- publier du contenu sur des réseaux sociaux,
- automatiser des actions de diffusion,
- exécuter des workflows de publication.

### Business model
- disponible via des **Stripe addon packs**

### Précautions
- Toute action de publication est une action **externe et publique**
- Nécessite des garde-fous clairs côté produit et agent
- Éviter toute publication automatique non validée lorsque le contexte est ambigu

---

## 6. OAuth ChatGPT (Provider Codex)

Vutler supporte une intégration OAuth avec ChatGPT pour le provider **Codex**.

### Fonctionnement
- flow de **device auth** pour connecter un compte ChatGPT
- token stocké en base de données
- refresh automatique du token

### Endpoint utilisé
- `chatgpt.com/backend-api/codex/responses`

### Modèles concernés
Cette intégration est utilisée par les modèles `codex/*`, par exemple :
- `gpt-5.4`
- `gpt-5.3-codex-spark`

### Notes
- Le token utilisateur doit être stocké de manière sécurisée
- Aucun token ne doit apparaître dans la documentation, les logs non sécurisés ou le code source

---

## 7. Outils Agents Internes

En plus des intégrations externes, certains outils sont directement exposés aux agents internes.

### `remember()` / `recall()`
Mémoire persistante via Snipara.

- `remember()` : stocke un fait, une décision ou un apprentissage utile
- `recall()` : récupère des souvenirs pertinents à partir d’une requête sémantique

**Usage recommandé**
- stocker des informations stables,
- éviter les données sensibles,
- privilégier les faits actionnables ou structurants.

### `web_search`
Recherche web pour enrichir le contexte avec des sources externes.

**Usage recommandé**
- vérifier une information externe,
- compléter un contexte produit / marché / technique,
- citer ou résumer des informations récentes.

### Sandbox code execution
Exécution de code dans un environnement isolé.

**Protection**
- protégé par un **auth guard**

**Usage recommandé**
- exécuter des scripts temporaires,
- tester des transformations,
- analyser ou produire des artefacts techniques sans exposer l’environnement principal.

---

## Bonnes pratiques générales

### Sécurité
- Ne jamais inclure de secrets dans la documentation
- Ne jamais committer de tokens, API keys ou credentials
- Préférer les variables sécurisées et les Settings workspace

### Documentation
- Documenter les capacités, pas les secrets
- Garder ce fichier à jour quand un outil est ajouté, renommé ou retiré
- Préciser les responsabilités et limites de chaque intégration

### Usage agent
- Favoriser les outils internes avant d’ajouter des dépendances externes
- Demander confirmation avant toute action publique ou irréversible
- Utiliser mémoire et contexte avec discernement

---

## Résumé

Les briques principales à connaître sont :

- **Snipara MCP** pour le contexte et la mémoire
- **MCP Nexus Bridge** pour exposer les agents Vutler via MCP
- **Claude Code integration** pour déléguer des tâches aux agents depuis un client MCP
- **Post for Me** pour les actions social media
- **OAuth ChatGPT / Codex** pour certains modèles connectés
- **remember / recall / web_search / sandbox** pour les capacités internes des agents

---

Si tu veux, je peux aussi te fournir une **version plus concise et plus “repo-ready”**, avec un ton encore plus uniforme, comme un vrai `TOOLS.md` de projet.
