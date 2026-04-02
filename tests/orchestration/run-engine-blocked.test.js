'use strict';

describe('runEngine blocked task remediation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('routes approval-like blockers to an approval gate', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const insertChatMessage = jest.fn().mockResolvedValue({ id: 'chat-blocked-approval-1' });
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-blocked-approval-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-blocked-approval-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-blocked-approval-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-blocked-approval-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-blocked-approval-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-blocked-approval-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Blocked approval run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-blocked-approval-1',
      run_id: 'run-blocked-approval-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-blocked-approval-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-blocked-approval-1',
        run_id: 'run-blocked-approval-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-blocked-approval-1',
        run_id: 'run-blocked-approval-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-blocked-approval-1',
      },
    ]);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-approval-blocked-1',
      run_id: 'run-blocked-approval-1',
      sequence_no: 3,
      step_type: 'approval_gate',
      status: 'awaiting_approval',
      title: 'Human approval required',
      approval_mode: 'manual',
    });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-blocked-approval-1',
      lock_token: 'lock-blocked-approval-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-blocked-approval-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-blocked-approval-1') {
          return {
            rows: [{
              id: 'root-task-blocked-approval-1',
              title: 'Release autonomous change',
              description: 'Ship after human sign-off.',
              priority: 'high',
              workspace_id: 'ws-1',
              metadata: {
                origin: 'chat',
                origin_chat_channel_id: 'channel-1',
                origin_chat_message_id: 'message-1',
              },
            }],
          };
        }

        if (params[0] === 'child-task-blocked-approval-1') {
          return {
            rows: [{
              id: 'child-task-blocked-approval-1',
              status: 'blocked',
              metadata: {
                snipara_blocker_type: 'approval_required',
                snipara_blocker_reason: 'Need final signoff from the owner.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in blocked approval test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask: jest.fn() }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 3,
        passThreshold: 7,
        evaluateTaskOutput: jest.fn(),
        recordVerdict: jest.fn(),
      }),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      claimRunnableRuns,
      createRunStep,
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease,
      listRunSteps,
      listRunEvents: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({
      pollIntervalMs: 50,
      resumeDelayMs: 3_000,
      leaseMs: 30_000,
      workerId: 'worker-run-engine-test',
    });

    await engine.pollOnce();

    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      stepType: 'approval_gate',
    }));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'awaiting_approval',
      currentStepId: 'step-approval-blocked-1',
    }));
    const approvalWrite = taskUpdates.find((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.orchestration_status === 'awaiting_approval';
    });
    expect(approvalWrite).toBeTruthy();
    expect(JSON.parse(approvalWrite.params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'awaiting_approval',
      orchestration_blocker_type: 'approval_required',
      orchestration_blocker_reason: 'Need final signoff from the owner.',
      pending_approval: expect.objectContaining({
        blocker_type: 'approval_required',
      }),
    }));
    expect(insertChatMessage).toHaveBeenCalledWith(expect.anything(), null, 'tenant_vutler', expect.objectContaining({
      channel_id: 'channel-1',
      content: expect.stringContaining('Need final signoff'),
    }));
  });

  test('parks dependency blockers as blocked runs until a new event wakes them', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-blocked-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-blocked-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-blocked-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-blocked-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-blocked-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-blocked-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Blocked dependency run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-blocked-1',
      run_id: 'run-blocked-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-blocked-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-blocked-1',
        run_id: 'run-blocked-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-blocked-1',
        run_id: 'run-blocked-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-blocked-1',
      },
    ]);
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-blocked-1',
      lock_token: 'lock-blocked-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-blocked-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-blocked-1') {
          return {
            rows: [{
              id: 'root-task-blocked-1',
              title: 'Wait on legal feedback',
              description: 'Stay blocked until contract input arrives.',
              priority: 'medium',
              workspace_id: 'ws-1',
              metadata: {},
            }],
          };
        }

        if (params[0] === 'child-task-blocked-1') {
          return {
            rows: [{
              id: 'child-task-blocked-1',
              status: 'blocked',
              metadata: {
                snipara_blocker_type: 'external_dependency',
                snipara_blocker_reason: 'Waiting on legal owner response.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in blocked dependency test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask: jest.fn() }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 3,
        passThreshold: 7,
        evaluateTaskOutput: jest.fn(),
        recordVerdict: jest.fn(),
      }),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      claimRunnableRuns,
      createRunStep: jest.fn(),
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease,
      listRunSteps,
      listRunEvents: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({
      pollIntervalMs: 50,
      resumeDelayMs: 3_000,
      leaseMs: 30_000,
      workerId: 'worker-run-engine-test',
    });

    await engine.pollOnce();

    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'blocked',
      currentStepId: 'step-delegate-blocked-1',
      nextWakeAt: null,
      error: expect.objectContaining({
        blocker_type: 'external_dependency',
      }),
    }));
    const blockedWrite = taskUpdates.find((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.orchestration_status === 'blocked';
    });
    expect(blockedWrite).toBeTruthy();
    expect(JSON.parse(blockedWrite.params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'blocked',
      orchestration_blocker_type: 'external_dependency',
      orchestration_blocker_reason: 'Waiting on legal owner response.',
    }));
  });

  test('clears blocker state and returns to waiting when a blocked delegated task is unblocked', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const updateRunStepCalls = [];
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-unblocked-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-unblocked-1',
      status: 'blocked',
      lock_token: 'lock-unblocked-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-unblocked-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-unblocked-1',
      status: 'blocked',
      lock_token: 'lock-unblocked-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Blocked run awaiting external input.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-unblocked-1',
      run_id: 'run-unblocked-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'blocked',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-unblocked-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-unblocked-1',
        run_id: 'run-unblocked-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-unblocked-1',
        run_id: 'run-unblocked-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'blocked',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-unblocked-1',
      },
    ]);
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-unblocked-1',
      lock_token: 'lock-unblocked-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-unblocked-1', ...patch };
    });
    const updateRunStep = jest.fn().mockImplementation(async (_db, stepId, patch) => {
      updateRunStepCalls.push({ stepId, patch });
      return { id: stepId, ...patch };
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-unblocked-1') {
          return {
            rows: [{
              id: 'root-task-unblocked-1',
              title: 'Resume external dependency',
              description: 'Continue once legal answers.',
              priority: 'medium',
              workspace_id: 'ws-1',
              metadata: { origin: 'task' },
            }],
          };
        }

        if (params[0] === 'child-task-unblocked-1') {
          return {
            rows: [{
              id: 'child-task-unblocked-1',
              status: 'in_progress',
              metadata: {
                snipara_last_event: 'task.unblocked',
                snipara_resolution: 'Legal owner replied.',
                snipara_blocker_type: null,
                snipara_blocker_reason: null,
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in unblocked delegate test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask: jest.fn() }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 3,
        passThreshold: 7,
        evaluateTaskOutput: jest.fn(),
        recordVerdict: jest.fn(),
      }),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      claimRunnableRuns,
      createRunStep: jest.fn(),
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease,
      listRunSteps,
      listRunEvents: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({
      pollIntervalMs: 50,
      resumeDelayMs: 3_000,
      leaseMs: 30_000,
      workerId: 'worker-run-engine-test',
    });

    await engine.pollOnce();

    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-unblocked-1',
      stepId: 'step-delegate-unblocked-1',
      eventType: 'delegate.task_resumed',
      payload: expect.objectContaining({
        delegated_task_id: 'child-task-unblocked-1',
        resolution: 'Legal owner replied.',
      }),
    }));
    expect(updateRunStepCalls).toContainEqual(expect.objectContaining({
      stepId: 'step-delegate-unblocked-1',
      patch: expect.objectContaining({
        status: 'waiting',
        completedAt: null,
        error: null,
        spawnedTaskId: 'child-task-unblocked-1',
      }),
    }));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'waiting_on_tasks',
      currentStepId: 'step-delegate-unblocked-1',
      error: null,
    }));

    const resumedPayload = taskUpdates
      .map((call) => call.params.find((value) => typeof value === 'string' && value.trim().startsWith('{')))
      .filter(Boolean)
      .map((value) => JSON.parse(value))
      .find((payload) => payload.orchestration_status === 'waiting_on_tasks');

    expect(resumedPayload).toEqual(expect.objectContaining({
      orchestration_status: 'waiting_on_tasks',
      orchestration_blocker_type: null,
      orchestration_blocker_reason: null,
      orchestration_last_resolution: 'Legal owner replied.',
      pending_approval: null,
    }));
  });
});
