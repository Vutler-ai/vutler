'use strict';

const { CryptoService } = require('./crypto');

const cryptoSvc = new CryptoService();

function looksEncrypted(secret) {
  const value = String(secret || '').trim();
  if (!value || value.length < 40) return false;
  return /^[A-Za-z0-9+/=]+$/.test(value);
}

function encryptProviderSecret(secret) {
  if (secret === undefined || secret === null || secret === '') return secret;

  try {
    return cryptoSvc.encrypt(secret);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    return String(secret);
  }
}

function decryptProviderSecret(secret) {
  if (secret === undefined || secret === null || secret === '') return secret;
  if (!looksEncrypted(secret)) return String(secret);

  try {
    return cryptoSvc.decrypt(secret);
  } catch (_) {
    return String(secret);
  }
}

function hydrateProviderSecret(row) {
  if (!row || !row.api_key) return row;
  return {
    ...row,
    api_key: decryptProviderSecret(row.api_key),
  };
}

module.exports = {
  decryptProviderSecret,
  encryptProviderSecret,
  hydrateProviderSecret,
};
