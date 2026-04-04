'use strict';

describe('push service bootstrap hardening', () => {
  let queryMock;
  let sendNotificationMock;
  let assertTableExistsMock;

  beforeEach(() => {
    jest.resetModules();
    queryMock = jest.fn(async (sql) => {
      if (sql.includes('SELECT endpoint')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    sendNotificationMock = jest.fn().mockResolvedValue(undefined);
    assertTableExistsMock = jest.fn().mockResolvedValue(true);

    jest.doMock('web-push', () => ({
      setVapidDetails: jest.fn(),
      sendNotification: sendNotificationMock,
    }));

    jest.doMock('../services/pg', () => ({
      getPool: jest.fn(() => ({
        query: queryMock,
      })),
    }));

    jest.doMock('../lib/schemaReadiness', () => ({
      assertTableExists: assertTableExistsMock,
      runtimeSchemaMutationsAllowed: jest.fn(() => true),
    }));
  });

  afterEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  test('does not bootstrap push schema on import', () => {
    require('../services/pushService');

    expect(queryMock).not.toHaveBeenCalled();
    expect(assertTableExistsMock).not.toHaveBeenCalled();
  });

  test('ensures push schema lazily on first write and caches the bootstrap', async () => {
    const pushService = require('../services/pushService');

    await pushService.saveSubscription('user-1', {
      endpoint: 'https://example.test/push',
      keys: {
        p256dh: 'p256dh',
        auth: 'auth',
      },
    });

    await pushService.removeSubscription('user-1', 'https://example.test/push');

    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS tenant_vutler.push_subscriptions')
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id')
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO tenant_vutler.push_subscriptions'),
      ['user-1', 'https://example.test/push', 'p256dh', 'auth']
    );
    expect(queryMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('DELETE FROM tenant_vutler.push_subscriptions WHERE user_id = $1 AND endpoint = $2'),
      ['user-1', 'https://example.test/push']
    );
  });
});
