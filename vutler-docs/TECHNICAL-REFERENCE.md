# Vutler - Documentation Technique Complète

## Table des Matières

1. [Architecture & Infrastructure](#architecture--infrastructure)
2. [API Reference](#api-reference)
3. [Database Schema](#database-schema)
4. [Frontend Pages](#frontend-pages)
5. [Services](#services)
6. [Configuration & Variables d'environnement](#configuration--variables-denvironnement)

---

## Architecture & Infrastructure

### Stack Technique
- **Backend**: Node.js 18.20.8 (Express.js)
- **Base de données**: PostgreSQL (via Vaultbrix @ REDACTED_DB_HOST:6543)
- **Cache**: Redis 7-alpine
- **Document Store**: MongoDB 7.0
- **Email**: Postal (SMTP server)
- **Container**: Docker (Alpine Linux)
- **Proxy**: Traefik (inféré)

### Containers & Services

| Container | Image | Ports | Status | Rôle |
|-----------|-------|-------|---------|------|
| `vutler-api` | `vutler-vutler-api` | - | Running* | API principale |
| `vutler-redis` | `redis:7-alpine` | 6379 | Healthy | Cache & sessions |
| `vutler-mongo` | `mongo:7.0` | 27017 | Healthy | Documents & logs |
| `postal-web` | `postal:latest` | 127.0.0.1:8082->5000 | Running | Interface email |
| `postal-smtp` | `postal:latest` | 127.0.0.1:25->25, 127.0.0.1:587->587 | Running | Serveur SMTP |
| `postal-worker` | `postal:latest` | - | Running | Worker email |
| `postal-rabbitmq` | `rabbitmq:3.12-management` | 5672, 15672 | Running | Queue messages |
| `postal-mariadb` | `mariadb:10.11` | 3306 | Running | DB Postal |

*Note: Le container principal a parfois des problèmes de redémarrage dus à des erreurs de syntaxe JavaScript*

### DNS & Ports
- **API principale**: Port interne non exposé (via reverse proxy)
- **Email SMTP**: 127.0.0.1:25, 127.0.0.1:587
- **Email Web**: 127.0.0.1:8082
- **PostgreSQL**: REDACTED_DB_HOST:6543 (externe)

### Architecture de données
```
Vutler API (Node.js)
├── PostgreSQL (tenant_vutler schema)
│   ├── Agents & Configs
│   ├── Chat & Messages
│   ├── Auth & Users
│   ├── Token Usage
│   └── Calendar & Tasks
├── MongoDB
│   ├── Token Usage Logs
│   ├── LLM Conversations
│   └── Agent Memory
└── Redis
    ├── Sessions
    ├── Cache
    └── WebSocket state
```

---

## API Reference

### Authentication Endpoints

#### `POST /api/v1/auth/login`
Authentification utilisateur avec création automatique du premier admin.

**Request:**
```bash
curl -X POST http://vutler-api/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@vutler.ai",
    "password": "your_password"
  }'
```

**Response:**
```json
{
  "success": true,
  "authToken": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "userId": "uuid",
  "username": "admin",
  "name": "admin",
  "email": "admin@vutler.ai",
  "role": "admin"
}
```

#### `POST /api/v1/auth/register`
Enregistrement d'un nouvel utilisateur.

**Request:**
```bash
curl -X POST http://vutler-api/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "secure_password",
    "name": "John Doe"
  }'
```

#### `GET /api/v1/auth/me`
Vérification du token JWT et récupération du profil utilisateur.

**Headers:**
```
Authorization: Bearer <jwt_token>
# OR
X-Auth-Token: <jwt_token>
```

### LLM & Agent Endpoints

#### `POST /api/v1/agents/:id/chat`
Envoi d'un message à l'agent via son LLM configuré.

**Request:**
```bash
curl -X POST http://vutler-api/api/v1/agents/:id/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "temperature": 0.7,
    "max_tokens": 4096,
    "stream": false
  }'
```

**Response:**
```json
{
  "success": true,
  "response": {
    "content": "Hello! I'm doing well, thank you for asking.",
    "usage": {
      "input": 12,
      "output": 28,
      "total": 40
    },
    "model": "gpt-4o-mini",
    "provider": "openai",
    "latency_ms": 850,
    "cost": 0.00012
  },
  "meta": {
    "mode": "managed",
    "fallback": null
  }
}
```

#### `PUT /api/v1/agents/:id/llm-config`
Configuration LLM pour un agent.

**Request (Managed Mode):**
```bash
curl -X PUT http://vutler-api/api/v1/agents/:id/llm-config \
  -H "Content-Type: application/json" \
  -d '{
    "managed": true,
    "tier": "premium"
  }'
```

**Request (BYOKEY Mode):**
```bash
curl -X PUT http://vutler-api/api/v1/agents/:id/llm-config \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "api_key": "sk-...",
    "model": "gpt-4o"
  }'
```

**Request (Custom Endpoint):**
```bash
curl -X PUT http://vutler-api/api/v1/agents/:id/llm-config \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "custom_endpoint": "http://localhost:11434/v1",
    "model": "llama3"
  }'
```

#### `GET /api/v1/agents/:id/llm-config`
Récupération de la configuration LLM (sans clé API).

#### `POST /api/v1/agents/:id/llm-test`
Test de connexion LLM pour un agent.

### Agent Runtime Endpoints

#### `POST /api/agents/:id/message`
Envoi direct de message à l'agent runtime (REST fallback).

#### `POST /api/agents/:id/start`
Démarrage du runtime d'un agent.

**Request:**
```bash
curl -X POST http://vutler-api/api/agents/:id/start \
  -H "Content-Type: application/json" \
  -d '{
    "system_prompt": "You are a helpful assistant",
    "model": "gpt-4o-mini",
    "rc_user_id": "rocket_chat_user_id",
    "rc_auth_token": "rocket_chat_auth_token"
  }'
```

#### `POST /api/agents/:id/stop`
Arrêt du runtime d'un agent.

#### `GET /api/agents/status`
Liste des agents runtime avec leur statut.

**Response:**
```json
{
  "success": true,
  "agents": [
    {
      "agent_id": "agent-123",
      "status": "running",
      "started_at": "2024-01-01T10:00:00Z",
      "last_activity": "2024-01-01T10:30:00Z",
      "in_memory": true
    }
  ],
  "count": 1
}
```

#### `GET /api/agents/:id/conversations`
Historique des conversations d'un agent.

### Dashboard Endpoints

#### `GET /api/dashboard`
Statistiques générales du dashboard.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalAgents": 5,
    "activeAgents": 3,
    "messagesToday": 142,
    "totalTokens": 1250000
  },
  "uptimeSeconds": 86400,
  "agents": [
    {
      "id": "agent-1",
      "name": "Luna",
      "username": "luna",
      "email": "luna@vutler.ai",
      "status": "online",
      "type": "bot",
      "role": "assistant",
      "avatar": "/sprites/agent-luna.png",
      "mbti": "ENFP",
      "model": "gpt-4o"
    }
  ]
}
```

### Memory & Tools Endpoints

#### Memory API (`/api/v1/memory`)
- Gestion de la mémoire des agents
- Stockage de souvenirs, faits, décisions
- Rappel sémantique

#### Tools API (`/api/v1/tools`)
- Gestion des outils disponibles pour les agents
- Configuration des capacités

---

## Database Schema

### PostgreSQL Tables (Schema: `tenant_vutler`)

#### `agents`
Table principale des agents IA.

| Colonne | Type | Nullable | Description |
|---------|------|----------|-------------|
| `id` | TEXT | NO | Identifiant unique |
| `name` | TEXT | YES | Nom d'affichage |
| `username` | TEXT | YES | Nom d'utilisateur unique |
| `email` | TEXT | YES | Email de l'agent |
| `status` | TEXT | YES | online/offline/busy |
| `type` | TEXT | YES | bot/human/hybrid |
| `avatar` | TEXT | YES | URL de l'avatar |
| `description` | TEXT | YES | Description de l'agent |
| `role` | TEXT | YES | assistant/admin/specialist |
| `mbti` | TEXT | YES | Type de personnalité |
| `model` | TEXT | YES | Modèle LLM par défaut |
| `provider` | TEXT | YES | Fournisseur LLM |
| `system_prompt` | TEXT | YES | Prompt système |
| `temperature` | NUMERIC | YES | Température LLM |
| `max_tokens` | INTEGER | YES | Limite de tokens |
| `capabilities` | JSONB | YES | Capacités/outils |
| `workspace_id` | TEXT | YES | ID de l'espace de travail |
| `created_at` | TIMESTAMPTZ | YES | Date de création |
| `updated_at` | TIMESTAMPTZ | YES | Dernière modification |

#### `users_auth`
Authentification et profils utilisateurs.

| Colonne | Type | Nullable | Description |
|---------|------|----------|-------------|
| `id` | TEXT | NO | UUID utilisateur |
| `workspace_id` | TEXT | YES | ID espace de travail |
| `email` | TEXT | NO | Email unique |
| `password_hash` | TEXT | NO | Hash SHA256 du mot de passe |
| `display_name` | TEXT | YES | Nom d'affichage |
| `avatar_url` | TEXT | YES | URL avatar |
| `role` | TEXT | YES | admin/user |
| `created_at` | TIMESTAMPTZ | YES | Date création |
| `updated_at` | TIMESTAMPTZ | YES | Dernière modification |

#### `agent_llm_configs`
Configurations LLM spécifiques aux agents.

#### `agent_conversations`
Historique des conversations des agents.

#### `agent_runtime_status`
Statut des runtimes d'agents.

#### `agent_memories`
Mémoire persistante des agents.

#### `chat_channels` / `chat_messages` / `chat_channel_members`
Système de chat intégré.

#### `email_messages` / `email_threads` / `email_routing_rules`
Gestion des emails.

#### `calendar_events` / `calendar_events_v2` / `event_attendees` / `event_reminders`
Système de calendrier.

#### `tasks` / `task_comments` / `task_activity`
Gestion des tâches.

#### `automation_rules` / `automation_triggers` / `automation_logs`
Système d'automatisation.

#### `hybrid_agents` / `hybrid_agent_tasks` / `hybrid_agent_logs`
Agents hybrides (humain + IA).

#### `token_usage`
Suivi de l'utilisation des tokens LLM.

#### `workspace_llm_providers` / `workspace_settings`
Configuration workspace.

#### `templates` / `goals` / `audit_logs`
Autres fonctionnalités.

### MongoDB Collections

#### `token_usage`
Logs détaillés d'utilisation des tokens.

#### `managed_overage`
Suivi des dépassements de quotas.

#### Autres collections
- Conversations LLM
- Agent memory
- Logs applicatifs

---

## Frontend Pages

### Pages d'administration (`/app/admin/`)

| Page | Fichier | Rôle |
|------|---------|------|
| **Dashboard principal** | `index.html` | Vue d'ensemble, stats, agents |
| **Gestion des agents** | `agents.html` | Liste, création, édition agents |
| **Constructeur d'agent** | `agent-builder.html` | Interface de création d'agent |
| **Détail agent** | `agent-detail.html` | Configuration détaillée |
| **Fournisseurs LLM** | `providers.html` | Config OpenAI, Anthropic, etc. |
| **Paramètres LLM** | `llm-settings.html` | Config globale LLM |
| **Calendrier** | `calendar.html` | Interface calendrier intégrée |
| **Templates** | `templates.html` | Modèles de prompts/agents |
| **Marketplace** | `marketplace.html` | Store d'agents publics |
| **Utilisation** | `usage.html` | Stats tokens, coûts |
| **Activité** | `activity.html` | Logs et audit |
| **Onboarding** | `onboarding.html` | Guide de démarrage |

### Pages de landing (`/app/admin/landing/`)
Pages publiques de présentation.

### CSS/Style
- `admin.css` : Styles principaux de l'interface admin

---

## Services

### 1. LLM Router (`services/llmRouter`)
Routage intelligent des requêtes LLM.

**Fonctionnalités:**
- Support multi-providers (OpenAI, Anthropic, Groq, Ollama)
- Mode managé vs BYOKEY
- Fallback automatique
- Gestion des quotas et fair-use
- Tracking des coûts

**Tiers managés:**
- **Economy**: 2M tokens/mois inclus, $2/M tokens overage
- **Standard**: Plus de tokens inclus
- **Premium**: Quotas étendus

### 2. Agent Runtime Engine
Moteur d'exécution pour agents autonomes.

**Fonctionnalités:**
- Conversations persistantes
- Tool calling
- Intégration RocketChat
- Polling automatique des messages
- Gestion d'état distribuée

### 3. Authentication System
Authentification JWT avec auto-bootstrapping.

**Sécurité:**
- Hachage SHA256 des mots de passe
- JWT avec expiration (7 jours)
- Création automatique du premier admin
- Rôles: admin/user

### 4. Email Service (Postal Integration)
Serveur email complet.

**Composants:**
- SMTP server (ports 25, 587)
- Interface web (port 8082)
- Workers de traitement
- Queue RabbitMQ
- Base MariaDB

### 5. WebSocket Chat (`api/ws-chat.js`)
Chat temps réel pour les agents.

### 6. Calendar Service
Système de calendrier intégré avec events et reminders.

### 7. Task Management
Gestion de tâches avec commentaires et activité.

### 8. Automation Engine
Règles d'automatisation avec triggers et actions.

---

## Configuration & Variables d'environnement

### Variables principales

#### Database
```bash
VAULTBRIX_PASSWORD=          # PostgreSQL password
```

#### Authentication
```bash
JWT_SECRET=                  # JWT signing secret (REQUIRED in production)
```

#### LLM Providers
```bash
OPENAI_API_KEY=             # OpenAI API key
ANTHROPIC_API_KEY=          # Claude API key
GROQ_API_KEY=               # Groq API key
```

#### Email (Postal)
```bash
POSTAL_URL=                 # Postal server URL
POSTAL_API_KEY=             # Postal API key
```

#### External Services
```bash
RC_URL=http://localhost:3000 # RocketChat base URL
```

### Configuration files

#### `config/llm-tiers.json`
Configuration des tiers LLM managés.

### Sécurité

⚠️ **Alertes de sécurité détectées:**

1. **JWT_SECRET manquant**: Le système utilise un secret par défaut si `JWT_SECRET` n'est pas défini
2. **Hachage SHA256 simple**: Mot de passe hashé avec SHA256 sans salt (vulnérable aux rainbow tables)
3. **SQL Injection**: Quelques requêtes pourraient bénéficier de paramètres liés

### Monitoring & Logs

- Logs de dépréciation Node.js (pg-pool)
- Audit logs dans `audit_logs` table
- Token usage tracking
- Agent runtime status monitoring

---

## Notes d'implémentation

### Points forts
✅ Architecture modulaire bien structurée  
✅ Support multi-providers LLM  
✅ Système d'agents runtime sophistiqué  
✅ Intégrations complètes (email, chat, calendrier)  
✅ Gestion des quotas et fair-use  
✅ Tool calling pour agents  

### Points d'amélioration
⚠️ Sécurité des mots de passe (utiliser bcrypt)  
⚠️ Gestion d'erreurs de syntaxe JavaScript  
⚠️ Dépréciation warnings (pg-pool)  
⚠️ Validation des entrées utilisateur  
⚠️ Documentation API manquante (OpenAPI/Swagger)  

---

*Documentation générée le 28 février 2025 par Luna 🧪*