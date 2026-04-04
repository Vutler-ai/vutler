'use strict';

describe('providerSecrets', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('encrypts and decrypts provider secrets', () => {
    const {
      encryptProviderSecret,
      decryptProviderSecret,
      hydrateProviderSecret,
    } = require('../services/providerSecrets');

    const encrypted = encryptProviderSecret('sk-live-secret');

    expect(encrypted).not.toBe('sk-live-secret');
    expect(decryptProviderSecret(encrypted)).toBe('sk-live-secret');
    expect(hydrateProviderSecret({ id: 'prov-1', api_key: encrypted })).toEqual({
      id: 'prov-1',
      api_key: 'sk-live-secret',
    });
  });

  test('keeps plaintext secrets readable for backward compatibility', () => {
    const { decryptProviderSecret } = require('../services/providerSecrets');

    expect(decryptProviderSecret('plain-legacy-secret')).toBe('plain-legacy-secret');
  });
});
