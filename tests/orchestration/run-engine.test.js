'use strict';

describe('runEngine claim/resume loop', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('claims a planning run, delegates a child task, and parks the run in waiting_on_tasks', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const updateRunStepCalls = [];
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-1',
      status: 'planning',
      lock_token: 'lock-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-1',
      status: 'planning',
      lock_token: 'lock-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Autonomous FULL-mode run.',
      plan_json: { goal: 'Implement orchestration engine' },
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-plan-1',
      run_id: 'run-1',
      sequence_no: 1,
      step_type: 'plan',
      status: 'queued',
      title: 'Plan orchestration run',
    });
    const listRunSteps = jest.fn().mockResolvedValue([{
      id: 'step-plan-1',
      run_id: 'run-1',
      sequence_no: 1,
      step_type: 'plan',
      status: 'queued',
      title: 'Plan orchestration run',
    }]);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-1',
      run_id: 'run-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'queued',
      title: 'Delegate execution task',
      spawned_task_id: null,
    });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-1',
      lock_token: 'lock-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-1', ...patch };
    });
    const updateRunStep = jest.fn().mockImplementation(async (_db, stepId, patch) => {
      updateRunStepCalls.push({ stepId, patch });
      return { id: stepId, ...patch };
    });
    const createTask = jest.fn().mockResolvedValue({
      id: 'child-task-1',
      status: 'pending',
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-1',
            title: 'Implement orchestration engine',
            description: 'Build a durable run engine and resume loop.',
            priority: 'high',
            assigned_agent: 'mike',
            workspace_id: 'ws-1',
            metadata: { workflow_mode: 'FULL', origin: 'task' },
          }],
        };
      }

      if (sql.includes(`metadata ->> 'orchestration_parent_run_id'`)) {
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in run-engine planning test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
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

    expect(claimRunnableRuns).toHaveBeenCalledWith(expect.anything(), 'worker-run-engine-test', expect.objectContaining({
      limit: 3,
      leaseMs: 30_000,
    }));
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: '[Run run-1] Implement orchestration engine',
      assigned_agent: 'mike',
      metadata: expect.objectContaining({
        workflow_mode: 'LITE',
        execution_backend: 'orchestration_delegate',
        orchestration_parent_run_id: 'run-1',
        orchestration_parent_step_id: 'step-delegate-1',
        orchestration_proactive: true,
      }),
    }), 'ws-1');
    expect(updateRunStepCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stepId: 'step-plan-1',
        patch: expect.objectContaining({
          status: 'completed',
          output: expect.objectContaining({
            delegated_task_id: 'child-task-1',
          }),
        }),
      }),
      expect.objectContaining({
        stepId: 'step-delegate-1',
        patch: expect.objectContaining({
          status: 'waiting',
          spawnedTaskId: 'child-task-1',
        }),
      }),
    ]));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'waiting_on_tasks',
      currentStepId: 'step-delegate-1',
      lockToken: null,
      lockedBy: null,
      leaseExpiresAt: null,
    }));
    expect(taskUpdates).toHaveLength(1);
    expect(JSON.parse(taskUpdates[0].params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'waiting_on_tasks',
      orchestration_run_id: 'run-1',
      orchestration_step_id: 'step-delegate-1',
      delegated_task_id: 'child-task-1',
      orchestration_proactive: true,
    }));
  });

  test('resumes a waiting run and finalizes it when the delegated task completes', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const updateRunStepCalls = [];
    const insertChatMessage = jest.fn().mockResolvedValue({ id: 'chat-1' });
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const evaluateTaskOutput = jest.fn().mockResolvedValue({
      passed: true,
      threshold: 7,
      verdict: {
        overall_pass: true,
        overall_score: 9,
        scores: [],
        summary: 'Verified successfully.',
      },
    });
    const recordVerdict = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-2',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-2',
      status: 'waiting_on_tasks',
      lock_token: 'lock-2',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-2',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-2',
      status: 'waiting_on_tasks',
      lock_token: 'lock-2',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Autonomous FULL-mode run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-2',
      run_id: 'run-2',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-2',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-2',
        run_id: 'run-2',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-2',
        run_id: 'run-2',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-2',
      },
    ]);
    const createRunStep = jest.fn()
      .mockResolvedValueOnce({
        id: 'step-verify-2',
        run_id: 'run-2',
        sequence_no: 3,
        step_type: 'verify',
        status: 'queued',
        title: 'Verify delegated result',
      })
      .mockResolvedValueOnce({
        id: 'step-finalize-2',
        run_id: 'run-2',
        sequence_no: 4,
        step_type: 'finalize',
        status: 'queued',
        title: 'Finalize successful run',
      });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-2',
      lock_token: 'lock-2',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-2', ...patch };
    });
    const updateRunStep = jest.fn().mockImplementation(async (_db, stepId, patch) => {
      updateRunStepCalls.push({ stepId, patch });
      return { id: stepId, ...patch };
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-2') {
          return {
            rows: [{
              id: 'root-task-2',
              title: 'Ship autonomous orchestration',
              description: 'Finalize the durable run flow.',
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

        if (params[0] === 'child-task-2') {
          return {
            rows: [{
              id: 'child-task-2',
              status: 'completed',
              metadata: {
                result: 'The autonomous orchestration engine is now wired and resumes proactively.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in run-engine finalize test: ${sql}`);
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
        evaluateTaskOutput,
        recordVerdict,
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

    expect(createRunStep).toHaveBeenNthCalledWith(1, expect.anything(), expect.objectContaining({
      stepType: 'verify',
      input: expect.objectContaining({
        delegated_task_id: 'child-task-2',
      }),
    }));
    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      stepType: 'finalize',
      input: expect.objectContaining({
        outcome: 'success',
        delegated_task_id: 'child-task-2',
      }),
    }));
    expect(updateRunStepCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stepId: 'step-delegate-2',
        patch: expect.objectContaining({
          status: 'completed',
          spawnedTaskId: 'child-task-2',
        }),
      }),
      expect.objectContaining({
        stepId: 'step-verify-2',
        patch: expect.objectContaining({
          status: 'completed',
          output: expect.objectContaining({
            passed: true,
          }),
        }),
      }),
      expect.objectContaining({
        stepId: 'step-finalize-2',
        patch: expect.objectContaining({
          status: 'completed',
          output: expect.objectContaining({
            result: 'The autonomous orchestration engine is now wired and resumes proactively.',
          }),
        }),
      }),
    ]));
    expect(updateRunCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: 'running',
        currentStepId: 'step-verify-2',
      }),
      expect.objectContaining({
        status: 'running',
        currentStepId: 'step-finalize-2',
      }),
      expect.objectContaining({
        status: 'completed',
        currentStepId: 'step-finalize-2',
        completedAt: expect.any(Date),
        lockToken: null,
        lockedBy: null,
      }),
    ]));
    expect(evaluateTaskOutput).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'root-task-2' }),
      'The autonomous orchestration engine is now wired and resumes proactively.'
    );
    expect(recordVerdict).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'child-task-2' }),
      expect.objectContaining({ overall_score: 9 }),
      expect.any(Object)
    );
    expect(taskUpdates.length).toBeGreaterThanOrEqual(2);
    const completionWrite = taskUpdates.find((call) => call.params[0] === 'completed');
    expect(completionWrite).toBeTruthy();
    expect(JSON.parse(completionWrite.params[1])).toEqual(expect.objectContaining({
      orchestration_status: 'completed',
      orchestration_run_id: 'run-2',
      orchestration_step_id: 'step-finalize-2',
      delegated_task_id: 'child-task-2',
      orchestration_proactive: true,
      result: 'The autonomous orchestration engine is now wired and resumes proactively.',
    }));
    expect(insertChatMessage).toHaveBeenCalledWith(expect.anything(), null, 'tenant_vutler', expect.objectContaining({
      channel_id: 'channel-1',
      sender_id: 'agent-1',
      sender_name: 'Mike',
      reply_to_message_id: 'message-1',
      content: 'The autonomous orchestration engine is now wired and resumes proactively.',
    }));
  });
});
