# Spécifications API - Vutler Phase 2
**Version:** 1.0  
**Date:** 2026-02-23  
**Base URL:** `https://api.vutler.com/v1`  
**Authentication:** Bearer JWT + E2E Key Exchange

## Nouveaux Endpoints pour E2E Chat

### Authentication & Key Management

#### `POST /auth/encryption/setup`
Configure le chiffrement E2E pour un utilisateur

**Request:**
```json
{
  "masterKeyEncrypted": "base64_encrypted_key",
  "keyDerivationParams": {
    "algorithm": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 100000,
    "salt": "base64_salt"
  },
  "backupPhraseHash": "sha256_hash",
  "deviceFingerprint": "unique_device_id"
}
```

**Response:**
```json
{
  "success": true,
  "keyId": "uuid",
  "encryptionEnabled": true,
  "backupPhrase": ["word1", "word2", ...], // 24 words BIP-39
  "emergencyBackupCreated": true
}
```

#### `POST /auth/encryption/key-exchange`
Échange de clés pour accès multi-device

**Request:**
```json
{
  "devicePublicKey": "base64_rsa_public_key",
  "deviceId": "unique_device_identifier",
  "challenge": "base64_challenge"
}
```

**Response:**
```json
{
  "encryptedMasterKey": "base64_encrypted_for_device",
  "sessionToken": "jwt_token",
  "keyVersion": 1,
  "syncedAt": "2026-02-23T10:30:00Z"
}
```

#### `POST /auth/encryption/recover`
Récupération de clé via phrase de backup

**Request:**
```json
{
  "recoveryPhrase": ["word1", "word2", ...],
  "newDevicePublicKey": "base64_rsa_public_key",
  "checksum": "phrase_checksum"
}
```

### Encrypted Messaging

#### `POST /chat/messages/encrypted`
Envoi de message chiffré

**Request:**
```json
{
  "chatId": "uuid",
  "encryptedContent": "base64_encrypted_message",
  "encryptionMetadata": {
    "algorithm": "AES-256-GCM",
    "iv": "base64_iv",
    "tag": "base64_auth_tag",
    "keyId": "uuid"
  },
  "agentPermissions": {
    "claude-assistant": "decrypt_ephemeral",
    "code-assistant": "metadata_only"
  }
}
```

**Response:**
```json
{
  "messageId": "uuid",
  "timestamp": "2026-02-23T10:30:00Z",
  "encryptionStatus": "encrypted",
  "agentsNotified": ["claude-assistant"]
}
```

#### `GET /chat/messages/{messageId}/decrypt`
Déchiffrement éphémère pour agents

**Headers:**
```
Authorization: Bearer jwt_token
X-Agent-ID: claude-assistant
X-Request-ID: uuid
```

**Response:**
```json
{
  "content": "decrypted_message_content",
  "decryptedAt": "2026-02-23T10:30:00Z",
  "expiresAt": "2026-02-23T10:30:30Z", // 30s TTL
  "requestId": "uuid"
}
```

#### `PUT /chat/messages/{messageId}/permissions`
Mise à jour permissions agent

**Request:**
```json
{
  "agentPermissions": {
    "claude-assistant": "decrypt_ephemeral",
    "new-agent": "denied",
    "file-agent": "metadata_only"
  }
}
```

## VDrive-in-Vchat Endpoints

### File Management Integration

#### `GET /vdrive/chat/{chatId}/files`
Liste des fichiers partagés dans un chat

**Query Parameters:**
- `limit`: integer (default: 50)
- `offset`: integer (default: 0)
- `type`: string (image, document, video, etc.)
- `encrypted_only`: boolean (default: false)

**Response:**
```json
{
  "files": [
    {
      "id": "uuid",
      "filename": "document.pdf",
      "encryptedFilename": "base64_encrypted_filename",
      "size": 1048576,
      "mimeType": "application/pdf",
      "encryptedMetadata": {
        "thumbnail": "base64_encrypted_thumbnail",
        "preview": "base64_encrypted_preview"
      },
      "sharedBy": {
        "userId": "uuid",
        "username": "john.doe",
        "avatar": "https://cdn.vutler.com/avatars/123.jpg"
      },
      "sharedAt": "2026-02-23T10:30:00Z",
      "permissions": {
        "read": true,
        "download": true,
        "share": false
      },
      "encryptionStatus": "encrypted"
    }
  ],
  "total": 25,
  "hasMore": false
}
```

#### `POST /vdrive/chat/upload`
Upload fichier chiffré vers VDrive avec partage chat

**Request (multipart/form-data):**
```
file: <encrypted_file_chunks>
metadata: {
  "chatId": "uuid",
  "encryptedFilename": "base64_encrypted",
  "encryptionMetadata": {
    "algorithm": "AES-256-GCM",
    "fileKeyEncrypted": "base64_file_key_encrypted_with_user_key",
    "iv": "base64_iv"
  },
  "permissions": {
    "read": true,
    "download": false,
    "agents": {
      "claude-assistant": "metadata_only"
    }
  }
}
```

**Response:**
```json
{
  "fileId": "uuid",
  "uploadStatus": "completed",
  "synologyPath": "/encrypted/user_id/file_id",
  "shareId": "uuid",
  "sharedInChat": true,
  "processingStatus": {
    "thumbnailGenerated": true,
    "previewGenerated": true,
    "indexedForSearch": false
  }
}
```

#### `GET /vdrive/files/{fileId}/download`
Téléchargement fichier avec déchiffrement

**Headers:**
```
Authorization: Bearer jwt_token
X-Decrypt-With-Key: user_key_id
```

**Response:**
```
Content-Type: application/octet-stream
Content-Disposition: attachment; filename*=UTF-8''encrypted_filename
X-Encryption-Status: decrypted
X-Original-Size: 1048576

<decrypted_file_data>
```

#### `POST /vdrive/files/{fileId}/share-in-chat`
Partager fichier existant dans un chat

**Request:**
```json
{
  "chatId": "uuid",
  "permissions": {
    "read": true,
    "download": false,
    "expires": "2026-03-01T00:00:00Z"
  },
  "message": "Voici le rapport mensuel !"
}
```

### Preview & Thumbnail Generation

#### `GET /vdrive/files/{fileId}/preview`
Génération preview sécurisé

**Query Parameters:**
- `size`: enum (thumbnail, small, medium, large)
- `page`: integer (pour PDFs)
- `decrypt`: boolean (si l'utilisateur a les permissions)

**Response:**
```json
{
  "previewType": "image/jpeg",
  "previewData": "base64_preview_data",
  "encrypted": false,
  "generatedAt": "2026-02-23T10:30:00Z",
  "cacheExpires": "2026-02-23T11:30:00Z"
}
```

## GitHub Connector Endpoints

### OAuth Integration

#### `GET /github/auth/oauth`
Initiation flux OAuth GitHub

**Query Parameters:**
- `state`: string (CSRF protection)
- `redirect_uri`: string (callback URL)

**Response:**
```json
{
  "authUrl": "https://github.com/login/oauth/authorize?client_id=...&state=...&scope=repo,workflow",
  "state": "csrf_token",
  "expiresIn": 600
}
```

#### `POST /github/auth/callback`
Callback OAuth GitHub

**Request:**
```json
{
  "code": "github_oauth_code",
  "state": "csrf_token"
}
```

**Response:**
```json
{
  "success": true,
  "integration": {
    "id": "uuid",
    "githubUserId": 12345,
    "username": "johndoe",
    "avatar": "https://github.com/avatars/123.jpg",
    "scopes": ["repo", "workflow"],
    "connectedRepos": []
  },
  "webhookSetupRequired": true
}
```

### Repository Management

#### `GET /github/repositories`
Liste repositories accessibles

**Response:**
```json
{
  "repositories": [
    {
      "id": 456789,
      "fullName": "johndoe/my-project",
      "description": "Mon projet principal",
      "private": true,
      "defaultBranch": "main",
      "languages": ["JavaScript", "Python"],
      "connected": false,
      "autoDeployEnabled": false,
      "lastActivity": "2026-02-20T15:30:00Z"
    }
  ],
  "total": 15,
  "hasMore": true
}
```

#### `POST /github/repositories/{repoId}/connect`
Connecter repository à Vutler

**Request:**
```json
{
  "autoDeployEnabled": true,
  "deployBranches": ["main", "production"],
  "webhookEvents": ["push", "pull_request", "release"],
  "agentNotifications": {
    "claude-assistant": ["push", "issues"],
    "code-assistant": ["pull_request", "release"]
  }
}
```

**Response:**
```json
{
  "connected": true,
  "webhookUrl": "https://api.vutler.com/v1/github/webhook/{uuid}",
  "webhookSecret": "webhook_secret",
  "autoDeployConfigured": true
}
```

### Webhook Handling

#### `POST /github/webhook/{integrationId}`
Réception webhooks GitHub

**Headers:**
```
X-GitHub-Event: push
X-GitHub-Signature-256: sha256=...
X-GitHub-Delivery: uuid
```

**Request Body:** GitHub webhook payload (variable selon l'événement)

**Internal Processing Flow:**
1. Vérification signature webhook
2. Parsing événement GitHub
3. Notification agents concernés
4. Déclenchement auto-deploy si configuré
5. Stockage événement pour historique

#### `GET /github/events`
Historique événements GitHub

**Query Parameters:**
- `repository`: string (filter par repo)
- `event_type`: string (push, pull_request, etc.)
- `from_date`: ISO date
- `limit`: integer

**Response:**
```json
{
  "events": [
    {
      "id": "uuid",
      "eventType": "push",
      "repository": "johndoe/my-project",
      "branch": "main",
      "author": {
        "username": "johndoe",
        "email": "john@example.com"
      },
      "commits": [
        {
          "sha": "abc123...",
          "message": "Fix authentication bug",
          "url": "https://github.com/johndoe/my-project/commit/abc123"
        }
      ],
      "autoDeployTriggered": true,
      "agentsNotified": ["claude-assistant", "code-assistant"],
      "receivedAt": "2026-02-23T10:30:00Z"
    }
  ]
}
```

### Auto-Deploy Pipeline

#### `POST /github/repositories/{repoId}/deploy`
Déclenchement manuel déploiement

**Request:**
```json
{
  "branch": "main",
  "environment": "production", // staging, production
  "force": false
}
```

**Response:**
```json
{
  "deploymentId": "uuid",
  "status": "pending",
  "environment": "production",
  "branch": "main",
  "sha": "abc123...",
  "startedAt": "2026-02-23T10:30:00Z",
  "estimatedDuration": 300 // seconds
}
```

#### `GET /github/deployments/{deploymentId}`
Status déploiement

**Response:**
```json
{
  "id": "uuid",
  "status": "running", // pending, running, success, failed
  "environment": "production",
  "progress": 60, // percentage
  "steps": [
    {
      "name": "checkout",
      "status": "completed",
      "duration": 5
    },
    {
      "name": "build",
      "status": "running",
      "startedAt": "2026-02-23T10:30:15Z"
    },
    {
      "name": "deploy",
      "status": "pending"
    }
  ],
  "logs": [
    {
      "timestamp": "2026-02-23T10:30:10Z",
      "level": "info",
      "message": "Starting deployment..."
    }
  ]
}
```

## Modifications d'Authentication

### JWT Token Enhancement

**Extended JWT Payload:**
```json
{
  "sub": "user_id",
  "iat": 1708689000,
  "exp": 1708775400,
  "aud": "vutler.com",
  "iss": "vutler-auth",
  
  // Nouveaux champs E2E
  "encryption": {
    "enabled": true,
    "keyId": "uuid",
    "keyVersion": 1,
    "deviceId": "unique_device_id"
  },
  
  // Permissions agent
  "agentPermissions": {
    "claude-assistant": ["chat:decrypt", "files:metadata"],
    "code-assistant": ["files:decrypt", "github:events"]
  },
  
  // GitHub integration
  "github": {
    "connected": true,
    "username": "johndoe",
    "permissions": ["repo", "workflow"]
  }
}
```

### Key Exchange Middleware

**Header Requirements pour endpoints chiffrés:**
```
Authorization: Bearer jwt_token
X-Encryption-Key-ID: uuid  
X-Device-Fingerprint: device_hash
X-Request-Signature: hmac_signature  // Anti-replay
```

### Rate Limiting Adjustments

```javascript
// Rate limits ajustés pour crypto operations
const cryptoRateLimits = {
  "/auth/encryption/*": "5 requests per minute per IP",
  "/chat/messages/*/decrypt": "100 requests per minute per user",
  "/vdrive/files/*/download": "50 requests per minute per user",
  "/github/webhook/*": "1000 requests per minute per integration"
};
```

## Error Codes et Handling

### Crypto-specific Error Codes

```json
{
  // Key management errors
  "ENCRYPTION_NOT_ENABLED": {
    "code": 4001,
    "message": "User encryption not configured",
    "action": "Setup E2E encryption first"
  },
  
  "INVALID_KEY": {
    "code": 4002,
    "message": "Invalid or expired encryption key",
    "action": "Re-authenticate or rotate key"
  },
  
  "DECRYPTION_FAILED": {
    "code": 4003,
    "message": "Failed to decrypt content",
    "action": "Verify key permissions"
  },
  
  // Agent permission errors
  "AGENT_ACCESS_DENIED": {
    "code": 4101,
    "message": "Agent not permitted to access encrypted content",
    "action": "Update agent permissions"
  },
  
  // VDrive integration errors
  "VDRIVE_ENCRYPTION_MISMATCH": {
    "code": 4201,
    "message": "File encryption incompatible with user key",
    "action": "Re-upload file or check key version"
  },
  
  // GitHub integration errors
  "GITHUB_WEBHOOK_INVALID": {
    "code": 4301,
    "message": "Invalid webhook signature",
    "action": "Verify webhook secret configuration"
  }
}
```

## API Versioning Strategy

### Version Header Support
```
API-Version: 2.0
Accept: application/vnd.vutler.v2+json
```

### Backward Compatibility
- **V1 endpoints:** Maintained pour 6 mois après V2 release
- **Migration path:** Automatic upgrade prompts in UI
- **Deprecation notices:** 3 months advance warning

### Feature Flags
```json
{
  "features": {
    "e2e_encryption": true,
    "vdrive_chat_integration": true,
    "github_connector": true,
    "auto_deploy": false // gradual rollout
  }
}
```

---

**Documentation complète:** https://docs.vutler.com/api/v2  
**Postman Collection:** [Download](https://api.vutler.com/docs/postman-collection.json)  
**OpenAPI Spec:** [Download](https://api.vutler.com/docs/openapi.yaml)  
**Responsable API:** lopez@starboxgroup.com