'use strict';

describe('runEngine tool action runs', () => {
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

  test('tool-action plans park in an approval gate before execution', async () => {
    const taskUpdates = [];
    const insertChatMessage = jest.fn().mockResolvedValue({ id: 'chat-approval-1' });
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-tool-approval-1',
      run_id: 'run-tool-1',
      step_type: 'approval_gate',
      status: 'awaiting_approval',
      approval_mode: 'manual',
      sequence_no: 2,
    });
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-tool-1' });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [{ id: 'root-task-1' }] };
      }
      throw new Error(`Unexpected SQL in tool approval plan test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/workspaceRealtime', () => ({ publishTaskEvent: jest.fn() }));
    jest.doMock('../../services/chatActionRuns', () => ({ updateChatActionRun: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        loadAgentDirectory: jest.fn().mockResolvedValue([]),
      }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({ passThreshold: 7, maxRetries: 2 }),
    }));
    jest.doMock('../../services/orchestration/actionRouter', () => ({
      dispatchOrchestratedAction: jest.fn(),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 15000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled']),
      appendRunEvent,
      claimRunnableRuns: jest.fn(),
      createRunStep,
      getCurrentRunStep: jest.fn(),
      getRunById: jest.fn(),
      heartbeatRunLease: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({ workerId: 'worker-tool-plan' });
    const run = {
      id: 'run-tool-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      orchestrated_by: 'jarvis',
      plan_json: {
        strategy: 'tool_actions',
      },
      context_json: {
        tool_name: 'run_code_in_sandbox',
        governed_decision: {
          version: 'v1',
          workspace_id: 'ws-1',
          selected_agent_id: 'agent-1',
          actions: [{
            id: 'act-tool-1',
            key: 'sandbox_code_exec',
            executor: 'sandbox-worker',
            mode: 'approval_required',
            approval: 'required',
            timeout_ms: 30000,
            params: { language: 'python', code: 'print(\"hello\")' },
          }],
          metadata: {
            execution_mode: 'approval_required',
          },
        },
      },
    };
    const step = {
      id: 'step-plan-1',
      run_id: 'run-tool-1',
      step_type: 'plan',
      status: 'running',
      started_at: new Date().toISOString(),
    };
    const rootTask = {
      id: 'root-task-1',
      title: 'Sandbox execution (approval_required)',
      workspace_id: 'ws-1',
      metadata: {
        origin: 'chat',
        origin_chat_channel_id: 'chan-1',
        origin_chat_message_id: 'msg-1',
        orchestration_tool_name: 'run_code_in_sandbox',
        chat_action_run_id: 'action-run-1',
      },
    };

    await engine.processToolPlanStep(run, step, [step], rootTask);

    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-tool-1',
      stepType: 'approval_gate',
      input: expect.objectContaining({
        tool_action: true,
        resume_to: 'execute_actions',
        chat_action_run_id: 'action-run-1',
      }),
    }));
    expect(insertChatMessage).toHaveBeenCalledTimes(1);
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), 'run-tool-1', expect.objectContaining({
      status: 'awaiting_approval',
      currentStepId: 'step-tool-approval-1',
    }));
    const approvalUpdate = taskUpdates.find((entry) => {
      const payload = JSON.parse(entry.params[0]);
      return payload.orchestration_status === 'awaiting_approval';
    });
    expect(approvalUpdate).toBeTruthy();
    expect(JSON.parse(approvalUpdate.params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'awaiting_approval',
      orchestration_run_id: 'run-tool-1',
      orchestration_step_id: 'step-tool-approval-1',
      approval_required: true,
      pending_approval: expect.objectContaining({
        run_id: 'run-tool-1',
        step_id: 'step-tool-approval-1',
      }),
    }));
  });

  test('approveRun resumes tool-action approvals into execute_actions', async () => {
    const taskUpdates = [];
    const requestImmediatePoll = jest.fn();
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-execute-1',
      run_id: 'run-tool-approve-1',
      step_type: 'execute_actions',
      status: 'queued',
      sequence_no: 3,
    });
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-tool-approve-1' });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-tool-approve-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-approve-1',
      status: 'awaiting_approval',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-approval-1',
      run_id: 'run-tool-approve-1',
      step_type: 'approval_gate',
      status: 'awaiting_approval',
      input_json: {
        tool_action: true,
        resume_to: 'execute_actions',
      },
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-1',
        step_type: 'plan',
        status: 'completed',
      },
      {
        id: 'step-approval-1',
        step_type: 'approval_gate',
        status: 'awaiting_approval',
        input_json: {
          tool_action: true,
          resume_to: 'execute_actions',
        },
      },
    ]);

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT *') && sql.includes('FROM tenant_vutler.tasks')) {
        return {
          rows: [{
            id: 'root-task-approve-1',
            workspace_id: 'ws-1',
            metadata: {
              chat_action_run_id: 'action-run-approve-1',
            },
          }],
        };
      }
      if (sql.includes('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [{ id: 'root-task-approve-1' }] };
      }
      throw new Error(`Unexpected SQL in tool approval resume test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/workspaceRealtime', () => ({ publishTaskEvent: jest.fn() }));
    jest.doMock('../../services/chatActionRuns', () => ({ updateChatActionRun: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        loadAgentDirectory: jest.fn().mockResolvedValue([]),
      }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({ passThreshold: 7, maxRetries: 2 }),
    }));
    jest.doMock('../../services/orchestration/actionRouter', () => ({
      dispatchOrchestratedAction: jest.fn(),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 15000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled']),
      appendRunEvent: jest.fn().mockResolvedValue(null),
      claimRunnableRuns: jest.fn(),
      createRunStep,
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps,
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({ workerId: 'worker-tool-approve' });
    engine.requestImmediatePoll = requestImmediatePoll;

    const result = await engine.approveRun('run-tool-approve-1', {
      approved: true,
      note: 'Approved',
      actor: 'human',
    });

    expect(result).toEqual(expect.objectContaining({
      approved: true,
    }));
    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-tool-approve-1',
      stepType: 'execute_actions',
      input: expect.objectContaining({
        tool_action: true,
        chat_action_run_id: 'action-run-approve-1',
      }),
    }));
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), 'run-tool-approve-1', expect.objectContaining({
      currentStepId: 'step-execute-1',
      status: 'running',
    }));
    expect(requestImmediatePoll).toHaveBeenCalledTimes(1);
    expect(JSON.parse(taskUpdates[0].params[0])).toEqual(expect.objectContaining({
      orchestration_step_id: 'step-execute-1',
      pending_approval: null,
      approval_granted: true,
    }));
  });

  test('execute_actions dispatches the governed tool plan and queues finalize', async () => {
    const taskUpdates = [];
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-finalize-1',
      run_id: 'run-tool-exec-1',
      step_type: 'finalize',
      status: 'queued',
      sequence_no: 3,
    });
    const updateRun = jest.fn().mockResolvedValue({ id: 'run-tool-exec-1' });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const dispatchOrchestratedAction = jest.fn().mockResolvedValue({
      action_id: 'act-tool-exec-1',
      success: true,
      status: 'completed',
      output_json: {
        stdout: 'hello from sandbox\n',
        status: 'completed',
      },
      artifacts: [],
      error: null,
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT *') && sql.includes('FROM tenant_vutler.tasks')) {
        return {
          rows: [{
            id: 'root-task-exec-1',
            workspace_id: 'ws-1',
            metadata: {
              origin: 'chat',
              origin_chat_channel_id: 'chan-1',
              origin_chat_message_id: 'msg-1',
              orchestration_tool_name: 'run_code_in_sandbox',
              chat_action_run_id: 'action-run-exec-1',
            },
          }],
        };
      }
      if (sql.includes('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [{ id: 'root-task-exec-1' }] };
      }
      throw new Error(`Unexpected SQL in tool execute test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/workspaceRealtime', () => ({ publishTaskEvent: jest.fn() }));
    jest.doMock('../../services/chatActionRuns', () => ({ updateChatActionRun: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        loadAgentDirectory: jest.fn().mockResolvedValue([
          { id: 'agent-1', username: 'mike', workspace_id: 'ws-1' },
        ]),
      }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({ passThreshold: 7, maxRetries: 2 }),
    }));
    jest.doMock('../../services/orchestration/actionRouter', () => ({
      dispatchOrchestratedAction,
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 15000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled']),
      appendRunEvent: jest.fn().mockResolvedValue(null),
      claimRunnableRuns: jest.fn(),
      createRunStep,
      getCurrentRunStep: jest.fn(),
      getRunById: jest.fn(),
      heartbeatRunLease: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun,
      updateRunStep,
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine({ workerId: 'worker-tool-exec' });
    engine.requestImmediatePoll = jest.fn();

    const run = {
      id: 'run-tool-exec-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-exec-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      context_json: {
        tool_name: 'run_code_in_sandbox',
        chat_action_run_id: 'action-run-exec-1',
        governed_decision: {
          version: 'v1',
          workspace_id: 'ws-1',
          selected_agent_id: 'agent-1',
          actions: [{
            id: 'act-tool-exec-1',
            key: 'sandbox_code_exec',
            executor: 'sandbox-worker',
            mode: 'approval_required',
            approval: 'required',
            timeout_ms: 30000,
            params: { language: 'python', code: 'print(\"hello\")' },
          }],
          metadata: {
            execution_mode: 'approval_required',
          },
        },
      },
    };
    const step = {
      id: 'step-execute-1',
      run_id: 'run-tool-exec-1',
      step_type: 'execute_actions',
      status: 'queued',
      input_json: {
        tool_action: true,
        chat_action_run_id: 'action-run-exec-1',
      },
    };

    await engine.processExecuteActionsStep(run, step, [step]);

    expect(dispatchOrchestratedAction).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sandbox_code_exec',
      mode: 'sync',
      approval: 'none',
    }), expect.objectContaining({
      workspaceId: 'ws-1',
      chatActionRunId: 'action-run-exec-1',
      agent: expect.objectContaining({
        id: 'agent-1',
        username: 'mike',
      }),
    }));
    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      runId: 'run-tool-exec-1',
      stepType: 'finalize',
      input: expect.objectContaining({
        tool_action: true,
        chat_action_run_id: 'action-run-exec-1',
        tool_result_text: expect.stringContaining('hello from sandbox'),
      }),
    }));
    expect(updateRun).toHaveBeenCalledWith(expect.anything(), 'run-tool-exec-1', expect.objectContaining({
      currentStepId: 'step-finalize-1',
      status: 'running',
    }));
    expect(taskUpdates).toHaveLength(1);
    expect(JSON.parse(taskUpdates[0].params[0])).toEqual(expect.objectContaining({
      orchestration_step_id: 'step-finalize-1',
      chat_action_run_id: 'action-run-exec-1',
    }));
  });
});
