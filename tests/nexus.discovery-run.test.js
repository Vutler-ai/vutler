'use strict';

describe('nexus discovery run', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('task orchestrator returns a local discovery snapshot', async () => {
    const buildLocalDiscoverySnapshot = jest.fn(() => ({
      collectedAt: '2026-04-03T10:00:00.000Z',
      platform: 'darwin',
      hostname: 'studio-mac',
      detectedApps: [{ key: 'mail', label: 'Apple Mail', location: '/Applications/Mail.app' }],
      syncedFolders: [{ key: 'dropbox', label: 'Dropbox Sync', path: '/Users/test/Dropbox' }],
      providers: {
        filesystem: { available: true, source: 'local_runtime', reason: 'Filesystem provider loaded in Nexus runtime' },
      },
      summary: {
        detectedApps: 1,
        syncedFolders: 1,
        readyProviders: 1,
        totalProviders: 1,
      },
    }));

    jest.doMock('../packages/nexus/lib/providers/discovery', () => ({
      buildLocalDiscoverySnapshot,
    }));

    const { TaskOrchestrator } = require('../packages/nexus/lib/task-orchestrator');
    const orchestrator = new TaskOrchestrator({ fs: {}, clipboard: {} }, null);
    const onProgress = jest.fn();

    const result = await orchestrator.execute(
      {
        taskId: 'cmd-1',
        action: 'discover_local_runtime',
        agentId: 'node-1',
        timestamp: '2026-04-03T10:00:00.000Z',
      },
      { onProgress }
    );

    expect(buildLocalDiscoverySnapshot).toHaveBeenCalledWith({
      providers: { fs: {}, clipboard: {} },
    });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      action: 'discover_local_runtime',
      stage: 'accepted',
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      action: 'discover_local_runtime',
      stage: 'discovering',
    }));
    expect(result).toEqual(expect.objectContaining({
      status: 'completed',
      data: {
        snapshot: expect.objectContaining({
          platform: 'darwin',
          detectedApps: [{ key: 'mail', label: 'Apple Mail', location: '/Applications/Mail.app' }],
        }),
      },
    }));
  });

  test('discovery snapshots can be normalized and persisted on the node record', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{
        config: {
          discovery_snapshot: {
            collectedAt: '2026-04-03T10:00:00.000Z',
            platform: 'darwin',
            hostname: 'studio-mac',
            detectedApps: [{ key: 'mail', label: 'Apple Mail', location: '/Applications/Mail.app' }],
            syncedFolders: [{ key: 'dropbox', label: 'Dropbox Sync', path: '/Users/test/Dropbox' }],
            providers: {
              filesystem: { available: true, source: 'local_runtime', reason: 'Filesystem provider loaded in Nexus runtime' },
              mail: { available: false, source: 'desktop_local', reason: 'Desktop mail bridge is not supported on this platform' },
            },
            summary: {
              detectedApps: 1,
              syncedFolders: 1,
              readyProviders: 1,
              totalProviders: 2,
            },
            lastCommandId: 'cmd-1',
          },
        },
      }],
    });

    jest.doMock('../lib/auth', () => ({
      requireApiKey: jest.fn((_req, _res, next) => next && next()),
    }));
    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/avatarPath', () => ({
      normalizeStoredAvatar: jest.fn(() => null),
      buildSpriteAvatar: jest.fn(() => null),
    }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/apiKeys', () => ({
      createApiKey: jest.fn(),
      listApiKeys: jest.fn(),
      revokeApiKey: jest.fn(),
      resolveApiKey: jest.fn(),
      ensureApiKeysTable: jest.fn(),
    }));
    jest.doMock('../services/nexusBilling', () => ({
      getNodeMode: jest.fn(),
      getWorkspaceNexusBillingSummary: jest.fn(),
      getWorkspaceNexusUsage: jest.fn(),
    }));
    jest.doMock('../services/nexusEnterpriseGovernance', () => ({
      ensureGovernanceTables: jest.fn(),
      createApprovalRequest: jest.fn(),
      listApprovalRequests: jest.fn(),
      getApprovalRequest: jest.fn(),
      resolveApprovalRequest: jest.fn(),
      markApprovalExecution: jest.fn(),
      findActiveApprovalScope: jest.fn(),
      revokeApprovalScope: jest.fn(),
      createAuditEvent: jest.fn(),
      listAuditEvents: jest.fn(),
    }));
    jest.doMock('../services/postalMailer', () => ({
      sendPostalMail: jest.fn(),
    }));

    const router = require('../api/nexus');
    const snapshot = router._private.extractDiscoverySnapshot({
      data: {
        snapshot: {
          collectedAt: '2026-04-03T10:00:00.000Z',
          platform: 'darwin',
          hostname: 'studio-mac',
          detectedApps: [{ key: 'mail', label: 'Apple Mail', location: '/Applications/Mail.app' }],
          syncedFolders: [{ key: 'dropbox', label: 'Dropbox Sync', path: '/Users/test/Dropbox' }],
          providers: {
            filesystem: { available: true, source: 'local_runtime', reason: 'Filesystem provider loaded in Nexus runtime' },
            mail: { available: false, source: 'desktop_local', reason: 'Desktop mail bridge is not supported on this platform' },
          },
        },
      },
    });

    expect(snapshot).toEqual(expect.objectContaining({
      platform: 'darwin',
      summary: {
        detectedApps: 1,
        syncedFolders: 1,
        readyProviders: 1,
        totalProviders: 2,
      },
    }));

    const persisted = await router._private.persistNodeDiscoverySnapshot({
      workspaceId: 'ws-1',
      nodeId: 'node-1',
      snapshot,
      commandId: 'cmd-1',
    });

    const lastCall = query.mock.calls[query.mock.calls.length - 1];
    expect(lastCall[0]).toContain('UPDATE tenant_vutler.nexus_nodes');
    expect(lastCall[1][0]).toBe('node-1');
    expect(lastCall[1][1]).toBe('ws-1');

    const configPatch = JSON.parse(lastCall[1][2]);
    expect(configPatch.discovery_snapshot).toEqual(expect.objectContaining({
      platform: 'darwin',
      lastCommandId: 'cmd-1',
    }));

    expect(router._private.getNodeDiscoverySnapshot({ config: configPatch })).toEqual(expect.objectContaining({
      platform: 'darwin',
      summary: {
        detectedApps: 1,
        syncedFolders: 1,
        readyProviders: 1,
        totalProviders: 2,
      },
    }));
    expect(persisted).toEqual(expect.objectContaining({
      platform: 'darwin',
      summary: {
        detectedApps: 1,
        syncedFolders: 1,
        readyProviders: 1,
        totalProviders: 2,
      },
    }));
  });
});
