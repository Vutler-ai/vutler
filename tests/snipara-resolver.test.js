'use strict';

describe('sniparaResolver', () => {
  beforeEach(() => {
    jest.resetModules();
    delete process.env.SNIPARA_API_KEY;
    delete process.env.RLM_TOKEN;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete global.fetch;
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

  test('surfaces HTTP diagnostics when a Snipara tool call fails', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_settings')) {
          return {
            rows: [
              { key: 'snipara_api_key', value: 'workspace-key' },
              { key: 'snipara_api_url', value: 'https://workspace.snipara.test/mcp' },
            ],
          };
        }
        if (sql.includes('FROM tenant_vutler.workspaces')) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      text: jest.fn(async () => '404 page not found'),
    });

    const { callSniparaTool, clearSniparaConfigCache } = require('../services/sniparaResolver');
    clearSniparaConfigCache();

    await expect(callSniparaTool({
      db,
      workspaceId: 'ws-3',
      toolName: 'rlm_memories',
      args: { limit: 5 },
    })).rejects.toMatchObject({
      name: 'SniparaToolError',
      statusCode: 404,
      toolName: 'rlm_memories',
      workspaceId: 'ws-3',
      apiUrl: 'https://workspace.snipara.test/mcp',
      responsePreview: '404 page not found',
    });
  });

  test('reports transport and tool probe diagnostics for workspace health', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_settings')) {
          return {
            rows: [
              { key: 'snipara_api_key', value: 'workspace-key' },
              { key: 'snipara_api_url', value: 'https://workspace.snipara.test/mcp' },
              { key: 'snipara_project_slug', value: 'workspace-slug' },
            ],
          };
        }
        if (sql.includes('FROM tenant_vutler.workspaces')) {
          return { rows: [] };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    global.fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: jest.fn(() => 'text/plain; charset=utf-8') },
        text: jest.fn(async () => '404 page not found'),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: jest.fn(async () => '404 page not found'),
      });

    const { probeSniparaHealth, clearSniparaConfigCache } = require('../services/sniparaResolver');
    clearSniparaConfigCache();

    const result = await probeSniparaHealth({ db, workspaceId: 'ws-4' });

    expect(result.ok).toBe(false);
    expect(result.resolved).toMatchObject({
      api_url: 'https://workspace.snipara.test/mcp',
      project_slug: 'workspace-slug',
      api_key_present: true,
    });
    expect(result.transport_probe).toMatchObject({
      ok: false,
      status_code: 404,
      response_preview: '404 page not found',
    });
    expect(result.tool_probe).toMatchObject({
      ok: false,
      status_code: 404,
      tool_name: 'rlm_shared_context',
      response_preview: '404 page not found',
    });
  });
});
