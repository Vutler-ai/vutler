# VUTLER-TOOLS.md

Documentation des endpoints API actuels de Vutler, des méthodes d’authentification, et des principaux outils disponibles pour intégrer ou piloter la plateforme.

---

## 1. Informations de connexion

### Base URL
```text
https://app.vutler.ai
```

### Authentification
Vutler accepte deux modes d’authentification :

#### 1. Bearer token Supabase
À transmettre dans le header HTTP :

```http
Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
```

#### 2. API Key
À transmettre dans le header HTTP :

```http
X-API-Key: <VUTLER_API_KEY>
```

### Workspace ID par défaut
```text
00000000-0000-0000-0000-000000000001
```

> Selon l’endpoint et le contexte d’exécution, le workspace actif peut être résolu automatiquement côté backend.

---

## 2. Auth & Profile

### GET `/api/v1/auth/me`
Retourne le profil de l’utilisateur authentifié.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/auth/me" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### PUT `/api/v1/auth/me`
Met à jour le profil de l’utilisateur authentifié.

#### Exemple
```bash
curl -X PUT "https://app.vutler.ai/api/v1/auth/me" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "full_name": "Jean Dupont",
    "avatar_url": "https://example.com/avatar.png"
  }'
```

---

### POST `/api/v1/settings/api-keys`
Génère une nouvelle API key pour l’utilisateur courant.

#### Exemple
```bash
curl -X POST "https://app.vutler.ai/api/v1/settings/api-keys" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

> Conservez la clé retournée immédiatement. Selon l’implémentation, elle peut ne plus être réaffichée ensuite.

---

## 3. Tasks

API de gestion des tâches du workspace.

### Statuts disponibles
- `todo`
- `in_progress`
- `done`
- `backlog`

### Priorités disponibles
- `low`
- `medium`
- `high`
- `critical`

### Agents disponibles
- `jarvis`
- `mike`
- `philip`
- `luna`
- `andrea`
- `max`
- `victor`
- `oscar`
- `nora`
- `stephen`
- `sentinel`
- `marcus`

---

### GET `/api/v1/tasks-v2`
Liste les tâches.

#### Filtres supportés
- `status`
- `parent_id`
- `limit`

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/tasks-v2?status=pending&limit=25" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### POST `/api/v1/tasks-v2`
Crée une tâche.

#### Body
```json
{
  "title": "Corriger la documentation API",
  "description": "Mettre à jour les endpoints et exemples curl",
  "assignee": "jarvis",
  "priority": "high"
}
```

#### Important
Le champ d’entrée public reste `assignee` côté API.  
La v2 accepte aussi les métadonnées de workflow hiérarchique (`hierarchical`, `workflow_mode`, `level`) quand nécessaire.

#### Exemple
```bash
curl -X POST "https://app.vutler.ai/api/v1/tasks-v2" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "title": "Réécrire VUTLER-TOOLS.md",
    "description": "Documenter les endpoints API actuels",
    "assignee": "marcus",
    "priority": "critical"
  }'
```

---

### GET `/api/v1/tasks-v2/:id`
Retourne le détail d’une tâche.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/tasks-v2/123" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### PATCH `/api/v1/tasks-v2/:id`
Met à jour une tâche existante.

#### Exemple
```bash
curl -X PATCH "https://app.vutler.ai/api/v1/tasks-v2/123" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "status": "in_progress",
    "priority": "critical",
    "assignee": "luna"
  }'
```

> Comme pour la création, `assignee` reste accepté côté API.

---

## 4. Agents

Gestion des agents IA du workspace.

### GET `/api/v1/agents`
Liste les agents du workspace.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/agents" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### GET `/api/v1/agents/:id`
Retourne le détail d’un agent.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/agents/agent_123" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### PUT `/api/v1/agents/:id`
Met à jour un agent.

#### Exemple
```bash
curl -X PUT "https://app.vutler.ai/api/v1/agents/agent_123" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "name": "Marcus",
    "description": "Agent spécialisé en documentation technique"
  }'
```

---

### GET `/api/v1/agents/:id/config`
Retourne la configuration d’un agent.

Cette configuration peut inclure notamment :
- `model`
- `provider`
- `skills`
- paramètres de comportement
- intégrations associées

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/agents/agent_123/config" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### PUT `/api/v1/agents/:id/config`
Met à jour la configuration d’un agent.

#### Exemple
```bash
curl -X PUT "https://app.vutler.ai/api/v1/agents/agent_123/config" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "skills": ["documentation", "api", "qa"]
  }'
```

### Modèles actuels supportés
Exemples de modèles/providers actuellement utilisés ou supportés :

- `codex/gpt-5.4` via ChatGPT OAuth
- `codex/gpt-5.3-codex-spark` via ChatGPT OAuth
- `claude-sonnet-4-20250514` via Anthropic

Autres providers supportés :
- Mistral
- Groq
- OpenRouter
- Google

> La liste exacte disponible dépend de la configuration du workspace et des providers connectés.

---

## 5. Chat

Vutler utilise un **WebSocket natif** pour les messages temps réel.

- Pas d’intégration Rocket.Chat pour cette couche
- Communication temps réel via endpoint WebSocket dédié

### Principe
Le chat temps réel s’appuie sur une connexion WS authentifiée au backend Vutler.

> L’URL WebSocket exacte peut dépendre de l’environnement de déploiement et de la configuration frontend/backend.

---

## 6. Drive

Gestion des fichiers du workspace.

### GET `/api/v1/drive/files`
Liste les fichiers disponibles.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/drive/files" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### POST `/api/v1/drive/upload`
Upload un fichier dans le Drive workspace.

#### Exemple
```bash
curl -X POST "https://app.vutler.ai/api/v1/drive/upload" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -F "file=@./document.pdf"
```

### Stockage
VDrive s’appuie sur **Exoscale SOS (Swiss)** pour le stockage des fichiers.

---

## 7. Settings / Config

Configuration globale du workspace.

### GET `/api/v1/settings`
Retourne la configuration du workspace.

#### Important
La réponse retourne les paramètres du workspace sous `settings`.

#### Peut inclure
- configuration Snipara
- providers LLM
- intégrations
- options workspace

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/settings" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### PUT `/api/v1/settings`
Met à jour la configuration du workspace.

#### Exemple
```bash
curl -X PUT "https://app.vutler.ai/api/v1/settings" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "timezone": "Europe/Zurich",
    "language": "fr"
  }'
```

---

## 8. Integrations

Gestion des intégrations externes.

### GET `/api/v1/integrations`
Liste les intégrations configurées ou disponibles.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/integrations" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### POST `/api/v1/integrations/chatgpt/connect`
Initie le flux OAuth de connexion à ChatGPT.

#### Exemple
```bash
curl -X POST "https://app.vutler.ai/api/v1/integrations/chatgpt/connect" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### GET `/api/v1/integrations/chatgpt/poll`
Vérifie le statut de la connexion ChatGPT en cours.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/integrations/chatgpt/poll" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

## 9. LLM Providers

Gestion des providers LLM configurés pour le workspace.

### GET `/api/v1/llm/providers`
Liste les providers disponibles et/ou configurés.

#### Exemple
```bash
curl -X GET "https://app.vutler.ai/api/v1/llm/providers" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

---

### POST `/api/v1/llm/providers`
Ajoute ou met à jour un provider LLM.

#### Exemple
```bash
curl -X POST "https://app.vutler.ai/api/v1/llm/providers" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "provider": "anthropic",
    "apiKey": "sk-ant-xxx",
    "enabled": true
  }'
```

---

## 10. Unified Vutler MCP Server

### Package
```text
@vutler/mcp
```

### Authentification
Le bridge MCP utilise l’authentification par :

```http
X-API-Key: <VUTLER_API_KEY>
```

### Usage
Le serveur MCP Vutler permet d’opérer le workspace Vutler et de déléguer des tâches aux agents depuis des environnements compatibles MCP, notamment **Claude Code**.

### Cas d’usage typiques
- créer et assigner des tâches à des agents
- interroger l’état des agents
- opérer email, tasks, files, calendar, memory ou clients selon le plan
- connecter Claude Code à un workspace Vutler

---

## 11. Sandbox

### POST `/api/v1/sandbox/execute`
Exécute du code dans un environnement sandboxé.

#### Important
Cet endpoint est désormais **protégé par auth guard**.  
Il n’est plus accessible anonymement.

Protection ajoutée : **mars 2026**

#### Exemple
```bash
curl -X POST "https://app.vutler.ai/api/v1/sandbox/execute" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "language": "javascript",
    "code": "console.log(\"hello from sandbox\")"
  }'
```

---

## 12. Exemples curl

Cette section regroupe les opérations courantes avec authentification via `X-API-Key`.

### Lire son profil
```bash
curl -X GET "https://app.vutler.ai/api/v1/auth/me" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Mettre à jour son profil
```bash
curl -X PUT "https://app.vutler.ai/api/v1/auth/me" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "full_name": "Alice Martin"
  }'
```

### Générer une API key
```bash
curl -X POST "https://app.vutler.ai/api/v1/settings/api-keys" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Lister les tâches
```bash
curl -X GET "https://app.vutler.ai/api/v1/tasks-v2" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Filtrer les tâches par statut
```bash
curl -X GET "https://app.vutler.ai/api/v1/tasks-v2?status=in_progress" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Créer une tâche
```bash
curl -X POST "https://app.vutler.ai/api/v1/tasks-v2" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "title": "Préparer la release note",
    "description": "Rédiger le changelog de la version actuelle",
    "assignee": "nora",
    "priority": "high"
  }'
```

### Mettre à jour une tâche
```bash
curl -X PATCH "https://app.vutler.ai/api/v1/tasks-v2/123" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "status": "done"
  }'
```

### Lister les agents
```bash
curl -X GET "https://app.vutler.ai/api/v1/agents" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Lire la config d’un agent
```bash
curl -X GET "https://app.vutler.ai/api/v1/agents/agent_123/config" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Mettre à jour la config d’un agent
```bash
curl -X PUT "https://app.vutler.ai/api/v1/agents/agent_123/config" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "provider": "openai",
    "model": "codex/gpt-5.4"
  }'
```

### Lire la config du workspace
```bash
curl -X GET "https://app.vutler.ai/api/v1/settings" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Mettre à jour la config du workspace
```bash
curl -X PUT "https://app.vutler.ai/api/v1/settings" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "integrations": {
      "chatgpt": {
        "enabled": true
      }
    }
  }'
```

### Lister les intégrations
```bash
curl -X GET "https://app.vutler.ai/api/v1/integrations" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Initier OAuth ChatGPT
```bash
curl -X POST "https://app.vutler.ai/api/v1/integrations/chatgpt/connect" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Vérifier l’état de connexion ChatGPT
```bash
curl -X GET "https://app.vutler.ai/api/v1/integrations/chatgpt/poll" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Lister les providers LLM
```bash
curl -X GET "https://app.vutler.ai/api/v1/llm/providers" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Ajouter ou modifier un provider LLM
```bash
curl -X POST "https://app.vutler.ai/api/v1/llm/providers" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "provider": "google",
    "apiKey": "google-key-xxx",
    "enabled": true
  }'
```

### Lister les fichiers Drive
```bash
curl -X GET "https://app.vutler.ai/api/v1/drive/files" \
  -H "X-API-Key: <VOTRE_API_KEY>"
```

### Upload un fichier dans Drive
```bash
curl -X POST "https://app.vutler.ai/api/v1/drive/upload" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -F "file=@./rapport.pdf"
```

### Exécuter du code dans la sandbox
```bash
curl -X POST "https://app.vutler.ai/api/v1/sandbox/execute" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <VOTRE_API_KEY>" \
  -d '{
    "language": "python",
    "code": "print(\"hello\")"
  }'
```

---

## Notes de mise à jour importantes

Cette version corrige les éléments obsolètes suivants :

- anciens endpoints d’authentification supprimés de la doc
- ajout de `PUT /api/v1/auth/me`
- documentation explicite du support `X-API-Key`
- correction de la création de tâche : usage public de `assignee`, mappé côté backend vers `assigned_agent`
- mise à jour des références workspace config vers `GET /api/v1/settings` et `PUT /api/v1/settings`
- migration des exemples tâches vers `/api/v1/tasks-v2`
- suppression des références `VDrive` au profit de `/api/v1/drive/*`
- mise à jour des modèles LLM dans les exemples
- clarification sur le chat : WebSocket natif, pas Rocket.Chat
- clarification sur la sandbox : endpoint désormais protégé par auth guard
- ajout du serveur MCP unifié `@vutler/mcp`

---
```

Si tu veux, je peux aussi te le livrer dans une version encore plus “repo-ready” :
- avec un ton plus produit/interne,
- ou plus technique/référence API,
- ou directement sous forme de diff/gist prêt à coller dans le fichier existant.
