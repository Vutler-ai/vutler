'use strict';

describe('llm API workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../services/providerSecrets', () => ({
      decryptProviderSecret: jest.fn((value) => value),
      encryptProviderSecret: jest.fn((value) => `enc:${value}`),
    }));

    return require('../api/llm');
  }

  test('does not synthesize a default workspace id', () => {
    const router = loadRouter();

    expect(router._private.getWorkspaceId({ headers: {}, query: {} })).toBeNull();
  });

  test('rejects provider routes without workspace context', () => {
    const router = loadRouter();
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext({ headers: {}, query: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'workspace context is required',
    });
  });

  test('accepts explicit x-workspace-id for machine provider calls', () => {
    const router = loadRouter();
    const req = {
      headers: { 'x-workspace-id': ' ws-llm ' },
      query: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.llmWorkspaceId).toBe('ws-llm');
    expect(res.status).not.toHaveBeenCalled();
  });
});
