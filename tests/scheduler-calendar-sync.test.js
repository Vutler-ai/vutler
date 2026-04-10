'use strict';

describe('scheduler calendar sync', () => {
  let query;
  let syncScheduleCalendarEvent;
  let deleteCalendarEvent;
  let setTimeoutSpy;
  let clearTimeoutSpy;
  let createTaskMock;

  beforeEach(() => {
    jest.resetModules();
    query = jest.fn();
    syncScheduleCalendarEvent = jest.fn().mockResolvedValue(null);
    deleteCalendarEvent = jest.fn().mockResolvedValue(false);
    createTaskMock = jest.fn().mockResolvedValue({
      id: 'task-from-schedule-1',
      assigned_agent: 'max',
    });
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockReturnValue('timer-1');
    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({ createTask: createTaskMock })),
    }));
    jest.doMock('../services/orchestration/runEngine', () => ({ getRunEngine: jest.fn() }));
    jest.doMock('../services/orchestration/runStore', () => ({ ensureRunForTask: jest.fn() }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/taskCalendarSyncService', () => ({
      deleteCalendarEvent,
      syncScheduleCalendarEvent,
      SCHEDULE_EVENT_SOURCE: 'scheduled_task',
    }));
  });

  afterEach(() => {
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  test('syncs the next run into Vutler calendar when creating a schedule', async () => {
    query.mockResolvedValueOnce({
      rows: [{
        id: 'schedule-1',
        workspace_id: 'ws-1',
        agent_id: 'max',
        cron_expression: '0 9 * * *',
        description: 'Daily social cadence',
        task_template: {
          title: 'Publish daily post',
        },
        is_active: true,
        next_run_at: '2026-04-11T09:00:00.000Z',
      }],
    });

    const scheduler = require('../services/scheduler');
    const schedule = await scheduler.createSchedule({
      workspaceId: 'ws-1',
      agentId: 'max',
      cron: '0 9 * * *',
      description: 'Daily social cadence',
      createdBy: 'max',
      taskTemplate: {
        title: 'Publish daily post',
        description: 'Use the approved copy.',
      },
    });

    expect(schedule.id).toBe('schedule-1');
    expect(syncScheduleCalendarEvent).toHaveBeenCalledWith(expect.objectContaining({
      id: 'schedule-1',
      workspace_id: 'ws-1',
      next_run_at: '2026-04-11T09:00:00.000Z',
    }));
  });

  test('cleans up the linked Vutler calendar event when deleting a schedule', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const scheduler = require('../services/scheduler');
    await scheduler.deleteSchedule('ws-1', 'schedule-9');

    expect(deleteCalendarEvent).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      source: 'scheduled_task',
      sourceId: 'schedule-9',
    });
  });

  test('reconciles overdue schedules that were not executed on time', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{
          id: 'schedule-overdue-1',
          workspace_id: 'ws-1',
          agent_id: 'max',
          cron_expression: '0 9 * * *',
          description: 'Overdue social cadence',
          task_template: {
            title: 'Publish next overdue post',
            description: 'Catch up the missed daily post.',
            priority: 'high',
          },
          is_active: true,
          next_run_at: '2026-04-10T09:00:00.000Z',
          run_count: 0,
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'run-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const scheduler = require('../services/scheduler');
    const executed = await scheduler.reconcileDueSchedules();

    expect(executed).toBe(1);
    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Publish next overdue post',
      description: 'Catch up the missed daily post.',
      for_agent_id: 'max',
      workspace_id: 'ws-1',
      metadata: expect.objectContaining({
        scheduled: true,
        schedule_id: 'schedule-overdue-1',
      }),
    }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE tenant_vutler.scheduled_tasks'), expect.any(Array));
  });

  test('materializes finite multi-day sequences into dated tasks immediately', async () => {
    const scheduler = require('../services/scheduler');
    const expectedSeries = scheduler.computeRunSeries('0 9 * * *', 3, '2026-04-10T08:00:00.000Z');
    const result = await scheduler.handleScheduleTool({
      cron: '0 9 * * *',
      description: 'Daily social sequence for the next 3 days',
      task_title: 'Publish next Vutler post',
      task_description: 'Publish the next approved Vutler post.',
      priority: 'P1',
      occurrences: 3,
      start_at: '2026-04-10T08:00:00.000Z',
    }, {
      workspaceId: 'ws-1',
      agentId: 'max',
      createdBy: 'max',
    });

    expect(createTaskMock).toHaveBeenCalledTimes(3);
    expect(createTaskMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        title: 'Publish next Vutler post (1/3)',
        due_date: expectedSeries[0],
        workspace_id: 'ws-1',
        metadata: expect.objectContaining({
          origin: 'materialized_schedule',
          materialized_occurrence_index: 1,
          materialized_occurrence_total: 3,
        }),
      }),
      'ws-1'
    );
    expect(result).toMatchObject({
      success: true,
      materialized: true,
      occurrence_count: 3,
      first_run_at: expectedSeries[0],
      last_run_at: expectedSeries[2],
    });
  });

  test('includes start_at when it already matches the requested occurrence boundary', () => {
    const scheduler = require('../services/scheduler');
    const startAt = '2026-04-10T09:00:00.000';
    const expectedFirst = new Date(startAt).toISOString();
    const expectedSecond = scheduler.getNextRun('0 9 * * *', new Date(startAt)).toISOString();
    const series = scheduler.computeRunSeries('0 9 * * *', 2, startAt);

    expect(series).toEqual([
      expectedFirst,
      expectedSecond,
    ]);
  });
});
