'use strict';

const crypto = require('crypto');
const {
  assertPostalWebhookRequest,
  normalizePublicKey,
  verifyPostalSignature,
} = require('../services/postalWebhookSecurity');

describe('postalWebhookSecurity', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('verifies Postal RSA signatures using a bare public key body', () => {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rawBody = Buffer.from(JSON.stringify({ rcpt_to: 'agent@acme.vutler.ai' }));
    const signature = crypto.sign('RSA-SHA1', rawBody, {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_PADDING,
    }).toString('base64');

    const pem = publicKey.export({ type: 'spki', format: 'pem' });
    const bareKey = pem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s+/g, '');

    expect(verifyPostalSignature(rawBody, signature, bareKey)).toBe(true);
  });

  test('normalizes Postal public keys from DKIM body format', () => {
    const normalized = normalizePublicKey('p=abc123;');
    expect(normalized).toContain('BEGIN PUBLIC KEY');
    expect(normalized).toContain('abc123');
  });

  test('rejects inbound requests with an invalid Postal signature', () => {
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const rawBody = Buffer.from('{}');
    const pem = publicKey.export({ type: 'spki', format: 'pem' });

    process.env.POSTAL_WEBHOOK_KEY = pem;
    process.env.POSTAL_REQUIRE_WEBHOOK_SIGNATURE = 'true';
    delete process.env.POSTAL_WEBHOOK_SECRET;
    delete process.env.POSTAL_REQUIRE_WEBHOOK_SECRET;

    expect(() => assertPostalWebhookRequest({
      rawBody,
      headers: { 'x-postal-signature': 'invalid-base64' },
      query: {},
    })).toThrow('Invalid Postal webhook signature.');
  });

  test('fails closed when signature verification is required but not configured', () => {
    const rawBody = Buffer.from('{}');

    delete process.env.POSTAL_WEBHOOK_KEY;
    delete process.env.POSTAL_INBOUND_WEBHOOK_KEY;
    process.env.POSTAL_REQUIRE_WEBHOOK_SIGNATURE = 'true';
    delete process.env.POSTAL_WEBHOOK_SECRET;
    delete process.env.POSTAL_REQUIRE_WEBHOOK_SECRET;

    expect(() => assertPostalWebhookRequest({
      rawBody,
      headers: {},
      query: {},
    })).toThrow('Postal webhook signature verification is not configured.');
  });

  test('accepts a matching shared secret from the query string', () => {
    process.env.POSTAL_REQUIRE_WEBHOOK_SIGNATURE = 'false';
    process.env.POSTAL_WEBHOOK_SECRET = 'shared-secret';

    expect(() => assertPostalWebhookRequest({
      rawBody: Buffer.from('{}'),
      headers: {},
      query: { secret: 'shared-secret' },
    })).not.toThrow();
  });

  test('rejects a wrong shared secret', () => {
    process.env.POSTAL_REQUIRE_WEBHOOK_SIGNATURE = 'false';
    process.env.POSTAL_WEBHOOK_SECRET = 'shared-secret';

    expect(() => assertPostalWebhookRequest({
      rawBody: Buffer.from('{}'),
      headers: { 'x-webhook-secret': 'wrong-secret' },
      query: {},
    })).toThrow('Invalid Postal webhook secret.');
  });
});
