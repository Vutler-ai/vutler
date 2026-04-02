'use strict';

describe('runEngine claim/resume loop', () => {
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

  test('uses swarm-assisted decomposition to seed the first planned phase and agent', async () => {
    const taskUpdates = [];
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-llm-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-llm-1',
      status: 'planning',
      lock_token: 'lock-llm-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-llm-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-llm-1',
      status: 'planning',
      lock_token: 'lock-llm-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Autonomous FULL-mode run.',
      plan_json: { goal: 'Ship orchestration' },
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-plan-llm-1',
      run_id: 'run-llm-1',
      sequence_no: 1,
      step_type: 'plan',
      status: 'queued',
      title: 'Plan orchestration run',
    });
    const listRunSteps = jest.fn()
      .mockResolvedValueOnce([{
        id: 'step-plan-llm-1',
        run_id: 'run-llm-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'queued',
        title: 'Plan orchestration run',
      }])
      .mockResolvedValueOnce([
        {
          id: 'step-plan-llm-1',
          run_id: 'run-llm-1',
          sequence_no: 1,
          step_type: 'plan',
          status: 'completed',
          title: 'Plan orchestration run',
        },
        {
          id: 'step-delegate-llm-1',
          run_id: 'run-llm-1',
          sequence_no: 2,
          step_type: 'delegate_task',
          status: 'queued',
          title: 'Phase 1: Inspect current runtime',
          selected_agent_username: 'oscar',
          selected_agent_id: 'agent-oscar',
          input_json: {
            plan_phase_index: 0,
            plan_phase_title: 'Inspect current runtime',
            plan_phase_count: 2,
            phase_objective: 'Map the current orchestration gaps before implementation.',
            snipara_swarm_id: 'swarm-1',
            strategy: 'multi_phase_sequential',
            execution_overlay: {
              integrationProviders: ['sandbox'],
              skillKeys: [],
              toolCapabilities: ['code_execution'],
            },
          },
        },
      ]);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-llm-1',
      run_id: 'run-llm-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'queued',
      title: 'Phase 1: Inspect current runtime',
      selected_agent_username: 'oscar',
      selected_agent_id: 'agent-oscar',
      input_json: {
        plan_phase_index: 0,
        plan_phase_title: 'Inspect current runtime',
        plan_phase_count: 2,
        phase_objective: 'Map the current orchestration gaps before implementation.',
        snipara_swarm_id: 'swarm-1',
        strategy: 'multi_phase_sequential',
        execution_overlay: {
          integrationProviders: ['sandbox'],
          skillKeys: [],
          toolCapabilities: ['code_execution'],
        },
      },
    });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-llm-1',
      lock_token: 'lock-llm-1',
    });
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-llm-1' });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const createTask = jest.fn().mockResolvedValue({
      id: 'child-task-llm-1',
      status: 'pending',
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        return {
          rows: [{
            id: 'root-task-llm-1',
            title: 'Ship orchestration',
            description: 'Plan and ship the orchestration runtime safely.',
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

      throw new Error(`Unexpected SQL in assisted planning test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockImplementation(async ({ messageText }) => {
        if (String(messageText).includes('Inspect current runtime')) {
          return {
            domains: ['technical'],
            overlayProviders: ['sandbox'],
            overlaySkillKeys: [],
            overlayToolCapabilities: ['code_execution'],
            primaryDelegate: null,
            delegatedAgents: [],
            reasons: [],
            availability: null,
            unavailableDomains: [],
            workspacePressure: null,
            specializationProfile: null,
            recommendations: [],
          };
        }
        return {
          domains: [],
          overlayProviders: ['project_management'],
          overlaySkillKeys: ['task_management'],
          overlayToolCapabilities: [],
          primaryDelegate: null,
          delegatedAgents: [],
          reasons: [],
          availability: null,
          unavailableDomains: [],
          workspacePressure: null,
          specializationProfile: null,
          recommendations: [],
        };
      }),
    }));
    jest.doMock('../../services/executionOverlayService', () => ({
      filterExecutionOverlay: jest.fn().mockImplementation(async ({ overlay }) => ({
        skillKeys: Array.isArray(overlay?.skillKeys) ? overlay.skillKeys : [],
        integrationProviders: Array.isArray(overlay?.integrationProviders) ? overlay.integrationProviders : [],
        toolCapabilities: Array.isArray(overlay?.toolCapabilities) ? overlay.toolCapabilities : [],
      })),
      isOverlayEmpty: jest.requireActual('../../services/executionOverlayService').isOverlayEmpty,
    }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        createTask,
        recallWorkspaceContext: jest.fn().mockResolvedValue('Workspace standards from Snipara memory.'),
        getSniparaRuntimeConfig: jest.fn().mockResolvedValue({
          swarmId: 'swarm-1',
          config: { configured: true, projectId: 'project-1' },
        }),
        loadAgentDirectory: jest.fn().mockResolvedValue([
          { id: 'agent-1', username: 'mike', name: 'Mike', type: ['engineering'] },
          { id: 'agent-oscar', username: 'oscar', name: 'Oscar', type: ['engineering'] },
        ]),
        decomposeWithLLM: jest.fn().mockResolvedValue([
          {
            title: 'Inspect current runtime',
            description: 'Map the current orchestration gaps before implementation.',
            agent: 'oscar',
          },
          {
            title: 'Implement the durable flow',
            description: 'Wire the execution and resume loop.',
            agent: 'mike',
          },
        ]),
        resolveAgentForSubtask: jest.fn((subtask) => subtask.agent),
        updateSharedContext: jest.fn().mockResolvedValue(null),
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

    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      title: 'Phase 1: Inspect current runtime',
      selectedAgentUsername: 'oscar',
      selectedAgentId: 'agent-oscar',
      input: expect.objectContaining({
        strategy: 'multi_phase_sequential',
        plan_phase_title: 'Inspect current runtime',
        plan_phase_count: 2,
        execution_overlay: expect.objectContaining({
          integrationProviders: ['sandbox'],
          toolCapabilities: ['code_execution'],
        }),
      }),
    }));
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: '[Run run-llm-] 1/2: Inspect current runtime',
      assigned_agent: 'oscar',
      metadata: expect.objectContaining({
        orchestration_plan_phase_title: 'Inspect current runtime',
        orchestration_snipara_swarm_id: 'swarm-1',
        execution_overlay: expect.objectContaining({
          integrationProviders: ['sandbox'],
          toolCapabilities: ['code_execution'],
        }),
        orchestration_overlay_tool_capabilities: ['code_execution'],
      }),
    }), 'ws-1');
    expect(JSON.parse(taskUpdates[0].params[0])).toEqual(expect.objectContaining({
      orchestration_planning_source: 'swarm_llm_decomposition',
      orchestration_phase_title: 'Inspect current runtime',
      orchestration_delegated_agents: expect.arrayContaining([
        expect.objectContaining({ agentRef: 'oscar', reason: 'Inspect current runtime' }),
      ]),
      orchestration_snipara_swarm_id: 'swarm-1',
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

  test('records closure-ready Snipara metadata before verification and finalization', async () => {
    const taskUpdates = [];
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const evaluateTaskOutput = jest.fn().mockResolvedValue({
      passed: true,
      threshold: 7,
      verdict: {
        overall_pass: true,
        overall_score: 8,
        scores: [],
        summary: 'Closure is acceptable.',
      },
    });
    const recordVerdict = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-closure-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-closure-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-closure-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-closure-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-closure-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-closure-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Waiting for Snipara closure.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-closure-1',
      run_id: 'run-closure-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-closure-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-closure-1',
        run_id: 'run-closure-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-closure-1',
        run_id: 'run-closure-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-closure-1',
      },
    ]);
    const createRunStep = jest.fn()
      .mockResolvedValueOnce({
        id: 'step-verify-closure-1',
        run_id: 'run-closure-1',
        sequence_no: 3,
        step_type: 'verify',
        status: 'queued',
        title: 'Verify delegated result',
      })
      .mockResolvedValueOnce({
        id: 'step-finalize-closure-1',
        run_id: 'run-closure-1',
        sequence_no: 4,
        step_type: 'finalize',
        status: 'queued',
        title: 'Finalize successful run',
      });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-closure-1',
      lock_token: 'lock-closure-1',
    });
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-closure-1' });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-closure-1') {
          return {
            rows: [{
              id: 'root-task-closure-1',
              title: 'Close compliance loop',
              description: 'Capture the closure-ready result and finalize.',
              priority: 'high',
              workspace_id: 'ws-1',
              metadata: { origin: 'task' },
            }],
          };
        }

        if (params[0] === 'child-task-closure-1') {
          return {
            rows: [{
              id: 'child-task-closure-1',
              status: 'completed',
              metadata: {
                snipara_last_event: 'htask.closure_ready',
                snipara_closed_with_waiver: true,
                snipara_auto_closed_parent: 'parent-1',
                snipara_resolution: 'Policy exception approved.',
                result: 'Closure package ready for final verification.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in closure-ready run test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        updateSharedContext: jest.fn().mockResolvedValue(null),
        rememberLearning: jest.fn().mockResolvedValue(null),
      }),
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

    expect(appendRunEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-closure-1',
      stepId: 'step-delegate-closure-1',
      eventType: 'delegate.task_closure_ready',
      payload: expect.objectContaining({
        delegated_task_id: 'child-task-closure-1',
        closed_with_waiver: true,
        auto_closed_parent: 'parent-1',
        resolution: 'Policy exception approved.',
      }),
    }));

    const closurePayload = taskUpdates
      .map((call) => call.params.find((value) => typeof value === 'string' && value.trim().startsWith('{')))
      .filter(Boolean)
      .map((value) => JSON.parse(value))
      .find((payload) => payload.orchestration_closure_ready === true);

    expect(closurePayload).toEqual(expect.objectContaining({
      orchestration_closure_ready: true,
      orchestration_closed_with_waiver: true,
      orchestration_auto_closed_parent: 'parent-1',
      orchestration_last_resolution: 'Policy exception approved.',
      delegated_task_id: 'child-task-closure-1',
    }));
    expect(evaluateTaskOutput).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'root-task-closure-1' }),
      'Closure package ready for final verification.'
    );
    expect(recordVerdict).toHaveBeenCalled();
  });
});
