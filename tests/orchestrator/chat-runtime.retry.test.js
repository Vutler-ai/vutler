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

      if (sql.includes("CASE WHEN $5 THEN 'processed' ELSE 'failed' END")) {
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

      if (sql.includes(`FROM tenant_vutler.agents`) && sql.includes('WHERE workspace_id = $1')) {
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
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: [],
        overlayProviders: [],
        overlaySkillKeys: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
      }),
    }));
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

  test('falls back when chat_messages.attachments column is missing', async () => {
    const state = {
      message: {
        id: 'msg-attachments',
        channel_id: 'chan-attachments',
        workspace_id: 'ws-1',
        sender_id: 'user-1',
        sender_name: 'User',
        content: 'Andrea, answer this legal message.',
        processing_state: 'pending',
        processing_attempts: 0,
        next_retry_at: new Date(Date.now() - 1000),
      },
      inserts: [],
      attachmentsSelectAttempts: 0,
    };

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes("SET processing_state = 'processing'")) {
        state.message.processing_state = 'processing';
        state.message.processing_attempts += 1;
        return { rows: [{ ...state.message }] };
      }

      if (sql.includes("SET processing_state = 'processed'")) {
        state.message.processing_state = 'processed';
        return { rows: [] };
      }

      if (sql.includes(`FROM tenant_vutler.chat_channel_members`)) {
        return {
          rows: [{
            id: 'agent-legal',
            name: 'Andrea',
            username: 'andrea',
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Andrea.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
          }],
        };
      }

      if (sql.includes(`FROM tenant_vutler.agents`) && sql.includes('WHERE workspace_id = $1')) {
        return {
          rows: [{
            id: 'agent-legal',
            name: 'Andrea',
            username: 'andrea',
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Andrea.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
          }],
        };
      }

      if (sql.includes('SELECT id, sender_id, sender_name, content, attachments')) {
        state.attachmentsSelectAttempts += 1;
        const err = new Error('column "attachments" does not exist');
        err.code = '42703';
        throw err;
      }

      if (sql.includes('NULL::jsonb AS attachments')) {
        return {
          rows: [{
            id: state.message.id,
            sender_id: state.message.sender_id,
            sender_name: state.message.sender_name,
            content: state.message.content,
            attachments: null,
          }],
        };
      }

      if (sql.includes(`INSERT INTO tenant_vutler.chat_messages`)) {
        state.inserts.push({ sql, params });
        return {
          rows: [{
            id: 'reply-attachments',
            channel_id: params[0],
            sender_id: params[1],
            sender_name: params[2],
            content: params[3],
            message_type: 'text',
            workspace_id: params[5],
            created_at: new Date().toISOString(),
          }],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    const llmChat = jest.fn().mockResolvedValue({
      content: 'Draft ready.',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
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
          workspaceToolPolicy: null,
        })),
      }),
    }));
    jest.doMock('../../api/ws-chat', () => ({ publishMessage: jest.fn() }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: [],
        overlayProviders: [],
        overlaySkillKeys: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
      }),
    }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext: jest.fn().mockResolvedValue({ prompt: '', stats: null }),
        recordConversation: jest.fn().mockResolvedValue([]),
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await expect(chatRuntime.processMessageById('msg-attachments', 'ws-1')).resolves.toEqual({ ok: true });
    expect(state.message.processing_state).toBe('processed');
    expect(state.attachmentsSelectAttempts).toBe(1);
    expect(state.inserts).toHaveLength(1);
    expect(llmChat).toHaveBeenCalledTimes(1);
  });

  test('terminal failures leave the message out of retry state after max attempts', async () => {
    const updates = [];

    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes("CASE WHEN $5 THEN 'processed' ELSE 'failed' END")) {
        updates.push({ sql, params });
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute: jest.fn(),
        resolveAgentExecutionContext: jest.fn(),
      }),
    }));
    jest.doMock('../../api/ws-chat', () => ({ publishMessage: jest.fn() }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: [],
        overlayProviders: [],
        overlaySkillKeys: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
      }),
    }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext: jest.fn().mockResolvedValue({ prompt: '', stats: null }),
        recordConversation: jest.fn().mockResolvedValue([]),
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    const failure = await chatRuntime._test.markFailed({
      id: 'msg-terminal',
      workspace_id: 'ws-1',
      processing_attempts: 5,
    }, new Error('column "attachments" does not exist'));

    expect(failure).toEqual({
      terminal: true,
      attempts: 5,
      error: 'column "attachments" does not exist',
    });
    expect(updates).toHaveLength(1);
    expect(updates[0].params[3]).toBeNull();
    expect(updates[0].params[4]).toBe(true);
  });
});
