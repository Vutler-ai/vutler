'use strict';

describe('SniparaSyncLoop', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('suppresses repeated circuit-open warnings for the same workspace and failure kind', async () => {
    const hasSniparaConfig = jest.fn().mockResolvedValue(true);
    const syncFromSnipara = jest.fn().mockRejectedValue(Object.assign(new Error('Snipara unavailable'), {
      code: 'circuit_open',
      statusCode: 404,
    }));
    const listEvents = jest.fn().mockRejectedValue(Object.assign(new Error('Snipara unavailable'), {
      code: 'circuit_open',
      statusCode: 404,
    }));

    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({
        rows: [{ workspace_id: 'ws-1' }],
      }),
    }));
    jest.doMock('../services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({
        hasSniparaConfig,
        syncFromSnipara,
        listEvents,
        projectWebhookEvent: jest.fn(),
      })),
    }));

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { SniparaSyncLoop } = require('../services/sniparaSyncLoop');
    const loop = new SniparaSyncLoop({ intervalMs: 1000, eventLimit: 10 });

    await loop.syncWorkspace('ws-1');
    await loop.syncWorkspace('ws-1');

    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((message) => message.includes('task reconcile skipped')).length).toBe(1);
    expect(messages.filter((message) => message.includes('event reconcile skipped')).length).toBe(1);

    warn.mockRestore();
  });

  test('does not synthesize a default workspace id from env-only swarm config', async () => {
    process.env.SNIPARA_SWARM_ID = 'swarm-env';
    delete process.env.SNIPARA_WORKSPACE_ID;

    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({
        hasSniparaConfig: jest.fn(),
        syncFromSnipara: jest.fn(),
        listEvents: jest.fn(),
        projectWebhookEvent: jest.fn(),
      })),
    }));

    const { SniparaSyncLoop } = require('../services/sniparaSyncLoop');
    const loop = new SniparaSyncLoop({ intervalMs: 1000, eventLimit: 10 });

    await expect(loop.getWorkspaceIds()).resolves.toEqual([]);

    delete process.env.SNIPARA_SWARM_ID;
  });
});
