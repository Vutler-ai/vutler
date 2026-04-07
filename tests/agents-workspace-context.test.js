'use strict';

describe('agents workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../lib/avatarPath', () => ({
      normalizeStoredAvatar: jest.fn((value) => value),
      buildSpriteAvatar: jest.fn(() => '/sprite.png'),
    }));
    jest.doMock('../services/agentConfigPolicy', () => ({
      normalizeCapabilities: jest.fn((value) => value || []),
      splitCapabilities: jest.fn(() => ({ skills: [], tools: [] })),
      buildAgentConfigUpdate: jest.fn(() => ({})),
      countCountedSkills: jest.fn(() => 0),
      mergeCapabilities: jest.fn(() => []),
    }));
    jest.doMock('../services/agentIntegrationService', () => ({
      normalizeAgentIntegrationProviders: jest.fn(() => []),
      listAgentIntegrationProviders: jest.fn(() => []),
      replaceAgentIntegrationProviders: jest.fn(),
    }));
    jest.doMock('../services/agentDriveService', () => ({
      ensureAgentDriveProvisioned: jest.fn(),
      resolveAgentDriveRoot: jest.fn(),
    }));
    jest.doMock('../services/agentSchemaService', () => ({
      ensureAgentConfigurationSchema: jest.fn(),
    }));
    jest.doMock('../services/agentTypeProfiles', () => ({
      getDefaultCapabilitiesForAgentTypes: jest.fn(() => []),
    }));
    jest.doMock('../services/agentAccessPolicyService', () => ({
      getAgentConfigSections: jest.fn(() => ({
        accessPolicy: {},
        provisioning: {},
        memoryPolicy: {},
        governance: {},
      })),
      normalizeAgentConfig: jest.fn(() => ({})),
      normalizeAccessPolicy: jest.fn(() => ({})),
      normalizeProvisioning: jest.fn(() => ({})),
      normalizeMemoryPolicy: jest.fn(() => ({})),
      normalizeGovernance: jest.fn(() => ({})),
      mergeAgentConfiguration: jest.fn(() => ({})),
      reconcileSandboxCapability: jest.fn((value) => value),
      validateSandboxConfiguration: jest.fn(),
    }));
    jest.doMock('../services/agentCapabilityMatrixService', () => ({
      resolveAgentCapabilityMatrix: jest.fn(() => ({})),
    }));
    jest.doMock('../services/workspaceEmailService', () => ({
      parseEmailDomain: jest.fn(),
      requireManagedAgentEmailAccess: jest.fn(),
      resolveWorkspaceEmailDomain: jest.fn(),
      resolveWorkspaceEmailEntitlements: jest.fn(),
    }));

    return require('../api/agents');
  }

  test('does not synthesize a default workspace id', () => {
    const router = loadRouter();

    expect(router._private.getWorkspaceId({ headers: {} })).toBeNull();
  });

  test('rejects agent routes without workspace context', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ headers: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'workspace context is required',
    });
  });

  test('accepts explicit x-workspace-id for agent requests', () => {
    const router = loadRouter();
    const req = {
      headers: { 'x-workspace-id': ' ws-agents ' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspaceId).toBe('ws-agents');
    expect(req.agentsWorkspaceId).toBe('ws-agents');
  });
});
