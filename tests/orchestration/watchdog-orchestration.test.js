'use strict';

describe('watchdog orchestration integration', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('redispatching an orchestration child task fails it locally and wakes the parent run', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const signalRunFromTask = jest.fn().mockResolvedValue({ signaled: true, runId: 'run-1' });
    const wakeRunFromTask = jest.fn();
    const appendRunEventForTask = jest.fn();

    jest.doMock('../../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask,
      signalRunFromTask,
      wakeRunFromTask,
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({ checkIntervalMs: 1000, stallThresholdMs: 1000, maxNudges: 1 });

    await watchdog._redispatch({
      id: 'child-task-1',
      title: 'Fix integration bug',
      assigned_agent: 'oscar',
      metadata: {
        orchestration_parent_run_id: 'run-1',
        orchestration_parent_step_id: 'step-1',
        orchestration_root_task_id: 'root-task-1',
      },
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'failed'"), expect.any(Array));
    expect(signalRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-1',
      status: 'failed',
      metadata: expect.objectContaining({
        watchdog_failed_reason: 'stalled_child_task',
      }),
    }), expect.objectContaining({
      reason: 'watchdog_redispatch',
      eventType: 'delegate.task_watchdog_failed',
      force: true,
    }));
    expect(wakeRunFromTask).not.toHaveBeenCalled();
  });

  test('redispatching an orchestration root task wakes the run instead of creating a floating replacement task', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const signalRunFromTask = jest.fn();
    const wakeRunFromTask = jest.fn().mockResolvedValue({ signaled: true, runId: 'run-root-1' });
    const appendRunEventForTask = jest.fn();

    jest.doMock('../../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask,
      signalRunFromTask,
      wakeRunFromTask,
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({ checkIntervalMs: 1000, stallThresholdMs: 1000, maxNudges: 1 });

    await watchdog._redispatch({
      id: 'root-task-1',
      title: 'Autonomous root task',
      assigned_agent: 'mike',
      metadata: {
        orchestration_run_id: 'run-root-1',
        execution_backend: 'orchestration_run',
      },
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET metadata = COALESCE'), expect.any(Array));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'root-task-1',
      metadata: expect.objectContaining({
        orchestration_run_id: 'run-root-1',
        execution_backend: 'orchestration_run',
      }),
    }), expect.objectContaining({
      reason: 'watchdog_root_stall',
      eventType: 'run.watchdog_woken',
      actor: 'watchdog',
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('handleBlocked enriches the task and wakes the orchestration run with blocker context', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'child-task-blocked-1',
          workspace_id: 'ws-1',
          status: 'in_progress',
          metadata: {
            orchestration_parent_run_id: 'run-1',
            orchestration_parent_step_id: 'step-1',
          },
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const signalRunFromTask = jest.fn();
    const wakeRunFromTask = jest.fn().mockResolvedValue({ signaled: true, runId: 'run-1' });
    const appendRunEventForTask = jest.fn().mockResolvedValue({ appended: true, runId: 'run-1' });
    const postSystemMessage = jest.fn().mockResolvedValue({});
    const getTeamChannelId = jest.fn().mockResolvedValue('channel-1');

    jest.doMock('../../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask,
      signalRunFromTask,
      wakeRunFromTask,
    }));
    jest.doMock('../../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        getTeamChannelId,
        postSystemMessage,
      }),
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({ checkIntervalMs: 1000, stallThresholdMs: 1000, maxNudges: 1 });

    await watchdog.handleBlocked({
      task_id: 'snip-1',
      owner: 'mike',
      blocker_type: 'external_dependency',
      blocker_reason: 'Waiting on legal owner response.',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'blocked'"),
      expect.any(Array)
    );
    expect(appendRunEventForTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-blocked-1',
      status: 'blocked',
      metadata: expect.objectContaining({
        snipara_blocker_type: 'external_dependency',
        snipara_blocker_reason: 'Waiting on legal owner response.',
      }),
    }), expect.objectContaining({
      eventType: 'watchdog.task_blocked',
      actor: 'watchdog',
    }));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-blocked-1',
      status: 'blocked',
      metadata: expect.objectContaining({
        snipara_blocker_type: 'external_dependency',
      }),
    }), expect.objectContaining({
      reason: 'watchdog_blocked_event',
      eventType: 'delegate.task_blocked',
      actor: 'watchdog',
      extraPayload: expect.objectContaining({
        blocker_type: 'external_dependency',
        blocker_reason: 'Waiting on legal owner response.',
      }),
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });
});
