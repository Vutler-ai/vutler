'use strict';

describe('sniparaWebhookEventLogService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('records supported webhook events in workspace settings', async () => {
    const writes = [];
    const query = jest.fn((sql, params) => {
      if (sql.includes('WHERE workspace_id = $1') && sql.includes('key = $2')) {
        return Promise.resolve({ rows: [] });
      }

      if (sql.includes('INSERT INTO tenant_vutler.workspace_settings')) {
        writes.push(params);
        return Promise.resolve({ rows: [] });
      }

      if (sql.includes('DELETE FROM tenant_vutler.workspace_settings')) {
        return Promise.resolve({ rows: [] });
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const {
      recordWorkspaceSniparaWebhookEvent,
    } = require('../services/sniparaWebhookEventLogService');

    const result = await recordWorkspaceSniparaWebhookEvent({
      db: { query },
      workspaceId: 'ws-1',
      eventType: 'task.timeout',
      deliveryId: 'evt-1',
      payload: {
        data: {
          task_id: 'task-1',
          agent_id: 'mike',
        },
      },
    });

    expect(result).toMatchObject({
      event_type: 'task.timeout',
      delivery_id: 'evt-1',
      status: 'processed',
      task_id: 'task-1',
      agent_id: 'mike',
    });
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][2])[0]).toMatchObject({
      event_type: 'task.timeout',
      task_id: 'task-1',
    });
  });

  test('ignores unsupported webhook event types', async () => {
    const query = jest.fn();
    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const {
      recordWorkspaceSniparaWebhookEvent,
    } = require('../services/sniparaWebhookEventLogService');

    const result = await recordWorkspaceSniparaWebhookEvent({
      db: { query },
      workspaceId: 'ws-1',
      eventType: 'task.completed',
      payload: { data: { task_id: 'task-1' } },
    });

    expect(result).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  test('lists retained webhook events with filtering', async () => {
    const query = jest.fn((sql) => {
      if (sql.includes('WHERE workspace_id = $1') && sql.includes('key = $2')) {
        return Promise.resolve({
          rows: [{
            value: [
              { id: 'evt-1', event_type: 'task.timeout', status: 'processed' },
              { id: 'evt-2', event_type: 'task.blocked', status: 'handler_error' },
            ],
          }],
        });
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const {
      getWorkspaceSniparaWebhookEvents,
    } = require('../services/sniparaWebhookEventLogService');

    const result = await getWorkspaceSniparaWebhookEvents({
      db: { query },
      workspaceId: 'ws-1',
      status: 'handler_error',
    });

    expect(result.count).toBe(1);
    expect(result.events[0].id).toBe('evt-2');
  });
});
