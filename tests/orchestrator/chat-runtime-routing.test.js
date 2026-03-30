'use strict';

jest.mock('../../lib/vaultbrix', () => ({ query: jest.fn() }));

const { SwarmCoordinator } = require('../../app/custom/services/swarmCoordinator');

describe('SwarmCoordinator analyzeAndRoute', () => {
  test('creates chat-origin task metadata for routed work requests', async () => {
    const coordinator = new SwarmCoordinator({ apiUrl: null, apiKey: null, swarmId: null });
    coordinator.rememberDecisionIfAny = jest.fn().mockResolvedValue();
    coordinator.recallWorkspaceContext = jest.fn().mockResolvedValue('workspace context');
    coordinator.decomposeWithLLM = jest.fn().mockResolvedValue([
      { title: 'Fix deployment', description: 'Investigate the deploy path', priority: 'high', agent: 'mike' },
    ]);
    coordinator.updateSharedContext = jest.fn().mockResolvedValue();
    coordinator.maybeOverflowToNexus = jest.fn().mockResolvedValue(false);
    coordinator.createTask = jest.fn(async (task, workspaceId) => ({
      id: 'task-1',
      workspace_id: workspaceId,
      metadata: task.metadata,
    }));

    const message = {
      id: 'msg-1',
      channel_id: 'chan-1',
      sender_id: 'user-1',
      sender_name: 'User',
      workspace_id: 'ws-7',
      content: 'Create task: investigate the deploy path, fix the regression, and share the result in chat.',
    };

    const result = await coordinator.analyzeAndRoute(message, [{ username: 'mike', name: 'Mike' }], 'ws-7');

    expect(result).toMatchObject({ routed: true, created_count: 1 });
    expect(coordinator.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Fix deployment',
        metadata: expect.objectContaining({
          origin: 'chat',
          origin_chat_channel_id: 'chan-1',
          origin_chat_message_id: 'msg-1',
          origin_chat_user_id: 'user-1',
          origin_chat_user_name: 'User',
          workspace_id: 'ws-7',
        }),
      }),
      'ws-7'
    );
  });
});
