'use strict';

function getRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('integration connection state', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter({ query = jest.fn().mockResolvedValue({ rows: [] }) } = {}) {
    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/google/googleApi', () => ({
      probeGoogleIntegration: jest.fn(),
    }));
    jest.doMock('../services/microsoft/graphApi', () => ({
      probeMicrosoftIntegration: jest.fn(),
    }));

    const router = require('../api/integrations');
    return { router, query };
  }

  test('buildIntegrationDetailPayload marks token-backed connectors without auth material as failed', () => {
    const { router } = loadRouter();

    const detail = router._private.buildIntegrationDetailPayload({
      provider: 'google',
      name: 'Google Workspace',
      description: 'Gmail, Calendar, Drive',
      icon: 'G',
      category: 'productivity',
      source: 'internal',
      connected: true,
      status: 'connected',
      connected_at: '2026-04-06T10:00:00.000Z',
      disconnected_at: '2026-04-06T10:05:00.000Z',
      connected_by: 'user@acme.test',
      config: {},
      credentials: {},
      scopes: ['gmail.readonly', 'calendar.readonly'],
      access_token: null,
      refresh_token: null,
      token_expires_at: null,
      metadata: {},
    });

    expect(detail.connected).toBe(false);
    expect(detail.status).toBe('failed');
    expect(detail.runtime_state.effective).toBe(false);
    expect(detail.runtime_state.reason).toContain('has not connected');
  });

  test('generic connect endpoint rejects providers that require a dedicated auth flow', async () => {
    const { router, query } = loadRouter();
    const handler = getRouteHandler(router, 'post', '/:provider/connect');
    const req = {
      params: { provider: 'google' },
      body: {},
      user: { email: 'user@acme.test' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(
      query.mock.calls.some(([sql]) =>
        typeof sql === 'string' && sql.includes('SELECT provider, source, default_scopes')
      )
    ).toBe(false);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'google requires its dedicated oauth connection flow',
      connect_mode: 'oauth',
      connect_path: '/api/v1/integrations/google/connect',
    });
  });
});
