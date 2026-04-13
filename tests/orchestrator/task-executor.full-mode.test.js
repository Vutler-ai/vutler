'use strict';

describe('taskExecutor FULL mode', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('queues a durable orchestration run instead of calling llmChat directly', async () => {
    const updates = [];
    const llmChat = jest.fn();
    const ensureRunForTask = jest.fn().mockResolvedValue({
      created: true,
      run: {
        id: 'run-1',
        status: 'queued',
        orchestrated_by: 'jarvis',
        requested_agent_id: 'agent-1',
        display_agent_id: 'agent-1',
      },
      step: {
        id: 'step-1',
      },
    });
    const preparePromptContext = jest.fn();
    const recordTaskEpisode = jest.fn();

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.agents')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Mike',
            username: 'mike',
            role: 'engineering',
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Mike.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
            capabilities: ['requirements_gathering'],
          }],
        };
      }

      if (sql.includes('UPDATE tenant_vutler.tasks')) {
        updates.push({ sql, params });
        return { rows: [{ id: params[2], status: params[0] }] };
      }

      throw new Error(`Unexpected SQL in FULL mode test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: [...(agent.capabilities || []), 'workspace_drive_write'],
          workspaceToolPolicy: {
            placementInstruction: 'The canonical Drive root is /projects/Starbox.',
          },
        })),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext,
        recordTaskEpisode,
      }),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      ensureRunForTask,
      isMissingOrchestrationSchemaError: jest.fn().mockReturnValue(false),
    }));

    const taskExecutor = require('../../app/custom/services/taskExecutor');

    await taskExecutor.executeTask({
      id: 'task-1',
      title: 'Implement orchestration run',
      description: 'Switch FULL workflow tasks to durable execution.',
      assigned_agent: 'mike',
      workspace_id: 'ws-1',
      metadata: {
        workflow_mode: 'FULL',
        origin: 'task',
      },
    });

    expect(ensureRunForTask).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      task: expect.objectContaining({ id: 'task-1' }),
      orchestratedBy: 'jarvis',
    }));
    expect(llmChat).not.toHaveBeenCalled();
    expect(preparePromptContext).not.toHaveBeenCalled();
    expect(recordTaskEpisode).not.toHaveBeenCalled();
    expect(updates).toHaveLength(1);
    expect(updates[0].params[0]).toBe('in_progress');
    expect(JSON.parse(updates[0].params[1])).toEqual(expect.objectContaining({
      execution_backend: 'orchestration_run',
      execution_mode: 'autonomous',
      workflow_mode: 'FULL',
      orchestration_run_id: 'run-1',
      orchestration_step_id: 'step-1',
      orchestration_status: 'queued',
      orchestrated_by: 'jarvis',
    }));
  });
});
