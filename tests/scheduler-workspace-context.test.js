'use strict';

describe('scheduler workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('handleScheduleTool rejects missing workspace ids before creating a schedule', async () => {
    const query = jest.fn();

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
      deleteCalendarEvent: jest.fn().mockResolvedValue(false),
      syncScheduleCalendarEvent: jest.fn().mockResolvedValue(null),
      SCHEDULE_EVENT_SOURCE: 'scheduled_task',
    }));

    const { handleScheduleTool } = require('../services/scheduler');

    await expect(handleScheduleTool({
      cron: '0 9 * * 1',
      description: 'Every Monday at 9am',
      task_title: 'Weekly check-in',
      task_description: 'Prepare the weekly check-in summary',
    })).rejects.toThrow('workspaceId is required for schedule creation');

    expect(query).not.toHaveBeenCalled();
  });
});
