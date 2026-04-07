'use strict';

describe('custom runbooks API workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../app/custom/lib/auth', () => ({
      authenticateAgent: (_req, _res, next) => next(),
    }));
    jest.doMock('../services/runbooks', () => ({
      parseRunbookFromText: jest.fn(),
      parseRunbookFromJSON: jest.fn(),
      validateRunbook: jest.fn(),
      executeRunbook: jest.fn(),
      getRunbookStatus: jest.fn(),
      listRunbooks: jest.fn(),
      cancelRunbook: jest.fn(),
      approveStep: jest.fn(),
    }));

    return require('../app/custom/api/runbooks');
  }

  test('does not synthesize a default workspace id', () => {
    const router = loadRouter();
    expect(router._private.getWorkspaceId({ headers: {} })).toBeNull();
  });

  test('rejects runbook routes without workspace context', () => {
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

  test('accepts explicit x-workspace-id for runbook routes', () => {
    const router = loadRouter();
    const req = {
      headers: { 'x-workspace-id': ' ws-runbook ' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspaceId).toBe('ws-runbook');
  });
});
