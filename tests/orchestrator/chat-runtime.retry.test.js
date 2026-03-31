'use strict';

describe('chatRuntime retry flow', () => {
  let warnSpy;

  beforeEach(() => {
    jest.resetModules();
    process.env.SNIPARA_API_KEY = '';
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('marks a message failed and processes it on retry', async () => {
    const state = {
      message: {
        id: 'msg-1',
        channel_id: 'chan-1',
        workspace_id: 'ws-1',
        sender_id: 'user-1',
        sender_name: 'User',
        content: 'Please create the deployment plan and document it clearly.',
        processing_state: 'pending',
        processing_attempts: 0,
        next_retry_at: new Date(Date.now() - 1000),
      },
      inserts: [],
    };

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes("SET processing_state = 'processing'")) {
        if (!['pending', 'failed'].includes(state.message.processing_state)) return { rows: [] };
        if (state.message.next_retry_at && state.message.next_retry_at > new Date()) return { rows: [] };
        state.message.processing_state = 'processing';
        state.message.processing_attempts += 1;
        return { rows: [{ ...state.message }] };
      }

      if (sql.includes("SET processing_state = 'failed'")) {
        state.message.processing_state = 'failed';
        state.message.next_retry_at = params[3];
        return { rows: [] };
      }

      if (sql.includes("SET processing_state = 'processed'")) {
        state.message.processing_state = 'processed';
        state.message.next_retry_at = null;
        return { rows: [] };
      }

      if (sql.includes(`FROM tenant_vutler.chat_channel_members`)) {
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

      if (sql.includes(`FROM tenant_vutler.chat_messages`) && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [{
            id: state.message.id,
            sender_id: state.message.sender_id,
            sender_name: state.message.sender_name,
            content: state.message.content,
          }],
        };
      }

      if (sql.includes(`INSERT INTO tenant_vutler.chat_messages`)) {
        state.inserts.push({ sql, params });
        return {
          rows: [{
            id: `reply-${state.inserts.length}`,
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

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    const llmChat = jest.fn()
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockResolvedValueOnce({
        content: 'Deployment plan ready.',
        model: 'claude-sonnet-4',
        provider: 'anthropic',
      });

    const analyzeAndRoute = jest.fn().mockResolvedValue({ routed: false });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute,
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: agent.capabilities || [],
          workspaceToolPolicy: {
            placementInstruction: 'The canonical Drive root is /projects/Vutler.',
          },
        })),
      }),
    }));
    jest.doMock('../../api/ws-chat', () => ({ publishMessage: jest.fn() }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext: jest.fn().mockResolvedValue({
          prompt: '## Agent Memory\n- [fact] Deployment preferences remembered.',
          stats: { runtime: 'chat', selected: { total: 1, instance: 1, template: 0, global: 0 } },
        }),
        recordConversation: jest.fn().mockResolvedValue([]),
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await expect(chatRuntime.processMessageById('msg-1', 'ws-1')).rejects.toThrow('upstream timeout');
    expect(state.message.processing_state).toBe('failed');

    state.message.next_retry_at = new Date(Date.now() - 1000);

    await expect(chatRuntime.processMessageById('msg-1', 'ws-1')).resolves.toEqual({ ok: true });
    expect(state.message.processing_state).toBe('processed');
    expect(llmChat).toHaveBeenCalledTimes(2);
    expect(state.inserts).toHaveLength(1);
    expect(analyzeAndRoute).not.toHaveBeenCalled();
  });
});
