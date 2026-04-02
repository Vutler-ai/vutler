'use strict';

describe('runSignals', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('does not wake runs for non-orchestrated tasks', async () => {
    const updateRun = jest.fn();
    const appendRunEvent = jest.fn();
    const getRunById = jest.fn();

    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      getRunById,
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
    }));

    const { signalRunFromTask } = require('../../services/orchestration/runSignals');
    const result = await signalRunFromTask({
      id: 'task-1',
      status: 'completed',
      metadata: {},
    });

    expect(result).toEqual(expect.objectContaining({
      signaled: false,
      reason: 'not_orchestration_task',
      status: 'completed',
    }));
    expect(getRunById).not.toHaveBeenCalled();
    expect(updateRun).not.toHaveBeenCalled();
    expect(appendRunEvent).not.toHaveBeenCalled();
  });

  test('wakes the parent run and requests an immediate poll for terminal child tasks', async () => {
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-1' });
    const appendRunEvent = jest.fn().mockResolvedValue({ id: 'evt-1' });
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-1',
      status: 'waiting_on_tasks',
      current_step_id: 'step-1',
    });
    const requestImmediatePoll = jest.fn();

    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      getRunById,
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
    }));
    jest.doMock('../../services/orchestration/runEngine', () => ({
      getRunEngine: () => ({ requestImmediatePoll }),
    }));

    const { signalRunFromTask } = require('../../services/orchestration/runSignals');
    const result = await signalRunFromTask({
      id: 'child-task-1',
      status: 'completed',
      metadata: {
        orchestration_parent_run_id: 'run-1',
        orchestration_parent_step_id: 'step-1',
        orchestration_root_task_id: 'root-task-1',
        execution_backend: 'orchestration_delegate',
        execution_mode: 'delegated_child',
      },
    }, {
      reason: 'snipara_webhook',
      eventType: 'delegate.task.completed',
    });

    expect(getRunById).toHaveBeenCalledWith(expect.anything(), 'run-1');
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), 'run-1', expect.objectContaining({
      nextWakeAt: expect.any(Date),
      lastProgressAt: expect.any(Date),
    }));
    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-1',
      stepId: 'step-1',
      eventType: 'delegate.task.completed',
      payload: expect.objectContaining({
        task_id: 'child-task-1',
        task_status: 'completed',
        root_task_id: 'root-task-1',
      }),
    }));
    expect(requestImmediatePoll).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      signaled: true,
      runId: 'run-1',
      stepId: 'step-1',
      status: 'completed',
      wakeAt: expect.any(Date),
    }));
  });

  test('includes Snipara blocker context in run wake events for blocked tasks', async () => {
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-1' });
    const appendRunEvent = jest.fn().mockResolvedValue({ id: 'evt-blocked-1' });
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-1',
      status: 'blocked',
      current_step_id: 'step-1',
    });
    const requestImmediatePoll = jest.fn();

    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      getRunById,
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
    }));
    jest.doMock('../../services/orchestration/runEngine', () => ({
      getRunEngine: () => ({ requestImmediatePoll }),
    }));

    const { signalRunFromTask } = require('../../services/orchestration/runSignals');
    await signalRunFromTask({
      id: 'child-task-blocked-1',
      status: 'blocked',
      metadata: {
        orchestration_parent_run_id: 'run-1',
        orchestration_parent_step_id: 'step-1',
        snipara_last_event: 'task.blocked',
        snipara_blocker_type: 'external_dependency',
        snipara_blocker_reason: 'Waiting on legal owner response.',
      },
    }, {
      reason: 'snipara_webhook',
      eventType: 'delegate.task.blocked',
    });

    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      eventType: 'delegate.task.blocked',
      payload: expect.objectContaining({
        task_status: 'blocked',
        source_task_metadata: expect.objectContaining({
          blocker_type: 'external_dependency',
          blocker_reason: 'Waiting on legal owner response.',
          snipara_last_event: 'task.blocked',
        }),
      }),
    }));
    expect(requestImmediatePoll).toHaveBeenCalledTimes(1);
  });
});
