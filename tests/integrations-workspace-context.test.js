'use strict';

describe('integrations workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter({ query = jest.fn().mockResolvedValue({ rows: [] }) } = {}) {
    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/google/googleApi', () => ({
      probeGoogleIntegration: jest.fn(),
    }));
    jest.doMock('../services/google/tokenManager', () => ({
      clearTokenCache: jest.fn(),
    }));
    jest.doMock('../services/microsoft/graphApi', () => ({
      probeMicrosoftIntegration: jest.fn(),
    }));
    jest.doMock('../services/microsoft/tokenManager', () => ({
      clearTokenCache: jest.fn(),
    }));

    return require('../api/integrations');
  }

  test('does not synthesize a default workspace id', () => {
    const router = loadRouter();

    expect(router._private.getWorkspaceId({ headers: {}, query: {} })).toBeNull();
  });

  test('rejects integration routes without workspace context', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ path: '/google/connect', headers: {}, query: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'workspace context is required',
    });
  });

  test('accepts explicit x-workspace-id for workspace-scoped integration routes', () => {
    const router = loadRouter();
    const req = {
      path: '/google/connect',
      headers: { 'x-workspace-id': ' ws-integrations ' },
      query: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.integrationWorkspaceId).toBe('ws-integrations');
    expect(req.workspaceId).toBe('ws-integrations');
  });

  test('does not require workspace context for oauth callback routes', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ path: '/google/callback', headers: {}, query: {} }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('does not require workspace context for available integrations catalog', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ path: '/available', headers: {}, query: {} }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
