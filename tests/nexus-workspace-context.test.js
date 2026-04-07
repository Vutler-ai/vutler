'use strict';

describe('nexus workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../lib/auth', () => ({
      requireApiKey: (_req, _res, next) => next(),
    }));
    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../lib/avatarPath', () => ({
      normalizeStoredAvatar: jest.fn((value) => value),
      buildSpriteAvatar: jest.fn(() => '/sprite.png'),
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
      getNodeMode: jest.fn(() => 'local'),
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

    return require('../api/nexus');
  }

  test('requires explicit workspace context for normal nexus routes', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ path: '/status', headers: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'workspace context is required',
    });
  });

  test('allows explicit x-workspace-id to satisfy nexus workspace context', () => {
    const router = loadRouter();
    const req = {
      path: '/status',
      headers: { 'x-workspace-id': ' ws-nexus ' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspaceId).toBe('ws-nexus');
    expect(req.nexusWorkspaceId).toBe('ws-nexus');
  });

  test('does not require workspace context for register route', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ path: '/register', headers: {} }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
