'use strict';

jest.mock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
jest.mock('../../services/orchestration/runBootstrap', () => ({
  bootstrapTaskRun: jest.fn(),
}));
jest.mock('../../services/orchestration/runStore', () => ({
  isMissingOrchestrationSchemaError: jest.fn().mockReturnValue(false),
}));

const { bootstrapTaskRun } = require('../../services/orchestration/runBootstrap');
const { SwarmCoordinator } = require('../../app/custom/services/swarmCoordinator');

describe('SwarmCoordinator queueRootOrchestrationRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates one FULL root task and seeds a durable run for chat work', async () => {
    const coordinator = new SwarmCoordinator({ apiUrl: null, apiKey: null, swarmId: null });
    coordinator.rememberDecisionIfAny = jest.fn().mockResolvedValue();
    coordinator.recallWorkspaceContext = jest.fn().mockResolvedValue('workspace context');
    coordinator.decomposeWithLLM = jest.fn().mockResolvedValue([
      { title: 'Investigate deployment', description: 'Audit the deploy path and blockers.', priority: 'high', agent: 'mike' },
      { title: 'Ship fix', description: 'Implement the runtime fix and verify it.', priority: 'medium', agent: 'mike' },
    ]);
    coordinator.updateSharedContext = jest.fn().mockResolvedValue();
    coordinator.maybeOverflowToNexus = jest.fn().mockResolvedValue(false);
    coordinator.createTask = jest.fn().mockResolvedValue({
      id: 'root-task-1',
      workspace_id: 'ws-7',
      assigned_agent: 'jarvis',
      metadata: {
        origin: 'chat',
        workflow_mode: 'FULL',
      },
    });
    bootstrapTaskRun.mockResolvedValue({
      run: {
        id: 'run-1',
        status: 'queued',
      },
      step: {
        id: 'step-1',
      },
      task: {
        id: 'root-task-1',
        status: 'in_progress',
      },
    });

    const message = {
      id: 'msg-1',
      channel_id: 'chan-1',
      sender_id: 'user-1',
      sender_name: 'User',
      workspace_id: 'ws-7',
      content: 'Investigate the deploy regression, fix it, and keep me posted in chat.',
      requested_agent_id: 'agent-jarvis',
    };
    const availableAgents = [
      { id: 'agent-jarvis', username: 'jarvis', name: 'Jarvis' },
      { id: 'agent-mike', username: 'mike', name: 'Mike' },
    ];

    const result = await coordinator.queueRootOrchestrationRun(message, availableAgents, 'ws-7', {
      requestedAgentId: 'agent-jarvis',
      displayAgentId: 'agent-jarvis',
      planningPreferredAgentId: 'mike',
    });

    expect(result).toMatchObject({
      routed: true,
      mode: 'root_run',
      root_task_id: 'root-task-1',
      orchestration_run_id: 'run-1',
      orchestration_step_id: 'step-1',
    });
    expect(coordinator.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        for_agent_id: 'jarvis',
        suppress_coordination: true,
        metadata: expect.objectContaining({
          origin: 'chat',
          origin_chat_channel_id: 'chan-1',
          origin_chat_message_id: 'msg-1',
          workflow_mode: 'FULL',
          execution_backend: 'orchestration_run',
          execution_mode: 'autonomous',
          orchestration_required: true,
          orchestration_entrypoint: 'chat',
          orchestration_phases: expect.arrayContaining([
            expect.objectContaining({
              key: 'phase_1',
              title: 'Investigate deployment',
              agent_username: 'mike',
            }),
            expect.objectContaining({
              key: 'phase_2',
              title: 'Ship fix',
              agent_username: 'mike',
            }),
          ]),
        }),
      }),
      'ws-7'
    );
    expect(bootstrapTaskRun).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ id: 'root-task-1' }),
      workspaceId: 'ws-7',
      orchestratedBy: 'jarvis',
      requestedAgent: expect.objectContaining({
        id: 'agent-jarvis',
        username: 'jarvis',
      }),
      taskStatus: 'in_progress',
      plan: expect.objectContaining({
        created_by: 'chat_runtime',
        phases: expect.arrayContaining([
          expect.objectContaining({ key: 'phase_1' }),
          expect.objectContaining({ key: 'phase_2' }),
        ]),
      }),
    }));
  });
});
