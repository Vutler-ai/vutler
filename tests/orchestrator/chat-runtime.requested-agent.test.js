'use strict';

describe('chatRuntime requested agent resolution', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SNIPARA_API_KEY = '';
  });

  afterEach(() => {
    delete process.env.SNIPARA_API_KEY;
  });

  test('falls back to Jarvis deterministically and persists orchestration metadata', async () => {
    const inserts = [];
    const llmChat = jest.fn().mockResolvedValue({
      content: 'Jarvis handled it.',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      usage: { input_tokens: 11, output_tokens: 7 },
    });

    const insertChatMessage = jest.fn(async (_pg, _app, _schema, payload) => {
      inserts.push(payload);
      return {
        id: 'reply-1',
        channel_id: payload.channel_id,
        sender_id: payload.sender_id,
        sender_name: payload.sender_name,
        content: payload.content,
        reply_to_message_id: payload.reply_to_message_id || null,
        requested_agent_id: payload.requested_agent_id || null,
        display_agent_id: payload.display_agent_id || null,
        orchestrated_by: payload.orchestrated_by || null,
        executed_by: payload.executed_by || null,
        metadata: payload.metadata || null,
        created_at: new Date().toISOString(),
      };
    });

    const messageState = {
      id: 'msg-1',
      channel_id: 'chan-1',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Who should handle this?',
      processed_at: null,
    };

    const poolQuery = jest.fn(async (sql) => {
      if (sql.includes('SET processed_at = NOW()') && sql.includes('RETURNING *')) {
        if (messageState.processed_at) return { rows: [] };
        messageState.processed_at = new Date();
        return { rows: [{ ...messageState }] };
      }

      if (sql.includes('UPDATE tenant_vutler.chat_messages SET processed_at = NOW() WHERE id = $1 AND workspace_id = $2')) {
        messageState.processed_at = new Date();
        return { rows: [] };
      }

      if (sql.includes('FROM tenant_vutler.chat_channel_members')) {
        return {
          rows: [
            {
              id: 'agent-2',
              name: 'Mike',
              username: 'mike',
              role: 'engineer',
              capabilities: ['requirements_gathering'],
              model: 'claude-sonnet-4',
              provider: 'anthropic',
              system_prompt: 'You are Mike.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
            },
            {
              id: 'agent-1',
              name: 'Jarvis',
              username: 'jarvis',
              role: 'coordinator',
              capabilities: ['workspace_drive_write', 'workspace_drive_search'],
              model: 'claude-sonnet-4',
              provider: 'anthropic',
              system_prompt: 'You are Jarvis.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
            },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_messages') && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [
            {
              id: messageState.id,
              sender_id: messageState.sender_id,
              sender_name: messageState.sender_name,
              content: messageState.content,
            },
          ],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute: jest.fn().mockResolvedValue({ routed: false }),
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: agent.capabilities || [],
          workspaceToolPolicy: {
            placementInstruction: 'The canonical Drive root is /projects/Starbox.',
          },
        })),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext: jest.fn().mockResolvedValue({
          prompt: '## Agent Memory\n- [fact] Team standards apply.',
          stats: { runtime: 'chat', selected: { total: 1, instance: 1, template: 0, global: 0 } },
        }),
        recordConversation: jest.fn().mockResolvedValue([]),
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await chatRuntime.processMessage({
      id: 'msg-1',
      channel_id: 'chan-1',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Who should handle this?',
    });

    expect(llmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-1',
        model: 'claude-sonnet-4',
        provider: 'anthropic',
        capabilities: ['workspace_drive_write', 'workspace_drive_search'],
        workspace_id: 'ws-1',
        system_prompt: expect.stringContaining('/projects/Starbox'),
      }),
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({
        chatActionContext: expect.objectContaining({
          workspaceId: 'ws-1',
          messageId: 'msg-1',
          channelId: 'chan-1',
          requestedAgentId: 'agent-1',
          displayAgentId: 'agent-1',
          orchestratedBy: 'jarvis',
        }),
      })
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      sender_id: 'agent-1',
      sender_name: 'Jarvis',
      requested_agent_id: 'agent-1',
      display_agent_id: 'agent-1',
      orchestrated_by: 'jarvis',
      executed_by: 'agent-1',
      reply_to_message_id: 'msg-1',
    });
    expect(inserts[0].metadata).toMatchObject({
      orchestration_status: 'completed',
      requested_agent_username: 'jarvis',
      requested_agent_reason: 'jarvis_fallback',
      llm_provider: 'anthropic',
      llm_model: 'claude-sonnet-4-20250514',
    });
  });
});
