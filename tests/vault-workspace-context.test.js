'use strict';

describe('vault workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../services/vault', () => ({
      ensureVaultTable: jest.fn(),
      storeSecret: jest.fn(),
      getSecret: jest.fn(),
      findSecrets: jest.fn(),
      listSecrets: jest.fn(),
      deleteSecret: jest.fn(),
      updateSecret: jest.fn(),
      extractCredentialsFromText: jest.fn(),
    }));
    jest.doMock('../lib/schemaReadiness', () => ({
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));

    return require('../api/vault');
  }

  test('does not synthesize the default workspace when context is missing', () => {
    const router = loadRouter();

    expect(router._private.workspaceId({ headers: {} })).toBeNull();
  });

  test('rejects vault requests without any workspace context', () => {
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

  test('accepts explicit x-workspace-id for machine-to-machine vault calls', () => {
    const router = loadRouter();
    const req = {
      headers: { 'x-workspace-id': ' ws-1 ' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.vaultWorkspaceId).toBe('ws-1');
    expect(res.status).not.toHaveBeenCalled();
  });
});
