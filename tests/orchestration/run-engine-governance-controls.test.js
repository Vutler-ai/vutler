'use strict';

describe('runEngine run-level governance controls', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: [],
        overlayProviders: [],
        overlaySkillKeys: [],
        overlayToolCapabilities: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
        availability: null,
        unavailableDomains: [],
        workspacePressure: null,
        specializationProfile: null,
        recommendations: [],
      }),
    }));
  });

  test('times out a run when its governance deadline has passed', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-deadline-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-deadline-1',
      status: 'planning',
      lock_token: 'lock-deadline-1',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-deadline-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-deadline-1',
      status: 'planning',
      lock_token: 'lock-deadline-1',
      started_at: '2026-04-13T07:00:00.000Z',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-plan-deadline-1',
      run_id: 'run-deadline-1',
      step_type: 'plan',
      status: 'queued',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-deadline-1',
        run_id: 'run-deadline-1',
        step_type: 'plan',
        status: 'queued',
      },
    ]);
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-deadline-1',
      lock_token: 'lock-deadline-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-deadline-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const insertChatMessage = jest.fn().mockResolvedValue({ id: 'chat-deadline-1' });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-deadline-1',
            title: 'Ship the run before the cutoff',
            workspace_id: 'ws-1',
            due_date: '2026-04-13T08:00:00.000Z',
            metadata: {
              origin: 'chat',
              origin_chat_channel_id: 'channel-deadline-1',
              origin_chat_message_id: 'message-deadline-1',
            },
          }],
        };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [{ id: 'root-task-deadline-1' }] };
      }

      throw new Error(`Unexpected SQL in deadline governance test: ${sql}`);
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
    jest.doMock('../../services/chatActionRuns', () => ({ updateChatActionRun: jest.fn() }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      claimRunnableRuns,
      createRunStep: jest.fn(),
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease,
      listRunEvents: jest.fn(),
      listRunSteps,
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({
      pollIntervalMs: 50,
      resumeDelayMs: 3_000,
      leaseMs: 30_000,
      workerId: 'worker-run-engine-governance-test',
    });

    await engine.pollOnce();

    expect(updateRunStep).toHaveBeenCalledWith(expect.anything(), 'step-plan-deadline-1', expect.objectContaining({
      status: 'failed',
      error: expect.objectContaining({
        blocker_type: 'deadline_exceeded',
      }),
    }));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'timed_out',
      currentStepId: 'step-plan-deadline-1',
      completedAt: expect.any(Date),
    }));
    expect(taskUpdates.some((call) => {
      const payload = JSON.parse(call.params[1]);
      return payload.orchestration_status === 'timed_out'
        && payload.orchestration_blocker_type === 'deadline_exceeded';
    })).toBe(true);
    expect(insertChatMessage).toHaveBeenCalledTimes(1);
    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-deadline-1',
      eventType: 'governance.deadline_exceeded',
    }));
  });

  test('parks delegate dispatch when workspace concurrency is saturated', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const createTask = jest.fn();
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-capacity-1',
      run_id: 'run-capacity-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'queued',
      title: 'Delegate execution task',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-capacity-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-capacity-1',
            title: 'Coordinate a release checklist',
            description: 'Prepare the release work package.',
            priority: 'high',
            workspace_id: 'ws-1',
            metadata: {
              orchestration_governance: {
                concurrency: {
                  max_active_runs_per_workspace: 1,
                },
              },
            },
          }],
        };
      }

      if (sql.includes(`metadata ->> 'orchestration_parent_run_id'`)) {
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.orchestration_runs') && sql.includes("status = ANY($3::text[])")) {
        return { rows: [{ count: 1 }] };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [{ id: 'root-task-capacity-1' }] };
      }

      throw new Error(`Unexpected SQL in capacity governance test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        createTask,
        loadAgentDirectory: jest.fn().mockResolvedValue([]),
      }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 3,
        passThreshold: 7,
        evaluateTaskOutput: jest.fn(),
        recordVerdict: jest.fn(),
      }),
    }));
    jest.doMock('../../services/chatActionRuns', () => ({ updateChatActionRun: jest.fn() }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      claimRunnableRuns: jest.fn(),
      createRunStep,
      getCurrentRunStep: jest.fn(),
      getRunById: jest.fn(),
      heartbeatRunLease: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps: jest.fn().mockResolvedValue([]),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({
      pollIntervalMs: 50,
      resumeDelayMs: 3_000,
      leaseMs: 30_000,
      workerId: 'worker-run-engine-governance-test',
    });

    await engine.processPlanStep({
      id: 'run-capacity-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-capacity-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      orchestrated_by: 'jarvis',
      summary: 'Capacity-limited run.',
      plan_json: {},
      context_json: {},
    }, {
      id: 'step-plan-capacity-1',
      run_id: 'run-capacity-1',
      sequence_no: 1,
      step_type: 'plan',
      status: 'queued',
    }, []);

    expect(createTask).not.toHaveBeenCalled();
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'sleeping',
      currentStepId: 'step-delegate-capacity-1',
      nextWakeAt: expect.any(Date),
    }));
    expect(taskUpdates.some((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.orchestration_status === 'sleeping'
        && payload.orchestration_blocker_type === 'capacity_wait';
    })).toBe(true);
    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-capacity-1',
      eventType: 'governance.capacity_wait',
    }));
  });

  test('blocks delegate dispatch when the run delegate budget is exhausted', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const createTask = jest.fn();
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-budget-1',
      run_id: 'run-budget-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'queued',
      title: 'Delegate execution task',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-budget-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-budget-1',
            title: 'Coordinate a release checklist',
            description: 'Prepare the release work package.',
            priority: 'high',
            workspace_id: 'ws-1',
            metadata: {
              orchestration_governance: {
                budget: {
                  max_delegate_tasks: 0,
                },
              },
            },
          }],
        };
      }

      if (sql.includes(`metadata ->> 'orchestration_parent_run_id'`)) {
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [{ id: 'root-task-budget-1' }] };
      }

      throw new Error(`Unexpected SQL in budget governance test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        createTask,
        loadAgentDirectory: jest.fn().mockResolvedValue([]),
      }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 3,
        passThreshold: 7,
        evaluateTaskOutput: jest.fn(),
        recordVerdict: jest.fn(),
      }),
    }));
    jest.doMock('../../services/chatActionRuns', () => ({ updateChatActionRun: jest.fn() }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent,
      claimRunnableRuns: jest.fn(),
      createRunStep,
      getCurrentRunStep: jest.fn(),
      getRunById: jest.fn(),
      heartbeatRunLease: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps: jest.fn().mockResolvedValue([]),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({
      pollIntervalMs: 50,
      resumeDelayMs: 3_000,
      leaseMs: 30_000,
      workerId: 'worker-run-engine-governance-test',
    });

    await engine.processPlanStep({
      id: 'run-budget-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-budget-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      orchestrated_by: 'jarvis',
      summary: 'Budget-limited run.',
      plan_json: {},
      context_json: {},
    }, {
      id: 'step-plan-budget-1',
      run_id: 'run-budget-1',
      sequence_no: 1,
      step_type: 'plan',
      status: 'queued',
    }, []);

    expect(createTask).not.toHaveBeenCalled();
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'blocked',
      currentStepId: 'step-delegate-budget-1',
      nextWakeAt: null,
    }));
    expect(taskUpdates.some((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.orchestration_status === 'blocked'
        && payload.orchestration_blocker_type === 'delegate_budget_exhausted';
    })).toBe(true);
    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-budget-1',
      eventType: 'governance.blocked',
      payload: expect.objectContaining({
        type: 'delegate_budget_exhausted',
      }),
    }));
  });
});
