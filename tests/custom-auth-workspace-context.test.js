'use strict';

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('custom auth workspace context hardening', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('authenticateAgent keeps missing user workspace as null instead of synthesizing a default', async () => {
    const { authenticateAgent } = require('../app/custom/lib/auth');
    const req = {
      user: {
        id: 'user-1',
        email: 'user@example.com',
        role: 'user',
        workspaceId: null,
      },
      headers: {},
      app: { locals: {} },
    };
    const res = createRes();
    const next = jest.fn();

    await authenticateAgent(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspaceId).toBeNull();
    expect(req.agent.workspaceId).toBeNull();
    expect(req.userId).toBe('user-1');
  });

  test('authenticateAgent rejects agent API keys without workspace context', async () => {
    const { authenticateAgent } = require('../app/custom/lib/auth');
    const req = {
      headers: {
        authorization: 'Bearer vutler_agent_key',
      },
      app: {
        locals: {
          pg: {
            query: jest.fn().mockResolvedValue({
              rows: [{
                id: 'agent-1',
                name: 'Agent One',
                email: 'agent@example.com',
                roles: ['agent'],
                permissions: {},
                workspace_id: null,
              }],
            }),
          },
        },
      },
    };
    const res = createRes();
    const next = jest.fn();

    await authenticateAgent(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'API key is missing workspace context',
    });
  });
});
