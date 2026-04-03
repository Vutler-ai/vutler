'use strict';

describe('workspace integration OAuth callback auth gates', () => {
  const originalJwtSecret = process.env.JWT_SECRET;
  const callbackPaths = [
    '/api/v1/integrations/google/callback?code=test&state=abc',
    '/api/v1/integrations/github/callback?code=test&state=abc',
    '/api/v1/integrations/microsoft365/callback?code=test&state=abc',
  ];

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

  test.each(callbackPaths)('allows unauthenticated access to %s', async (originalUrl) => {
    const authMiddleware = require('../api/middleware/auth');

    const req = {
      originalUrl,
      headers: {},
      app: { locals: {} },
    };
    const res = createRes();
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.workspaceId).toBeUndefined();
  });

  test('still rejects unauthenticated access to integration connect routes', async () => {
    const authMiddleware = require('../api/middleware/auth');

    const req = {
      originalUrl: '/api/v1/integrations/google/connect',
      headers: {},
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
