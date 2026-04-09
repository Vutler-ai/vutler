'use strict';

describe('admin API auth boundary', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  function createRes() {
    return {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  }

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'test-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  test('allows admin API requests to reach route-level auth without bearer or API key', async () => {
    const authMiddleware = require('../api/middleware/auth');

    const req = {
      originalUrl: '/api/v1/admin/stats',
      headers: {
        'x-admin-token': 'admin-session-token',
      },
      app: { locals: {} },
    };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('still rejects unauthenticated access to non-admin protected routes', async () => {
    const authMiddleware = require('../api/middleware/auth');

    const req = {
      originalUrl: '/api/v1/dashboard/summary',
      headers: {
        'x-admin-token': 'admin-session-token',
      },
      app: { locals: {} },
    };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Authentication required (Bearer token or X-API-Key)',
    });
  });
});
