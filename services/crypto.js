'use strict';

/**
 * Crypto Service — AES-256-GCM encryption (security audit 2026-03-28)
 *
 * Replaces the previous Base64 stub with real envelope encryption.
 * Key is derived from ENCRYPTION_KEY env var (must be 32+ chars).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;       // 96 bits recommended for GCM
const TAG_LENGTH = 16;      // 128 bits auth tag
const ENCODING = 'base64';

function _getKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey || envKey.length < 32) {
    throw new Error('[CryptoService] ENCRYPTION_KEY env var must be set (min 32 chars). Cannot encrypt/decrypt without it.');
  }
  // Derive a 256-bit key from the env secret via SHA-256
  return crypto.createHash('sha256').update(envKey).digest();
}

class CryptoService {
  generateId() {
    return crypto.randomUUID();
  }

  /**
   * Encrypt data with AES-256-GCM.
   * Returns: base64 string of IV + authTag + ciphertext
   */
  encrypt(data) {
    if (!data) return data;
    const key = _getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

    const encrypted = Buffer.concat([
      cipher.update(String(data), 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Pack: IV (12) + Tag (16) + Ciphertext
    const packed = Buffer.concat([iv, authTag, encrypted]);
    return packed.toString(ENCODING);
  }

  /**
   * Decrypt data encrypted by encrypt().
   * Input: base64 string of IV + authTag + ciphertext
   */
  decrypt(data) {
    if (!data) return data;
    const key = _getKey();
    const packed = Buffer.from(data, ENCODING);

    if (packed.length < IV_LENGTH + TAG_LENGTH + 1) {
      throw new Error('Invalid encrypted data: too short for AES-GCM. Data may need migration from legacy format.');
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (err) {
      throw new Error('Decryption failed: authentication tag mismatch or wrong key.');
    }
  }
}

module.exports = { CryptoService };
