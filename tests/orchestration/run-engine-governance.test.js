'use strict';

describe('runEngine verification and approval flow', () => {
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

  test('creates an approval gate after verification passes when approval is required', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const createTask = jest.fn();
    const insertChatMessage = jest.fn().mockResolvedValue({ id: 'chat-approval-1' });
    const evaluateTaskOutput = jest.fn().mockResolvedValue({
      passed: true,
      threshold: 7,
      verdict: {
        overall_pass: true,
        overall_score: 8,
        scores: [],
        summary: 'Ready for human sign-off.',
      },
    });
    const recordVerdict = jest.fn().mockResolvedValue(null);
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-approval-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-approval-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-approval-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-approval-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-approval-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-approval-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Approval flow run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-approval-1',
      run_id: 'run-approval-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-approval-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-approval-1',
        run_id: 'run-approval-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-approval-1',
        run_id: 'run-approval-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-approval-1',
      },
    ]);
    const createRunStep = jest.fn()
      .mockResolvedValueOnce({
        id: 'step-verify-approval-1',
        run_id: 'run-approval-1',
        sequence_no: 3,
        step_type: 'verify',
        status: 'queued',
        title: 'Verify delegated result',
      })
      .mockResolvedValueOnce({
        id: 'step-approval-1',
        run_id: 'run-approval-1',
        sequence_no: 4,
        step_type: 'approval_gate',
        status: 'awaiting_approval',
        title: 'Human approval required',
        approval_mode: 'manual',
      });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-approval-1',
      lock_token: 'lock-approval-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-approval-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-approval-1') {
          return {
            rows: [{
              id: 'root-task-approval-1',
              title: 'Approve autonomous delivery',
              description: 'Review the final output before release.',
              priority: 'high',
              workspace_id: 'ws-1',
              metadata: {
                origin: 'chat',
                origin_chat_channel_id: 'channel-approval-1',
                origin_chat_message_id: 'message-approval-1',
                approval_required: true,
              },
            }],
          };
        }

        if (params[0] === 'child-task-approval-1') {
          return {
            rows: [{
              id: 'child-task-approval-1',
              status: 'completed',
              metadata: {
                result: 'Deliverable is ready for release.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in approval gate test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
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

    expect(createRunStep).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      stepType: 'approval_gate',
      approvalMode: 'manual',
    }));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'awaiting_approval',
      currentStepId: 'step-approval-1',
      lockToken: null,
      lockedBy: null,
    }));
    expect(createTask).not.toHaveBeenCalled();
    const approvalWrite = taskUpdates.find((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.orchestration_status === 'awaiting_approval';
    });
    expect(approvalWrite).toBeTruthy();
    expect(JSON.parse(approvalWrite.params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'awaiting_approval',
      orchestration_run_id: 'run-approval-1',
      orchestration_step_id: 'step-approval-1',
      approval_required: true,
      pending_approval: expect.objectContaining({
        run_id: 'run-approval-1',
        step_id: 'step-approval-1',
      }),
    }));
    expect(insertChatMessage).toHaveBeenCalledWith(expect.anything(), null, 'tenant_vutler', expect.objectContaining({
      channel_id: 'channel-approval-1',
      content: expect.stringContaining('Approval required'),
    }));
  });

  test('routes auto-accepted verification results to manual review when criteria were unavailable', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const createTask = jest.fn();
    const insertChatMessage = jest.fn().mockResolvedValue({ id: 'chat-review-1' });
    const evaluateTaskOutput = jest.fn().mockResolvedValue({
      passed: true,
      threshold: 8,
      autoAccepted: true,
      autoAcceptedReason: 'no_criteria',
      verdict: {
        overall_pass: true,
        overall_score: 10,
        scores: [],
        summary: 'Auto-accepted (no criteria)',
      },
    });
    const recordVerdict = jest.fn().mockResolvedValue(null);
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-review-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-review-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-review-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-review-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-review-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-review-1',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      summary: 'Verification review run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-review-1',
      run_id: 'run-review-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-review-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-review-1',
        run_id: 'run-review-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-review-1',
        run_id: 'run-review-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-review-1',
      },
    ]);
    const createRunStep = jest.fn()
      .mockResolvedValueOnce({
        id: 'step-verify-review-1',
        run_id: 'run-review-1',
        sequence_no: 3,
        step_type: 'verify',
        status: 'queued',
        title: 'Verify delegated result',
      })
      .mockResolvedValueOnce({
        id: 'step-approval-review-1',
        run_id: 'run-review-1',
        sequence_no: 4,
        step_type: 'approval_gate',
        status: 'awaiting_approval',
        title: 'Human approval required',
        approval_mode: 'manual',
      });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-review-1',
      lock_token: 'lock-review-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-review-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-review-1') {
          return {
            rows: [{
              id: 'root-task-review-1',
              title: 'Review autonomous delivery',
              description: 'No acceptance criteria were provided here.',
              priority: 'high',
              workspace_id: 'ws-1',
              metadata: {
                origin: 'chat',
                origin_chat_channel_id: 'channel-review-1',
                origin_chat_message_id: 'message-review-1',
              },
            }],
          };
        }

        if (params[0] === 'child-task-review-1') {
          return {
            rows: [{
              id: 'child-task-review-1',
              status: 'completed',
              metadata: {
                result: 'Deliverable is ready, but criteria were never formalized.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in verification review test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
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

    expect(createRunStep).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      stepType: 'approval_gate',
      approvalMode: 'manual',
      input: expect.objectContaining({
        delegated_task_id: 'child-task-review-1',
      }),
    }));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'awaiting_approval',
      currentStepId: 'step-approval-review-1',
      lockToken: null,
      lockedBy: null,
    }));
    expect(createTask).not.toHaveBeenCalled();
    const approvalWrite = taskUpdates.find((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.pending_approval?.blocker_type === 'verification_review';
    });
    expect(approvalWrite).toBeTruthy();
    expect(JSON.parse(approvalWrite.params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'awaiting_approval',
      orchestration_run_id: 'run-review-1',
      orchestration_step_id: 'step-approval-review-1',
      approval_required: true,
      verification_auto_accepted: true,
      verification_auto_accepted_reason: 'no_criteria',
      pending_approval: expect.objectContaining({
        run_id: 'run-review-1',
        step_id: 'step-approval-review-1',
        blocker_type: 'verification_review',
      }),
    }));
    expect(insertChatMessage).toHaveBeenCalledWith(expect.anything(), null, 'tenant_vutler', expect.objectContaining({
      channel_id: 'channel-review-1',
      content: expect.stringContaining('Human verification required because no acceptance criteria were available.'),
    }));
  });

  test('queues a revision delegate when verification fails below the retry ceiling', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const createTask = jest.fn().mockResolvedValue({
      id: 'child-task-revision-1',
      status: 'pending',
    });
    const evaluateTaskOutput = jest.fn().mockResolvedValue({
      passed: false,
      threshold: 7,
      verdict: {
        overall_pass: false,
        overall_score: 4,
        summary: 'Missing one acceptance criterion.',
        scores: [
          { criterion: 'Covers retry policy', score: 4, feedback: 'Retry behavior is not documented.' },
        ],
      },
    });
    const recordVerdict = jest.fn().mockResolvedValue(null);
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-revision-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-revision-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-revision-1',
      requested_agent_id: 'agent-2',
      requested_agent_username: 'oscar',
      display_agent_id: 'agent-2',
      display_agent_username: 'oscar',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-revision-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-revision-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-revision-1',
      requested_agent_id: 'agent-2',
      requested_agent_username: 'oscar',
      display_agent_id: 'agent-2',
      display_agent_username: 'oscar',
      summary: 'Revision flow run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-revision-1',
      run_id: 'run-revision-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-original-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-revision-1',
        run_id: 'run-revision-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-revision-1',
        run_id: 'run-revision-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-original-1',
      },
    ]);
    const createRunStep = jest.fn()
      .mockResolvedValueOnce({
        id: 'step-verify-revision-1',
        run_id: 'run-revision-1',
        sequence_no: 3,
        step_type: 'verify',
        status: 'queued',
        title: 'Verify delegated result',
      })
      .mockResolvedValueOnce({
        id: 'step-revision-2',
        run_id: 'run-revision-1',
        sequence_no: 4,
        step_type: 'delegate_task',
        status: 'queued',
        title: 'Revision #1: Improve orchestration quality',
        selected_agent_username: 'oscar',
        retry_count: 1,
      });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-revision-1',
      lock_token: 'lock-revision-1',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-revision-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-revision-1') {
          return {
            rows: [{
              id: 'root-task-revision-1',
              title: 'Improve orchestration quality',
              description: '- [ ] Covers retry policy',
              priority: 'high',
              assigned_agent: 'oscar',
              workspace_id: 'ws-1',
              metadata: {},
            }],
          };
        }

        if (params[0] === 'child-task-original-1') {
          return {
            rows: [{
              id: 'child-task-original-1',
              status: 'completed',
              retry_count: 0,
              metadata: {
                result: 'Initial draft without retry notes.',
              },
            }],
          };
        }
      }

      if (sql.includes(`metadata ->> 'orchestration_parent_run_id'`)) {
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in revision test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 2,
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

    expect(createRunStep).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      stepType: 'delegate_task',
      title: 'Revision #1: Improve orchestration quality',
      selectedAgentUsername: 'oscar',
      retryCount: 1,
      input: expect.objectContaining({
        verification_feedback: expect.stringContaining('Retry behavior is not documented.'),
        escalation: false,
      }),
    }));
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      assigned_agent: 'oscar',
      metadata: expect.objectContaining({
        orchestration_parent_step_id: 'step-revision-2',
      }),
    }), 'ws-1');
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'waiting_on_tasks',
      currentStepId: 'step-revision-2',
    }));
    const waitWrite = taskUpdates.find((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.orchestration_step_id === 'step-revision-2';
    });
    expect(waitWrite).toBeTruthy();
    expect(JSON.parse(waitWrite.params[0])).toEqual(expect.objectContaining({
      orchestration_status: 'waiting_on_tasks',
      orchestration_step_id: 'step-revision-2',
      escalation_active: false,
    }));
  });

  test('queues an escalation delegate to mike when verification exceeds the retry ceiling', async () => {
    const createTask = jest.fn().mockResolvedValue({
      id: 'child-task-escalation-1',
      status: 'pending',
    });
    const evaluateTaskOutput = jest.fn().mockResolvedValue({
      passed: false,
      threshold: 7,
      verdict: {
        overall_pass: false,
        overall_score: 2,
        summary: 'Repeatedly failing the acceptance criteria.',
        scores: [
          { criterion: 'Fix is complete', score: 2, feedback: 'Still incomplete.' },
        ],
      },
    });
    const appendRunEvent = jest.fn().mockResolvedValue(null);
    const claimRunnableRuns = jest.fn().mockResolvedValue([{
      id: 'run-escalation-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-escalation-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-escalation-1',
      requested_agent_id: 'agent-3',
      requested_agent_username: 'oscar',
      display_agent_id: 'agent-3',
      display_agent_username: 'oscar',
    }]);
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-escalation-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-escalation-1',
      status: 'waiting_on_tasks',
      lock_token: 'lock-escalation-1',
      requested_agent_id: 'agent-3',
      requested_agent_username: 'oscar',
      display_agent_id: 'agent-3',
      display_agent_username: 'oscar',
      summary: 'Escalation flow run.',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-delegate-escalation-1',
      run_id: 'run-escalation-1',
      sequence_no: 2,
      step_type: 'delegate_task',
      status: 'waiting',
      title: 'Delegate execution task',
      spawned_task_id: 'child-task-original-escalation-1',
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-plan-escalation-1',
        run_id: 'run-escalation-1',
        sequence_no: 1,
        step_type: 'plan',
        status: 'completed',
        title: 'Plan orchestration run',
      },
      {
        id: 'step-delegate-escalation-1',
        run_id: 'run-escalation-1',
        sequence_no: 2,
        step_type: 'delegate_task',
        status: 'waiting',
        title: 'Delegate execution task',
        spawned_task_id: 'child-task-original-escalation-1',
      },
    ]);
    const createRunStep = jest.fn()
      .mockResolvedValueOnce({
        id: 'step-verify-escalation-1',
        run_id: 'run-escalation-1',
        sequence_no: 3,
        step_type: 'verify',
        status: 'queued',
        title: 'Verify delegated result',
      })
      .mockResolvedValueOnce({
        id: 'step-escalation-2',
        run_id: 'run-escalation-1',
        sequence_no: 4,
        step_type: 'delegate_task',
        status: 'queued',
        title: 'Escalation review: Restore orchestration quality',
        selected_agent_username: 'mike',
        retry_count: 1,
      });
    const heartbeatRunLease = jest.fn().mockResolvedValue({
      id: 'run-escalation-1',
      lock_token: 'lock-escalation-1',
    });
    const updateRun = jest.fn().mockResolvedValue({});
    const updateRunStep = jest.fn().mockResolvedValue({});
    const taskUpdates = [];

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-escalation-1') {
          return {
            rows: [{
              id: 'root-task-escalation-1',
              title: 'Restore orchestration quality',
              description: '- [ ] Fix is complete',
              priority: 'high',
              assigned_agent: 'oscar',
              workspace_id: 'ws-1',
              metadata: {},
            }],
          };
        }

        if (params[0] === 'child-task-original-escalation-1') {
          return {
            rows: [{
              id: 'child-task-original-escalation-1',
              status: 'completed',
              retry_count: 0,
              metadata: {
                result: 'Still incomplete.',
              },
            }],
          };
        }
      }

      if (sql.includes(`metadata ->> 'orchestration_parent_run_id'`)) {
        return { rows: [] };
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in escalation test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ createTask }),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 0,
        passThreshold: 7,
        evaluateTaskOutput,
        recordVerdict: jest.fn().mockResolvedValue(null),
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

    expect(createRunStep).toHaveBeenNthCalledWith(2, expect.anything(), expect.objectContaining({
      stepType: 'delegate_task',
      title: 'Escalation review: Restore orchestration quality',
      selectedAgentUsername: 'mike',
      retryCount: 1,
      input: expect.objectContaining({
        escalation: true,
        verification_feedback: expect.stringContaining('Still incomplete.'),
      }),
    }));
    expect(createTask).toHaveBeenCalledWith(expect.objectContaining({
      assigned_agent: 'mike',
    }), 'ws-1');
    const escalationWrite = taskUpdates.find((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.escalation_active === true;
    });
    expect(escalationWrite).toBeTruthy();
  });

  test('approveRun resumes an approval-gated run toward finalize', async () => {
    const taskUpdates = [];
    const updateRunCalls = [];
    const getRunById = jest.fn().mockResolvedValue({
      id: 'run-approve-resume-1',
      workspace_id: 'ws-1',
      root_task_id: 'root-task-approve-resume-1',
      status: 'awaiting_approval',
      display_agent_id: 'agent-1',
      display_agent_username: 'mike',
      requested_agent_id: 'agent-1',
      requested_agent_username: 'mike',
    });
    const getCurrentRunStep = jest.fn().mockResolvedValue({
      id: 'step-approval-resume-1',
      run_id: 'run-approve-resume-1',
      step_type: 'approval_gate',
      status: 'awaiting_approval',
      input_json: {
        delegated_task_id: 'child-task-approve-resume-1',
      },
    });
    const listRunSteps = jest.fn().mockResolvedValue([
      {
        id: 'step-approval-resume-1',
        run_id: 'run-approve-resume-1',
        step_type: 'approval_gate',
        status: 'awaiting_approval',
        input_json: {
          delegated_task_id: 'child-task-approve-resume-1',
        },
      },
    ]);
    const createRunStep = jest.fn().mockResolvedValue({
      id: 'step-finalize-resume-1',
      run_id: 'run-approve-resume-1',
      sequence_no: 5,
      step_type: 'finalize',
      status: 'queued',
      title: 'Finalize successful run',
    });
    const updateRun = jest.fn().mockImplementation(async (_db, _runId, patch) => {
      updateRunCalls.push(patch);
      return { id: 'run-approve-resume-1', ...patch };
    });
    const updateRunStep = jest.fn().mockResolvedValue({});
    const appendRunEvent = jest.fn().mockResolvedValue(null);

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.tasks') && sql.includes('WHERE id = $1')) {
        if (params[0] === 'root-task-approve-resume-1') {
          return {
            rows: [{
              id: 'root-task-approve-resume-1',
              title: 'Release the approved result',
              workspace_id: 'ws-1',
              metadata: {
                origin: 'chat',
              },
            }],
          };
        }

        if (params[0] === 'child-task-approve-resume-1') {
          return {
            rows: [{
              id: 'child-task-approve-resume-1',
              status: 'completed',
              metadata: {
                result: 'Approved deliverable.',
              },
            }],
          };
        }
      }

      if (sql.startsWith('UPDATE tenant_vutler.tasks')) {
        taskUpdates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in approveRun test: ${sql}`);
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
      createRunStep,
      getCurrentRunStep,
      getRunById,
      heartbeatRunLease: jest.fn(),
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
    const pollSpy = jest.spyOn(engine, 'requestImmediatePoll').mockImplementation(() => {});

    const decision = await engine.approveRun('run-approve-resume-1', {
      approved: true,
      note: 'Ship it',
      actor: 'alex',
    });

    expect(updateRunStep).toHaveBeenCalledWith(expect.anything(), 'step-approval-resume-1', expect.objectContaining({
      status: 'completed',
      output: expect.objectContaining({
        approved: true,
        note: 'Ship it',
        actor: 'alex',
      }),
    }));
    expect(createRunStep).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      stepType: 'finalize',
      input: expect.objectContaining({
        delegated_task_id: 'child-task-approve-resume-1',
      }),
    }));
    expect(updateRunCalls).toContainEqual(expect.objectContaining({
      status: 'running',
      currentStepId: 'step-finalize-resume-1',
      nextWakeAt: expect.any(Date),
    }));
    expect(pollSpy).toHaveBeenCalledTimes(1);
    expect(taskUpdates.some((call) => {
      const payload = JSON.parse(call.params[0]);
      return payload.approval_granted === true && payload.orchestration_step_id === 'step-finalize-resume-1';
    })).toBe(true);
    expect(decision).toEqual(expect.objectContaining({
      approved: true,
      stepStatus: 'completed',
    }));

    pollSpy.mockRestore();
  });
});
