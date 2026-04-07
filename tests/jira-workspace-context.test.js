'use strict';

describe('jira workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter() {
    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../services/integrations/jira', () => ({
      JiraAdapter: jest.fn(),
    }));
    jest.doMock('../services/crypto', () => ({
      CryptoService: jest.fn().mockImplementation(() => ({
        decrypt: jest.fn((value) => value),
      })),
    }));

    return require('../api/jira');
  }

  test('does not synthesize a default workspace id', () => {
    const router = loadRouter();

    expect(router._private.getWorkspaceId({ headers: {} })).toBeNull();
  });

  test('rejects jira requests without a workspace context', () => {
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

  test('accepts explicit x-workspace-id for jira API calls', () => {
    const router = loadRouter();
    const req = {
      headers: { 'x-workspace-id': ' ws-jira ' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router._private.ensureWorkspaceContext(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.jiraWorkspaceId).toBe('ws-jira');
    expect(res.status).not.toHaveBeenCalled();
  });
});
