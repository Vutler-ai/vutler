'use strict';

describe('social media connection state reconciliation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('marks aggregate social integration disconnected when no accounts remain', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT DISTINCT platform')) {
        expect(params).toEqual(['ws-1']);
        return { rows: [] };
      }

      if (sql.includes('UPDATE tenant_vutler.workspace_integrations') && sql.includes("provider = 'social_media'")) {
        expect(params).toEqual(['ws-1', false, 'disconnected']);
        return { rowCount: 1 };
      }

      if (sql.includes('UPDATE tenant_vutler.workspace_integrations')) {
        expect(params[0]).toBe('ws-1');
        expect(typeof params[1]).toBe('string');
        expect(params[2]).toBe(false);
        expect(params[3]).toBe('disconnected');
        return { rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../packages/core/middleware/featureGate', () => ({
      getPlan: jest.fn(),
      normalizePlanId: jest.fn((value) => value),
    }));
    jest.doMock('../services/postForMeClient', () => ({
      createSocialAccountAuthUrl: jest.fn(),
      createSocialPost: jest.fn(),
      disconnectSocialAccount: jest.fn(),
      listSocialAccounts: jest.fn(),
      toInternalPlatform: jest.fn((value) => String(value || '').toLowerCase()),
    }));
    jest.doMock('../services/socialAccountScope', () => ({
      extractSocialAccountIdentifiers: jest.fn(() => []),
      getPrimarySocialAccountIdentifier: jest.fn(() => null),
    }));

    const { __test } = require('../api/social-media');
    const result = await __test.refreshWorkspaceSocialIntegrationState('ws-1');

    expect(result).toEqual({
      connectedPlatforms: [],
      socialConnected: false,
    });
  });

  test('keeps provider and aggregate integrations connected when accounts remain', async () => {
    const inserts = [];
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT DISTINCT platform')) {
        return { rows: [{ platform: 'linkedin' }] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.workspace_integrations')) {
        inserts.push({ sql, params });
        return { rowCount: 1 };
      }

      if (sql.includes('UPDATE tenant_vutler.workspace_integrations') && sql.includes("provider = 'social_media'")) {
        expect(params).toEqual(['ws-1', true, 'connected']);
        return { rowCount: 1 };
      }

      if (sql.includes('UPDATE tenant_vutler.workspace_integrations')) {
        const provider = params[1];
        if (provider === 'linkedin') {
          expect(params).toEqual(['ws-1', 'linkedin', true, 'connected']);
          return { rowCount: 0 };
        }
        expect(params[0]).toBe('ws-1');
        expect(params[2]).toBe(false);
        expect(params[3]).toBe('disconnected');
        return { rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../packages/core/middleware/featureGate', () => ({
      getPlan: jest.fn(),
      normalizePlanId: jest.fn((value) => value),
    }));
    jest.doMock('../services/postForMeClient', () => ({
      createSocialAccountAuthUrl: jest.fn(),
      createSocialPost: jest.fn(),
      disconnectSocialAccount: jest.fn(),
      listSocialAccounts: jest.fn(),
      toInternalPlatform: jest.fn((value) => String(value || '').toLowerCase()),
    }));
    jest.doMock('../services/socialAccountScope', () => ({
      extractSocialAccountIdentifiers: jest.fn(() => []),
      getPrimarySocialAccountIdentifier: jest.fn(() => null),
    }));

    const { __test } = require('../api/social-media');
    const result = await __test.refreshWorkspaceSocialIntegrationState('ws-1');

    expect(result).toEqual({
      connectedPlatforms: ['linkedin'],
      socialConnected: true,
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual(['ws-1', 'linkedin']);
  });
});
