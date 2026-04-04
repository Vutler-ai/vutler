'use strict';

describe('llmProviderCompat', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('syncLegacyWorkspaceProviders updates modern rows missing api_key', async () => {
    jest.doMock('../services/crypto', () => ({
      CryptoService: class {
        encrypt(value) {
          return `encrypted:${value}`;
        }
        decrypt(value) {
          return `decrypted:${value}`;
        }
      },
    }));

    const calls = [];
    const db = {
      query: jest.fn().mockImplementation(async (sql) => {
        calls.push(sql);

        if (/information_schema\.columns/i.test(sql)) {
          return {
            rows: [
              'id',
              'workspace_id',
              'provider',
              'api_key',
              'base_url',
              'is_enabled',
              'is_default',
              'config',
            ].map((column_name) => ({ column_name })),
          };
        }

        if (/FROM tenant_vutler\.workspace_llm_providers/i.test(sql)) {
          return {
            rows: [{
              id: 'prov-1',
              workspace_id: 'ws-1',
              name: 'OpenAI',
              provider: 'openai',
              api_key_encrypted: 'secret-1',
              base_url: '',
              is_active: true,
              created_at: null,
              updated_at: null,
            }],
          };
        }

        if (/FROM tenant_vutler\.llm_providers/i.test(sql)) {
          return {
            rows: [{
              id: 'prov-1',
              api_key: null,
              base_url: null,
              config: {},
            }],
          };
        }

        return { rows: [] };
      }),
    };

    const { syncLegacyWorkspaceProviders } = require('../services/llmProviderCompat');

    await syncLegacyWorkspaceProviders(db, 'ws-1');

    expect(
      db.query.mock.calls.some(([sql, params]) => /UPDATE tenant_vutler\.llm_providers/i.test(sql)
        && params[0] === 'encrypted:decrypted:secret-1')
    ).toBe(true);
  });

  test('resolveLegacyWorkspaceProvider normalizes missing URL schemes', async () => {
    jest.doMock('../services/crypto', () => ({
      CryptoService: class {
        encrypt(value) {
          return `encrypted:${value}`;
        }
        decrypt(value) {
          return `decrypted:${value}`;
        }
      },
    }));

    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'prov-2',
          workspace_id: 'ws-1',
          name: 'Kimi',
          provider: 'other',
          api_key_encrypted: 'secret-2',
          base_url: 'api.moonshot.ai/v1',
          is_active: true,
          created_at: null,
          updated_at: null,
        }],
      }),
    };

    const { resolveLegacyWorkspaceProvider } = require('../services/llmProviderCompat');
    const provider = await resolveLegacyWorkspaceProvider(db, 'ws-1', 'other');

    expect(provider.api_key).toBe('decrypted:secret-2');
    expect(provider.base_url).toBe('https://api.moonshot.ai/v1');
    expect(provider.config.display_name).toBe('Kimi');
  });
});
