'use strict';

const crypto = require('crypto');

function createError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getPostalWebhookConfig() {
  const publicKey = process.env.POSTAL_INBOUND_WEBHOOK_KEY
    || process.env.POSTAL_WEBHOOK_KEY
    || process.env.POSTAL_WEBHOOK_PUBLIC_KEY
    || '';

  const sharedSecret = process.env.POSTAL_INBOUND_WEBHOOK_SECRET
    || process.env.POSTAL_WEBHOOK_SECRET
    || '';

  return {
    publicKey,
    sharedSecret,
    requireSignature: normalizeBoolean(
      process.env.POSTAL_REQUIRE_WEBHOOK_SIGNATURE,
      process.env.NODE_ENV === 'production'
    ),
    requireSharedSecret: normalizeBoolean(
      process.env.POSTAL_REQUIRE_WEBHOOK_SECRET,
      Boolean(sharedSecret)
    ),
  };
}

function normalizePublicKey(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.includes('BEGIN PUBLIC KEY')) return input;

  const base64Body = input
    .replace(/^p=/i, '')
    .replace(/;.*/, '')
    .replace(/\s+/g, '');

  const chunks = base64Body.match(/.{1,64}/g) || [];
  return [
    '-----BEGIN PUBLIC KEY-----',
    ...chunks,
    '-----END PUBLIC KEY-----',
  ].join('\n');
}

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyPostalSignature(rawBody, signatureHeader, publicKey) {
  if (!signatureHeader || !publicKey) return false;

  try {
    const signature = Buffer.from(String(signatureHeader).trim(), 'base64');
    if (!signature.length) return false;

    return crypto.verify(
      'RSA-SHA1',
      rawBody,
      {
        key: normalizePublicKey(publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      signature
    );
  } catch (_) {
    return false;
  }
}

function assertPostalWebhookRequest({ rawBody, headers = {}, query = {} }) {
  const config = getPostalWebhookConfig();

  if (config.requireSignature) {
    if (!config.publicKey) {
      throw createError('Postal webhook signature verification is not configured.', 503);
    }

    if (!verifyPostalSignature(rawBody, headers['x-postal-signature'], config.publicKey)) {
      throw createError('Invalid Postal webhook signature.', 401);
    }
  } else if (config.publicKey && headers['x-postal-signature']) {
    if (!verifyPostalSignature(rawBody, headers['x-postal-signature'], config.publicKey)) {
      throw createError('Invalid Postal webhook signature.', 401);
    }
  }

  if (config.requireSharedSecret) {
    if (!config.sharedSecret) {
      throw createError('Postal webhook shared secret is not configured.', 503);
    }

    const providedSecret = headers['x-webhook-secret']
      || headers['x-vutler-webhook-secret']
      || query.secret;

    if (!timingSafeEqualString(providedSecret, config.sharedSecret)) {
      throw createError('Invalid Postal webhook secret.', 401);
    }
  }

  return config;
}

module.exports = {
  assertPostalWebhookRequest,
  createError,
  getPostalWebhookConfig,
  normalizePublicKey,
  timingSafeEqualString,
  verifyPostalSignature,
};
