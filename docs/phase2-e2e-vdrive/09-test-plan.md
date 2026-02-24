# Plan de Tests - Phase 2 E2E & VDrive
**Version:** 1.0  
**Date:** 2026-02-23  
**Équipe:** QA & Security Starbox Group

## Résumé Exécutif

Ce plan de tests couvre l'ensemble des fonctionnalités Phase 2 de Vutler : chiffrement E2E, intégration VDrive, GitHub Connector, et monitoring dashboard. L'approche combine tests unitaires, intégration, E2E, performance et sécurité pour garantir une production robuste orientée PME/solopreneurs.

## Stratégie de Test Globale

### Pyramide de Tests
```
                /\
               /  \
              / E2E \
             /Tests \
            /__________\
           /            \
          /  Integration  \
         /     Tests       \
        /____________________\
       /                      \
      /      Unit Tests        \
     /________________________\
```

**Répartition:**
- **70% Unit Tests** - Modules crypto, API endpoints, services
- **20% Integration Tests** - Flux E2E, VDrive sync, GitHub webhooks  
- **10% E2E Tests** - User journeys critiques, cross-browser

### Technologies de Test

```javascript
// Stack de test principal
const testStack = {
  unitTests: {
    framework: 'Jest',
    coverage: 'nyc/istanbul',
    mocking: 'sinon',
    crypto: 'node:crypto/webcrypto'
  },
  integration: {
    framework: 'Jest + Supertest',
    database: 'PostgreSQL Test Instance',
    redis: 'Redis Test Instance',
    fixtures: 'Custom data seeding'
  },
  e2e: {
    browser: 'Playwright',
    devices: ['Chrome', 'Firefox', 'Safari', 'Mobile'],
    parallel: true,
    screenshots: 'on-failure'
  },
  performance: {
    load: 'Artillery.io',
    profiling: 'clinic.js',
    monitoring: 'Prometheus + Grafana'
  },
  security: {
    sast: 'Semgrep',
    dast: 'OWASP ZAP',
    crypto: 'Custom security tests'
  }
};
```

## Tests Unitaires - Modules Crypto

### 1. WebCrypto API Tests

```javascript
// crypto/webcrypto.test.js
import { CryptoService } from '../src/services/crypto.js';
import { webcrypto } from 'node:crypto';

// Polyfill WebCrypto pour Node.js
global.crypto = webcrypto;

describe('WebCrypto Module', () => {
  let cryptoService;
  
  beforeEach(() => {
    cryptoService = new CryptoService();
  });

  describe('Key Generation', () => {
    test('should generate AES-256-GCM key', async () => {
      const key = await cryptoService.generateKey('AES-GCM', 256);
      
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.algorithm.length).toBe(256);
      expect(key.extractable).toBe(true);
      expect(key.usages).toContain('encrypt');
      expect(key.usages).toContain('decrypt');
    });

    test('should generate RSA-OAEP key pair', async () => {
      const keyPair = await cryptoService.generateKeyPair('RSA-OAEP', 2048);
      
      expect(keyPair.publicKey).toBeInstanceOf(CryptoKey);
      expect(keyPair.privateKey).toBeInstanceOf(CryptoKey);
      expect(keyPair.publicKey.algorithm.name).toBe('RSA-OAEP');
      expect(keyPair.publicKey.algorithm.modulusLength).toBe(2048);
    });

    test('should derive key from password using PBKDF2', async () => {
      const password = 'test-password-123';
      const salt = crypto.getRandomValues(new Uint8Array(16));
      
      const key = await cryptoService.deriveKey(password, salt, 100000);
      
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe('AES-GCM');
      expect(key.extractable).toBe(false);
    });
  });

  describe('Encryption/Decryption', () => {
    test('should encrypt and decrypt text correctly', async () => {
      const plaintext = 'Hello, World! This is a test message.';
      const key = await cryptoService.generateKey('AES-GCM', 256);
      
      const encrypted = await cryptoService.encrypt(plaintext, key);
      expect(encrypted.ciphertext).toBeInstanceOf(ArrayBuffer);
      expect(encrypted.iv).toBeInstanceOf(ArrayBuffer);
      expect(encrypted.iv.byteLength).toBe(12); // GCM IV length
      
      const decrypted = await cryptoService.decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    test('should fail decryption with wrong key', async () => {
      const plaintext = 'Secret message';
      const key1 = await cryptoService.generateKey('AES-GCM', 256);
      const key2 = await cryptoService.generateKey('AES-GCM', 256);
      
      const encrypted = await cryptoService.encrypt(plaintext, key1);
      
      await expect(
        cryptoService.decrypt(encrypted, key2)
      ).rejects.toThrow();
    });

    test('should encrypt large files in chunks', async () => {
      const largeData = new Uint8Array(1024 * 1024 * 5); // 5MB
      crypto.getRandomValues(largeData);
      
      const key = await cryptoService.generateKey('AES-GCM', 256);
      
      const startTime = performance.now();
      const encrypted = await cryptoService.encryptChunked(largeData, key, 1024 * 1024);
      const encryptTime = performance.now() - startTime;
      
      expect(encryptTime).toBeLessThan(1000); // Should encrypt 5MB in <1s
      expect(encrypted.chunks).toHaveLength(5);
      
      const decrypted = await cryptoService.decryptChunked(encrypted, key);
      expect(new Uint8Array(decrypted)).toEqual(largeData);
    });
  });

  describe('Key Import/Export', () => {
    test('should export and import AES key', async () => {
      const originalKey = await cryptoService.generateKey('AES-GCM', 256);
      
      const exported = await crypto.subtle.exportKey('raw', originalKey);
      const imported = await crypto.subtle.importKey(
        'raw',
        exported,
        { name: 'AES-GCM' },
        true,
        ['encrypt', 'decrypt']
      );
      
      // Test that imported key works
      const testData = 'Test encryption';
      const encrypted = await cryptoService.encrypt(testData, originalKey);
      const decrypted = await cryptoService.decrypt(encrypted, imported);
      
      expect(decrypted).toBe(testData);
    });

    test('should handle JWK format for RSA keys', async () => {
      const keyPair = await cryptoService.generateKeyPair('RSA-OAEP', 2048);
      
      const publicJWK = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
      expect(publicJWK.kty).toBe('RSA');
      expect(publicJWK.alg).toBe('RSA-OAEP-256');
      
      const importedPublic = await crypto.subtle.importKey(
        'jwk',
        publicJWK,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt']
      );
      
      expect(importedPublic.algorithm.name).toBe('RSA-OAEP');
    });
  });

  describe('Security Edge Cases', () => {
    test('should generate unique IVs for each encryption', async () => {
      const plaintext = 'Same message';
      const key = await cryptoService.generateKey('AES-GCM', 256);
      
      const encrypted1 = await cryptoService.encrypt(plaintext, key);
      const encrypted2 = await cryptoService.encrypt(plaintext, key);
      
      expect(encrypted1.iv).not.toEqual(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toEqual(encrypted2.ciphertext);
    });

    test('should validate IV length', async () => {
      const key = await cryptoService.generateKey('AES-GCM', 256);
      const plaintext = 'Test message';
      
      // Test with invalid IV length
      const invalidIV = crypto.getRandomValues(new Uint8Array(8)); // Should be 12
      
      await expect(
        crypto.subtle.encrypt(
          { name: 'AES-GCM', iv: invalidIV },
          key,
          new TextEncoder().encode(plaintext)
        )
      ).rejects.toThrow();
    });

    test('should detect tampering in ciphertext', async () => {
      const key = await cryptoService.generateKey('AES-GCM', 256);
      const plaintext = 'Original message';
      
      const encrypted = await cryptoService.encrypt(plaintext, key);
      
      // Tamper with ciphertext
      const tamperedCiphertext = new Uint8Array(encrypted.ciphertext);
      tamperedCiphertext[0] ^= 1; // Flip one bit
      
      await expect(
        cryptoService.decrypt({
          ciphertext: tamperedCiphertext.buffer,
          iv: encrypted.iv
        }, key)
      ).rejects.toThrow();
    });
  });
});
```

### 2. Server-Side Crypto Service Tests

```javascript
// services/crypto-service.test.js
import { ServerCryptoService } from '../src/services/server-crypto.js';
import { randomBytes } from 'node:crypto';

describe('Server Crypto Service', () => {
  let cryptoService;
  
  beforeEach(() => {
    cryptoService = new ServerCryptoService();
  });

  describe('User Key Management', () => {
    test('should generate user master key', async () => {
      const userId = 'user-123';
      const password = 'user-password';
      
      const { masterKey, salt } = await cryptoService.generateUserMasterKey(userId, password);
      
      expect(masterKey).toBeInstanceOf(Buffer);
      expect(masterKey.length).toBe(32); // 256 bits
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(16); // 128 bits
    });

    test('should derive consistent session keys', async () => {
      const masterKey = randomBytes(32);
      const sessionData = { userId: 'user-123', timestamp: Date.now() };
      
      const sessionKey1 = await cryptoService.deriveSessionKey(masterKey, sessionData);
      const sessionKey2 = await cryptoService.deriveSessionKey(masterKey, sessionData);
      
      expect(sessionKey1).toEqual(sessionKey2);
    });
  });

  describe('Database Encryption', () => {
    test('should encrypt database fields', async () => {
      const userId = 'user-123';
      const data = { message: 'Secret data', timestamp: Date.now() };
      
      const encrypted = await cryptoService.encryptForDatabase(userId, data);
      
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('keyVersion');
      expect(encrypted.ciphertext).toBeInstanceOf(Buffer);
    });

    test('should decrypt database fields', async () => {
      const userId = 'user-123';
      const originalData = { message: 'Secret data', amount: 12345 };
      
      const encrypted = await cryptoService.encryptForDatabase(userId, originalData);
      const decrypted = await cryptoService.decryptFromDatabase(userId, encrypted);
      
      expect(decrypted).toEqual(originalData);
    });
  });
});
```

## Tests d'Intégration - Flux E2E

### 1. Message Encryption Flow

```javascript
// integration/message-encryption.test.js
import request from 'supertest';
import { app } from '../src/app.js';
import { setupTestDB, cleanupTestDB } from './helpers/db-setup.js';

describe('Message Encryption Integration', () => {
  let server;
  let testUser;
  let authToken;
  
  beforeAll(async () => {
    server = app.listen(0);
    await setupTestDB();
  });
  
  afterAll(async () => {
    await cleanupTestDB();
    server.close();
  });
  
  beforeEach(async () => {
    testUser = await createTestUser();
    authToken = await generateAuthToken(testUser.id);
  });

  test('should encrypt message on client, store encrypted, allow agent access', async () => {
    // 1. Client encrypts message
    const plaintext = 'This is a secret message from integration test';
    const clientCrypto = new ClientCryptoService();
    const userKey = await clientCrypto.getUserKey(testUser.id);
    const encrypted = await clientCrypto.encryptMessage(plaintext, userKey);
    
    // 2. Send encrypted message via API
    const response = await request(server)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        content: encrypted.ciphertext.toString('base64'),
        iv: encrypted.iv.toString('base64'),
        encrypted: true,
        channelId: 'test-channel'
      });
      
    expect(response.status).toBe(201);
    const messageId = response.body.data.id;
    
    // 3. Verify message stored encrypted in database
    const dbMessage = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    expect(dbMessage.rows[0].encrypted_content).toBeTruthy();
    expect(dbMessage.rows[0].content).toBeNull(); // Plain content should not be stored
    
    // 4. Agent requests message decryption
    const agentResponse = await request(server)
      .get(`/api/v1/messages/${messageId}/decrypt`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Agent-Request', 'claude-assistant');
      
    expect(agentResponse.status).toBe(200);
    expect(agentResponse.body.data.content).toBe(plaintext);
    
    // 5. Verify ephemeral decryption (no plain content cached)
    const dbMessageAfter = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    expect(dbMessageAfter.rows[0].content).toBeNull();
  });

  test('should handle concurrent message encryption', async () => {
    const messages = [
      'Message 1',
      'Message 2',
      'Message 3',
      'Message 4',
      'Message 5'
    ];
    
    const clientCrypto = new ClientCryptoService();
    const userKey = await clientCrypto.getUserKey(testUser.id);
    
    // Encrypt and send messages concurrently
    const promises = messages.map(async (msg, index) => {
      const encrypted = await clientCrypto.encryptMessage(msg, userKey);
      
      return request(server)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: encrypted.ciphertext.toString('base64'),
          iv: encrypted.iv.toString('base64'),
          encrypted: true,
          channelId: 'test-channel'
        });
    });
    
    const responses = await Promise.all(promises);
    
    // All should succeed
    responses.forEach(response => {
      expect(response.status).toBe(201);
    });
    
    // Verify all messages can be decrypted
    for (let i = 0; i < responses.length; i++) {
      const messageId = responses[i].body.data.id;
      const decrypted = await request(server)
        .get(`/api/v1/messages/${messageId}/decrypt`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Agent-Request', 'claude-assistant');
        
      expect(decrypted.body.data.content).toBe(messages[i]);
    }
  });
});
```

### 2. VDrive Integration Tests

```javascript
// integration/vdrive-integration.test.js
describe('VDrive Integration', () => {
  let testUser;
  let vdriveService;
  
  beforeEach(async () => {
    testUser = await createTestUser();
    vdriveService = new VDriveService(testUser.id);
  });

  test('should upload encrypted file to VDrive and retrieve via Vchat', async () => {
    // 1. Upload encrypted file
    const fileContent = Buffer.from('This is test file content for VDrive integration');
    const fileName = 'test-document.txt';
    
    const uploadResponse = await request(server)
      .post('/api/v1/vdrive/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', fileContent, fileName);
      
    expect(uploadResponse.status).toBe(201);
    const fileId = uploadResponse.body.data.id;
    
    // 2. Verify file encrypted on Synology
    const synoFile = await vdriveService.getSynologyFile(fileId);
    expect(synoFile.encrypted).toBe(true);
    expect(synoFile.encryption_version).toBe(1);
    
    // 3. Access file via Vchat interface
    const vchatResponse = await request(server)
      .get(`/api/v1/vdrive-chat/files/${fileId}`)
      .set('Authorization', `Bearer ${authToken}`);
      
    expect(vchatResponse.status).toBe(200);
    expect(vchatResponse.body.data.name).toBe(fileName);
    expect(vchatResponse.body.data.encrypted).toBe(true);
    
    // 4. Agent requests file access
    const agentFileResponse = await request(server)
      .get(`/api/v1/vdrive-chat/files/${fileId}/content`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Agent-Request', 'claude-assistant');
      
    expect(agentFileResponse.status).toBe(200);
    expect(agentFileResponse.body.data.content).toBe(fileContent.toString());
  });

  test('should sync VDrive changes in real-time via WebSocket', async () => {
    const wsClient = new WebSocketTestClient(`ws://localhost:${server.address().port}`);
    await wsClient.connect(authToken);
    
    // Upload file
    const uploadResponse = await request(server)
      .post('/api/v1/vdrive/upload')
      .set('Authorization', `Bearer ${authToken}`)
      .attach('file', Buffer.from('test content'), 'test.txt');
      
    // Should receive WebSocket notification
    const wsMessage = await wsClient.waitForMessage(5000);
    expect(wsMessage.type).toBe('vdrive:file_uploaded');
    expect(wsMessage.data.fileName).toBe('test.txt');
    
    wsClient.disconnect();
  });
});
```

## Tests E2E - Playwright Browser Tests

### 1. User Journey Tests

```javascript
// e2e/user-journey.spec.js
import { test, expect } from '@playwright/test';

test.describe('E2E User Journey', () => {
  test.beforeEach(async ({ page }) => {
    // Setup test user and login
    await page.goto('/login');
    await page.fill('[data-testid="email"]', 'test@example.com');
    await page.fill('[data-testid="password"]', 'testpassword123');
    await page.click('[data-testid="login-button"]');
    await expect(page).toHaveURL('/dashboard');
  });

  test('complete encryption setup and first encrypted message', async ({ page }) => {
    // 1. First-time encryption setup
    await page.click('[data-testid="setup-encryption"]');
    
    // Generate master key
    await page.fill('[data-testid="master-password"]', 'my-secure-password');
    await page.fill('[data-testid="confirm-password"]', 'my-secure-password');
    await page.click('[data-testid="generate-keys"]');
    
    // Wait for key generation (can take a few seconds)
    await expect(page.locator('[data-testid="encryption-status"]')).toHaveText('Active', { timeout: 10000 });
    
    // 2. Send encrypted message in Vchat
    await page.click('[data-testid="vchat-tab"]');
    await page.fill('[data-testid="message-input"]', 'This is my first encrypted message!');
    await page.click('[data-testid="encryption-toggle"]'); // Enable encryption
    await expect(page.locator('[data-testid="encryption-indicator"]')).toBeVisible();
    await page.click('[data-testid="send-message"]');
    
    // 3. Verify message appears encrypted for other users but decrypted for sender
    const messageElement = page.locator('[data-testid="message"]:last-child');
    await expect(messageElement.locator('[data-testid="encryption-badge"]')).toBeVisible();
    await expect(messageElement.locator('[data-testid="message-content"]')).toHaveText('This is my first encrypted message!');
    
    // 4. Agent should be able to read the message
    await page.fill('[data-testid="agent-prompt"]', 'What was my last message about?');
    await page.click('[data-testid="send-to-agent"]');
    
    const agentResponse = page.locator('[data-testid="agent-response"]:last-child');
    await expect(agentResponse).toContainText('encrypted message', { timeout: 15000 });
  });

  test('VDrive file upload and sharing in chat', async ({ page }) => {
    // 1. Open VDrive panel in Vchat
    await page.click('[data-testid="vchat-tab"]');
    await page.click('[data-testid="vdrive-panel-toggle"]');
    await expect(page.locator('[data-testid="vdrive-panel"]')).toBeVisible();
    
    // 2. Upload a file
    const fileInput = page.locator('[data-testid="vdrive-upload-input"]');
    await fileInput.setInputFiles({
      name: 'test-document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test content')
    });
    
    // Wait for upload and encryption
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="upload-progress"]')).not.toBeVisible({ timeout: 10000 });
    
    // 3. File should appear in VDrive list with encryption indicator
    const fileItem = page.locator('[data-testid="vdrive-file"]:has-text("test-document.pdf")');
    await expect(fileItem).toBeVisible();
    await expect(fileItem.locator('[data-testid="encryption-badge"]')).toBeVisible();
    
    // 4. Share file in chat
    await fileItem.click();
    await page.click('[data-testid="share-in-chat"]');
    
    // File should appear as a message with preview
    const sharedFileMessage = page.locator('[data-testid="message"]:last-child');
    await expect(sharedFileMessage.locator('[data-testid="file-preview"]')).toBeVisible();
    await expect(sharedFileMessage).toContainText('test-document.pdf');
    
    // 5. Agent should be able to access file content
    await page.fill('[data-testid="agent-prompt"]', 'What files do I have in my VDrive?');
    await page.click('[data-testid="send-to-agent"]');
    
    const agentResponse = page.locator('[data-testid="agent-response"]:last-child');
    await expect(agentResponse).toContainText('test-document.pdf', { timeout: 15000 });
  });

  test('GitHub integration setup and webhook handling', async ({ page }) => {
    // 1. Navigate to GitHub integration settings
    await page.click('[data-testid="settings-tab"]');
    await page.click('[data-testid="integrations-section"]');
    await page.click('[data-testid="github-connect"]');
    
    // 2. OAuth flow (mocked in test environment)
    await expect(page).toHaveURL(/github\.com\/login\/oauth/);
    await page.click('[data-testid="authorize-app"]'); // Mocked button
    
    // 3. Return to Vutler with integration active
    await expect(page).toHaveURL('/settings/integrations');
    await expect(page.locator('[data-testid="github-status"]')).toHaveText('Connected');
    
    // 4. Simulate webhook event (test helper)
    await page.evaluate(() => {
      window.testHelpers.simulateGitHubWebhook({
        event: 'push',
        repository: 'test-user/test-repo',
        commits: [{ message: 'Fix authentication bug' }]
      });
    });
    
    // 5. Should see notification in Vchat
    await page.click('[data-testid="vchat-tab"]');
    const notification = page.locator('[data-testid="github-notification"]:last-child');
    await expect(notification).toContainText('Push to test-user/test-repo');
    await expect(notification).toContainText('Fix authentication bug');
  });
});
```

### 2. Cross-Browser Compatibility Tests

```javascript
// e2e/cross-browser.spec.js
const browsers = ['chromium', 'firefox', 'webkit'];

browsers.forEach(browserName => {
  test.describe(`Cross-browser tests - ${browserName}`, () => {
    test.use({ browserName });

    test('WebCrypto API compatibility', async ({ page }) => {
      await page.goto('/crypto-test');
      
      // Test WebCrypto availability
      const cryptoSupport = await page.evaluate(() => {
        return typeof window.crypto !== 'undefined' && 
               typeof window.crypto.subtle !== 'undefined';
      });
      expect(cryptoSupport).toBe(true);
      
      // Test AES-GCM key generation
      const keyGenResult = await page.evaluate(async () => {
        try {
          const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );
          return key.algorithm.name === 'AES-GCM';
        } catch (error) {
          return false;
        }
      });
      expect(keyGenResult).toBe(true);
    });

    test('VDrive file upload works across browsers', async ({ page }) => {
      await loginTestUser(page);
      await page.click('[data-testid="vchat-tab"]');
      await page.click('[data-testid="vdrive-panel-toggle"]');
      
      const fileInput = page.locator('[data-testid="vdrive-upload-input"]');
      await fileInput.setInputFiles({
        name: 'cross-browser-test.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Cross-browser test content')
      });
      
      await expect(page.locator('[data-testid="upload-success"]')).toBeVisible({ timeout: 10000 });
    });
  });
});
```

## Tests de Performance et Charge

### 1. Tests de Performance Crypto

```javascript
// performance/crypto-performance.test.js
import { performance } from 'node:perf_hooks';

describe('Crypto Performance Tests', () => {
  test('AES-256-GCM encryption performance', async () => {
    const cryptoService = new CryptoService();
    const key = await cryptoService.generateKey('AES-GCM', 256);
    
    const testSizes = [
      { name: '1KB', size: 1024 },
      { name: '100KB', size: 100 * 1024 },
      { name: '1MB', size: 1024 * 1024 },
      { name: '10MB', size: 10 * 1024 * 1024 }
    ];
    
    for (const testCase of testSizes) {
      const data = new Uint8Array(testCase.size);
      crypto.getRandomValues(data);
      
      const startTime = performance.now();
      const encrypted = await cryptoService.encrypt(data.buffer, key);
      const encryptTime = performance.now() - startTime;
      
      const decryptStart = performance.now();
      const decrypted = await cryptoService.decrypt(encrypted, key);
      const decryptTime = performance.now() - decryptStart;
      
      // Performance assertions (adjust based on target hardware)
      const encryptMBps = (testCase.size / 1024 / 1024) / (encryptTime / 1000);
      const decryptMBps = (testCase.size / 1024 / 1024) / (decryptTime / 1000);
      
      console.log(`${testCase.name}: Encrypt ${encryptMBps.toFixed(2)} MB/s, Decrypt ${decryptMBps.toFixed(2)} MB/s`);
      
      // Minimum performance requirements
      if (testCase.size >= 1024 * 1024) { // For files >= 1MB
        expect(encryptMBps).toBeGreaterThan(10); // At least 10 MB/s
        expect(decryptMBps).toBeGreaterThan(10);
      }
    }
  });

  test('concurrent encryption performance', async () => {
    const cryptoService = new CryptoService();
    const key = await cryptoService.generateKey('AES-GCM', 256);
    const messageSize = 1024; // 1KB messages
    const concurrentMessages = 100;
    
    const messages = Array.from({ length: concurrentMessages }, (_, i) => {
      const data = new Uint8Array(messageSize);
      crypto.getRandomValues(data);
      return data.buffer;
    });
    
    const startTime = performance.now();
    
    const encryptPromises = messages.map(msg => 
      cryptoService.encrypt(msg, key)
    );
    
    await Promise.all(encryptPromises);
    
    const totalTime = performance.now() - startTime;
    const messagesPerSecond = (concurrentMessages / totalTime) * 1000;
    
    console.log(`Concurrent encryption: ${messagesPerSecond.toFixed(2)} messages/second`);
    
    // Should handle at least 50 concurrent 1KB encryptions per second
    expect(messagesPerSecond).toBeGreaterThan(50);
  });
});
```

### 2. Load Testing avec Artillery

```yaml
# artillery/load-test.yml
config:
  target: 'https://vutler.starboxgroup.com'
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 300
      arrivalRate: 50
      rampTo: 200
      name: "Ramp up load"
    - duration: 300
      arrivalRate: 200
      name: "Sustained load"
  variables:
    testUsers:
      - "testuser1@example.com:password123"
      - "testuser2@example.com:password123"
      - "testuser3@example.com:password123"

scenarios:
  - name: "Encrypted Message Flow"
    weight: 60
    flow:
      - post:
          url: "/api/v1/auth/login"
          json:
            email: "{{ $randomString() }}@loadtest.com"
            password: "loadtest123"
          capture:
            - json: "$.data.token"
              as: "authToken"
      - post:
          url: "/api/v1/messages"
          headers:
            Authorization: "Bearer {{ authToken }}"
          json:
            content: "{{ $randomString(100) }}"
            encrypted: true
            channelId: "load-test-channel"
      - get:
          url: "/api/v1/messages"
          headers:
            Authorization: "Bearer {{ authToken }}"

  - name: "VDrive File Operations"
    weight: 30
    flow:
      - post:
          url: "/api/v1/auth/login"
          json:
            email: "{{ $randomString() }}@loadtest.com"
            password: "loadtest123"
          capture:
            - json: "$.data.token"
              as: "authToken"
      - post:
          url: "/api/v1/vdrive/upload"
          headers:
            Authorization: "Bearer {{ authToken }}"
          formData:
            file: "@./test-files/sample-{{ $randomInt(1, 10) }}.txt"
      - get:
          url: "/api/v1/vdrive/files"
          headers:
            Authorization: "Bearer {{ authToken }}"

  - name: "GitHub Webhook Processing"
    weight: 10
    flow:
      - post:
          url: "/api/v1/github/webhook"
          headers:
            X-GitHub-Event: "push"
            X-Hub-Signature-256: "{{ $computeHmac() }}"
          json:
            repository:
              id: "{{ $randomInt(1000, 9999) }}"
              full_name: "loadtest/repo-{{ $randomInt(1, 100) }}"
            commits:
              - message: "Load test commit {{ $randomString(20) }}"

# Performance targets
expect:
  - statusCode: 200
  - contentType: json
  - maxResponseTime: 2000  # 2 seconds max response time
  - percentile:
      p95: 1000  # 95th percentile under 1 second
      p99: 2000  # 99th percentile under 2 seconds
```

## Tests de Sécurité Spécifiques

### 1. Tests d'Attaque Cryptographique

```javascript
// security/crypto-attack.test.js
describe('Crypto Security Tests', () => {
  test('should resist timing attacks on decryption', async () => {
    const cryptoService = new CryptoService();
    const key = await cryptoService.generateKey('AES-GCM', 256);
    
    const validMessage = 'Valid test message';
    const encrypted = await cryptoService.encrypt(validMessage, key);
    
    // Create invalid ciphertext
    const invalidCiphertext = new Uint8Array(encrypted.ciphertext);
    invalidCiphertext[0] ^= 1; // Flip one bit
    
    const timingData = [];
    
    // Measure decryption timing for valid vs invalid ciphertext
    for (let i = 0; i < 100; i++) {
      // Valid decryption
      const validStart = performance.now();
      try {
        await cryptoService.decrypt(encrypted, key);
      } catch (e) { /* expected */ }
      const validTime = performance.now() - validStart;
      
      // Invalid decryption
      const invalidStart = performance.now();
      try {
        await cryptoService.decrypt({
          ciphertext: invalidCiphertext.buffer,
          iv: encrypted.iv
        }, key);
      } catch (e) { /* expected */ }
      const invalidTime = performance.now() - invalidStart;
      
      timingData.push({ valid: validTime, invalid: invalidTime });
    }
    
    // Statistical analysis of timing differences
    const avgValidTime = timingData.reduce((sum, d) => sum + d.valid, 0) / timingData.length;
    const avgInvalidTime = timingData.reduce((sum, d) => sum + d.invalid, 0) / timingData.length;
    const timingDifference = Math.abs(avgValidTime - avgInvalidTime);
    
    // Should not have significant timing difference (< 1ms difference acceptable)
    expect(timingDifference).toBeLessThan(1);
  });

  test('should prevent key recovery through side channels', async () => {
    const cryptoService = new CryptoService();
    const key = await cryptoService.generateKey('AES-GCM', 256);
    
    // Try to extract key information through repeated operations
    const message = 'Test message for side channel analysis';
    const encryptions = [];
    
    for (let i = 0; i < 1000; i++) {
      const encrypted = await cryptoService.encrypt(message, key);
      encryptions.push(encrypted);
    }
    
    // All IVs should be unique
    const ivs = encryptions.map(e => Buffer.from(e.iv).toString('hex'));
    const uniqueIVs = new Set(ivs);
    expect(uniqueIVs.size).toBe(encryptions.length);
    
    // All ciphertexts should be different
    const ciphertexts = encryptions.map(e => Buffer.from(e.ciphertext).toString('hex'));
    const uniqueCiphertexts = new Set(ciphertexts);
    expect(uniqueCiphertexts.size).toBe(encryptions.length);
  });
});
```

### 2. Tests de Sécurité API

```javascript
// security/api-security.test.js
describe('API Security Tests', () => {
  test('should prevent unauthorized access to encrypted data', async () => {
    const user1 = await createTestUser();
    const user2 = await createTestUser();
    const user1Token = await generateAuthToken(user1.id);
    const user2Token = await generateAuthToken(user2.id);
    
    // User1 creates encrypted message
    const response1 = await request(server)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        content: 'base64-encrypted-content',
        encrypted: true,
        channelId: 'private-channel'
      });
      
    const messageId = response1.body.data.id;
    
    // User2 should not be able to decrypt User1's message
    const response2 = await request(server)
      .get(`/api/v1/messages/${messageId}/decrypt`)
      .set('Authorization', `Bearer ${user2Token}`)
      .set('X-Agent-Request', 'claude-assistant');
      
    expect(response2.status).toBe(403);
    expect(response2.body.error).toContain('unauthorized');
  });

  test('should validate agent access permissions', async () => {
    const testUser = await createTestUser();
    const authToken = await generateAuthToken(testUser.id);
    
    // Create message with agent access disabled
    const response = await request(server)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        content: 'sensitive-encrypted-content',
        encrypted: true,
        agentAccess: false,
        channelId: 'private-channel'
      });
      
    const messageId = response.body.data.id;
    
    // Agent should be denied access
    const agentResponse = await request(server)
      .get(`/api/v1/messages/${messageId}/decrypt`)
      .set('Authorization', `Bearer ${authToken}`)
      .set('X-Agent-Request', 'claude-assistant');
      
    expect(agentResponse.status).toBe(403);
    expect(agentResponse.body.error).toContain('agent access denied');
  });

  test('should prevent SQL injection in encrypted queries', async () => {
    const testUser = await createTestUser();
    const authToken = await generateAuthToken(testUser.id);
    
    // Attempt SQL injection via search parameter
    const maliciousQuery = "'; DROP TABLE messages; --";
    
    const response = await request(server)
      .get('/api/v1/messages/search')
      .set('Authorization', `Bearer ${authToken}`)
      .query({ q: maliciousQuery });
      
    // Should not crash or expose database error
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
    
    // Verify messages table still exists
    const tableExists = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'messages'
      )
    `);
    expect(tableExists.rows[0].exists).toBe(true);
  });
});
```

## Configuration CI/CD et Automation

### 1. GitHub Actions Workflow

```yaml
# .github/workflows/test-phase2.yml
name: Phase 2 E2E Testing

on:
  push:
    branches: [main, phase2-e2e-vdrive]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'
  POSTGRES_VERSION: '16'
  REDIS_VERSION: '7'

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: vutler_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Setup test database
        run: |
          npm run db:test:setup
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/vutler_test
          
      - name: Run crypto unit tests
        run: npm run test:crypto
        
      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/vutler_test
          REDIS_URL: redis://localhost:6379
          
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/lcov.info

  e2e-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: vutler_test
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Install dependencies
        run: npm ci
        
      - name: Install Playwright
        run: npx playwright install --with-deps
        
      - name: Build application
        run: npm run build:test
        
      - name: Start test server
        run: npm run start:test &
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/vutler_test
          
      - name: Wait for server
        run: npx wait-on http://localhost:3000
        
      - name: Run E2E tests
        run: npx playwright test
        env:
          BASE_URL: http://localhost:3000
          
      - name: Upload E2E artifacts
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Semgrep SAST
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/secrets
            p/owasp-top-ten
            
      - name: Run OWASP ZAP
        uses: zaproxy/action-full-scan@v0.10.0
        with:
          target: 'http://localhost:3000'
          cmd_options: '-a'

  performance-tests:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          
      - name: Install Artillery
        run: npm install -g artillery@latest
        
      - name: Run load tests
        run: artillery run artillery/load-test.yml
        
      - name: Upload performance report
        uses: actions/upload-artifact@v4
        with:
          name: performance-report
          path: artillery-report.json
```

### 2. Test Database Setup

```javascript
// test/helpers/db-setup.js
import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const TEST_DB_CONFIG = {
  host: 'localhost',
  port: 5432,
  database: 'vutler_test',
  user: 'postgres',
  password: 'testpass'
};

export async function setupTestDB() {
  const client = new Client(TEST_DB_CONFIG);
  await client.connect();
  
  // Load schema
  const schema = readFileSync(join(__dirname, '../../sql/schema.sql'), 'utf8');
  await client.query(schema);
  
  // Load test fixtures
  const fixtures = readFileSync(join(__dirname, '../../sql/test-fixtures.sql'), 'utf8');
  await client.query(fixtures);
  
  await client.end();
}

export async function cleanupTestDB() {
  const client = new Client(TEST_DB_CONFIG);
  await client.connect();
  
  // Clean all tables
  await client.query(`
    TRUNCATE TABLE 
      messages, 
      files, 
      github_integrations, 
      security_advisories,
      deployments
    CASCADE
  `);
  
  await client.end();
}

export async function createTestUser(userData = {}) {
  const client = new Client(TEST_DB_CONFIG);
  await client.connect();
  
  const user = {
    email: userData.email || 'test@example.com',
    password: userData.password || 'testpass123',
    name: userData.name || 'Test User',
    ...userData
  };
  
  const result = await client.query(`
    INSERT INTO users (email, password_hash, name, created_at)
    VALUES ($1, $2, $3, NOW())
    RETURNING *
  `, [user.email, user.password, user.name]);
  
  await client.end();
  return result.rows[0];
}
```

## Métriques et Reporting

### 1. Coverage Requirements

```json
// package.json - Coverage thresholds
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 85,
        "functions": 90,
        "lines": 88,
        "statements": 88
      },
      "./src/services/crypto.js": {
        "branches": 95,
        "functions": 100,
        "lines": 95,
        "statements": 95
      },
      "./src/api/": {
        "branches": 80,
        "functions": 85,
        "lines": 85,
        "statements": 85
      }
    }
  }
}
```

### 2. Test Metrics Dashboard

```javascript
// scripts/generate-test-report.js
import fs from 'fs';
import { execSync } from 'child_process';

async function generateTestReport() {
  console.log('🧪 Generating comprehensive test report...');
  
  // Run all test suites
  const results = {
    unit: await runUnitTests(),
    integration: await runIntegrationTests(),
    e2e: await runE2ETests(),
    performance: await runPerformanceTests(),
    security: await runSecurityTests()
  };
  
  // Generate HTML report
  const reportHtml = generateHTMLReport(results);
  fs.writeFileSync('./test-results/report.html', reportHtml);
  
  console.log('✅ Test report generated: ./test-results/report.html');
  
  // Check if all tests passed
  const allPassed = Object.values(results).every(r => r.passed);
  process.exit(allPassed ? 0 : 1);
}

async function runUnitTests() {
  try {
    const output = execSync('npm run test:unit -- --json', { encoding: 'utf8' });
    const result = JSON.parse(output);
    return {
      passed: result.success,
      tests: result.numTotalTests,
      failures: result.numFailedTests,
      coverage: result.coverageMap
    };
  } catch (error) {
    return { passed: false, error: error.message };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateTestReport();
}
```

## Checklist Déploiement

### Phase 2 Go-Live Checklist

- [ ] **Tests Unitaires**
  - [ ] Crypto modules: 100% coverage
  - [ ] API endpoints: >90% coverage  
  - [ ] Services: >85% coverage

- [ ] **Tests Intégration**
  - [ ] Message encryption flow
  - [ ] VDrive upload/download
  - [ ] GitHub webhooks
  - [ ] Agent access control

- [ ] **Tests E2E**
  - [ ] User journey complet
  - [ ] Cross-browser compatibility
  - [ ] Mobile responsiveness
  - [ ] Real-time WebSocket events

- [ ] **Tests Performance**
  - [ ] Encryption: <200ms overhead
  - [ ] Load test: 200 concurrent users
  - [ ] Database queries: <100ms avg
  - [ ] File upload: >10MB/s throughput

- [ ] **Tests Sécurité** 
  - [ ] SAST scan: 0 high/critical issues
  - [ ] DAST scan: 0 vulnerabilities
  - [ ] Crypto timing attack resistance
  - [ ] Access control verification

- [ ] **Infrastructure**
  - [ ] Production database migration
  - [ ] Redis cache configuration
  - [ ] Nginx SSL/TLS setup
  - [ ] Monitoring alerts configured

---

**Équipe QA:** lopez@starboxgroup.com, qa-team@starboxgroup.com  
**Validation:** Tous les tests doivent passer avant déploiement production  
**Rollback:** Plan de rollback testé et documenté dans `10-deployment-plan.md`