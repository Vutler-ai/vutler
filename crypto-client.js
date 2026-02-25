/**
 * Vutler Frontend Crypto Client - WebCrypto API Implementation
 * Handles client-side encryption/decryption using browser WebCrypto API
 * Stores keys securely in IndexedDB with recovery phrase support
 */

class VutlerCryptoClient {
  constructor() {
    this.algorithm = 'AES-GCM';
    this.keyLength = 256;
    this.rsaKeyLength = 2048;
    this.ivLength = 12; // 96 bits for GCM
    
    this.dbName = 'VutlerCrypto';
    this.dbVersion = 1;
    this.db = null;
    
    this.masterKey = null;
    this.keyPair = null;
    
    this.initDatabase();
  }

  /**
   * Initialize IndexedDB for secure key storage
   */
  async initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Keys store
        if (!db.objectStoreNames.contains('keys')) {
          const keyStore = db.createObjectStore('keys', { keyPath: 'id' });
          keyStore.createIndex('userId', 'userId', { unique: false });
          keyStore.createIndex('type', 'type', { unique: false });
        }
        
        // Messages store (for offline encryption)
        if (!db.objectStoreNames.contains('messages')) {
          const messageStore = db.createObjectStore('messages', { keyPath: 'id' });
          messageStore.createIndex('chatId', 'chatId', { unique: false });
          messageStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  /**
   * Generate master key for user
   */
  async generateMasterKey() {
    this.masterKey = await crypto.subtle.generateKey(
      {
        name: this.algorithm,
        length: this.keyLength
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    
    return this.masterKey;
  }

  /**
   * Generate RSA key pair for device
   */
  async generateDeviceKeyPair() {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: this.rsaKeyLength,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    
    return this.keyPair;
  }

  /**
   * Derive key from password using PBKDF2
   */
  async deriveKeyFromPassword(password, salt) {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    
    // Import password as raw key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveKey']
    );
    
    // Derive AES key
    const derivedKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      {
        name: this.algorithm,
        length: this.keyLength
      },
      true, // extractable
      ['encrypt', 'decrypt']
    );
    
    return derivedKey;
  }

  /**
   * Encrypt text with AES-256-GCM
   */
  async encrypt(plaintext, key = null) {
    const encryptionKey = key || this.masterKey;
    if (!encryptionKey) {
      throw new Error('No encryption key available');
    }
    
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    
    const iv = crypto.getRandomValues(new Uint8Array(this.ivLength));
    
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: this.algorithm,
        iv: iv
      },
      encryptionKey,
      data
    );
    
    return {
      ciphertext: this.arrayBufferToBase64(encryptedData),
      iv: this.arrayBufferToBase64(iv),
      algorithm: this.algorithm
    };
  }

  /**
   * Decrypt text with AES-256-GCM
   */
  async decrypt(encryptedData, key = null) {
    const decryptionKey = key || this.masterKey;
    if (!decryptionKey) {
      throw new Error('No decryption key available');
    }
    
    const ciphertext = this.base64ToArrayBuffer(encryptedData.ciphertext);
    const iv = this.base64ToArrayBuffer(encryptedData.iv);
    
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: this.algorithm,
        iv: iv
      },
      decryptionKey,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }

  /**
   * Encrypt data with RSA-OAEP (for key exchange)
   */
  async encryptWithRSA(data, publicKey) {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP'
      },
      publicKey,
      dataBuffer
    );
    
    return this.arrayBufferToBase64(encrypted);
  }

  /**
   * Decrypt data with RSA-OAEP
   */
  async decryptWithRSA(encryptedData, privateKey) {
    const data = this.base64ToArrayBuffer(encryptedData);
    
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP'
      },
      privateKey,
      data
    );
    
    return new Uint8Array(decrypted);
  }

  /**
   * Setup user encryption (first time)
   */
  async setupEncryption(password, userId) {
    try {
      // Generate master key
      await this.generateMasterKey();
      
      // Generate device key pair
      await this.generateDeviceKeyPair();
      
      // Generate salt for password derivation
      const salt = crypto.getRandomValues(new Uint8Array(16));
      
      // Derive key from password
      const derivedKey = await this.deriveKeyFromPassword(password, salt);
      
      // Export master key
      const masterKeyData = await crypto.subtle.exportKey('raw', this.masterKey);
      
      // Encrypt master key with derived key
      const encryptedMasterKey = await this.encrypt(
        this.arrayBufferToBase64(masterKeyData), 
        derivedKey
      );
      
      // Export public key
      const publicKeyData = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
      const publicKeyPem = this.arrayBufferToPem(publicKeyData, 'PUBLIC KEY');
      
      // Export private key
      const privateKeyData = await crypto.subtle.exportKey('pkcs8', this.keyPair.privateKey);
      
      // Encrypt private key with master key
      const encryptedPrivateKey = await this.encrypt(
        this.arrayBufferToBase64(privateKeyData)
      );
      
      // Generate device fingerprint
      const deviceFingerprint = await this.generateDeviceFingerprint();
      
      // Store encrypted keys in IndexedDB
      await this.storeKey({
        id: 'masterKey',
        userId: userId,
        type: 'master',
        encryptedKey: encryptedMasterKey,
        salt: this.arrayBufferToBase64(salt),
        created: Date.now()
      });
      
      await this.storeKey({
        id: 'deviceKeyPair',
        userId: userId,
        type: 'device',
        publicKey: publicKeyPem,
        encryptedPrivateKey: encryptedPrivateKey,
        deviceFingerprint: deviceFingerprint,
        created: Date.now()
      });
      
      return {
        publicKey: publicKeyPem,
        deviceFingerprint: deviceFingerprint,
        encryptedMasterKey: encryptedMasterKey,
        salt: this.arrayBufferToBase64(salt)
      };
      
    } catch (error) {
      throw new Error(`Encryption setup failed: ${error.message}`);
    }
  }

  /**
   * Login with password (decrypt keys)
   */
  async login(password, userId) {
    try {
      // Get stored master key
      const masterKeyData = await this.getKey('masterKey', userId);
      if (!masterKeyData) {
        throw new Error('No master key found');
      }
      
      // Reconstruct salt
      const salt = this.base64ToArrayBuffer(masterKeyData.salt);
      
      // Derive key from password
      const derivedKey = await this.deriveKeyFromPassword(password, salt);
      
      // Decrypt master key
      const decryptedMasterKeyB64 = await this.decrypt(masterKeyData.encryptedKey, derivedKey);
      const masterKeyBuffer = this.base64ToArrayBuffer(decryptedMasterKeyB64);
      
      // Import master key
      this.masterKey = await crypto.subtle.importKey(
        'raw',
        masterKeyBuffer,
        {
          name: this.algorithm,
          length: this.keyLength
        },
        true,
        ['encrypt', 'decrypt']
      );
      
      // Get and decrypt device keys
      const deviceKeyData = await this.getKey('deviceKeyPair', userId);
      if (deviceKeyData) {
        const decryptedPrivateKeyB64 = await this.decrypt(deviceKeyData.encryptedPrivateKey);
        const privateKeyBuffer = this.base64ToArrayBuffer(decryptedPrivateKeyB64);
        
        const privateKey = await crypto.subtle.importKey(
          'pkcs8',
          privateKeyBuffer,
          {
            name: 'RSA-OAEP',
            hash: 'SHA-256'
          },
          true,
          ['decrypt']
        );
        
        const publicKey = await this.pemToPublicKey(deviceKeyData.publicKey);
        
        this.keyPair = { publicKey, privateKey };
      }
      
      return true;
      
    } catch (error) {
      throw new Error(`Login failed: ${error.message}`);
    }
  }

  /**
   * Store key in IndexedDB
   */
  async storeKey(keyData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['keys'], 'readwrite');
      const store = transaction.objectStore('keys');
      
      const request = store.put(keyData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get key from IndexedDB
   */
  async getKey(keyId, userId = null) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['keys'], 'readonly');
      const store = transaction.objectStore('keys');
      
      const request = store.get(keyId);
      request.onsuccess = () => {
        const result = request.result;
        if (result && (!userId || result.userId === userId)) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Generate device fingerprint
   */
  async generateDeviceFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Device fingerprint', 2, 2);
    
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      canvas.toDataURL()
    ].join('|');
    
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprint);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    
    return this.arrayBufferToHex(hashBuffer);
  }

  /**
   * Utility: Convert ArrayBuffer to Base64
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary);
  }

  /**
   * Utility: Convert Base64 to ArrayBuffer
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Utility: Convert ArrayBuffer to Hex
   */
  arrayBufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Utility: Convert ArrayBuffer to PEM
   */
  arrayBufferToPem(buffer, label) {
    const base64 = this.arrayBufferToBase64(buffer);
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----`;
  }

  /**
   * Utility: Convert PEM to PublicKey
   */
  async pemToPublicKey(pem) {
    const pemContents = pem.replace(/-----BEGIN PUBLIC KEY-----/, '')
                          .replace(/-----END PUBLIC KEY-----/, '')
                          .replace(/\s/g, '');
    const keyBuffer = this.base64ToArrayBuffer(pemContents);
    
    return await crypto.subtle.importKey(
      'spki',
      keyBuffer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['encrypt']
    );
  }

  /**
   * Encrypt message for chat
   */
  async encryptMessage(message, chatId) {
    if (!this.masterKey) {
      throw new Error('Not logged in - no master key');
    }
    
    const messageId = crypto.randomUUID();
    const timestamp = Date.now();
    
    const encryptedData = await this.encrypt(message);
    
    const encryptedMessage = {
      id: messageId,
      chatId: chatId,
      encryptedContent: encryptedData,
      timestamp: timestamp,
      algorithm: this.algorithm
    };
    
    // Store locally for offline capability
    await this.storeMessage(encryptedMessage);
    
    return encryptedMessage;
  }

  /**
   * Store encrypted message locally
   */
  async storeMessage(messageData) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');
      
      const request = store.put(messageData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get encryption status
   */
  getEncryptionStatus() {
    return {
      isSetup: this.masterKey !== null,
      hasDeviceKeys: this.keyPair !== null,
      algorithm: this.algorithm,
      keyLength: this.keyLength
    };
  }
}

// Make it globally available
window.VutlerCrypto = VutlerCryptoClient;