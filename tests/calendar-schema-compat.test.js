'use strict';

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('calendar schema compatibility', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('api calendar create tolerates legacy schema without source_id', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('information_schema.columns')) {
        return {
          rows: [
            { column_name: 'id' },
            { column_name: 'workspace_id' },
            { column_name: 'title' },
            { column_name: 'description' },
            { column_name: 'start_time' },
            { column_name: 'end_time' },
            { column_name: 'all_day' },
            { column_name: 'location' },
            { column_name: 'color' },
            { column_name: 'source' },
            { column_name: 'metadata' },
            { column_name: 'created_at' },
            { column_name: 'updated_at' },
          ],
        };
      }

      if (sql.includes('INSERT INTO tenant_vutler.calendar_events')) {
        expect(sql).toContain('(workspace_id, title, description, start_time, end_time, all_day, location, color, source, metadata)');
        expect(sql).not.toContain('source_id');
        expect(params[0]).toBe('ws-1');
        return {
          rows: [{
            id: 'event-1',
            title: 'Compatibility Test',
            description: 'legacy schema',
            start_time: '2026-04-06T09:00:00.000Z',
            end_time: '2026-04-06T09:30:00.000Z',
            all_day: false,
            location: 'HQ',
            color: '#3b82f6',
            source: 'manual',
            metadata: {},
          }],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn(async () => new Set([
        'id', 'workspace_id', 'title', 'description', 'start_time', 'end_time',
        'all_day', 'location', 'color', 'source', 'metadata', 'created_at', 'updated_at',
      ])),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));

    const router = require('../api/calendar');
    const handler = findRouteHandler(router, 'post', '/events');
    const req = {
      workspaceId: 'ws-1',
      body: {
        title: 'Compatibility Test',
        start: '2026-04-06T09:00:00.000Z',
        end: '2026-04-06T09:30:00.000Z',
        description: 'legacy schema',
        location: 'HQ',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      event: {
        id: 'event-1',
        title: 'Compatibility Test',
        start: '2026-04-06T09:00:00.000Z',
        end: '2026-04-06T09:30:00.000Z',
        allDay: false,
        description: 'legacy schema',
        location: 'HQ',
        color: '#3b82f6',
        source: 'manual',
        sourceId: null,
        readOnly: false,
        metadata: {},
      },
    });
  });

  test('vutler calendar adapter create omits source_id on legacy schema', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('INSERT INTO tenant_vutler.calendar_events')) {
        expect(sql).toContain('(workspace_id, title, description, start_time, end_time, all_day, location, color, source, metadata)');
        expect(sql).not.toContain('source_id');
        expect(params[0]).toBe('ws-1');
        return {
          rows: [{
            id: 'event-2',
            title: 'Adapter Event',
            start_time: '2026-04-06T10:00:00.000Z',
            end_time: '2026-04-06T10:30:00.000Z',
            location: 'Studio',
            source: 'manual',
          }],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn(async () => new Set([
        'id', 'workspace_id', 'title', 'description', 'start_time', 'end_time',
        'all_day', 'location', 'color', 'source', 'metadata',
      ])),
    }));

    const { VutlerCalendarAdapter } = require('../services/skills/adapters/VutlerCalendarAdapter');
    const adapter = new VutlerCalendarAdapter();
    const result = await adapter.execute({
      workspaceId: 'ws-1',
      params: {
        action: 'create',
        event: {
          title: 'Adapter Event',
          start: '2026-04-06T10:00:00.000Z',
          end: '2026-04-06T10:30:00.000Z',
          location: 'Studio',
        },
      },
    });

    expect(result).toEqual({
      success: true,
      data: {
        id: 'event-2',
        summary: 'Adapter Event',
        start: '2026-04-06T10:00:00.000Z',
        end: '2026-04-06T10:30:00.000Z',
        location: 'Studio',
        source: 'manual',
      },
    });
  });
});
