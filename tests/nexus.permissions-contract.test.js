'use strict';

describe('nexus permission contract', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('builds node capabilities with allowed folders and allowed actions', () => {
    jest.doMock('../lib/auth', () => ({
      requireApiKey: jest.fn((_req, _res, next) => next && next()),
    }));
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
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

    expect(
      router._private.buildNodeCapabilitiesPayload(
        {
          type: 'local',
          config: {
            permissions: {
              allowedFolders: ['/Users/test/Documents'],
              allowedActions: ['search', 'open_file'],
            },
          },
        },
        {
          filesystem: { active: 'local', fallbacks: [] },
        }
      )
    ).toEqual(expect.objectContaining({
      platform: 'local',
      providers: ['filesystem'],
      providerSources: {
        filesystem: { active: 'local', fallbacks: [] },
      },
      permissions: {
        allowedFolders: ['/Users/test/Documents'],
        allowedActions: ['search', 'open_file'],
      },
    }));
  });

  test('syncs allowed actions into the local permission engine snapshot', () => {
    const replace = jest.fn();

    jest.doMock('../packages/nexus/dashboard/server', () => ({
      createDashboardServer: jest.fn(),
    }));
    jest.doMock('../packages/nexus/lib/agent-manager', () =>
      jest.fn().mockImplementation(() => ({
        getStatus: jest.fn(() => []),
      }))
    );
    jest.doMock('../packages/nexus/lib/task-orchestrator', () => ({
      TaskOrchestrator: jest.fn().mockImplementation(() => ({})),
    }));
    jest.doMock('../packages/nexus/lib/permission-engine', () => ({
      getPermissionEngine: jest.fn(() => ({ replace })),
    }));
    jest.doMock('../packages/nexus/lib/profile-registry', () => ({
      ProfileRegistry: jest.fn().mockImplementation(() => ({})),
    }));
    jest.doMock('../packages/nexus/lib/enterprise-policy-engine', () => ({
      EnterprisePolicyEngine: jest.fn().mockImplementation(() => ({})),
    }));
    jest.doMock('../packages/nexus/lib/local-integration-bridge', () => ({
      LocalIntegrationBridge: jest.fn().mockImplementation(() => ({})),
    }));
    jest.doMock('../packages/nexus/lib/enterprise-action-executor', () => ({
      EnterpriseActionExecutor: jest.fn().mockImplementation(() => ({})),
    }));

    const { NexusNode } = require('../packages/nexus');

    new NexusNode({
      providers: false,
      permissions: {
        allowedFolders: ['/Users/test/Documents'],
        allowedActions: ['search', 'read_document'],
      },
    });

    expect(replace).toHaveBeenCalledWith({
      allowedFolders: ['/Users/test/Documents'],
      allowedActions: ['search', 'read_document'],
    });
  });
});
