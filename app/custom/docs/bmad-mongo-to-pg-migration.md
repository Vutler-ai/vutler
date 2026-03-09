# BMAD — Migration MongoDB → PostgreSQL (Vaultbrix) & Chat Runtime v1

> **Projet** : Vutler by Starbox Group  
> **Date** : 2026-03-08  
> **Auteur** : Agent BMAD  
> **Statut** : Draft  
> **Sprint cible** : S12+  

---

## Résumé exécutif

Vutler a été construit initialement sur Rocket.Chat (MongoDB). La migration vers notre propre stack est quasi-complète : les tables PostgreSQL (Vaultbrix) sont en place, le frontend pointe déjà vers les bons endpoints. **9 fichiers** contiennent encore des références MongoDB qu'il faut éliminer, et le **Chat Runtime natif** (agents IA répondant via LLM) doit être activé.

Ce document n'est pas un nouveau produit — c'est du **nettoyage d'infrastructure** avec activation d'une capacité déjà architecturée.

---

## Phase B — Business

### B.1 Objectif stratégique

Supprimer toute dépendance à MongoDB/Rocket.Chat et activer le runtime de chat natif où les 19 agents IA répondent directement aux utilisateurs via LLM, sans intermédiaire RC.

### B.2 User Stories

| # | Story | Priorité |
|---|-------|----------|
| US-1 | **En tant qu'utilisateur**, je peux envoyer un message dans un channel et recevoir une réponse d'un agent IA en < 500ms | P0 |
| US-2 | **En tant qu'agent IA**, je reçois les messages via le Chat Runtime natif (polling PG) et je réponds via LLM sans passer par Rocket.Chat | P0 |
| US-3 | **En tant que développeur**, je peux démarrer le container Vutler sans qu'aucune connexion MongoDB ne soit tentée | P0 |
| US-4 | **En tant qu'utilisateur**, je vois mes channels et historique de messages sans aucun changement d'UI | P1 |
| US-5 | **En tant qu'admin**, les 19 agents sont actifs et assignés à leurs channels respectifs au démarrage | P1 |
| US-6 | **En tant que développeur**, `package.json` ne contient plus la dépendance `mongodb` et le container est plus léger | P2 |

### B.3 Métriques de succès

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Références MongoDB dans le code | **0** | `grep -r "mongo\|MongoDB\|MongoClient\|rocketchat_" --include="*.js"` |
| Temps de réponse agent au chat | **< 500ms** | Timestamp message → timestamp réponse agent |
| Agents actifs au démarrage | **19/19** | Log `[ChatRuntime] Agents loaded: 19` |
| Channels fonctionnels | **10/10** | `GET /chat/channels` retourne 10 résultats |
| Tests E2E passants | **100%** | Suite de tests post-migration |
| Taille image Docker | **Réduite** | Avant/après suppression dépendance mongodb |

### B.4 Risques

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Casser l'API chat pendant la migration | Élevé | Moyenne | Migration fichier par fichier, tests après chaque changement |
| Auth cassée (users_auth PG incomplet) | Élevé | Faible | Vérifier que tous les users RC sont dans `users_auth` avant migration |
| Agents ne répondent pas après activation runtime | Moyen | Moyenne | Fallback : endpoint `/chat/message` fonctionne même sans runtime actif |
| Perte de messages historiques | Moyen | Faible | Les messages sont déjà dans `chat_messages` PG — pas de migration de données nécessaire |

---

## Phase M — Metrics & Acceptance Criteria

### M.1 Critères d'acceptation par fichier

| # | Fichier | Critère d'acceptation | Vérification |
|---|---------|----------------------|--------------|
| 1 | `index.js` | Aucun `MongoClient`, aucun `require('mongodb')`, démarrage sans erreur | Container start + logs propres |
| 2 | `api/chat.js` | Toutes les queries utilisent `pool.query()` PG, aucune ref `rocketchat_room`/`rocketchat_message` | `grep` + test endpoints CRUD |
| 3 | `api/agents.js` | Aucun fallback Mongo, toutes les données viennent de table `agents` PG | `GET /agents` retourne 19 agents |
| 4 | `api/ui-pack.js` | Mongo refs supprimées ou fichier supprimé si inutile | Audit du fichier |
| 5 | `lib/auth.js` | Auth via `users_auth` PG uniquement, aucune vérification Mongo | Login + token validation fonctionnels |
| 6 | `services/whatsappMirror.js` | **Fichier supprimé** (deprecated) | Fichier absent du repo |
| 7 | `scripts/verify-whatsapp-mirror-e2e.js` | **Fichier supprimé** (deprecated) | Fichier absent du repo |
| 8 | `scripts/backfill-core-permissions.js` | **Fichier supprimé** ou nettoyé des refs Mongo | Fichier absent ou propre |
| 9 | `index.js.backup` | **Fichier supprimé** | Fichier absent du repo |

### M.2 Definition of Done (DoD)

- [ ] `grep -ri "mongo" --include="*.js" /app/custom/` retourne **0 résultat**
- [ ] `grep -ri "rocketchat_" --include="*.js" /app/custom/` retourne **0 résultat**
- [ ] `package.json` ne contient pas `"mongodb"`
- [ ] `node_modules/mongodb` absent du container
- [ ] Container `vutler-api` démarre sans erreur
- [ ] `GET /chat/channels` retourne 10 channels depuis PG
- [ ] `POST /chat/message` crée un message dans `chat_messages` PG
- [ ] Chat Runtime polling actif, agents répondent via LLM
- [ ] 19 agents chargés au démarrage (vérifié dans les logs)
- [ ] Suite de tests E2E passe à 100%
- [ ] Aucune connexion MongoDB dans les logs réseau du container

### M.3 Métriques de suivi

| Phase | Métrique | Outil |
|-------|----------|-------|
| Pendant migration | Fichiers migrés / 9 | Checklist manuelle |
| Post-migration | Erreurs 500 sur endpoints chat | Logs PM2 |
| Post-activation | Messages traités par ChatRuntime / minute | Counter interne |
| Post-activation | Latence LLM p95 | Logs structurés |

---

## Phase A — Architecture

### A.1 Vue d'ensemble de la migration

```
AVANT (état actuel)                    APRÈS (cible)
─────────────────                      ─────────────
index.js                               index.js
  └─ MongoClient.connect()               └─ (supprimé)
  └─ pool (PG) ✓                          └─ pool (PG) ✓
                                          └─ ChatRuntime.start()

api/chat.js                            api/chat.js
  └─ db.collection('rocketchat_room')     └─ pool.query('SELECT FROM chat_channels')
  └─ db.collection('rocketchat_message')  └─ pool.query('SELECT FROM chat_messages')

lib/auth.js                            lib/auth.js
  └─ db.collection('users').findOne()     └─ pool.query('SELECT FROM users_auth')

services/whatsappMirror.js             (supprimé)
scripts/verify-whatsapp-mirror-e2e.js  (supprimé)
scripts/backfill-core-permissions.js   (supprimé)
index.js.backup                        (supprimé)
```

### A.2 Plan de migration par fichier

#### Fichier 1 : `index.js` — Nettoyage connexion MongoDB

**Changements :**
- Supprimer `const { MongoClient } = require('mongodb')`
- Supprimer le bloc `MongoClient.connect(MONGODB_URI)` et le callback/promise associé
- Supprimer la variable `db` (instance Mongo) et toutes ses propagations (`app.locals.db`, `req.db`, etc.)
- Supprimer `MONGODB_URI` des variables d'environnement lues
- Ajouter `const ChatRuntime = require('./services/chatRuntime')`
- Ajouter `ChatRuntime.start(pool)` après l'init Express

**Risque :** Élevé — fichier d'entrée principal. Tester immédiatement après.

#### Fichier 2 : `api/chat.js` — Migration CRUD chat

**Changements :**
- Remplacer toutes les opérations `db.collection('rocketchat_room')` par des queries sur `chat_channels`
- Remplacer `db.collection('rocketchat_message')` par des queries sur `chat_messages`
- Mapping des champs :
  - `rocketchat_room._id` → `chat_channels.id`
  - `rocketchat_room.name` → `chat_channels.name`
  - `rocketchat_room.fname` → `chat_channels.display_name`
  - `rocketchat_message.msg` → `chat_messages.content`
  - `rocketchat_message.u._id` → `chat_messages.sender_id`
  - `rocketchat_message.ts` → `chat_messages.created_at`
- Utiliser `req.pool` ou import direct de `lib/postgres.js`

#### Fichier 3 : `api/agents.js` — Supprimer fallback Mongo

**Changements :**
- Identifier et supprimer tout bloc `if (!agent) { /* fallback mongo */ }`
- S'assurer que toutes les routes utilisent exclusivement la table `agents` PG
- Vérifier que les 19 agents sont bien dans PG : `SELECT count(*) FROM tenant_vutler.agents`

#### Fichier 4 : `api/ui-pack.js` — Audit et nettoyage

**Changements :**
- Auditer l'utilisation réelle de MongoDB dans ce fichier
- Si le fichier ne sert qu'à lire des configs RC : supprimer les refs Mongo, pointer vers PG ou config statique
- Si le fichier entier est un vestige RC : le supprimer

#### Fichier 5 : `lib/auth.js` — Migration authentification

**Changements :**
- Remplacer `db.collection('users').findOne({ _id: userId })` par :
  ```javascript
  const result = await pool.query(
    'SELECT * FROM tenant_vutler.users_auth WHERE id = $1',
    [userId]
  );
  ```
- Adapter le mapping des champs user (RC → PG)
- Vérifier que les tokens JWT restent compatibles

#### Fichiers 6-9 : Suppressions

| Fichier | Action |
|---------|--------|
| `services/whatsappMirror.js` | `rm` — deprecated, remplacé par intégration WhatsApp native |
| `scripts/verify-whatsapp-mirror-e2e.js` | `rm` — test du service supprimé |
| `scripts/backfill-core-permissions.js` | `rm` — migration one-shot déjà exécutée |
| `index.js.backup` | `rm` — backup obsolète |

### A.3 Architecture du Chat Runtime (`chatRuntime.js`)

```
┌─────────────────────────────────────────────────┐
│                  ChatRuntime                      │
│                                                   │
│  ┌──────────┐    ┌──────────┐    ┌────────────┐ │
│  │  Poller   │───▶│ Dispatcher│───▶│ LLM Router │ │
│  │ (3s loop) │    │           │    │            │ │
│  └──────────┘    └──────────┘    └────────────┘ │
│       │               │               │          │
│       ▼               ▼               ▼          │
│  chat_messages   agents table    OpenAI/Claude   │
│  (PG polling)    (routing)       (completion)    │
│                                                   │
│  Flow:                                            │
│  1. Poll chat_messages WHERE processed = false    │
│  2. Match message.channel → agent assignment      │
│  3. Build context (last N messages)               │
│  4. Route to LLM via llmRouter.js                 │
│  5. INSERT response into chat_messages            │
│  6. Mark original message as processed            │
└─────────────────────────────────────────────────┘
```

**Composants clés :**

```javascript
// services/chatRuntime.js — Structure cible
class ChatRuntime {
  constructor(pool) {
    this.pool = pool;
    this.agents = new Map();      // agentId → config
    this.pollInterval = 3000;     // 3s polling
    this.running = false;
  }

  async start() {
    await this._loadAgents();
    this._startPolling();
    console.log(`[ChatRuntime] Started — ${this.agents.size} agents loaded`);
  }

  async _loadAgents() {
    const { rows } = await this.pool.query(
      'SELECT * FROM tenant_vutler.agents WHERE status = $1',
      ['active']
    );
    rows.forEach(a => this.agents.set(a.id, a));
  }

  async _poll() {
    const { rows: messages } = await this.pool.query(
      `SELECT m.*, c.name as channel_name 
       FROM tenant_vutler.chat_messages m
       JOIN tenant_vutler.chat_channels c ON m.channel_id = c.id
       WHERE m.processed = false AND m.sender_type = 'user'
       ORDER BY m.created_at ASC LIMIT 10`
    );
    for (const msg of messages) {
      await this._processMessage(msg);
    }
  }

  async _processMessage(msg) {
    // 1. Find assigned agent for channel
    // 2. Build conversation context
    // 3. Call LLM via llmRouter
    // 4. Insert response
    // 5. Mark processed
  }
}
```

### A.4 Schéma des tables PG (existantes)

```sql
-- Déjà en place dans tenant_vutler
chat_channels (id, workspace_id, name, display_name, type, created_at, updated_at)
chat_messages (id, channel_id, sender_id, sender_type, content, processed, created_at)
chat_channel_members (channel_id, user_id, role, joined_at)
agents (id, workspace_id, name, model, system_prompt, status, channels, created_at)
agent_conversations (id, agent_id, channel_id, messages_jsonb, created_at)
users_auth (id, workspace_id, email, password_hash, display_name, role, created_at)
```

### A.5 Nettoyage `package.json`

```diff
  "dependencies": {
-   "mongodb": "^6.x",
    "pg": "^8.x",
    "express": "^4.x",
    ...
  }
```

Après suppression : `npm install` dans le Dockerfile pour rebuild propre.

### A.6 Variables d'environnement à nettoyer

```diff
- MONGODB_URI=mongodb://vutler-mongo:27017/rocketchat
- RC_WS_URL=ws://vutler-rocketchat:3000/websocket
- RC_API_URL=http://vutler-rocketchat:3000
- RC_ADMIN_TOKEN=xxx
- RC_ADMIN_USER_ID=xxx
```

Ces variables peuvent être retirées du `.env` et du `docker-compose.yml`.

### A.7 Ordre d'exécution recommandé

```
Chunk 1 : Fichiers à supprimer (6, 7, 8, 9)        → Risque faible
Chunk 2 : api/ui-pack.js audit + nettoyage (4)      → Risque faible
Chunk 3 : api/agents.js suppression fallback (3)     → Risque moyen
Chunk 4 : lib/auth.js migration auth (5)             → Risque élevé
Chunk 5 : api/chat.js migration CRUD (2)             → Risque élevé
Chunk 6 : index.js nettoyage connexion (1)           → Risque élevé
Chunk 7 : chatRuntime.js création + activation       → Risque moyen
Chunk 8 : package.json + docker rebuild + tests      → Risque moyen
```

Chaque chunk : implémentation → test local → deploy VPS → vérification prod.

---

## Phase D — Design

### D.1 Impact UI

**Aucun changement frontend requis.**

Le frontend utilise déjà les endpoints REST corrects :
- `fetchWithAuth('/chat/channels')` → liste des channels
- `fetchWithAuth('/chat/channels/:id/messages')` → historique
- `fetchWithAuth('/chat/message')` → envoi de message

Le backend doit simplement retourner les mêmes structures JSON depuis PG au lieu de MongoDB.

### D.2 Contrat API (inchangé)

```javascript
// GET /chat/channels — Response format (maintenu)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "general",
      "display_name": "Général",
      "type": "channel",
      "members_count": 5,
      "last_message": { ... }
    }
  ]
}

// GET /chat/channels/:id/messages — Response format (maintenu)
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "content": "Bonjour, comment puis-je vous aider ?",
      "sender_id": "agent-uuid",
      "sender_type": "agent",
      "sender_name": "Rex",
      "created_at": "2026-03-08T19:00:00Z"
    }
  ]
}
```

### D.3 Mapping des champs RC → PG

| Champ Rocket.Chat (MongoDB) | Champ PostgreSQL | Notes |
|------------------------------|------------------|-------|
| `_id` (ObjectId string) | `id` (UUID) | Nouveau format |
| `name` | `name` | Identique |
| `fname` | `display_name` | Renommé |
| `t` ("c", "p", "d") | `type` ("channel", "private", "direct") | Valeurs explicites |
| `msgs` | Calculé via COUNT | Plus de dénormalisation |
| `u._id` | `sender_id` | Relation directe |
| `u.username` | JOIN sur `users_auth.display_name` | Plus de sous-document |
| `msg` | `content` | Renommé |
| `ts` (Date) | `created_at` (timestamptz) | Type natif PG |

### D.4 Diagramme de séquence — Message utilisateur → Réponse agent

```
Utilisateur          Frontend            API (chat.js)         ChatRuntime         LLM Router
    │                    │                    │                     │                   │
    │── tape message ──▶│                    │                     │                   │
    │                    │── POST /chat/msg ─▶│                    │                   │
    │                    │                    │── INSERT INTO       │                   │
    │                    │                    │   chat_messages ──▶│                   │
    │                    │◀── 201 Created ────│                    │                   │
    │                    │                    │                     │                   │
    │                    │                    │     (polling 3s)    │                   │
    │                    │                    │                     │── SELECT unproc. ─│
    │                    │                    │                     │── build context ──│
    │                    │                    │                     │── call LLM ──────▶│
    │                    │                    │                     │◀── response ──────│
    │                    │                    │                     │── INSERT response │
    │                    │                    │                     │── UPDATE processed│
    │                    │                    │                     │                   │
    │                    │── GET /messages ──▶│                    │                   │
    │                    │◀── [user msg +    ─│                    │                   │
    │                    │    agent response]  │                    │                   │
    │◀── affiche ────────│                    │                    │                   │
```

### D.5 Considérations de performance

- **Polling 3s** : acceptable pour v1, migration vers WebSocket/LISTEN-NOTIFY PG en v2
- **Batch processing** : traiter jusqu'à 10 messages par cycle de poll
- **Connection pooling** : réutiliser le pool PG existant (pas de nouvelles connexions)
- **Index requis** : `CREATE INDEX idx_chat_messages_unprocessed ON chat_messages(processed, created_at) WHERE processed = false`

### D.6 Rollback plan

Si la migration cause des problèmes critiques en production :
1. `git revert` du commit de migration
2. Rebuild container avec anciennes dépendances
3. Les données PG restent intactes (pas de perte)
4. Le `index.js.backup` n'est PAS le rollback plan — c'est le git history

---

## Annexe — Checklist d'implémentation

```
[ ] Chunk 1 : rm whatsappMirror.js, verify-whatsapp-mirror-e2e.js, 
              backfill-core-permissions.js, index.js.backup
[ ] Chunk 2 : Audit + nettoyage ui-pack.js
[ ] Chunk 3 : Supprimer fallback Mongo dans agents.js
[ ] Chunk 4 : Migrer auth.js vers users_auth PG
[ ] Chunk 5 : Migrer chat.js vers chat_channels/chat_messages PG
[ ] Chunk 6 : Nettoyer index.js (supprimer MongoClient, ajouter ChatRuntime)
[ ] Chunk 7 : Créer chatRuntime.js + activer
[ ] Chunk 8 : Supprimer mongodb de package.json, rebuild Docker, tests E2E
[ ] Validation finale : grep mongo = 0, 19 agents actifs, 10 channels OK
```

---

*Document généré le 2026-03-08 — BMAD Framework v1*  
*Projet : Vutler by Starbox Group*
