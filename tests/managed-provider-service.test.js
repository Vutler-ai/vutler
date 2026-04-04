'use strict';

describe('managedProviderService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.VUTLER_TRIAL_PROVIDER;
    delete process.env.VUTLER_TRIAL_MODEL;
    delete process.env.VUTLER_MANAGED_PROVIDER;
    delete process.env.VUTLER_MANAGED_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('prefers Anthropic Haiku for workspace trials when available', () => {
    process.env.ANTHROPIC_API_KEY = 'anthropic-managed-key';
    process.env.OPENAI_API_KEY = 'openai-managed-key';

    const { resolveManagedProfile } = require('../services/managedProviderService');
    const profile = resolveManagedProfile('trial');

    expect(profile).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      apiKey: 'anthropic-managed-key',
      source: 'trial',
    });
  });

  test('prefers OpenRouter auto for purchased managed credits', () => {
    process.env.OPENROUTER_API_KEY = 'openrouter-managed-key';
    process.env.ANTHROPIC_API_KEY = 'anthropic-managed-key';

    const { resolveManagedProfile } = require('../services/managedProviderService');
    const profile = resolveManagedProfile('credits');

    expect(profile).toMatchObject({
      provider: 'openrouter',
      model: 'openrouter/auto',
      apiKey: 'openrouter-managed-key',
      source: 'credits',
    });
  });
});
