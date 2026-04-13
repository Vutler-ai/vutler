'use strict';

describe('sniparaProvisioningService', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SNIPARA_INTEGRATION_KEY = 'integration-key';
  });

  afterEach(() => {
    delete process.env.SNIPARA_INTEGRATION_KEY;
  });

  test('reuses existing project credentials and only creates the missing swarm', async () => {
    const query = jest.fn((sql, params) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({
          rows: [
            { key: 'snipara_api_key', value: 'existing-key' },
            { key: 'snipara_api_url', value: 'https://existing.snipara.test/mcp' },
            { key: 'snipara_project_id', value: 'project-1' },
            { key: 'snipara_project_slug', value: 'workspace-1' },
            { key: 'snipara_client_id', value: 'client-1' },
          ],
        });
      }

      if (sql.includes('INSERT INTO tenant_vutler.workspace_settings')) {
        return Promise.resolve({ rows: [] });
      }

      if (sql.includes('DELETE FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({ rows: [] });
      }

      throw new Error(`Unexpected SQL: ${sql} :: ${JSON.stringify(params)}`);
    });

    const createProject = jest.fn();
    const createSwarm = jest.fn().mockResolvedValue({ swarm_id: 'swarm-1' });
    const createClientSwarm = jest.fn().mockResolvedValue({ swarm_id: 'swarm-1' });
    const clearSniparaConfigCache = jest.fn();

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/sniparaService', () => ({
      createProject,
      createClientSwarm,
      createSwarm,
    }));
    jest.doMock('../services/sniparaResolver', () => ({
      buildSniparaProjectUrl: jest.fn((slug) => `https://api.snipara.com/mcp/${slug}`),
      clearSniparaConfigCache,
      normalizeProjectSlug: jest.fn((value) => value),
    }));

    const { provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');
    const result = await provisionWorkspaceSnipara({
      db: { query },
      workspaceId: 'ws-1',
      workspaceName: 'Workspace 1',
      workspaceSlug: 'workspace-1',
      ownerEmail: 'owner@example.com',
    });

    expect(createProject).not.toHaveBeenCalled();
    expect(createClientSwarm).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      name: 'workspace-1-client-swarm',
    }));
    expect(createSwarm).not.toHaveBeenCalled();
    expect(clearSniparaConfigCache).toHaveBeenCalledWith('ws-1');
    expect(result).toMatchObject({
      provisioned: true,
      createdProject: false,
      createdSwarm: true,
      apiKey: 'existing-key',
      apiUrl: 'https://existing.snipara.test/mcp',
      clientId: 'client-1',
      projectId: 'project-1',
      projectSlug: 'workspace-1',
      swarmId: 'swarm-1',
      swarmCreationMode: 'integrator',
    });
  });

  test('fails provisioning when swarm creation does not produce a swarm id', async () => {
    const query = jest.fn((sql) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({ rows: [] });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const createProject = jest.fn().mockResolvedValue({
      client_id: 'client-1',
      project_id: 'project-1',
      api_key: 'project-key',
      project_slug: 'workspace-1',
      api_url: 'https://api.snipara.com/mcp/workspace-1',
    });
    const createClientSwarm = jest.fn().mockResolvedValue({ swarm_id: null });
    const createSwarm = jest.fn().mockResolvedValue({ swarm_id: null });
    const clearSniparaConfigCache = jest.fn();

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/sniparaService', () => ({
      createProject,
      createClientSwarm,
      createSwarm,
    }));
    jest.doMock('../services/sniparaResolver', () => ({
      buildSniparaProjectUrl: jest.fn((slug) => `https://api.snipara.com/mcp/${slug}`),
      clearSniparaConfigCache,
      normalizeProjectSlug: jest.fn((value) => value),
    }));

    const { provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');

    await expect(provisionWorkspaceSnipara({
      db: { query },
      workspaceId: 'ws-1',
      workspaceName: 'Workspace 1',
      workspaceSlug: 'workspace-1',
      ownerEmail: 'owner@example.com',
    })).rejects.toThrow('Snipara provisioning did not return a swarm id');
  });

  test('repairs a missing workspace api key from the existing client binding instead of recreating the project', async () => {
    const query = jest.fn((sql) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({
          rows: [
            { key: 'snipara_api_url', value: 'https://existing.snipara.test/mcp' },
            { key: 'snipara_project_id', value: 'project-1' },
            { key: 'snipara_project_slug', value: 'workspace-1' },
            { key: 'snipara_client_id', value: 'client-1' },
            { key: 'snipara_swarm_id', value: 'swarm-1' },
          ],
        });
      }

      if (sql.includes('INSERT INTO tenant_vutler.workspace_settings')) {
        return Promise.resolve({ rows: [] });
      }

      if (sql.includes('DELETE FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({ rows: [] });
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const createProject = jest.fn();
    const createSwarm = jest.fn();
    const createClientSwarm = jest.fn();
    const createClientApiKey = jest.fn().mockResolvedValue({ key: 'recovered-key' });
    const listClientSwarms = jest.fn();
    const clearSniparaConfigCache = jest.fn();

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/sniparaService', () => ({
      createProject,
      createClientApiKey,
      createClientSwarm,
      listClientSwarms,
      createSwarm,
    }));
    jest.doMock('../services/sniparaResolver', () => ({
      buildSniparaProjectUrl: jest.fn((slug) => `https://api.snipara.com/mcp/${slug}`),
      clearSniparaConfigCache,
      normalizeProjectSlug: jest.fn((value) => value),
    }));

    const { provisionWorkspaceSnipara } = require('../services/sniparaProvisioningService');
    const result = await provisionWorkspaceSnipara({
      db: { query },
      workspaceId: 'ws-1',
      workspaceName: 'Workspace 1',
      workspaceSlug: 'workspace-1',
      ownerEmail: 'owner@example.com',
    });

    expect(createProject).not.toHaveBeenCalled();
    expect(createClientApiKey).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      name: 'workspace-1-workspace-key',
    }));
    expect(createClientSwarm).not.toHaveBeenCalled();
    expect(createSwarm).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      apiKey: 'recovered-key',
      swarmId: 'swarm-1',
      recoveredApiKey: true,
    });
  });

  test('surfaces provisioning diagnostics with a repair recommendation and remote swarm visibility', async () => {
    const query = jest.fn((sql) => {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({
          rows: [
            { key: 'snipara_api_url', value: 'https://existing.snipara.test/mcp' },
            { key: 'snipara_project_slug', value: 'workspace-1' },
            { key: 'snipara_client_id', value: 'client-1' },
          ],
        });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const clearSniparaConfigCache = jest.fn();
    const listClientSwarms = jest.fn().mockResolvedValue({
      swarms: [
        { id: 'swarm-1' },
        { id: 'swarm-2' },
      ],
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/sniparaService', () => ({
      createProject: jest.fn(),
      createClientApiKey: jest.fn(),
      createClientSwarm: jest.fn(),
      listClientSwarms,
      createSwarm: jest.fn(),
    }));
    jest.doMock('../services/sniparaResolver', () => ({
      buildSniparaProjectUrl: jest.fn((slug) => `https://api.snipara.com/mcp/${slug}`),
      clearSniparaConfigCache,
      normalizeProjectSlug: jest.fn((value) => value),
    }));

    const { getWorkspaceSniparaProvisioningDiagnostics } = require('../services/sniparaProvisioningService');
    const result = await getWorkspaceSniparaProvisioningDiagnostics({
      db: { query },
      workspaceId: 'ws-1',
    });

    expect(result).toMatchObject({
      configured: false,
      integration_key_present: true,
      recommended_action: 'repair_api_key',
      provisioning_mode: 'partial',
      missing_fields: expect.arrayContaining(['api_key', 'swarm_id']),
      fields: {
        client_id: 'client-1',
        project_slug: 'workspace-1',
      },
      remote: {
        supported: true,
        swarms_count: 2,
      },
    });
  });
});
