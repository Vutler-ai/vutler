# Vue d'Ensemble de l'Architecture - Vutler Phase 2
**Version:** 1.0  
**Date:** 2026-02-23  
**Équipe:** Architecture Starbox Group

## Architecture Système avec Couche E2E

### Vue d'Ensemble Globale

```mermaid
graph TB
    subgraph "Client Layer"
        UI[Vchat UI]
        CryptoJS[WebCrypto Module]
        VDrivePanel[VDrive Panel]
    end
    
    subgraph "Network Layer"
        Nginx[Nginx Proxy]
        WS[WebSocket Gateway]
    end
    
    subgraph "Application Layer"
        API[Express API Server]
        Auth[Auth Service]
        Crypto[Crypto Service]
        VDriveAPI[VDrive API Bridge]
    end
    
    subgraph "AI Layer"
        AgentGateway[Agent Access Gateway]
        Claude[Claude API]
        Memory[Snipara Memory]
    end
    
    subgraph "Storage Layer"
        PG[(PostgreSQL 16)]
        Redis[(Redis Cache)]
        Synology[Synology NAS]
    end
    
    subgraph "External"
        GitHub[GitHub API]
        Webhooks[GitHub Webhooks]
    end
    
    UI ←→ CryptoJS
    UI ←→ VDrivePanel
    CryptoJS ←→ Nginx
    VDrivePanel ←→ Nginx
    
    Nginx ←→ WS
    Nginx ←→ API
    
    API ←→ Auth
    API ←→ Crypto
    API ←→ VDriveAPI
    
    Auth ←→ PG
    Crypto ←→ PG
    Crypto ←→ Redis
    
    VDriveAPI ←→ Synology
    
    AgentGateway ←→ Crypto
    AgentGateway ←→ Claude
    AgentGateway ←→ Memory
    
    API ←→ GitHub
    Webhooks → API
```

## Diagramme de Flux de Données pour Messages Chiffrés

### 1. Envoi de Message Chiffré

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant UI as Vchat UI
    participant Crypto as WebCrypto
    participant WS as WebSocket
    participant API as Express API
    participant DB as PostgreSQL
    participant Agent as Agent IA
    participant Claude as Claude API
    
    User->>UI: Tape message
    UI->>Crypto: encrypt(message, userKey)
    Crypto-->>UI: {encryptedContent, iv, tag}
    UI->>WS: send(encrypted_message)
    WS->>API: forward(encrypted_message)
    API->>DB: INSERT messages (encrypted_content, metadata)
    
    Note over Agent: Agent triggered par nouveau message
    
    Agent->>API: request message access
    API->>API: checkPermissions(agent, user)
    API->>Crypto: decrypt_ephemeral(encrypted_content)
    API->>Claude: process(decrypted_content)
    Claude-->>API: response
    API->>API: clearMemory()
    API->>Agent: agent_response
```

### 2. Upload et Partage Fichier VDrive

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant Panel as VDrive Panel
    participant Crypto as WebCrypto
    participant API as Express API
    participant NAS as Synology NAS
    participant DB as PostgreSQL
    participant Chat as Vchat
    
    User->>Panel: select file
    Panel->>Crypto: encrypt file chunks
    Crypto-->>Panel: encrypted_chunks[]
    Panel->>API: upload(encrypted_chunks, metadata)
    API->>NAS: store encrypted file
    API->>DB: INSERT file_index (encrypted_meta)
    
    User->>Panel: share in chat
    Panel->>API: create_file_share_link(file_id, chat_id)
    API->>DB: INSERT shared_files
    API->>Chat: send file_share_message
    Chat->>UI: display file preview
```

## Interaction des Composants

### Architecture en Couches

```mermaid
graph TB
    subgraph "Presentation Layer"
        WebUI[Web Interface]
        Mobile[Mobile App Future]
    end
    
    subgraph "API Gateway Layer"
        Gateway[Nginx Gateway]
        LoadBalancer[Load Balancer]
        RateLimiter[Rate Limiter]
    end
    
    subgraph "Business Logic Layer"
        ChatService[Chat Service]
        FileService[File Service]
        AuthService[Auth Service]
        CryptoService[Crypto Service]
        AgentService[Agent Service]
        GitHubService[GitHub Service]
    end
    
    subgraph "Data Access Layer"
        PGDAO[PostgreSQL DAO]
        RedisDAO[Redis DAO]
        SynologyDAO[Synology DAO]
        GitHubDAO[GitHub DAO]
    end
    
    subgraph "Infrastructure Layer"
        Database[(PostgreSQL)]
        Cache[(Redis)]
        FileStorage[(Synology)]
        External[External APIs]
    end
    
    WebUI → Gateway
    Mobile → Gateway
    
    Gateway → ChatService
    Gateway → FileService
    Gateway → AuthService
    
    ChatService → CryptoService
    FileService → CryptoService
    AuthService → CryptoService
    
    ChatService → AgentService
    FileService → AgentService
    
    GitHubService → AgentService
    
    ChatService → PGDAO
    FileService → SynologyDAO
    AuthService → PGDAO
    CryptoService → RedisDAO
    AgentService → PGDAO
    GitHubService → GitHubDAO
    
    PGDAO → Database
    RedisDAO → Cache
    SynologyDAO → FileStorage
    GitHubDAO → External
```

## Modifications du Schéma Base de Données

### Tables Existantes - Modifications

```sql
-- Messages table - ajout chiffrement
ALTER TABLE messages 
ADD COLUMN encrypted_content BYTEA,
ADD COLUMN encryption_version INTEGER DEFAULT 1,
ADD COLUMN encryption_key_id UUID,
ADD COLUMN decryption_permissions JSONB DEFAULT '{}',
ADD COLUMN created_at_encrypted BOOLEAN DEFAULT FALSE;

-- Users table - gestion clés
ALTER TABLE users
ADD COLUMN master_key_encrypted BYTEA,
ADD COLUMN key_derivation_params JSONB,
ADD COLUMN backup_phrase_hash VARCHAR(64),
ADD COLUMN encryption_enabled BOOLEAN DEFAULT FALSE;

-- Files table - métadonnées chiffrées  
ALTER TABLE files
ADD COLUMN encrypted_metadata JSONB,
ADD COLUMN file_key_encrypted BYTEA,
ADD COLUMN encryption_algorithm VARCHAR(50) DEFAULT 'AES-256-GCM',
ADD COLUMN synology_path_encrypted VARCHAR(500);
```

### Nouvelles Tables

```sql
-- Gestion des clés de chiffrement
CREATE TABLE encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    key_type VARCHAR(50) NOT NULL, -- 'master', 'session', 'file'
    encrypted_key BYTEA NOT NULL,
    key_params JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    revoked_at TIMESTAMP,
    INDEX idx_encryption_keys_user (user_id),
    INDEX idx_encryption_keys_type (key_type)
);

-- Permissions d'accès agents
CREATE TABLE agent_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    agent_name VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL, -- 'chat', 'files', 'vdrive'
    access_level VARCHAR(50) NOT NULL, -- 'denied', 'metadata', 'decrypt_ephemeral'
    conditions JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, agent_name, resource_type)
);

-- Log des accès de déchiffrement
CREATE TABLE decryption_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    agent_name VARCHAR(100) NOT NULL,
    resource_id UUID NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    decryption_success BOOLEAN NOT NULL,
    ip_address INET,
    user_agent TEXT,
    decrypted_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_audit_user_date (user_id, decrypted_at),
    INDEX idx_audit_agent (agent_name)
);

-- Intégration VDrive-Chat
CREATE TABLE vdrive_chat_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    chat_id UUID NOT NULL REFERENCES chats(id),
    shared_by UUID NOT NULL REFERENCES users(id),
    message_id UUID REFERENCES messages(id),
    access_permissions JSONB DEFAULT '{"read": true, "download": false}',
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_vdrive_shares_chat (chat_id),
    INDEX idx_vdrive_shares_file (file_id)
);

-- GitHub Connector
CREATE TABLE github_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    github_user_id INTEGER NOT NULL,
    access_token_encrypted BYTEA NOT NULL,
    refresh_token_encrypted BYTEA,
    scopes TEXT[] DEFAULT ARRAY['repo', 'workflow'],
    webhook_secret_encrypted BYTEA,
    connected_repos JSONB DEFAULT '[]',
    auto_deploy_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, github_user_id)
);
```

## Séquences de Données Critiques

### 1. Configuration Initiale E2E Utilisateur

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant UI as Interface
    participant API as Backend
    participant Crypto as Service Crypto
    participant DB as PostgreSQL
    
    User->>UI: Active E2E Encryption
    UI->>UI: Génère master key (WebCrypto)
    UI->>User: Affiche backup phrase
    User->>UI: Confirme backup phrase
    UI->>Crypto: derive encryption params
    Crypto-->>UI: {salt, iterations, encrypted_key}
    UI->>API: setup_encryption(user_id, params)
    API->>DB: INSERT encryption_keys
    API->>DB: UPDATE users SET encryption_enabled=true
    API-->>UI: encryption_setup_complete
    UI->>User: Encryption activé ✅
```

### 2. Agent Accède à Fichier Chiffré

```mermaid
sequenceDiagram
    participant Agent as Agent IA
    participant Gateway as Agent Gateway  
    participant API as Express API
    participant Crypto as Service Crypto
    participant NAS as Synology
    participant DB as PostgreSQL
    participant Claude as Claude API
    
    Agent->>Gateway: request file access
    Gateway->>API: check_permissions(agent, file_id)
    API->>DB: SELECT agent_permissions
    API-->>Gateway: permission_granted
    Gateway->>API: get_encrypted_file(file_id)
    API->>DB: SELECT file metadata
    API->>NAS: download encrypted chunks
    NAS-->>API: encrypted_file_data
    API->>Crypto: decrypt_ephemeral(file_data, user_key)
    Crypto-->>API: decrypted_content
    API->>Claude: process(decrypted_content)
    Claude-->>API: analysis_result
    API->>Crypto: clear_memory()
    API-->>Gateway: analysis_result
    Gateway-->>Agent: file_analysis
```

### 3. Upload et Partage VDrive dans Chat

```mermaid
sequenceDiagram
    participant User as Utilisateur
    participant VPanel as VDrive Panel
    participant Chat as Vchat
    participant API as Backend
    participant NAS as Synology
    participant DB as PostgreSQL
    
    User->>VPanel: Drag & drop fichier
    VPanel->>VPanel: Encrypt file + metadata
    VPanel->>API: upload_encrypted_file()
    API->>NAS: Store encrypted chunks
    API->>DB: INSERT file record
    
    User->>VPanel: Share in chat
    VPanel->>API: create_chat_share(file_id, chat_id)
    API->>DB: INSERT vdrive_chat_shares
    API->>Chat: send_file_message(encrypted_preview)
    Chat->>Chat: Display file card with preview
    
    Note over Chat: Autres utilisateurs voient le fichier partagé
    
    Chat->>API: request_file_preview(file_id)
    API->>API: check_chat_permissions()
    API->>NAS: get_encrypted_thumbnail
    API->>API: decrypt_preview_only()
    API-->>Chat: preview_data
```

## Points d'Extension Future

### Microservices Architecture (Phase 3)
- **Crypto Service** autonome
- **Agent Gateway** isolé
- **VDrive Service** indépendant
- Load balancing et haute disponibilité

### Multi-tenant Support
- Isolation encryption par tenant
- Key management hiérarchique
- Audit trails séparés

### Advanced Security Features
- Hardware Security Module (HSM)
- Zero-knowledge proofs
- Forward secrecy pour messages
- Quantum-resistant algorithms (preparation)

---

**Prochaine révision:** 2026-03-15  
**Architecte responsable:** lopez@starboxgroup.com