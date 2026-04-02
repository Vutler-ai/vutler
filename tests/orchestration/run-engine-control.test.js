'use strict';

describe('runEngine manual controls', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('resumeRun reopens a blocked approval gate and schedules immediate polling', async () => {
    const taskUpdates = [];
    const requestImmediatePoll = jest.fn();
    const updateRun = jest.fn().mockResolvedValue({
      id: 'run-resume-1',
      status: 'running',
      current_step_id: 'step-approval-resume-1',
    });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const appendRunEvent = jest.fn().mockResolvedValue({});
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-resume-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-resume-1',
      status: 'blocked',
      current_step_id: 'step-approval-resume-1',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-approval-resume-1',
      run_id: 'run-resume-1',
      step_type: 'approval_gate',
      status: 'failed',
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-resume-1',
            workspace_id: 'ws-1',
            metadata: {
              pending_approval: {
                run_id: 'run-resume-1',
                step_id: 'step-approval-resume-1',
              },
            },
          }],
        };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in resumeRun test: ${sql}`);
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
      claimRunnableRuns: jest.fn(),
      createRunStep: jest.fn(),
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease: jest.fn(),
      listRunSteps: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({ workerId: 'worker-run-engine-control-test' });
    engine.requestImmediatePoll = requestImmediatePoll;

    const result = await engine.resumeRun('run-resume-1', {
      actor: 'alice',
      note: 'Re-open approval after clarification',
    });

    expect(updateRunStep).toHaveBeenCalledWith(expect.anything(), 'step-approval-resume-1', expect.objectContaining({
      status: 'awaiting_approval',
      completedAt: null,
      error: null,
    }));
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), 'run-resume-1', expect.objectContaining({
      status: 'running',
      currentStepId: 'step-approval-resume-1',
      nextWakeAt: expect.any(Date),
      error: null,
    }));
    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-resume-1',
      stepId: 'step-approval-resume-1',
      eventType: 'run.resumed',
      actor: 'alice',
    }));
    expect(requestImmediatePoll).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({
      resumed: true,
    }));
    expect(taskUpdates).toHaveLength(1);
    expect(JSON.parse(taskUpdates[0].params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'running',
      orchestration_run_id: 'run-resume-1',
      orchestration_step_id: 'step-approval-resume-1',
      orchestration_resume_note: 'Re-open approval after clarification',
    }));
  });

  test('cancelRun marks the run and root task as cancelled', async () => {
    const taskUpdates = [];
    const updateRun = jest.fn().mockResolvedValue({
      id: 'run-cancel-1',
      status: 'cancelled',
      current_step_id: 'step-delegate-cancel-1',
    });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const appendRunEvent = jest.fn().mockResolvedValue({});
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-cancel-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-cancel-1',
      status: 'waiting_on_tasks',
      current_step_id: 'step-delegate-cancel-1',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-cancel-1',
      run_id: 'run-cancel-1',
      step_type: 'delegate_task',
      status: 'waiting',
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-cancel-1',
            workspace_id: 'ws-1',
            metadata: {},
          }],
        };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in cancelRun test: ${sql}`);
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
      claimRunnableRuns: jest.fn(),
      createRunStep: jest.fn(),
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease: jest.fn(),
      listRunSteps: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({ workerId: 'worker-run-engine-control-test' });

    const result = await engine.cancelRun('run-cancel-1', {
      actor: 'alice',
      note: 'Stop this run',
    });

    expect(updateRunStep).toHaveBeenCalledWith(expect.anything(), 'step-delegate-cancel-1', expect.objectContaining({
      status: 'cancelled',
      completedAt: expect.any(Date),
    }));
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), 'run-cancel-1', expect.objectContaining({
      status: 'cancelled',
      cancelledAt: expect.any(Date),
      nextWakeAt: null,
    }));
    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-cancel-1',
      eventType: 'run.cancelled',
      actor: 'alice',
    }));
    expect(result).toEqual(expect.objectContaining({
      cancelled: true,
    }));
    expect(JSON.parse(taskUpdates[0].params[1])).toEqual(expect.objectContaining({
      orchestration_status: 'cancelled',
      orchestration_run_id: 'run-cancel-1',
      orchestration_cancelled_note: 'Stop this run',
    }));
  });
});
