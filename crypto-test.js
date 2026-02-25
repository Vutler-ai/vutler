/**
 * Vutler Crypto Service Tests
 * Tests for E2E encryption functionality
 */

const { CryptoService } = require('../services/crypto');

describe('CryptoService', () => {
  let cryptoService;

  beforeEach(() => {
    cryptoService = new CryptoService();
  });

  describe('Key Generation', () => {
    test('should generate AES-256 key', async () => {
      const key = await cryptoService.generateKey();
      
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32); // 256 bits
    });

    test('should generate RSA key pair', async () => {
      const keyPair = await cryptoService.generateRSAKeyPair();
      
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      expect(keyPair.publicKey).toContain('BEGIN PUBLIC KEY');
      expect(keyPair.privateKey).toContain('BEGIN PRIVATE KEY');
    });

    test('should derive key from password', async () => {
      const password = 'test_password_123';
      const { key, salt } = await cryptoService.deriveKeyFromPassword(password);
      
      expect(Buffer.isBuffer(key)).toBe(true);
      expect(Buffer.isBuffer(salt)).toBe(true);
      expect(key.length).toBe(32); // 256 bits
      expect(salt.length).toBe(16); // 128 bits
    });

    test('should derive same key with same password and salt', async () => {
      const password = 'test_password_123';
      const { key: key1, salt } = await cryptoService.deriveKeyFromPassword(password);
      const { key: key2 } = await cryptoService.deriveKeyFromPassword(password, salt);
      
      expect(key1.equals(key2)).toBe(true);
    });
  });

  describe('Encryption/Decryption', () => {
    test('should encrypt and decrypt text successfully', async () => {
      const key = await cryptoService.generateKey();
      const plaintext = 'Hello, World! This is a test message.';
      
      const encrypted = await cryptoService.encrypt(plaintext, key);
      const decrypted = await cryptoService.decrypt(encrypted, key);
      
      expect(decrypted).toBe(plaintext);
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('tag');
      expect(encrypted).toHaveProperty('algorithm');
    });

    test('should handle binary data', async () => {
      const key = await cryptoService.generateKey();
      const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD]);
      
      const encrypted = await cryptoService.encrypt(binaryData, key);
      const decrypted = await cryptoService.decrypt(encrypted, key);
      
      expect(decrypted).toBe(binaryData.toString('utf8'));
    });

    test('should fail with wrong key', async () => {
      const key1 = await cryptoService.generateKey();
      const key2 = await cryptoService.generateKey();
      const plaintext = 'Secret message';
      
      const encrypted = await cryptoService.encrypt(plaintext, key1);
      
      await expect(cryptoService.decrypt(encrypted, key2)).rejects.toThrow();
    });

    test('should support associated data', async () => {
      const key = await cryptoService.generateKey();
      const plaintext = 'Secret message';
      const associatedData = 'user_id:123';
      
      const encrypted = await cryptoService.encrypt(plaintext, key, associatedData);
      const decrypted = await cryptoService.decrypt(encrypted, key, associatedData);
      
      expect(decrypted).toBe(plaintext);
      
      // Should fail with wrong associated data
      await expect(
        cryptoService.decrypt(encrypted, key, 'user_id:456')
      ).rejects.toThrow();
    });
  });

  describe('RSA Encryption', () => {
    test('should encrypt and decrypt with RSA', async () => {
      const { publicKey, privateKey } = await cryptoService.generateRSAKeyPair();
      const data = 'Small secret data';
      
      const encrypted = await cryptoService.encryptWithRSA(data, publicKey);
      const decrypted = await cryptoService.decryptWithRSA(encrypted, privateKey);
      
      expect(decrypted.toString()).toBe(data);
    });

    test('should handle Buffer data', async () => {
      const { publicKey, privateKey } = await cryptoService.generateRSAKeyPair();
      const data = Buffer.from('Binary secret data');
      
      const encrypted = await cryptoService.encryptWithRSA(data, publicKey);
      const decrypted = await cryptoService.decryptWithRSA(encrypted, privateKey);
      
      expect(Buffer.from(decrypted).equals(data)).toBe(true);
    });
  });

  describe('Ephemeral Decryption', () => {
    test('should decrypt for agent with TTL', async () => {
      const key = await cryptoService.generateKey();
      const message = 'Agent accessible message';
      const agentId = 'claude-assistant';
      const requestId = 'req_123';
      
      const encrypted = await cryptoService.encrypt(message, key);
      const decrypted = await cryptoService.decryptForAgent(
        encrypted, 
        key, 
        agentId, 
        requestId
      );
      
      expect(decrypted).toBe(message);
    });

    test('should cache decrypted content', async () => {
      const key = await cryptoService.generateKey();
      const message = 'Cached message';
      const agentId = 'code-assistant';
      const requestId = 'req_cache_123';
      
      const encrypted = await cryptoService.encrypt(message, key);
      
      // First call should decrypt
      const decrypted1 = await cryptoService.decryptForAgent(
        encrypted, key, agentId, requestId
      );
      
      // Second call should use cache
      const decrypted2 = await cryptoService.decryptForAgent(
        encrypted, key, agentId, requestId
      );
      
      expect(decrypted1).toBe(decrypted2);
      expect(decrypted1).toBe(message);
    });

    test('should clear ephemeral cache', async () => {
      const requestId = 'req_clear_123';
      
      // Add to cache first
      cryptoService.ephemeralCache.set(requestId, {
        decryptedContent: 'test content',
        agentId: 'test-agent',
        timestamp: Date.now()
      });
      
      expect(cryptoService.ephemeralCache.has(requestId)).toBe(true);
      
      const cleared = cryptoService.clearEphemeralCache(requestId);
      
      expect(cleared).toBe(true);
      expect(cryptoService.ephemeralCache.has(requestId)).toBe(false);
    });
  });

  describe('Recovery Phrase', () => {
    test('should generate recovery phrase', async () => {
      const masterKey = await cryptoService.generateKey();
      const { phrase, checksum } = await cryptoService.generateRecoveryPhrase(masterKey);
      
      expect(Array.isArray(phrase)).toBe(true);
      expect(phrase.length).toBe(24);
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBe(8);
    });

    test('should recover key from phrase', async () => {
      const masterKey = await cryptoService.generateKey();
      const { phrase, checksum } = await cryptoService.generateRecoveryPhrase(masterKey);
      
      const recoveredKey = await cryptoService.recoverKeyFromPhrase(phrase, checksum);
      
      expect(Buffer.isBuffer(recoveredKey)).toBe(true);
      expect(recoveredKey.length).toBe(32);
    });

    test('should fail with wrong checksum', async () => {
      const masterKey = await cryptoService.generateKey();
      const { phrase } = await cryptoService.generateRecoveryPhrase(masterKey);
      
      await expect(
        cryptoService.recoverKeyFromPhrase(phrase, 'wrongsum')
      ).rejects.toThrow('Invalid recovery phrase checksum');
    });
  });

  describe('Session Keys', () => {
    test('should generate session key with metadata', async () => {
      const sessionKey = await cryptoService.generateSessionKey();
      
      expect(sessionKey).toHaveProperty('key');
      expect(sessionKey).toHaveProperty('id');
      expect(sessionKey).toHaveProperty('created');
      expect(sessionKey).toHaveProperty('rotateAfter');
      
      expect(Buffer.isBuffer(sessionKey.key)).toBe(true);
      expect(sessionKey.key.length).toBe(32);
      expect(typeof sessionKey.id).toBe('string');
      expect(sessionKey.rotateAfter > sessionKey.created).toBe(true);
    });
  });

  describe('Utility Functions', () => {
    test('should hash data consistently', () => {
      const data = 'test data to hash';
      const hash1 = cryptoService.hash(data);
      const hash2 = cryptoService.hash(data);
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('string');
      expect(hash1.length).toBe(64); // SHA-256 hex
    });

    test('should generate unique IDs', () => {
      const id1 = cryptoService.generateId();
      const id2 = cryptoService.generateId();
      
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
      expect(id1.length).toBe(36); // UUID format
    });
  });

  describe('Performance', () => {
    test('should encrypt large data efficiently', async () => {
      const key = await cryptoService.generateKey();
      const largeData = 'x'.repeat(1024 * 100); // 100KB
      
      const startTime = Date.now();
      const encrypted = await cryptoService.encrypt(largeData, key);
      const decrypted = await cryptoService.decrypt(encrypted, key);
      const endTime = Date.now();
      
      expect(decrypted).toBe(largeData);
      expect(endTime - startTime).toBeLessThan(1000); // Should be under 1 second
    });

    test('key derivation should be appropriately slow', async () => {
      const password = 'test_password';
      
      const startTime = Date.now();
      await cryptoService.deriveKeyFromPassword(password);
      const endTime = Date.now();
      
      // Should take some time for security (but not too long for tests)
      expect(endTime - startTime).toBeGreaterThan(50);
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Error Handling', () => {
    test('should handle corrupted ciphertext', async () => {
      const key = await cryptoService.generateKey();
      const encrypted = await cryptoService.encrypt('test', key);
      
      // Corrupt the ciphertext
      encrypted.ciphertext = 'corrupted_data';
      
      await expect(cryptoService.decrypt(encrypted, key)).rejects.toThrow();
    });

    test('should handle invalid IV', async () => {
      const key = await cryptoService.generateKey();
      const encrypted = await cryptoService.encrypt('test', key);
      
      // Invalid IV
      encrypted.iv = 'invalid_iv';
      
      await expect(cryptoService.decrypt(encrypted, key)).rejects.toThrow();
    });

    test('should handle invalid auth tag', async () => {
      const key = await cryptoService.generateKey();
      const encrypted = await cryptoService.encrypt('test', key);
      
      // Corrupt auth tag
      encrypted.tag = 'invalid_tag';
      
      await expect(cryptoService.decrypt(encrypted, key)).rejects.toThrow();
    });
  });
});

// Integration test function
async function runIntegrationTest() {
  console.log('Running crypto integration test...');
  
  const cryptoService = new CryptoService();
  
  // Full E2E workflow test
  const password = 'user_password_123';
  const message = 'Secret business document content';
  const agentId = 'claude-assistant';
  
  try {
    // 1. Derive user key from password
    const { key: userKey, salt } = await cryptoService.deriveKeyFromPassword(password);
    console.log('✓ Key derived from password');
    
    // 2. Generate master key and encrypt it with user key
    const masterKey = await cryptoService.generateKey();
    const encryptedMasterKey = await cryptoService.encrypt(
      masterKey.toString('base64'), 
      userKey
    );
    console.log('✓ Master key generated and encrypted');
    
    // 3. Encrypt message with master key
    const encryptedMessage = await cryptoService.encrypt(message, masterKey);
    console.log('✓ Message encrypted');
    
    // 4. Agent decryption workflow
    const requestId = cryptoService.generateId();
    const decryptedForAgent = await cryptoService.decryptForAgent(
      encryptedMessage,
      masterKey,
      agentId,
      requestId
    );
    console.log('✓ Agent decryption successful');
    
    // 5. Verify decryption
    if (decryptedForAgent === message) {
      console.log('✓ Integration test PASSED');
      return true;
    } else {
      console.error('✗ Integration test FAILED: Content mismatch');
      return false;
    }
    
  } catch (error) {
    console.error('✗ Integration test FAILED:', error.message);
    return false;
  }
}

// Export for testing
module.exports = {
  runIntegrationTest
};

// Run integration test if called directly
if (require.main === module) {
  runIntegrationTest().then(success => {
    process.exit(success ? 0 : 1);
  });
}