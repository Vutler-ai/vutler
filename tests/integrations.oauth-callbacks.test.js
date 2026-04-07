'use strict';

const { EventEmitter } = require('events');

function getRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

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

describe('workspace integration OAuth runtime cache handling', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function createHttpsRequestMock(body, statusCode = 200) {
    return jest.fn((options, callback) => {
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn(() => {
        const res = new EventEmitter();
        res.statusCode = statusCode;
        res.headers = { 'content-type': 'application/json' };
        callback(res);
        res.emit('data', JSON.stringify(body));
        res.emit('end');
      });
      req.on = jest.fn();
      return req;
    });
  }

  function loadRouter({
    query = jest.fn().mockResolvedValue({ rows: [] }),
    probeGoogleIntegration = jest.fn().mockResolvedValue({ provider: 'google', status: 'connected', summary: 'ok', checks: [] }),
    probeMicrosoftIntegration = jest.fn().mockResolvedValue({ provider: 'microsoft365', status: 'connected', summary: 'ok', checks: [] }),
    clearGoogleTokenCache = jest.fn(),
    clearMicrosoftTokenCache = jest.fn(),
    httpsBody = { access_token: 'access-token', refresh_token: 'refresh-token', expires_in: 3600 },
    httpsStatus = 200,
  } = {}) {
    jest.doMock('https', () => ({
      request: createHttpsRequestMock(httpsBody, httpsStatus),
    }));
    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/google/googleApi', () => ({
      probeGoogleIntegration,
    }));
    jest.doMock('../services/microsoft/graphApi', () => ({
      probeMicrosoftIntegration,
    }));
    jest.doMock('../services/google/tokenManager', () => ({
      clearTokenCache: clearGoogleTokenCache,
    }));
    jest.doMock('../services/microsoft/tokenManager', () => ({
      clearTokenCache: clearMicrosoftTokenCache,
    }));

    const router = require('../api/integrations');
    return {
      router,
      query,
      probeGoogleIntegration,
      probeMicrosoftIntegration,
      clearGoogleTokenCache,
      clearMicrosoftTokenCache,
    };
  }

  test('google callback clears the cached token before running health checks', async () => {
    const { router, clearGoogleTokenCache, probeGoogleIntegration } = loadRouter();
    const handler = getRouteHandler(router, 'get', '/google/callback');
    router._private.oauthStateStore.set('abc', {
      workspaceId: 'ws-google',
      provider: 'google',
      createdAt: Date.now(),
    });

    const res = { redirect: jest.fn() };
    await handler({
      query: { code: 'oauth-code', state: 'abc' },
      user: { email: 'user@acme.test' },
    }, res);

    expect(clearGoogleTokenCache).toHaveBeenCalledWith('ws-google');
    expect(probeGoogleIntegration).toHaveBeenCalledWith('ws-google');
    expect(res.redirect).toHaveBeenCalledWith('/settings/integrations?connected=google');
  });

  test('microsoft callback clears the cached token before running health checks', async () => {
    const { router, clearMicrosoftTokenCache, probeMicrosoftIntegration } = loadRouter();
    const handler = getRouteHandler(router, 'get', '/microsoft365/callback');
    router._private.oauthStateStore.set('abc', {
      workspaceId: 'ws-ms',
      provider: 'microsoft365',
      createdAt: Date.now(),
    });

    const res = { redirect: jest.fn() };
    await handler({
      query: { code: 'oauth-code', state: 'abc' },
      user: { email: 'user@acme.test' },
    }, res);

    expect(clearMicrosoftTokenCache).toHaveBeenCalledWith('ws-ms');
    expect(probeMicrosoftIntegration).toHaveBeenCalledWith('ws-ms');
    expect(res.redirect).toHaveBeenCalledWith('/settings/integrations?connected=microsoft365');
  });

  test('generic disconnect clears cached Google tokens and wipes persisted OAuth material', async () => {
    const query = jest.fn(async (sql) => {
      if (typeof sql === 'string' && sql.includes('RETURNING workspace_id, provider, source, connected, status')) {
        return {
          rows: [{ workspace_id: 'ws-google', provider: 'google', source: 'oauth', connected: false, status: 'disconnected' }],
        };
      }
      return { rows: [] };
    });
    const { router, clearGoogleTokenCache } = loadRouter({ query });
    const handler = getRouteHandler(router, 'delete', '/:provider/disconnect');
    const res = { json: jest.fn() };

    await handler({
      workspaceId: 'ws-google',
      params: { provider: 'google' },
    }, res);

    expect(clearGoogleTokenCache).toHaveBeenCalledWith('ws-google');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('access_token = CASE WHEN $3 THEN NULL'),
      ['ws-google', 'google', true, false]
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      integration: { workspace_id: 'ws-google', provider: 'google', source: 'oauth', connected: false, status: 'disconnected' },
      message: 'google disconnected',
    });
  });

  test('toggle off clears cached Microsoft tokens immediately', async () => {
    const query = jest.fn(async (sql) => {
      if (typeof sql === 'string' && sql.includes('SELECT connected FROM tenant_vutler.workspace_integrations')) {
        return { rows: [{ connected: true }] };
      }
      if (typeof sql === 'string' && sql.includes('UPDATE tenant_vutler.workspace_integrations')) {
        return {
          rows: [{ workspace_id: 'ws-ms', provider: 'microsoft365', source: 'oauth', connected: false, status: 'disconnected' }],
        };
      }
      return { rows: [] };
    });
    const { router, clearMicrosoftTokenCache } = loadRouter({ query });
    const handler = getRouteHandler(router, 'patch', '/:provider/toggle');
    const res = { json: jest.fn() };

    await handler({
      workspaceId: 'ws-ms',
      params: { provider: 'microsoft365' },
    }, res);

    expect(clearMicrosoftTokenCache).toHaveBeenCalledWith('ws-ms');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      integration: { workspace_id: 'ws-ms', provider: 'microsoft365', source: 'oauth', connected: false, status: 'disconnected' },
    });
  });
});
