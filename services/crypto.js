'use strict';

/**
 * Crypto Service — AES-256-GCM encryption
 * Requires ENCRYPTION_KEY env var (min 32 chars).
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const ENCODING = 'base64';

function _getKey() {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey || envKey.length < 32) {
    throw new Error('[CryptoService] ENCRYPTION_KEY env var must be set (min 32 chars).');
  }
  return crypto.createHash('sha256').update(envKey).digest();
}

class CryptoService {
  generateId() {
    return crypto.randomUUID();
  }

  encrypt(data) {
    if (!data) return data;
    const key = _getKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(String(data), 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, encrypted]).toString(ENCODING);
  }

  decrypt(data) {
    if (!data) return data;
    const key = _getKey();
    const packed = Buffer.from(data, ENCODING);
    if (packed.length < IV_LENGTH + TAG_LENGTH + 1) {
      return Buffer.from(data, 'base64').toString('utf8');
    }
    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}

module.exports = { CryptoService };
