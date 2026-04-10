'use strict';

describe('taskCalendarSyncService', () => {
  let query;

  beforeEach(() => {
    jest.resetModules();
    query = jest.fn();

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      getExistingColumns: jest.fn().mockResolvedValue(new Set([
        'id',
        'workspace_id',
        'title',
        'description',
        'start_time',
        'end_time',
        'all_day',
        'location',
        'color',
        'source',
        'source_id',
        'metadata',
        'created_at',
        'updated_at',
      ])),
    }));
  });

  test('creates a Vutler calendar event for a scheduled social task', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          title: 'Social post: AI adoption does not fail because teams lack ambition.',
          source: 'agent_social_schedule',
          source_id: 'task-1',
        }],
      });

    const { syncTaskCalendarEvent } = require('../services/taskCalendarSyncService');
    const event = await syncTaskCalendarEvent({
      id: 'task-1',
      workspace_id: 'ws-1',
      title: 'Social publish: AI adoption does not fail because teams lack ambition.',
      description: 'Publish the approved caption.',
      status: 'pending',
      assigned_agent: 'max',
      due_date: '2026-04-11T08:30:00.000Z',
      metadata: {
        origin: 'social_executor',
        social_publication_request: {
          caption: 'AI adoption does not fail because teams lack ambition.',
          platforms: ['linkedin'],
          scheduled_at: '2026-04-11T08:30:00.000Z',
        },
      },
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id'),
      ['ws-1', 'agent_social_schedule', 'task-1']
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO tenant_vutler.calendar_events'),
      expect.arrayContaining([
        'ws-1',
        'Social post: AI adoption does not fail because teams lack ambition.',
        '2026-04-11T08:30:00.000Z',
        '2026-04-11T09:00:00.000Z',
        '#0a66c2',
        'agent_social_schedule',
        'task-1',
      ])
    );
    expect(event).toMatchObject({
      id: 'event-1',
      source: 'agent_social_schedule',
      source_id: 'task-1',
    });
  });

  test('removes the linked Vutler calendar event when a scheduled social task is cancelled', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'event-1' }] });

    const { syncTaskCalendarEvent } = require('../services/taskCalendarSyncService');
    const result = await syncTaskCalendarEvent({
      id: 'task-2',
      workspace_id: 'ws-1',
      title: 'Social publish: Cancel this',
      status: 'cancelled',
      due_date: '2026-04-12T09:00:00.000Z',
      metadata: {
        origin: 'social_executor',
        social_publication_request: {
          caption: 'Cancel this',
          scheduled_at: '2026-04-12T09:00:00.000Z',
        },
      },
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM tenant_vutler.calendar_events'),
      ['ws-1', 'agent_social_schedule', 'task-2']
    );
    expect(result).toBeNull();
  });

  test('creates a Vutler calendar event for the next recurring schedule run', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-schedule-1',
          source: 'scheduled_task',
          source_id: 'schedule-1',
        }],
      });

    const { syncScheduleCalendarEvent } = require('../services/taskCalendarSyncService');
    const event = await syncScheduleCalendarEvent({
      id: 'schedule-1',
      workspace_id: 'ws-1',
      agent_id: 'max',
      cron_expression: '0 9 * * *',
      description: 'Daily social cadence',
      task_template: {
        title: 'Publish daily social post',
        description: 'Publish the next approved post.',
        priority: 'high',
      },
      is_active: true,
      next_run_at: '2026-04-11T09:00:00.000Z',
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id'),
      ['ws-1', 'scheduled_task', 'schedule-1']
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO tenant_vutler.calendar_events'),
      expect.arrayContaining([
        'ws-1',
        'Scheduled run: Publish daily social post',
        '2026-04-11T09:00:00.000Z',
        '2026-04-11T09:30:00.000Z',
        '#f97316',
        'scheduled_task',
        'schedule-1',
      ])
    );
    expect(event).toMatchObject({
      id: 'event-schedule-1',
      source: 'scheduled_task',
      source_id: 'schedule-1',
    });
  });

  test('creates a Vutler calendar event for a materialized finite-schedule task', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-task-1',
          title: 'Scheduled task: Publish next Vutler post (2/27)',
          source: 'materialized_task',
          source_id: 'task-27',
        }],
      });

    const { syncTaskCalendarEvent } = require('../services/taskCalendarSyncService');
    const event = await syncTaskCalendarEvent({
      id: 'task-27',
      workspace_id: 'ws-1',
      title: 'Publish next Vutler post (2/27)',
      description: 'Publish the next approved post in sequence.',
      status: 'pending',
      assigned_agent: 'max',
      due_date: '2026-04-12T09:00:00.000Z',
      metadata: {
        origin: 'materialized_schedule',
        materialized_schedule_id: 'mat-1',
        materialized_occurrence_index: 2,
        materialized_occurrence_total: 27,
      },
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT id'),
      ['ws-1', 'materialized_task', 'task-27']
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO tenant_vutler.calendar_events'),
      expect.arrayContaining([
        'ws-1',
        'Scheduled task: Publish next Vutler post (2/27)',
        '2026-04-12T09:00:00.000Z',
        '2026-04-12T09:30:00.000Z',
        '#14b8a6',
        'materialized_task',
        'task-27',
      ])
    );
    expect(event).toMatchObject({
      id: 'event-task-1',
      source: 'materialized_task',
      source_id: 'task-27',
    });
  });
});
