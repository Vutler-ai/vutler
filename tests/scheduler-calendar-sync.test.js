'use strict';

describe('scheduler calendar sync', () => {
  let query;
  let syncScheduleCalendarEvent;
  let deleteCalendarEvent;
  let setTimeoutSpy;
  let clearTimeoutSpy;

  beforeEach(() => {
    jest.resetModules();
    query = jest.fn();
    syncScheduleCalendarEvent = jest.fn().mockResolvedValue(null);
    deleteCalendarEvent = jest.fn().mockResolvedValue(false);
    setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockReturnValue('timer-1');
    clearTimeoutSpy = jest.spyOn(global, 'clearTimeout').mockImplementation(() => {});

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../services/swarmCoordinator', () => ({ getSwarmCoordinator: jest.fn() }));
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
});
