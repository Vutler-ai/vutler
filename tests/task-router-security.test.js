'use strict';

function getRouteHandlers(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((entry) => entry.handle);
}

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('task-router security', () => {
  const originalTaskRouterSecret = process.env.TASK_ROUTER_WEBHOOK_SECRET;
  const originalSniparaSecret = process.env.SNIPARA_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.resetModules();
    process.env.TASK_ROUTER_WEBHOOK_SECRET = 'task-router-secret';
    process.env.SNIPARA_WEBHOOK_SECRET = '';
  });

  afterAll(() => {
    process.env.TASK_ROUTER_WEBHOOK_SECRET = originalTaskRouterSecret;
    process.env.SNIPARA_WEBHOOK_SECRET = originalSniparaSecret;
  });

  test('auth middleware only keeps task-router sync public', async () => {
    const authMiddleware = require('../api/middleware/auth');

    const publicReq = {
      originalUrl: '/api/v1/task-router/sync?secret=test',
      headers: {},
      app: { locals: {} },
    };
    const publicRes = createRes();
    const publicNext = jest.fn();

    await authMiddleware(publicReq, publicRes, publicNext);

    expect(publicNext).toHaveBeenCalledTimes(1);
    expect(publicRes.status).not.toHaveBeenCalled();

    const protectedReq = {
      originalUrl: '/api/v1/task-router',
      headers: {},
      app: { locals: {} },
    };
    const protectedRes = createRes();
    const protectedNext = jest.fn();

    await authMiddleware(protectedReq, protectedRes, protectedNext);

    expect(protectedNext).not.toHaveBeenCalled();
    expect(protectedRes.status).toHaveBeenCalledWith(401);
  });

  test('sync route rejects requests with an invalid webhook secret', async () => {
    jest.doMock('../services/taskRouter', () => ({}));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({
        projectWebhookEvent: jest.fn(),
      })),
    }));

    const router = require('../api/tasks-router');
    const [requireSyncAuth] = getRouteHandlers(router, 'post', '/sync');
    const req = {
      headers: { 'x-webhook-secret': 'wrong-secret' },
      query: {},
    };
    const res = createRes();
    const next = jest.fn();

    await requireSyncAuth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Unauthorized' });
  });
});
