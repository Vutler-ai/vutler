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
    const preparePromptContext = jest.fn().mockResolvedValue({
      prompt: '## Agent Memory\n- [fact] Team standards apply.',
      stats: { runtime: 'chat', selected: { total: 1, instance: 1, template: 0, global: 0 } },
    });
    const recordConversation = jest.fn().mockResolvedValue([]);
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

      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Jarvis',
            username: 'jarvis',
            role: 'coordinator',
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Jarvis.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
            capabilities: ['workspace_drive_write', 'workspace_drive_search'],
          }],
        };
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
        preparePromptContext,
        recordConversation,
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
        humanContext: {
          id: 'user-1',
          name: 'User',
        },
      })
    );
    expect(preparePromptContext).toHaveBeenCalledWith(expect.objectContaining({
      agent: expect.objectContaining({
        id: 'agent-1',
        username: 'jarvis',
      }),
      humanContext: {
        id: 'user-1',
        name: 'User',
      },
    }));

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
    expect(recordConversation).toHaveBeenCalledWith(expect.objectContaining({
      agent: expect.objectContaining({
        id: 'agent-1',
        username: 'jarvis',
      }),
    }));
  });

  test('bypasses swarm delegation for a direct email send in a single-agent DM when the facade agent has email', async () => {
    const inserts = [];
    const preparePromptContext = jest.fn().mockResolvedValue({
      prompt: '',
      stats: { runtime: 'chat', selected: { total: 0, instance: 0, template: 0, global: 0 } },
    });
    const recordConversation = jest.fn().mockResolvedValue([]);
    const llmChat = jest.fn().mockResolvedValue({
      content: 'Email sent.',
      provider: 'codex',
      model: 'gpt-5.4',
      usage: { input_tokens: 15, output_tokens: 6 },
    });
    const analyzeAndRoute = jest.fn().mockResolvedValue({ routed: false });

    const insertChatMessage = jest.fn(async (_pg, _app, _schema, payload) => {
      inserts.push(payload);
      return { id: 'reply-email-1', ...payload };
    });
    const messageState = {
      id: 'msg-email-1',
      channel_id: 'chan-email-1',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Envoie immédiatement un email à client@example.com. Sujet: Test. Corps: Bonjour.',
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

      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
        return {
          rows: [
            {
              id: 'agent-nora',
              name: 'Nora',
              username: 'nora',
              email: 'nora@starbox-group.com',
              role: 'support',
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Nora.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
              capabilities: ['email_outreach'],
            },
            {
              id: 'agent-jarvis',
              name: 'Jarvis',
              username: 'jarvis',
              email: 'jarvis@starbox-group.com',
              role: 'coordinator',
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Jarvis.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
              capabilities: [],
            },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_channel_members')) {
        return {
          rows: [{
            id: 'agent-nora',
            name: 'Nora',
            username: 'nora',
            email: 'nora@starbox-group.com',
            role: 'support',
            capabilities: ['email_outreach'],
            model: 'gpt-5.4',
            provider: 'codex',
            system_prompt: 'You are Nora.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
          }],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_messages') && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [{
            id: messageState.id,
            sender_id: messageState.sender_id,
            sender_name: messageState.sender_name,
            content: messageState.content,
            attachments: null,
          }],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute,
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: agent.capabilities || [],
        })),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: ['email'],
        overlayProviders: ['email'],
        overlaySkillKeys: ['email_outreach'],
        overlayToolCapabilities: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
      }),
    }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext,
        recordConversation,
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await chatRuntime.processMessage({
      id: 'msg-email-1',
      channel_id: 'chan-email-1',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Envoie immédiatement un email à client@example.com. Sujet: Test. Corps: Bonjour.',
    });

    expect(analyzeAndRoute).not.toHaveBeenCalled();
    expect(llmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-nora',
        email: 'nora@starbox-group.com',
        provider: 'codex',
        model: 'gpt-5.4',
        workspace_id: 'ws-1',
      }),
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({
        chatActionContext: expect.objectContaining({
          requestedAgentId: 'agent-nora',
          displayAgentId: 'agent-nora',
          orchestratedBy: 'jarvis',
        }),
      })
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      sender_id: 'agent-nora',
      sender_name: 'Nora',
      requested_agent_id: 'agent-nora',
      display_agent_id: 'agent-nora',
      orchestrated_by: 'jarvis',
      executed_by: 'agent-nora',
      reply_to_message_id: 'msg-email-1',
    });
  });

  test('bypasses swarm delegation for a direct email send when the requested agent is explicit and Jarvis is also in the channel', async () => {
    const inserts = [];
    const preparePromptContext = jest.fn().mockResolvedValue({
      prompt: '',
      stats: { runtime: 'chat', selected: { total: 0, instance: 0, template: 0, global: 0 } },
    });
    const recordConversation = jest.fn().mockResolvedValue([]);
    const llmChat = jest.fn().mockResolvedValue({
      content: 'Email sent by Nora.',
      provider: 'codex',
      model: 'gpt-5.4',
      usage: { input_tokens: 18, output_tokens: 7 },
    });
    const analyzeAndRoute = jest.fn().mockResolvedValue({ routed: false });

    const insertChatMessage = jest.fn(async (_pg, _app, _schema, payload) => {
      inserts.push(payload);
      return { id: 'reply-email-2', ...payload };
    });
    const messageState = {
      id: 'msg-email-2',
      channel_id: 'chan-email-2',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      requested_agent_id: 'agent-nora',
      content: 'Nora, envoie un email de test à alopez.nevicom@gmail.com. Sujet: Test email. Corps: Bonjour.',
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

      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
        return {
          rows: [
            {
              id: 'agent-nora',
              name: 'Nora',
              username: 'nora',
              email: 'nora@starbox-group.com',
              role: 'support',
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Nora.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
              capabilities: ['email_outreach'],
            },
            {
              id: 'agent-jarvis',
              name: 'Jarvis',
              username: 'jarvis',
              email: 'jarvis@starbox-group.com',
              role: 'coordinator',
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Jarvis.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
              capabilities: [],
            },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_channel_members')) {
        return {
          rows: [
            {
              id: 'agent-nora',
              name: 'Nora',
              username: 'nora',
              email: 'nora@starbox-group.com',
              role: 'support',
              capabilities: ['email_outreach'],
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Nora.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
            },
            {
              id: 'agent-jarvis',
              name: 'Jarvis',
              username: 'jarvis',
              email: 'jarvis@starbox-group.com',
              role: 'coordinator',
              capabilities: [],
              model: 'gpt-5.4',
              provider: 'codex',
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
          rows: [{
            id: messageState.id,
            sender_id: messageState.sender_id,
            sender_name: messageState.sender_name,
            content: messageState.content,
            attachments: null,
          }],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute,
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: agent.capabilities || [],
        })),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: ['email', 'technical'],
        overlayProviders: ['email', 'sandbox'],
        overlaySkillKeys: ['email_outreach'],
        overlayToolCapabilities: ['code_execution'],
        primaryDelegate: {
          domain: 'technical',
          agentId: 'agent-mike',
          agentRef: 'mike',
          reason: 'technical_specialist',
        },
        delegatedAgents: [],
        reasons: [],
      }),
    }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext,
        recordConversation,
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await chatRuntime.processMessage({
      id: 'msg-email-2',
      channel_id: 'chan-email-2',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      requested_agent_id: 'agent-nora',
      content: 'Nora, envoie un email de test à alopez.nevicom@gmail.com. Sujet: Test email. Corps: Bonjour.',
    });

    expect(analyzeAndRoute).not.toHaveBeenCalled();
    expect(llmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-nora',
        email: 'nora@starbox-group.com',
        provider: 'codex',
        model: 'gpt-5.4',
        workspace_id: 'ws-1',
      }),
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({
        chatActionContext: expect.objectContaining({
          requestedAgentId: 'agent-nora',
          displayAgentId: 'agent-nora',
          orchestratedBy: 'jarvis',
        }),
      })
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      sender_id: 'agent-nora',
      sender_name: 'Nora',
      requested_agent_id: 'agent-nora',
      display_agent_id: 'agent-nora',
      orchestrated_by: 'jarvis',
      executed_by: 'agent-nora',
      reply_to_message_id: 'msg-email-2',
    });
  });

  test('prefers the single non-Jarvis channel agent for a direct email send when Jarvis is only present as coordinator', async () => {
    const inserts = [];
    const preparePromptContext = jest.fn().mockResolvedValue({
      prompt: '',
      stats: { runtime: 'chat', selected: { total: 0, instance: 0, template: 0, global: 0 } },
    });
    const recordConversation = jest.fn().mockResolvedValue([]);
    const llmChat = jest.fn().mockResolvedValue({
      content: 'Email sent by Nora.',
      provider: 'codex',
      model: 'gpt-5.4',
      usage: { input_tokens: 19, output_tokens: 8 },
    });
    const analyzeAndRoute = jest.fn().mockResolvedValue({ routed: false });

    const insertChatMessage = jest.fn(async (_pg, _app, _schema, payload) => {
      inserts.push(payload);
      return { id: 'reply-email-3', ...payload };
    });
    const messageState = {
      id: 'msg-email-3',
      channel_id: 'chan-email-3',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Envoie un email de test à alopez.nevicom@gmail.com depuis Nora. Sujet: Test email. Corps: Bonjour.',
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

      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
        return {
          rows: [
            {
              id: 'agent-nora',
              name: 'Nora',
              username: 'nora',
              email: 'nora@starbox-group.com',
              role: 'support',
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Nora.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
              capabilities: ['email_outreach'],
            },
            {
              id: 'agent-jarvis',
              name: 'Jarvis',
              username: 'jarvis',
              email: 'jarvis@starbox-group.com',
              role: 'coordinator',
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Jarvis.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
              capabilities: [],
            },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_channel_members')) {
        return {
          rows: [
            {
              id: 'agent-jarvis',
              name: 'Jarvis',
              username: 'jarvis',
              email: 'jarvis@starbox-group.com',
              role: 'coordinator',
              capabilities: [],
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Jarvis.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
            },
            {
              id: 'agent-nora',
              name: 'Nora',
              username: 'nora',
              email: 'nora@starbox-group.com',
              role: 'support',
              capabilities: ['email_outreach'],
              model: 'gpt-5.4',
              provider: 'codex',
              system_prompt: 'You are Nora.',
              temperature: 0.2,
              max_tokens: 512,
              workspace_id: 'ws-1',
            },
          ],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_messages') && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [{
            id: messageState.id,
            sender_id: messageState.sender_id,
            sender_name: messageState.sender_name,
            content: messageState.content,
            attachments: null,
          }],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: llmChat }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute,
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: agent.capabilities || [],
        })),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: ['email'],
        overlayProviders: ['email'],
        overlaySkillKeys: ['email_outreach'],
        overlayToolCapabilities: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
      }),
    }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext,
        recordConversation,
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await chatRuntime.processMessage({
      id: 'msg-email-3',
      channel_id: 'chan-email-3',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: 'Envoie un email de test à alopez.nevicom@gmail.com depuis Nora. Sujet: Test email. Corps: Bonjour.',
    });

    expect(analyzeAndRoute).not.toHaveBeenCalled();
    expect(llmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-nora',
        email: 'nora@starbox-group.com',
        provider: 'codex',
        model: 'gpt-5.4',
        workspace_id: 'ws-1',
      }),
      expect.any(Array),
      expect.anything(),
      expect.objectContaining({
        chatActionContext: expect.objectContaining({
          requestedAgentId: 'agent-nora',
          displayAgentId: 'agent-nora',
          orchestratedBy: 'jarvis',
        }),
      })
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      sender_id: 'agent-nora',
      sender_name: 'Nora',
      requested_agent_id: 'agent-nora',
      display_agent_id: 'agent-nora',
      orchestrated_by: 'jarvis',
      executed_by: 'agent-nora',
      reply_to_message_id: 'msg-email-3',
    });
  });

  test('invalidates cached soul after remembering a conversation', async () => {
    const preparePromptContext = jest.fn().mockResolvedValue({
      prompt: '## Agent Memory\n- [fact] Team standards apply.',
      stats: { runtime: 'chat', selected: { total: 1, instance: 1, template: 0, global: 0 } },
    });
    const recordConversation = jest.fn().mockResolvedValue([]);
    let currentContent = 'Please remember that I prefer concise French replies for project updates.';

    const poolQuery = jest.fn(async (sql) => {
      if (sql.includes('FROM tenant_vutler.agents') && sql.includes('WHERE workspace_id = $1')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Jarvis',
            username: 'jarvis',
            role: 'coordinator',
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Jarvis.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
            capabilities: ['workspace_drive_write'],
          }],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_channel_members')) {
        return {
          rows: [{
            id: 'agent-1',
            name: 'Jarvis',
            username: 'jarvis',
            role: 'coordinator',
            capabilities: ['workspace_drive_write'],
            model: 'claude-sonnet-4',
            provider: 'anthropic',
            system_prompt: 'You are Jarvis.',
            temperature: 0.2,
            max_tokens: 512,
            workspace_id: 'ws-1',
          }],
        };
      }

      if (sql.includes('FROM tenant_vutler.chat_messages') && sql.includes('ORDER BY created_at DESC')) {
        return {
          rows: [{
            id: 'msg-history',
            sender_id: 'user-1',
            sender_name: 'User',
            content: currentContent,
          }],
        };
      }

      throw new Error(`Unexpected SQL in test: ${sql}`);
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({
      chat: jest.fn().mockResolvedValue({
        content: 'Noted, I will keep replies concise in French.',
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 12, output_tokens: 10 },
      }),
    }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute: jest.fn().mockResolvedValue({ routed: false }),
        resolveAgentExecutionContext: jest.fn(async (agent, workspaceId) => ({
          ...agent,
          workspace_id: workspaceId,
          capabilities: agent.capabilities || [],
        })),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({
      insertChatMessage: jest.fn(async () => ({ id: 'reply-1' })),
    }));
    jest.doMock('../../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
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
        preparePromptContext,
        recordConversation,
      }),
    }));

    const chatRuntime = require('../../app/custom/services/chatRuntime');

    await chatRuntime.processMessage({
      channel_id: 'chan-1',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: currentContent,
    });

    currentContent = 'Second request with the same preference, please answer in concise French again.';

    await chatRuntime.processMessage({
      channel_id: 'chan-1',
      workspace_id: 'ws-1',
      sender_id: 'user-1',
      sender_name: 'User',
      content: currentContent,
    });

    expect(preparePromptContext).toHaveBeenCalledTimes(2);
    expect(recordConversation).toHaveBeenCalledTimes(2);
  });
});
