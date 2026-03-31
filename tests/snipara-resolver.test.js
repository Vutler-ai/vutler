'use strict';

describe('sniparaResolver', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.SNIPARA_API_KEY;
    delete process.env.RLM_TOKEN;
  });

  test('prefers workspace settings over env defaults', async () => {
    process.env.SNIPARA_API_KEY = 'env-key';

    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_settings')) {
          return {
            rows: [
              { key: 'snipara_api_key', value: 'workspace-key' },
              { key: 'snipara_api_url', value: 'https://workspace.snipara.test/mcp' },
              { key: 'snipara_project_id', value: 'project-42' },
              { key: 'snipara_swarm_id', value: 'swarm-42' },
            ],
          };
        }
        if (sql.includes('FROM tenant_vutler.workspaces')) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const { resolveSniparaConfig, clearSniparaConfigCache } = require('../services/sniparaResolver');
    clearSniparaConfigCache();

    const result = await resolveSniparaConfig(db, 'ws-1');

    expect(result).toMatchObject({
      workspaceId: 'ws-1',
      apiKey: 'workspace-key',
      apiUrl: 'https://workspace.snipara.test/mcp',
      projectId: 'project-42',
      swarmId: 'swarm-42',
      configured: true,
      source: 'workspace_settings',
    });
  });

  test('falls back to legacy workspaces table when workspace settings are empty', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_settings')) {
          return { rows: [] };
        }
        if (sql.includes('FROM tenant_vutler.workspaces')) {
          return {
            rows: [
              {
                snipara_api_key: 'legacy-key',
                snipara_project_id: 'legacy-project',
              },
            ],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    const { resolveSniparaConfig, clearSniparaConfigCache } = require('../services/sniparaResolver');
    clearSniparaConfigCache();

    const result = await resolveSniparaConfig(db, 'ws-2');

    expect(result).toMatchObject({
      workspaceId: 'ws-2',
      apiKey: 'legacy-key',
      projectId: 'legacy-project',
      swarmId: null,
      configured: true,
      source: 'workspaces',
    });
  });
});
