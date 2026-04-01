'use strict';

describe('taskExecutor execution context', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('uses swarm coordinator execution policy for direct LLM tasks', async () => {
    const updates = [];
    const preparePromptContext = jest.fn().mockResolvedValue({
      prompt: '## Agent Memory\n- [fact] Delivery standards apply.',
      stats: { runtime: 'task', selected: { total: 1, instance: 1, template: 0, global: 0 } },
    });
    const llmChat = jest.fn().mockResolvedValue({
      content: 'Task completed.',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      usage: { input_tokens: 12, output_tokens: 18 },
    });

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $2')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Mike',
            username: 'mike',
            role: 'engineer',
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

      if (sql.includes('FROM tenant_vutler.agents')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Mike',
            username: 'mike',
            role: 'engineer',
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

      if (sql.startsWith('UPDATE tenant_vutler.tasks SET')) {
        updates.push({ sql, params });
        return { rows: [{ id: params[0], status: params[1] }] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    const resolveAgentExecutionContext = jest.fn(async (agent, workspaceId) => ({
      ...agent,
      workspace_id: workspaceId,
      capabilities: ['requirements_gathering', 'workspace_drive_write'],
      workspaceToolPolicy: {
        placementInstruction: 'The canonical Drive root is /projects/Starbox.',
      },
    }));

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        resolveAgentExecutionContext,
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext,
        recordTaskEpisode: jest.fn().mockResolvedValue([]),
      }),
    }));

    const taskExecutor = require('../../app/custom/services/taskExecutor');

    await taskExecutor.executeTask({
      id: 'task-1',
      title: 'Prepare workspace note',
      description: 'Write and store a short workspace note.',
      assigned_agent: 'mike',
      workspace_id: 'ws-1',
      metadata: {},
    });

    expect(resolveAgentExecutionContext).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'mike' }),
      'ws-1'
    );
    expect(preparePromptContext).toHaveBeenCalledWith(expect.objectContaining({
      agent: expect.objectContaining({
        username: 'mike',
      }),
    }));
    expect(llmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-1',
        username: 'mike',
        capabilities: ['requirements_gathering', 'workspace_drive_write'],
        workspace_id: 'ws-1',
        system_prompt: expect.stringContaining('/projects/Starbox'),
      }),
      expect.any(Array),
      expect.anything(),
      expect.any(Object)
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].params[1]).toBe('completed');
  });
});
