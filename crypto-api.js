/**
 * Vutler Crypto API - E2E Encryption Endpoints
 * Handles key management, encryption/decryption, and agent access
 */

const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { CryptoService } = require('../services/crypto');
const router = express.Router();

const cryptoService = new CryptoService();

// Middleware to validate JWT and extract user info
const authenticateUser = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authorization token required' });
  }
  
  // In a real implementation, validate JWT and extract user info
  // For now, we'll simulate it
  req.user = { 
    id: 'user_123', // This should come from JWT
    workspaceId: 'workspace_456'
  };
  next();
};

// Middleware to check agent permissions
const authenticateAgent = (req, res, next) => {
  const agentId = req.headers['x-agent-id'];
  if (!agentId) {
    return res.status(401).json({ error: 'Agent ID required' });
  }
  
  req.agent = { id: agentId };
  next();
};

/**
 * POST /api/v1/crypto/keys - Generate user key pair
 */
router.post('/keys', [
  authenticateUser,
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('deviceFingerprint').notEmpty().withMessage('Device fingerprint required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { password, deviceFingerprint } = req.body;
    const userId = req.user.id;
    const workspaceId = req.user.workspaceId;

    // Generate master key
    const masterKey = await cryptoService.generateKey();
    
    // Derive key from password
    const { key: derivedKey, salt } = await cryptoService.deriveKeyFromPassword(password);
    
    // Encrypt master key with derived key
    const encryptedMasterKey = await cryptoService.encrypt(masterKey, derivedKey);
    
    // Generate RSA key pair for device
    const { publicKey, privateKey } = await cryptoService.generateRSAKeyPair();
    
    // Encrypt private key with master key
    const encryptedPrivateKey = await cryptoService.encrypt(privateKey, masterKey);
    
    // Generate recovery phrase
    const { phrase, checksum } = await cryptoService.generateRecoveryPhrase(masterKey);
    
    const keyId = cryptoService.generateId();
    
    // Store in database (simulated - use your PostgreSQL service)
    const keyData = {
      keyId,
      userId,
      workspaceId,
      publicKey,
      encryptedPrivateKey: encryptedPrivateKey,
      encryptedMasterKey: encryptedMasterKey,
      salt: salt.toString('base64'),
      keyDerivationParams: {
        algorithm: 'PBKDF2',
        hash: 'SHA-256',
        iterations: cryptoService.keyDerivation.iterations
      },
      deviceFingerprint,
      created: new Date().toISOString()
    };

    // TODO: Store keyData in PostgreSQL
    console.log('Key generated for user:', userId, 'Key ID:', keyId);

    res.json({
      success: true,
      keyId,
      publicKey,
      backupPhrase: phrase,
      backupChecksum: checksum,
      encryptionEnabled: true
    });

  } catch (error) {
    console.error('Key generation error:', error);
    res.status(500).json({ 
      error: 'Key generation failed',
      message: error.message 
    });
  }
});

/**
 * GET /api/v1/crypto/keys/:userId - Get user's public key
 */
router.get('/keys/:userId', [
  authenticateUser,
  param('userId').isUUID().withMessage('Invalid user ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.params;
    
    // TODO: Fetch from PostgreSQL
    // const userData = await pgService.getUserKey(userId);
    
    // Simulated response
    const userData = {
      userId,
      publicKey: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----',
      keyVersion: 1,
      created: new Date().toISOString()
    };

    res.json({
      success: true,
      userId: userData.userId,
      publicKey: userData.publicKey,
      keyVersion: userData.keyVersion
    });

  } catch (error) {
    console.error('Key retrieval error:', error);
    res.status(500).json({ 
      error: 'Key retrieval failed',
      message: error.message 
    });
  }
});

/**
 * POST /api/v1/crypto/encrypt - Encrypt message server-side
 */
router.post('/encrypt', [
  authenticateUser,
  body('content').notEmpty().withMessage('Content required'),
  body('keyId').isUUID().withMessage('Valid key ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content, keyId, agentPermissions } = req.body;
    const userId = req.user.id;

    // TODO: Retrieve user's master key from database
    // For now, simulate
    const masterKey = await cryptoService.generateKey(); // This should be retrieved

    // Encrypt content
    const encryptedData = await cryptoService.encrypt(content, masterKey);
    
    const encryptedMessage = {
      id: cryptoService.generateId(),
      userId,
      keyId,
      encryptedContent: encryptedData,
      agentPermissions: agentPermissions || {},
      created: new Date().toISOString()
    };

    // TODO: Store encrypted message in database
    console.log('Message encrypted for user:', userId);

    res.json({
      success: true,
      messageId: encryptedMessage.id,
      encryptedData: encryptedData,
      encryptionStatus: 'encrypted'
    });

  } catch (error) {
    console.error('Encryption error:', error);
    res.status(500).json({ 
      error: 'Encryption failed',
      message: error.message 
    });
  }
});

/**
 * POST /api/v1/crypto/decrypt - Decrypt for agents (ephemeral)
 */
router.post('/decrypt', [
  authenticateUser,
  authenticateAgent,
  body('messageId').isUUID().withMessage('Valid message ID required'),
  body('requestId').isUUID().withMessage('Valid request ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { messageId, requestId } = req.body;
    const userId = req.user.id;
    const agentId = req.agent.id;

    // TODO: Check agent permissions in database
    // const hasPermission = await checkAgentPermissions(userId, agentId, messageId);
    const hasPermission = true; // Simulated

    if (!hasPermission) {
      return res.status(403).json({ 
        error: 'Agent access denied',
        code: 'AGENT_ACCESS_DENIED' 
      });
    }

    // TODO: Retrieve encrypted message and user key
    // For now, simulate
    const encryptedData = {
      ciphertext: 'base64_encrypted_content',
      iv: 'base64_iv',
      tag: 'base64_tag'
    };
    const masterKey = await cryptoService.generateKey(); // Should be retrieved

    // Perform ephemeral decryption
    const decryptedContent = await cryptoService.decryptForAgent(
      encryptedData, 
      masterKey, 
      agentId, 
      requestId
    );

    res.json({
      success: true,
      content: decryptedContent,
      requestId,
      decryptedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + cryptoService.maxCacheTime).toISOString()
    });

  } catch (error) {
    console.error('Agent decryption error:', error);
    res.status(500).json({ 
      error: 'Decryption failed',
      message: error.message 
    });
  }
});

/**
 * POST /api/v1/crypto/key-exchange - Device key exchange
 */
router.post('/key-exchange', [
  authenticateUser,
  body('devicePublicKey').notEmpty().withMessage('Device public key required'),
  body('deviceId').notEmpty().withMessage('Device ID required'),
  body('challenge').notEmpty().withMessage('Challenge required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { devicePublicKey, deviceId, challenge } = req.body;
    const userId = req.user.id;

    // TODO: Retrieve user's master key
    const masterKey = await cryptoService.generateKey(); // Should be retrieved

    // Encrypt master key for new device
    const encryptedMasterKey = await cryptoService.encryptWithRSA(
      masterKey, 
      devicePublicKey
    );

    // Generate session token
    const sessionToken = cryptoService.generateId(); // In real app, use JWT

    // TODO: Store device association in database
    const deviceData = {
      userId,
      deviceId,
      devicePublicKey,
      encryptedMasterKey,
      sessionToken,
      syncedAt: new Date().toISOString()
    };

    console.log('Device key exchange for user:', userId, 'Device:', deviceId);

    res.json({
      success: true,
      encryptedMasterKey,
      sessionToken,
      keyVersion: 1,
      syncedAt: deviceData.syncedAt
    });

  } catch (error) {
    console.error('Key exchange error:', error);
    res.status(500).json({ 
      error: 'Key exchange failed',
      message: error.message 
    });
  }
});

/**
 * POST /api/v1/crypto/recover - Recover key from backup phrase
 */
router.post('/recover', [
  body('recoveryPhrase').isArray().withMessage('Recovery phrase must be an array'),
  body('checksum').notEmpty().withMessage('Checksum required'),
  body('newDevicePublicKey').notEmpty().withMessage('New device public key required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { recoveryPhrase, checksum, newDevicePublicKey } = req.body;

    // Recover master key from phrase
    const masterKey = await cryptoService.recoverKeyFromPhrase(recoveryPhrase, checksum);

    // Encrypt for new device
    const encryptedMasterKey = await cryptoService.encryptWithRSA(
      masterKey,
      newDevicePublicKey
    );

    // Generate new session token
    const sessionToken = cryptoService.generateId();

    res.json({
      success: true,
      encryptedMasterKey,
      sessionToken,
      recoveredAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Key recovery error:', error);
    res.status(500).json({ 
      error: 'Key recovery failed',
      message: error.message 
    });
  }
});

/**
 * DELETE /api/v1/crypto/ephemeral/:requestId - Clear ephemeral cache
 */
router.delete('/ephemeral/:requestId', [
  authenticateUser,
  authenticateAgent,
  param('requestId').isUUID().withMessage('Valid request ID required')
], async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const cleared = cryptoService.clearEphemeralCache(requestId);
    
    res.json({
      success: true,
      cleared,
      requestId
    });

  } catch (error) {
    console.error('Cache cleanup error:', error);
    res.status(500).json({ 
      error: 'Cache cleanup failed',
      message: error.message 
    });
  }
});

module.exports = router;