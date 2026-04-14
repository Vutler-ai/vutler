'use strict';

describe('custom runbooks API workspace context enforcement', () => {
  let runbookService;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    runbookService = {
      parseRunbookFromText: jest.fn(),
      parseRunbookFromJSON: jest.fn(),
      validateRunbook: jest.fn(),
      executeRunbook: jest.fn(),
      getRunbookStatus: jest.fn(),
      listRunbooks: jest.fn(),
      cancelRunbook: jest.fn(),
      approveStep: jest.fn(),
    };
    jest.doMock('../app/custom/lib/auth', () => ({
      authenticateAgent: (_req, _res, next) => next(),
    }));
    jest.doMock('../services/runbooks', () => runbookService);

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

  test('rejects client supplied x-workspace-id for runbook routes', () => {
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

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('uses authenticated workspace context and actor identity', () => {
    const router = loadRouter();
    const req = {
      workspaceId: 'ws-runbook',
      user: { id: 'user-1' },
      headers: {
        'x-workspace-id': 'spoofed-workspace',
        'x-user-id': 'spoofed-user',
      },
    };

    expect(router._private.getWorkspaceId(req)).toBe('ws-runbook');
    expect(router._private.actorIdOf(req)).toBe('user-1');
  });

  test('status route scopes runbook reads by workspace', async () => {
    const router = loadRouter();
    runbookService.getRunbookStatus.mockResolvedValue({ id: 'rb-1', workspace_id: 'ws-runbook' });
    const layer = router.stack.find((entry) => entry.route?.path === '/runbooks/:id' && entry.route?.methods?.get);
    const handler = layer.route.stack[0].handle;
    const req = {
      params: { id: 'rb-1' },
      workspaceId: 'ws-runbook',
    };
    const res = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };

    await handler(req, res);

    expect(runbookService.getRunbookStatus).toHaveBeenCalledWith('rb-1', 'ws-runbook');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 'rb-1', workspace_id: 'ws-runbook' },
    });
  });
});
