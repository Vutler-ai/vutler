'use strict';

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('calendar workspace isolation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('lists stored events only for the authenticated workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT') && sql.includes('FROM tenant_vutler.calendar_events')) {
        expect(sql).toContain('workspace_id = $1');
        expect(params[0]).toBe('ws-1');
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.scheduled_tasks')) {
        expect(params[0]).toBe('ws-1');
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn(async () => new Set([
        'id', 'workspace_id', 'title', 'description', 'start_time', 'end_time',
        'all_day', 'location', 'color', 'source', 'source_id', 'metadata', 'created_at', 'updated_at',
      ])),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/google/tokenManager', () => ({
      isGoogleConnected: jest.fn(async () => false),
    }));

    const router = require('../api/calendar');
    const handler = findRouteHandler(router, 'get', '/');
    const req = {
      workspaceId: 'ws-1',
      query: {},
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, events: [] });
  });

  test('expands recurring scheduled tasks into future calendar occurrences for the authenticated workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.calendar_events')) {
        expect(params[0]).toBe('ws-1');
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.scheduled_tasks')) {
        expect(params[0]).toBe('ws-1');
        return {
          rows: [
            {
              id: 'schedule-1',
              workspace_id: 'ws-1',
              agent_id: 'max',
              cron_expression: '0 9 * * *',
              description: 'Daily LinkedIn cadence',
              task_template: {
                title: 'Publish daily LinkedIn post',
                description: 'Publish the next approved LinkedIn post.',
              },
              is_active: true,
              next_run_at: '2026-04-11T09:00:00.000Z',
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn(async () => new Set([
        'id', 'workspace_id', 'title', 'description', 'start_time', 'end_time',
        'all_day', 'location', 'color', 'source', 'source_id', 'metadata', 'created_at', 'updated_at',
      ])),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/google/tokenManager', () => ({
      isGoogleConnected: jest.fn(async () => false),
    }));

    const router = require('../api/calendar');
    const handler = findRouteHandler(router, 'get', '/');
    const req = {
      workspaceId: 'ws-1',
      query: {
        start: '2026-04-10T00:00:00.000Z',
        end: '2026-04-13T23:59:59.000Z',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    const scheduledEvents = payload.events.filter((event) => event.source === 'scheduled_task');
    expect(scheduledEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'scheduled-schedule-1-2026-04-11T09:00:00.000Z',
        title: 'Publish daily LinkedIn post',
        sourceId: 'schedule-1',
        readOnly: true,
      }),
    ]));
    expect(scheduledEvents).toHaveLength(3);
    expect(scheduledEvents.map((event) => event.start.slice(0, 10))).toEqual([
      '2026-04-11',
      '2026-04-12',
      '2026-04-13',
    ]);
  });

  test('updates only events from the authenticated workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('UPDATE tenant_vutler.calendar_events')) {
        expect(sql).toContain('WHERE id=$1 AND workspace_id = $9');
        expect(params[0]).toBe('event-1');
        expect(params[8]).toBe('ws-1');
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn(async () => new Set()),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));

    const router = require('../api/calendar');
    const handler = findRouteHandler(router, 'put', '/events/:id');
    const req = {
      workspaceId: 'ws-1',
      params: { id: 'event-1' },
      body: { title: 'Updated title' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'Event not found' });
  });

  test('deletes only events from the authenticated workspace', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('DELETE FROM tenant_vutler.calendar_events')) {
        expect(sql).toContain('WHERE id=$1 AND workspace_id = $2');
        expect(params).toEqual(['event-1', 'ws-1']);
        return { rowCount: 0 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn(async () => new Set()),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));

    const router = require('../api/calendar');
    const handler = findRouteHandler(router, 'delete', '/events/:id');
    const req = {
      workspaceId: 'ws-1',
      params: { id: 'event-1' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});
