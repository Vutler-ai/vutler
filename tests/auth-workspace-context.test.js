'use strict';

const crypto = require('crypto');

function signJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

describe('auth workspace context hardening', () => {
  const originalJwtSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    jest.resetModules();
    process.env.JWT_SECRET = 'test-jwt-secret';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalJwtSecret;
  });

  test('public-path JWT decode does not inject the legacy default workspace', async () => {
    const authMiddleware = require('../api/middleware/auth');
    const token = signJwt({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const req = {
      originalUrl: '/api/v1/health',
      headers: {
        authorization: `Bearer ${token}`,
      },
      app: { locals: {} },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.workspaceId).toBeNull();
    expect(req.user.workspaceId).toBeNull();
  });
});
