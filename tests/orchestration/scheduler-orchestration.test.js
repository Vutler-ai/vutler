'use strict';

describe('scheduler orchestration targets', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('run_resume schedules wake the target run without creating a task', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'sched-run-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const wakeRun = jest.fn().mockResolvedValue({ id: 'run-123' });
    const requestImmediatePoll = jest.fn();
    const createTask = jest.fn();

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
    }));
    jest.doMock('../../services/orchestration/runEngine', () => ({
      getRunEngine: () => ({ wakeRun, requestImmediatePoll }),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      ensureRunForTask: jest.fn(),
    }));
    jest.doMock('../../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn().mockReturnValue(false),
    }));

    const scheduler = require('../../services/scheduler');
    const result = await scheduler._executeScheduledTask({
      id: 'schedule-1',
      workspace_id: 'ws-1',
      description: 'Wake run',
      cron_expression: '0 9 * * 1',
      task_template: {
        target: {
          kind: 'run_resume',
          run_id: 'run-123',
        },
      },
    });

    expect(wakeRun).toHaveBeenCalledWith('run-123', 'scheduler');
    expect(requestImmediatePoll).toHaveBeenCalledTimes(1);
    expect(createTask).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      status: 'completed',
    }));
  });

  test('run_template schedules create a durable autonomous root task and seed a run immediately', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'sched-run-2' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const wakeRun = jest.fn();
    const requestImmediatePoll = jest.fn();
    const createTask = jest.fn().mockResolvedValue({
      id: 'root-task-1',
      assigned_agent: 'mike',
      metadata: {
        origin: 'schedule',
      },
    });
    const ensureRunForTask = jest.fn().mockResolvedValue({
      run: {
        id: 'run-template-1',
        status: 'queued',
        orchestrated_by: 'scheduler',
      },
      step: {
        id: 'step-template-1',
      },
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
    }));
    jest.doMock('../../services/orchestration/runEngine', () => ({
      getRunEngine: () => ({ wakeRun, requestImmediatePoll }),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      ensureRunForTask,
    }));
    jest.doMock('../../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn().mockReturnValue(false),
    }));

    const scheduler = require('../../services/scheduler');
    const result = await scheduler._executeScheduledTask({
      id: 'schedule-2',
      workspace_id: 'ws-1',
      agent_id: 'mike',
      description: 'Morning autonomous review',
      cron_expression: '0 9 * * 1',
      task_template: {
        target: {
          kind: 'run_template',
          requested_agent_username: 'mike',
        },
        title: 'Morning autonomous review',
        description: 'Review the workspace and create follow-up work.',
        priority: 'high',
        metadata: {
          custom_flag: true,
        },
      },
    });

    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Morning autonomous review',
      description: 'Review the workspace and create follow-up work.',
      for_agent_id: 'mike',
      metadata: expect.objectContaining({
        scheduled: true,
        schedule_id: 'schedule-2',
        schedule_target_kind: 'run_template',
        execution_backend: 'orchestration_run',
        execution_mode: 'autonomous',
        workflow_mode: 'FULL',
        custom_flag: true,
      }),
    }));
    expect(ensureRunForTask).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      task: expect.objectContaining({ id: 'root-task-1' }),
      orchestratedBy: 'scheduler',
      requestedAgent: expect.objectContaining({
        username: 'mike',
      }),
    }));
    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'in_progress'"), expect.any(Array));
    expect(result).toEqual(expect.objectContaining({
      taskId: 'root-task-1',
      status: 'completed',
    }));
  });
});
