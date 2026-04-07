'use strict';

jest.mock('../services/postForMeClient', () => ({
  listSocialAccounts: jest.fn(async () => []),
  toInternalPlatform: jest.fn((value) => String(value || '').toLowerCase()),
}));

const { listSocialAccounts } = require('../services/postForMeClient');
const {
  listConnectedWorkspaceIntegrationProviders,
} = require('../services/agentIntegrationService');

describe('agent integration social disconnect overrides', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('explicit social_media disconnect suppresses aggregate social availability', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_integrations') && sql.includes('connected = TRUE')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tenant_vutler.workspace_integrations') && sql.includes('provider = ANY($2::text[])')) {
          return { rows: [{ provider: 'social_media', connected: false }] };
        }
        if (sql.includes('SELECT DISTINCT platform') && sql.includes('FROM tenant_vutler.social_accounts')) {
          return { rows: [{ platform: 'linkedin' }] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const connected = await listConnectedWorkspaceIntegrationProviders('ws-1', db);

    expect(Array.from(connected)).toEqual(['linkedin']);
  });

  test('explicit provider disconnect suppresses that platform from connected providers', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_integrations') && sql.includes('connected = TRUE')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tenant_vutler.workspace_integrations') && sql.includes('provider = ANY($2::text[])')) {
          return { rows: [{ provider: 'linkedin', connected: false }] };
        }
        if (sql.includes('SELECT DISTINCT platform') && sql.includes('FROM tenant_vutler.social_accounts')) {
          return { rows: [{ platform: 'linkedin' }, { platform: 'twitter' }] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const connected = await listConnectedWorkspaceIntegrationProviders('ws-1', db);

    expect(Array.from(connected)).toEqual(expect.arrayContaining(['twitter', 'social_media']));
    expect(Array.from(connected)).not.toContain('linkedin');
  });

  test('falls back to remote social accounts only when no local rows exist', async () => {
    listSocialAccounts.mockResolvedValue([{ platform: 'linkedin' }]);
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_integrations') && sql.includes('connected = TRUE')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tenant_vutler.workspace_integrations') && sql.includes('provider = ANY($2::text[])')) {
          return { rows: [] };
        }
        if (sql.includes('SELECT DISTINCT platform') && sql.includes('FROM tenant_vutler.social_accounts')) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const connected = await listConnectedWorkspaceIntegrationProviders('ws-1', db);

    expect(Array.from(connected)).toEqual(expect.arrayContaining(['linkedin', 'social_media']));
  });
});
