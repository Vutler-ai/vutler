/**
 * Vutler Crypto Service - E2E Hybrid Encryption
 * Supports AES-256-GCM for messages and files
 * RSA-OAEP for key exchange and recovery
 * PBKDF2 for password-based key derivation
 */

const crypto = require('crypto');
const { promisify } = require('util');
const randomBytes = promisify(crypto.randomBytes);

class CryptoService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyDerivation = {
      algorithm: 'pbkdf2',
      hash: 'sha256',
      iterations: 100000,
      keyLength: 32, // 256 bits
      saltLength: 16  // 128 bits
    };
    this.rsaKeySize = 2048;
    this.ivLength = 12; // 96 bits for GCM
    this.tagLength = 16; // 128 bits
    
    // Ephemeral decryption cache with TTL
    this.ephemeralCache = new Map();
    this.maxCacheTime = 30000; // 30 seconds
    
    this.setupCleanupTimer();
  }
  
  setupCleanupTimer() {
    setInterval(() => {
      const now = Date.now();
      for (const [requestId, data] of this.ephemeralCache.entries()) {
        if (now - data.timestamp > this.maxCacheTime) {
          this.ephemeralCache.delete(requestId);
        }
      }
    }, 5000); // Cleanup every 5 seconds
  }

  /**
   * Generate a secure random key for AES-256-GCM
   */
  async generateKey() {
    const key = await randomBytes(32); // 256 bits
    return key;
  }

  /**
   * Generate RSA key pair for key exchange
   */
  async generateRSAKeyPair() {
    return new Promise((resolve, reject) => {
      crypto.generateKeyPair('rsa', {
        modulusLength: this.rsaKeySize,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem'
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem'
        }
      }, (err, publicKey, privateKey) => {
        if (err) reject(err);
        else resolve({ publicKey, privateKey });
      });
    });
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKeyFromPassword(password, salt) {
    if (!salt) {
      salt = await randomBytes(this.keyDerivation.saltLength);
    }
    
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        this.keyDerivation.iterations,
        this.keyDerivation.keyLength,
        this.keyDerivation.hash,
        (err, derivedKey) => {
          if (err) reject(err);
          else resolve({ key: derivedKey, salt });
        }
      );
    });
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(plaintext, key, associatedData = null) {
    try {
      const iv = await randomBytes(this.ivLength);
      const cipher = crypto.createCipher(this.algorithm, key, { iv });
      
      if (associatedData) {
        cipher.setAAD(Buffer.from(associatedData));
      }
      
      const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');
      
      let encrypted = cipher.update(plaintextBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      const tag = cipher.getAuthTag();
      
      return {
        ciphertext: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        algorithm: this.algorithm
      };
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(encryptedData, key, associatedData = null) {
    try {
      const { ciphertext, iv, tag } = encryptedData;
      
      const decipher = crypto.createDecipher(
        this.algorithm,
        key,
        { iv: Buffer.from(iv, 'base64') }
      );
      
      if (associatedData) {
        decipher.setAAD(Buffer.from(associatedData));
      }
      
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      
      let decrypted = decipher.update(Buffer.from(ciphertext, 'base64'));
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Encrypt data with RSA-OAEP (for key exchange)
   */
  async encryptWithRSA(data, publicKeyPem) {
    try {
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
      const encrypted = crypto.publicEncrypt({
        key: publicKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }, buffer);
      
      return encrypted.toString('base64');
    } catch (error) {
      throw new Error(`RSA encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data with RSA-OAEP
   */
  async decryptWithRSA(encryptedData, privateKeyPem) {
    try {
      const buffer = Buffer.from(encryptedData, 'base64');
      const decrypted = crypto.privateDecrypt({
        key: privateKeyPem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      }, buffer);
      
      return decrypted;
    } catch (error) {
      throw new Error(`RSA decryption failed: ${error.message}`);
    }
  }

  /**
   * Ephemeral decryption for agent access
   * Decrypts data temporarily, stores in memory for limited time
   */
  async decryptForAgent(encryptedData, key, agentId, requestId) {
    try {
      // Check if already cached
      const cached = this.ephemeralCache.get(requestId);
      if (cached) {
        return cached.decryptedContent;
      }
      
      // Decrypt content
      const decryptedContent = await this.decrypt(encryptedData, key);
      
      // Cache for limited time
      this.ephemeralCache.set(requestId, {
        decryptedContent,
        agentId,
        timestamp: Date.now(),
        expiresAt: Date.now() + this.maxCacheTime
      });
      
      // Auto-cleanup after TTL
      setTimeout(() => {
        this.ephemeralCache.delete(requestId);
      }, this.maxCacheTime);
      
      return decryptedContent;
    } catch (error) {
      throw new Error(`Agent decryption failed: ${error.message}`);
    }
  }

  /**
   * Clear ephemeral cache entry
   */
  clearEphemeralCache(requestId) {
    return this.ephemeralCache.delete(requestId);
  }

  /**
   * Generate recovery phrase (BIP-39 style)
   */
  async generateRecoveryPhrase(masterKey) {
    // Simple implementation - in production, use proper BIP-39 library
    const entropy = Buffer.concat([masterKey, await randomBytes(16)]);
    const words = [];
    
    // Convert to mnemonic words (simplified)
    const wordList = this.getMnemonicWordList();
    for (let i = 0; i < entropy.length; i += 2) {
      const index = entropy.readUInt16BE(i) % wordList.length;
      words.push(wordList[index]);
    }
    
    const phrase = words.slice(0, 24); // 24-word phrase
    const checksum = this.calculatePhraseChecksum(phrase.join(' '));
    
    return {
      phrase,
      checksum
    };
  }

  /**
   * Recover key from phrase
   */
  async recoverKeyFromPhrase(phrase, checksum) {
    const phraseStr = Array.isArray(phrase) ? phrase.join(' ') : phrase;
    
    // Verify checksum
    const calculatedChecksum = this.calculatePhraseChecksum(phraseStr);
    if (calculatedChecksum !== checksum) {
      throw new Error('Invalid recovery phrase checksum');
    }
    
    // Convert phrase back to key (simplified)
    const hash = crypto.createHash('sha256').update(phraseStr).digest();
    return hash.slice(0, 32); // 256-bit key
  }

  /**
   * Calculate checksum for recovery phrase
   */
  calculatePhraseChecksum(phrase) {
    return crypto.createHash('sha256').update(phrase).digest('hex').slice(0, 8);
  }

  /**
   * Get mnemonic word list (simplified BIP-39 subset)
   */
  getMnemonicWordList() {
    return [
      'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract',
      'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
      'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
      'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
      'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'agent', 'agree',
      'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol',
      'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone', 'alpha',
      'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among', 'amount',
      'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry', 'animal'
      // ... (in production, use full BIP-39 word list)
    ];
  }

  /**
   * Generate session key for channels
   */
  async generateSessionKey() {
    return {
      key: await randomBytes(32),
      id: crypto.randomUUID(),
      created: Date.now(),
      rotateAfter: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    };
  }

  /**
   * Hash function for consistency
   */
  hash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Generate secure random UUID
   */
  generateId() {
    return crypto.randomUUID();
  }
}

module.exports = { CryptoService };