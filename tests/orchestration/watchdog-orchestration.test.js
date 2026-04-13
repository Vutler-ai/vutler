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

  test('handleTimeout redispatches execution timeouts but persists timeout context first', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'task-timeout-redispatch-1',
          workspace_id: 'ws-1',
          status: 'in_progress',
          assigned_agent: 'mike',
          title: 'Retry sync',
          metadata: {
            orchestration_parent_run_id: 'run-1',
          },
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const signalRunFromTask = jest.fn();
    const wakeRunFromTask = jest.fn();
    const appendRunEventForTask = jest.fn();
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
    const redispatchSpy = jest.spyOn(watchdog, '_redispatch').mockResolvedValue();

    await watchdog.handleTimeout({
      task_id: 'snip-timeout-1',
      reason: 'execution_timeout',
      stalled_for_seconds: 720,
      agent_id: 'mike',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET metadata = COALESCE'),
      expect.any(Array)
    );
    expect(postSystemMessage).toHaveBeenCalledWith(
      'ws-1',
      'channel-1',
      'Watchdog',
      expect.stringContaining('Re-dispatching automatically'),
      'watchdog',
    );
    expect(redispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-timeout-redispatch-1',
      metadata: expect.objectContaining({
        snipara_timeout_reason: 'execution_timeout',
        watchdog_timeout_handling: 'redispatch',
      }),
    }));
    expect(appendRunEventForTask).not.toHaveBeenCalled();
    expect(wakeRunFromTask).not.toHaveBeenCalled();
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('handleTimeout alerts instead of redispatching when a task was never claimed', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'task-timeout-alert-1',
          workspace_id: 'ws-1',
          status: 'in_progress',
          assigned_agent: 'mike',
          title: 'Review contract clause',
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
    const redispatchSpy = jest.spyOn(watchdog, '_redispatch').mockResolvedValue();

    await watchdog.handleTimeout({
      task_id: 'snip-timeout-2',
      reason: 'never_claimed',
      stalled_for_seconds: 600,
      agent_id: 'mike',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'blocked'"),
      expect.any(Array)
    );
    expect(postSystemMessage).toHaveBeenCalledWith(
      'ws-1',
      'channel-1',
      'Watchdog',
      expect.stringContaining('Manual attention required'),
      'watchdog',
    );
    expect(redispatchSpy).not.toHaveBeenCalled();
    expect(appendRunEventForTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-timeout-alert-1',
      status: 'blocked',
      metadata: expect.objectContaining({
        snipara_timeout_reason: 'never_claimed',
        watchdog_timeout_handling: 'alert',
      }),
    }), expect.objectContaining({
      eventType: 'watchdog.task_timeout_alert',
      actor: 'watchdog',
      payload: expect.objectContaining({
        timeout_reason: 'never_claimed',
        timeout_handling: 'alert',
      }),
    }));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-timeout-alert-1',
      status: 'blocked',
    }), expect.objectContaining({
      reason: 'watchdog_timeout_alert',
      eventType: 'delegate.task_timeout_alert',
      actor: 'watchdog',
      extraPayload: expect.objectContaining({
        timeout_reason: 'never_claimed',
        timeout_handling: 'alert',
      }),
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('handleTimeout escalates htask stalls instead of redispatching them', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'task-timeout-escalate-1',
          workspace_id: 'ws-1',
          status: 'in_progress',
          assigned_agent: 'oscar',
          title: 'Close parent hierarchy',
          metadata: {
            orchestration_parent_run_id: 'run-9',
            orchestration_parent_step_id: 'step-9',
          },
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const signalRunFromTask = jest.fn();
    const wakeRunFromTask = jest.fn().mockResolvedValue({ signaled: true, runId: 'run-9' });
    const appendRunEventForTask = jest.fn().mockResolvedValue({ appended: true, runId: 'run-9' });
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
    const redispatchSpy = jest.spyOn(watchdog, '_redispatch').mockResolvedValue();

    await watchdog.handleTimeout({
      task_id: 'snip-timeout-3',
      reason: 'htask_stalled',
      stalled_for_seconds: 86400,
      agent_id: 'oscar',
    });

    expect(redispatchSpy).not.toHaveBeenCalled();
    expect(postSystemMessage).toHaveBeenCalledWith(
      'ws-1',
      'channel-1',
      'Watchdog',
      expect.stringContaining('Escalating to orchestration follow-up'),
      'watchdog',
    );
    expect(appendRunEventForTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-timeout-escalate-1',
      status: 'blocked',
      metadata: expect.objectContaining({
        snipara_timeout_reason: 'htask_stalled',
        watchdog_timeout_handling: 'escalate',
      }),
    }), expect.objectContaining({
      eventType: 'watchdog.task_timeout_escalated',
      actor: 'watchdog',
    }));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'task-timeout-escalate-1',
      status: 'blocked',
    }), expect.objectContaining({
      reason: 'watchdog_timeout_escalation',
      eventType: 'delegate.task_timeout_escalated',
      actor: 'watchdog',
      extraPayload: expect.objectContaining({
        timeout_reason: 'htask_stalled',
        timeout_handling: 'escalate',
      }),
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('handleUnblocked marks the task in progress again and wakes the run', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'child-task-unblocked-1',
          workspace_id: 'ws-1',
          status: 'blocked',
          metadata: {
            orchestration_parent_run_id: 'run-1',
            orchestration_parent_step_id: 'step-1',
            snipara_blocker_type: 'external_dependency',
          },
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    const signalRunFromTask = jest.fn();
    const wakeRunFromTask = jest.fn().mockResolvedValue({ signaled: true, runId: 'run-1' });
    const appendRunEventForTask = jest.fn().mockResolvedValue({ appended: true, runId: 'run-1' });

    jest.doMock('../../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask,
      signalRunFromTask,
      wakeRunFromTask,
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({ checkIntervalMs: 1000, stallThresholdMs: 1000, maxNudges: 1 });

    await watchdog.handleUnblocked({
      task_id: 'snip-1',
      resolution: 'Legal owner replied.',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'in_progress'"),
      expect.any(Array)
    );
    expect(appendRunEventForTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-unblocked-1',
      status: 'in_progress',
      metadata: expect.objectContaining({
        snipara_resolution: 'Legal owner replied.',
        snipara_blocker_type: null,
      }),
    }), expect.objectContaining({
      eventType: 'watchdog.task_unblocked',
    }));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-unblocked-1',
      status: 'in_progress',
    }), expect.objectContaining({
      reason: 'watchdog_unblocked_event',
      eventType: 'delegate.task_unblocked',
      extraPayload: expect.objectContaining({
        resolution: 'Legal owner replied.',
      }),
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('handleClosureReady appends a closure event and wakes the run', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'child-task-closure-1',
          workspace_id: 'ws-1',
          status: 'completed',
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

    jest.doMock('../../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask,
      signalRunFromTask,
      wakeRunFromTask,
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({ checkIntervalMs: 1000, stallThresholdMs: 1000, maxNudges: 1 });

    await watchdog.handleClosureReady({
      task_id: 'snip-1',
      closed_with_waiver: false,
      auto_closed_parent: 'parent-1',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET metadata = COALESCE'),
      expect.any(Array)
    );
    expect(appendRunEventForTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-closure-1',
      metadata: expect.objectContaining({
        snipara_auto_closed_parent: 'parent-1',
      }),
    }), expect.objectContaining({
      eventType: 'watchdog.task_closure_ready',
    }));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'child-task-closure-1',
    }), expect.objectContaining({
      reason: 'watchdog_closure_ready_event',
      eventType: 'delegate.task_closure_ready',
      extraPayload: expect.objectContaining({
        auto_closed_parent: 'parent-1',
      }),
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('follows up visible roots on the configured 15-minute cadence and wakes orchestration roots', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const signalRunFromTask = jest.fn();
    const wakeRunFromTask = jest.fn().mockResolvedValue({ signaled: true, runId: 'run-root-2' });
    const appendRunEventForTask = jest.fn().mockResolvedValue({ appended: true, runId: 'run-root-2' });

    jest.doMock('../../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask,
      signalRunFromTask,
      wakeRunFromTask,
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({
      checkIntervalMs: 1000,
      stallThresholdMs: 1000,
      visibleRootFollowUpMs: 900_000,
      maxNudges: 1,
    });

    await watchdog._followUpVisibleRoot({
      id: 'root-task-2',
      title: 'April editorial calendar',
      workspace_id: 'ws-1',
      parent_id: null,
      status: 'in_progress',
      metadata: {
        visible_in_kanban: true,
        snipara_hierarchy_level: 'N0',
        orchestration_run_id: 'run-root-2',
        execution_backend: 'orchestration_run',
      },
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SET metadata = COALESCE'),
      expect.any(Array)
    );
    expect(appendRunEventForTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'root-task-2',
      metadata: expect.objectContaining({
        watchdog_root_follow_up_interval_ms: 900000,
      }),
    }), expect.objectContaining({
      eventType: 'watchdog.visible_root_followup',
    }));
    expect(wakeRunFromTask).toHaveBeenCalledWith(expect.objectContaining({
      id: 'root-task-2',
    }), expect.objectContaining({
      reason: 'watchdog_visible_root_followup',
      eventType: 'run.watchdog_visible_root_followup',
      actor: 'watchdog',
      extraPayload: expect.objectContaining({
        follow_up_interval_ms: 900000,
      }),
    }));
    expect(signalRunFromTask).not.toHaveBeenCalled();
  });

  test('does not follow up a visible root again before the cadence expires', async () => {
    jest.doMock('../../lib/postgres', () => ({ pool: { query: jest.fn() } }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask: jest.fn(),
      signalRunFromTask: jest.fn(),
      wakeRunFromTask: jest.fn(),
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({
      visibleRootFollowUpMs: 900_000,
    });

    expect(watchdog._shouldFollowUpVisibleRoot({
      id: 'root-task-3',
      parent_id: null,
      metadata: {
        visible_in_kanban: true,
        snipara_hierarchy_level: 'N0',
        watchdog_last_root_follow_up_at: new Date(Date.now() - 60_000).toISOString(),
      },
    })).toBe(false);
  });
});
