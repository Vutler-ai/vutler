'use strict';

describe('workspace notification service', () => {
  let queryMock;

  beforeEach(() => {
    jest.resetModules();
    queryMock = jest.fn(async (sql) => {
      if (sql.includes('SELECT column_name') && sql.includes('information_schema.columns')) {
        return {
          rows: [
            { column_name: 'workspace_id' },
            { column_name: 'key' },
            { column_name: 'value' },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.workspace_settings') && sql.includes('SELECT key, value')) {
        return {
          rows: [
            {
              key: 'notification_settings',
              value: {
                sandbox_alert: false,
                security_alert: true,
              },
            },
          ],
        };
      }

      if (sql.includes('CREATE TABLE IF NOT EXISTS tenant_vutler.notifications')) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.notifications') && sql.includes('created_at >= NOW()')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.notifications')) {
        return {
          rows: [{
            id: 'notif-1',
            workspace_id: 'ws-1',
            type: 'warning',
            title: 'Test notification',
            message: 'hello',
          }],
        };
      }

      return { rows: [] };
    });

    jest.doMock('../lib/vaultbrix', () => ({
      query: queryMock,
    }));
  });

  test('normalizes sandbox alerts as enabled by default', () => {
    const service = require('../services/workspaceNotificationService');

    expect(service.normalizeNotificationSettings({})).toMatchObject({
      sandbox_alert: true,
      security_alert: true,
      daily_digest: false,
    });
  });

  test('reads sandbox alert preferences from workspace settings', async () => {
    const service = require('../services/workspaceNotificationService');

    const result = await service.readWorkspaceNotificationSettings('ws-1', { query: queryMock });

    expect(result).toMatchObject({
      sandbox_alert: false,
      security_alert: true,
    });
  });

  test('creates workspace notifications with cooldown dedupe checks', async () => {
    const service = require('../services/workspaceNotificationService');

    const result = await service.createWorkspaceNotification({
      workspaceId: 'ws-1',
      type: 'warning',
      title: 'Test notification',
      message: 'hello',
      cooldownMinutes: 30,
    }, { query: queryMock });

    expect(result).toMatchObject({
      id: 'notif-1',
      workspace_id: 'ws-1',
      type: 'warning',
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_vutler.notifications'),
      [null, 'ws-1', 'warning', 'Test notification', 'hello']
    );
  });
});
