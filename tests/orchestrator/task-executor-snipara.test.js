'use strict';

describe('taskExecutor Snipara sync', () => {
  let logSpy;

  beforeEach(() => {
    jest.resetModules();
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('claims then completes snipara-backed tasks before final local completion', async () => {
    const writes = [];
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FROM tenant_vutler.agents')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Mike',
            username: 'mike',
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Mike.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
          }],
        };
      }

      if (sql.includes('UPDATE tenant_vutler.tasks SET')) {
        writes.push({ sql, params });
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.chat_messages')) {
        return {
          rows: [{
            id: 'chat-result-1',
            channel_id: params[0],
            sender_id: params[1],
            sender_name: params[2],
            content: params[3],
            message_type: 'text',
            workspace_id: params[5],
            created_at: new Date().toISOString(),
            reply_to_message_id: params[params.length - 1] || null,
          }],
        };
      }

      return { rows: [] };
    });

    const llmChat = jest.fn().mockResolvedValue({
      content: 'Task completed output.',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
    });
    const claimTask = jest.fn().mockResolvedValue({ ok: true });
    const completeTask = jest.fn().mockResolvedValue({ ok: true });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({ claimTask, completeTask }),
    }));
    jest.doMock('../../api/ws-chat', () => ({ publishMessage: jest.fn() }));

    const taskExecutor = require('../../app/custom/services/taskExecutor');

    await taskExecutor.executeTask({
      id: 'task-1',
      title: 'Investigate regression',
      description: 'Find the issue and return the fix plan.',
      status: 'in_progress',
      assignee: 'mike',
      assigned_agent: 'mike',
      workspace_id: 'ws-1',
      snipara_task_id: 'snip-1',
      metadata: {
        origin: 'chat',
        origin_chat_channel_id: 'chan-1',
        origin_chat_message_id: 'msg-1',
      },
    });

    expect(claimTask).toHaveBeenCalledWith('snip-1', 'mike', 'ws-1');
    expect(completeTask).toHaveBeenCalledWith('snip-1', 'mike', 'Task completed output.', 'ws-1');
    expect(llmChat).toHaveBeenCalledTimes(1);
    expect(writes.some((call) => String(call.params[1]) === 'completed')).toBe(true);
    expect(claimTask.mock.invocationCallOrder[0]).toBeLessThan(completeTask.mock.invocationCallOrder[0]);
  });
});
