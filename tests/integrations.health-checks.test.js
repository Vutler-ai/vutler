'use strict';

describe('integration post-connect health checks', () => {
  function loadRouterWithMocks() {
    jest.resetModules();

    const query = jest.fn().mockResolvedValue({ rows: [] });
    const probeGoogleIntegration = jest.fn();
    const probeMicrosoftIntegration = jest.fn();

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

    const router = require('../api/integrations');

    return {
      helpers: router._private,
      query,
      probeGoogleIntegration,
      probeMicrosoftIntegration,
    };
  }

  test('delegates google health checks to the Google probe service', async () => {
    const { helpers, probeGoogleIntegration } = loadRouterWithMocks();
    const expected = {
      provider: 'google',
      status: 'connected',
      summary: 'google health check connected (3/3 checks passed)',
      checks: [],
    };
    probeGoogleIntegration.mockResolvedValue(expected);

    await expect(
      helpers.runWorkspaceIntegrationHealthCheck({
        workspaceId: 'ws-google',
        provider: 'google',
      })
    ).resolves.toEqual(expected);

    expect(probeGoogleIntegration).toHaveBeenCalledWith('ws-google');
  });

  test('persists failed health checks as disconnected and stores health metadata', async () => {
    const { helpers, query, probeMicrosoftIntegration } = loadRouterWithMocks();

    probeMicrosoftIntegration.mockResolvedValue({
      provider: 'microsoft365',
      status: 'failed',
      summary: 'microsoft365 health check failed (0/3 checks passed)',
      checks: [
        {
          key: 'mail',
          label: 'Mail API',
          status: 'error',
          code: 'scope_missing',
          error: 'Missing Mail.Read scope',
        },
      ],
    });

    const result = await helpers.finalizeWorkspaceIntegrationHealth({
      workspaceId: 'ws-microsoft',
      provider: 'microsoft365',
    });

    expect(result.status).toBe('failed');
    expect(result.connected).toBe(false);
    expect(result.checked_at).toEqual(expect.any(String));

    const updateCall = query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('UPDATE tenant_vutler.workspace_integrations')
    );

    expect(updateCall).toBeTruthy();
    expect(updateCall[1][0]).toBe('ws-microsoft');
    expect(updateCall[1][1]).toBe('microsoft365');
    expect(updateCall[1][2]).toBe(false);
    expect(updateCall[1][3]).toBe('failed');
    expect(JSON.parse(updateCall[1][4])).toEqual(
      expect.objectContaining({
        health: expect.objectContaining({
          provider: 'microsoft365',
          status: 'failed',
          summary: 'microsoft365 health check failed (0/3 checks passed)',
        }),
      })
    );

    const logCall = query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('INSERT INTO tenant_vutler.workspace_integration_logs')
    );
    expect(logCall).toBeTruthy();
  });

  test('persists degraded health checks while keeping the integration connected', async () => {
    const { helpers, query, probeGoogleIntegration } = loadRouterWithMocks();

    probeGoogleIntegration.mockResolvedValue({
      provider: 'google',
      status: 'degraded',
      summary: 'google health check degraded (2/3 checks passed)',
      checks: [
        { key: 'calendar', label: 'Calendar API', status: 'ok' },
        { key: 'gmail', label: 'Gmail API', status: 'ok' },
        { key: 'contacts', label: 'People API', status: 'error', code: 'scope_missing', error: 'Missing contacts scope' },
      ],
    });

    const result = await helpers.finalizeWorkspaceIntegrationHealth({
      workspaceId: 'ws-google',
      provider: 'google',
    });

    expect(result.status).toBe('degraded');
    expect(result.connected).toBe(true);

    const updateCall = query.mock.calls.find(([sql]) =>
      typeof sql === 'string' && sql.includes('UPDATE tenant_vutler.workspace_integrations')
    );

    expect(updateCall).toBeTruthy();
    expect(updateCall[1][2]).toBe(true);
    expect(updateCall[1][3]).toBe('degraded');
  });
});
