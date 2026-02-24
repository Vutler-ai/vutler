# RFC Technique : Chiffrement E2E et Intégration VDrive
**Version:** 1.0  
**Date:** 2026-02-23  
**Auteur:** Équipe Technique Starbox Group  
**Statut:** Draft pour validation CEO

## Résumé Exécutif

Ce RFC définit l'architecture technique pour implémenter le chiffrement de bout en bout (E2E) dans Vutler tout en maintenant l'accès des agents IA aux contenus. L'approche hybride proposée chiffre les données au repos et en transit, mais permet un déchiffrement éphémère côté serveur pour les appels API LLM.

## Architecture E2E + Intégration VDrive

### Vision Globale
```
[Client Web] ←→ [Nginx] ←→ [Express API] ←→ [PostgreSQL 16]
     ↓              ↓          ↓              ↓
[Clés locales] [TLS 1.3] [Déchiffrement] [Données chiffrées]
     ↓                         ↓
[WebCrypto API] ←→ [Agents IA] ←→ [Synology NAS (VDrive)]
```

### Composants Principaux
1. **Client-side Crypto Module** (WebCrypto API)
2. **Server-side Crypto Service** (Node.js crypto)
3. **Key Management System** (KMS)
4. **VDrive Crypto Adapter** (pour Synology NAS)
5. **Agent Access Gateway** (déchiffrement éphémère)

## Choix Technologiques

### Algorithmes de Chiffrement
- **AES-256-GCM** : Chiffrement symétrique principal
  - Authentification intégrée
  - Performance optimale pour gros volumes
  - Support natif WebCrypto API

- **PBKDF2** : Dérivation de clés
  - 100,000 iterations minimum
  - Salt unique par utilisateur
  - Compatible avec standards OWASP

- **RSA-OAEP-256** : Échange de clés
  - Clés 2048-bit minimum
  - Pour partage de clés de groupe/équipe

### WebCrypto API Implementation
```javascript
// Génération clé principale utilisateur
const masterKey = await crypto.subtle.generateKey(
  {
    name: "AES-GCM",
    length: 256,
  },
  true, // extractable
  ["encrypt", "decrypt"]
);

// Dérivation clé de session
const sessionKey = await crypto.subtle.deriveKey(
  {
    name: "PBKDF2",
    salt: userSalt,
    iterations: 100000,
    hash: "SHA-256"
  },
  rawKey,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"]
);
```

## Flux de Données Détaillé

### 1. Message Chiffré dans Vchat
```
[Utilisateur tape message] 
    ↓
[Client: chiffrement AES-256-GCM + IV unique]
    ↓  
[Envoi via WebSocket sécurisé]
    ↓
[Serveur: stockage encrypted_content + metadata]
    ↓
[Agent IA demande accès]
    ↓
[Serveur: déchiffrement éphémère → API Claude → nettoyage mémoire]
```

### 2. Upload Fichier VDrive Chiffré
```
[Client: sélection fichier]
    ↓
[Chiffrement par chunks (1MB) + métadonnées]
    ↓
[Upload parallel chunks vers Synology NAS]
    ↓
[Index chiffré dans PostgreSQL]
    ↓
[Accès agent via VDrive-Vchat bridge]
```

### 3. Intégration VDrive dans Vchat
```
[Panel VDrive dans UI Vchat]
    ↓
[API unifiée: /api/v1/vdrive-chat/*]
    ↓
[Proxy vers Synology + déchiffrement selon permissions]
    ↓
[Affichage dans chat avec preview chiffré/déchiffré]
```

## Cas Limites et Gestion d'Erreurs

### 1. Perte de Clés
**Problème:** Utilisateur perd sa clé principale
**Solution:** 
- Key recovery via backup phrases (BIP-39 compatible)
- Emergency access pour admins équipe
- Re-chiffrement progressif avec nouvelle clé

### 2. Multi-Device Sync
**Problème:** Synchronisation clés entre appareils
**Solution:**
- Clé principale stockée chiffrée sur serveur
- Unlock avec mot de passe + 2FA
- Dérivation locale des clés de session

### 3. Agent Access Control
**Problème:** Contrôle granulaire accès agents aux données chiffrées
**Solution:**
```javascript
// Configuration par utilisateur/équipe
const agentPermissions = {
  "claude-assistant": {
    "chat_history": "decrypt_ephemeral",
    "vdrive_files": "metadata_only",
    "sensitive_files": "denied"
  },
  "code-assistant": {
    "code_files": "decrypt_ephemeral",
    "documentation": "decrypt_ephemeral"
  }
};
```

### 4. Performance Impact
**Problème:** Latence chiffrement/déchiffrement
**Solution:**
- Chiffrement asynchrone côté client
- Cache déchiffré temporaire (5min TTL)
- Lazy loading pour gros fichiers
- Compression avant chiffrement

## Migration depuis État Non-Chiffré

### Phase 1: Infrastructure (Semaine 1-2)
1. Déploiement nouveaux modules crypto
2. Migration schéma PostgreSQL
3. Configuration Synology encryption-at-rest
4. Tests de charge

### Phase 2: Migration Données (Semaine 3-4)
```sql
-- Nouvelle structure tables
ALTER TABLE messages ADD COLUMN encrypted_content BYTEA;
ALTER TABLE messages ADD COLUMN encryption_version INT DEFAULT 1;
ALTER TABLE files ADD COLUMN encryption_key_id UUID;
ALTER TABLE files ADD COLUMN encrypted_metadata JSONB;

-- Migration progressive
UPDATE messages SET 
  encrypted_content = encrypt_aes256(content, user_key),
  encryption_version = 1
WHERE created_at > NOW() - INTERVAL '30 days';
```

### Phase 3: Activation Client (Semaine 5-6)
1. Rollout progressif : 10% → 50% → 100% utilisateurs
2. Onboarding guidé pour configuration clés
3. Migration transparente anciens messages

### Phase 4: Cleanup (Semaine 7-8)
1. Suppression colonnes non-chiffrées
2. Audit sécurité complet
3. Documentation finale

## Alternatives Considérées

### 1. Full Client-Side Encryption
**Avantages:** Sécurité maximale, zero-knowledge
**Inconvénients:** Agents IA ne peuvent pas accéder aux données
**Décision:** Rejeté - incompatible avec use case Vutler

### 2. Server-Side Encryption Only
**Avantages:** Simple à implémenter
**Inconvénients:** Clés accessibles aux admins serveur
**Décision:** Rejeté - pas assez sécurisé pour B2B

### 3. Proxy Decryption Service
**Avantages:** Isolation service de déchiffrement
**Inconvénients:** Complexité architecture, point de défaillance
**Décision:** Considéré pour Phase 3

### 4. Hardware Security Module (HSM)
**Avantages:** Sécurité matérielle, audit compliance
**Inconvénients:** Coût élevé, complexité déploiement
**Décision:** Phase future si besoin enterprise

## Évaluation des Risques

### Risques Techniques
- **Performance:** +15% latence estimée
- **Complexité:** Migration 6-8 semaines
- **Compatibility:** Tests extensifs requis

### Risques Business  
- **UX Impact:** Onboarding plus complexe
- **Support:** Formation équipe sur crypto
- **Coûts:** +20% infrastructure pour chiffrement

### Risques Sécurité
- **Key Management:** Point critique unique
- **Backup/Recovery:** Processus complexe  
- **Compliance:** Audit GDPR/LPD requis

## Métriques de Succès

1. **Performance:** <200ms overhead chiffrement
2. **Adoption:** >90% utilisateurs migrés en 30 jours
3. **Sécurité:** Zéro incident sur 6 mois
4. **UX:** Net Promoter Score maintenu >8/10

## Prochaines Étapes

1. **Validation CEO:** Approval de ce RFC
2. **Prototype:** Implémentation crypto module (5 jours)
3. **Tests Sécurité:** Pentest externe (10 jours)
4. **Development:** Sprint de développement (6 semaines)
5. **Launch:** Rollout progressive Phase 2

---

**Contact:** lopez@starboxgroup.com  
**Validation requise:** Alex Starbox (CEO)  
**Timeline:** Go/No-Go décision avant 2026-02-28