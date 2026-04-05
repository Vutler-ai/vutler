'use strict';

const { EventEmitter } = require('events');

describe('llmRouter nexus tool orchestration', () => {
  let recordedBodies;
  let chat;
  let nexusTools;
  let orchestrateToolCallMock;
  let governOrchestrationDecisionMock;
  let executeOrchestrationDecisionMock;
  let responses;
  let actionRuns;
  let db;
  let onlineNexusNode;

  function buildStopResponse(content = 'Done.') {
    return JSON.stringify({
      id: `chatcmpl-stop-${Date.now()}`,
      model: 'gpt-5.4',
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content,
          },
        },
      ],
      usage: { prompt_tokens: 8, completion_tokens: 6 },
    });
  }

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];
    responses = [];
    actionRuns = [];
    onlineNexusNode = { id: 'node-1' };
    nexusTools = [
      {
        name: 'search_files',
        description: 'Search files on the Nexus node',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
          },
          required: ['query'],
        },
      },
    ];

    orchestrateToolCallMock = jest.fn();
    governOrchestrationDecisionMock = jest.fn();
    executeOrchestrationDecisionMock = jest.fn();

    jest.doMock('../services/orchestration/orchestrator', () => ({
      orchestrateToolCall: orchestrateToolCallMock,
    }));
    jest.doMock('../services/orchestration/policy', () => ({
      governOrchestrationDecision: governOrchestrationDecisionMock,
    }));
    jest.doMock('../services/orchestration/actionRouter', () => ({
      executeOrchestrationDecision: executeOrchestrationDecisionMock,
    }));
    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
        planId: 'agents_pro',
        providerStates: {},
        availableProviders: [],
        unavailableProviders: [],
      }),
      filterAvailableProviders: jest.fn((providers = []) => providers),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: jest.fn((skills = []) => skills),
      isProviderAvailable: jest.fn(() => true),
      inferProviderForSkill: jest.fn(() => null),
    }));
    jest.doMock('../services/nexusTools', () => ({
      getNexusToolsForWorkspace: jest.fn().mockImplementation(async () => nexusTools),
      getOnlineNexusNode: jest.fn().mockImplementation(async () => onlineNexusNode),
      NEXUS_TOOL_NAMES: new Set(['search_files', 'send_email', 'draft_email', 'read_emails', 'read_contacts']),
    }));

    const realHttps = jest.requireActual('https');
    jest.doMock('https', () => ({
      request: jest.fn((options, callback) => {
        const req = new EventEmitter();
        let body = '';

        req.write = (chunk) => {
          body += chunk;
        };

        req.end = () => {
          recordedBodies.push(JSON.parse(body));

          const res = new EventEmitter();
          res.statusCode = 200;
          res.headers = { 'content-type': 'application/json' };
          callback(res);

          const payload = responses.shift() || buildStopResponse();
          process.nextTick(() => {
            res.emit('data', payload);
            res.emit('end');
          });
        };

        req.setTimeout = () => {};
        req.destroy = (err) => {
          if (err) req.emit('error', err);
        };

        return req;
      }),
      Agent: realHttps.Agent,
    }));

    db = {
      query: jest.fn(async (sql, params) => {
        if (sql.includes('INSERT INTO tenant_vutler.chat_action_runs')) {
          const row = {
            id: 'run-1',
            workspace_id: params[0],
            chat_message_id: params[1],
            channel_id: params[2],
            requested_agent_id: params[3],
            display_agent_id: params[4],
            orchestrated_by: params[5],
            executed_by: params[6],
            action_key: params[7],
            adapter: params[8],
            status: params[9],
          };
          actionRuns.push(row);
          return { rows: [row] };
        }

        if (sql.includes('UPDATE tenant_vutler.chat_action_runs')) {
          actionRuns[0] = {
            ...actionRuns[0],
            status: params[0],
            executed_by: params[1],
            output_json: params[2] ? JSON.parse(params[2]) : params[2],
            error_json: params[3] ? JSON.parse(params[3]) : params[3],
          };
          return { rows: [actionRuns[0]] };
        }

        return { rows: [] };
      }),
    };

    process.env.OPENAI_API_KEY = 'test-openai-key';
    chat = require('../services/llmRouter').chat;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  test('routes nexus tool execution through the orchestration pipeline', async () => {
    orchestrateToolCallMock.mockReturnValue({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'Current execution agent is authorized to execute this Nexus tool.',
      allowed_tools: ['search_files'],
      allowed_skills: [],
      actions: [
        {
          id: 'act_nexus_1',
          kind: 'tool',
          key: 'nexus_tool_exec',
          executor: 'nexus-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            tool_name: 'search_files',
            args: {
              query: 'brief',
            },
          },
          risk_level: 'medium',
        },
      ],
      final_response_strategy: 'tool_then_agent',
      metadata: {
        trace_id: 'msg-1',
        policy_bundle: 'nexus-default-v1',
      },
    });
    governOrchestrationDecisionMock.mockReturnValue({
      allowed: true,
      decision: 'sync',
      reason: 'Nexus execution allowed.',
      risk_level: 'medium',
      decisionPayload: {
        version: 'v1',
        workspace_id: 'ws-1',
        selected_agent_id: 'agent-1',
        selected_agent_reason: 'Current execution agent is authorized to execute this Nexus tool.',
        allowed_tools: ['search_files'],
        allowed_skills: [],
        actions: [
          {
            id: 'act_nexus_1',
            kind: 'tool',
            key: 'nexus_tool_exec',
            executor: 'nexus-executor',
            mode: 'sync',
            approval: 'none',
            params: {
              tool_name: 'search_files',
              args: {
                query: 'brief',
              },
            },
            risk_level: 'medium',
          },
        ],
        final_response_strategy: 'tool_then_agent',
        metadata: {
          trace_id: 'msg-1',
          policy_bundle: 'nexus-default-v1',
        },
      },
    });
    executeOrchestrationDecisionMock.mockResolvedValue([
      {
        action_id: 'act_nexus_1',
        success: true,
        status: 'completed',
        output_json: {
          matches: [{ path: '/tmp/brief.md' }],
        },
        error: null,
        artifacts: [],
      },
    ]);

    responses.push(
      JSON.stringify({
        id: 'chatcmpl-1',
        model: 'gpt-5.4',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'search_files',
                    arguments: JSON.stringify({ query: 'brief' }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      buildStopResponse('Search complete.')
    );

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are a filesystem assistant.',
      },
      [{ role: 'user', content: 'Find the brief on my machine.' }],
      db,
      {
        chatActionContext: {
          workspaceId: 'ws-1',
          messageId: 'msg-1',
          channelId: 'chan-1',
          requestedAgentId: 'agent-1',
          displayAgentId: 'agent-1',
          orchestratedBy: 'jarvis',
        },
        wsConnections: new Map([['node-1', { ws: { send: jest.fn() } }]]),
      }
    );

    expect(result.content).toContain('Search complete.');
    expect(recordedBodies[0].tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['search_files'])
    );
    expect(orchestrateToolCallMock).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'search_files',
      args: {
        query: 'brief',
      },
      adapter: 'nexus',
      agent: expect.objectContaining({ id: 'agent-1' }),
      workspaceId: 'ws-1',
      chatActionContext: expect.objectContaining({
        workspaceId: 'ws-1',
        messageId: 'msg-1',
      }),
      nexusNodeId: 'node-1',
      originTaskId: null,
    }));
    expect(executeOrchestrationDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 'v1',
        selected_agent_id: 'agent-1',
        actions: [
          expect.objectContaining({
            executor: 'nexus-executor',
            params: expect.objectContaining({
              tool_name: 'search_files',
            }),
          }),
        ],
      }),
      expect.objectContaining({
        nexusNodeId: 'node-1',
        chatActionContext: expect.objectContaining({
          workspaceId: 'ws-1',
        }),
      })
    );
    expect(actionRuns[0]).toMatchObject({
      workspace_id: 'ws-1',
      chat_message_id: 'msg-1',
      channel_id: 'chan-1',
      action_key: 'search_files',
      adapter: 'nexus',
      status: 'success',
    });
    expect(actionRuns[0].output_json?.orchestration).toMatchObject({
      decision: 'sync',
      governed_decision: expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'nexus-executor',
          }),
        ],
      }),
    });
  });

  test('prunes mail and contacts probes for direct send requests with an explicit recipient', async () => {
    nexusTools = [
      {
        name: 'send_email',
        description: 'Send immediately',
        input_schema: { type: 'object', properties: { to: { type: 'string' } } },
      },
      {
        name: 'draft_email',
        description: 'Draft an email',
        input_schema: { type: 'object', properties: { to: { type: 'string' } } },
      },
      {
        name: 'read_emails',
        description: 'Read emails',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'read_contacts',
        description: 'Read contacts',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        email: 'jarvis@starbox-group.com',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are an assistant.',
      },
      [{ role: 'user', content: 'Tu peux envoyer ça à client@example.com maintenant ?' }],
      db,
      {
        chatActionContext: {
          workspaceId: 'ws-1',
          messageId: 'msg-2',
          channelId: 'chan-1',
          requestedAgentId: 'agent-1',
          displayAgentId: 'agent-1',
          orchestratedBy: 'jarvis',
        },
      }
    );

    expect(result.content).toContain('Done.');
    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).toContain('send_email');
    expect(toolNames).not.toContain('draft_email');
    expect(toolNames).not.toContain('read_emails');
    expect(toolNames).not.toContain('read_contacts');
  });

  test('routes workspace-backed send_email tool calls even when no nexus node is online', async () => {
    onlineNexusNode = null;
    nexusTools = [
      {
        name: 'send_email',
        description: 'Send immediately',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string' },
            subject: { type: 'string' },
            body: { type: 'string' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    ];

    orchestrateToolCallMock.mockReturnValue({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'Current execution agent is authorized to execute this Nexus tool.',
      allowed_tools: ['send_email'],
      allowed_skills: [],
      actions: [
        {
          id: 'act_nexus_email_1',
          kind: 'tool',
          key: 'nexus_tool_exec',
          executor: 'nexus-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            tool_name: 'send_email',
            args: {
              to: 'client@example.com',
              subject: 'Test',
              body: 'Hello',
            },
          },
          risk_level: 'medium',
        },
      ],
      final_response_strategy: 'tool_then_agent',
      metadata: {
        trace_id: 'msg-4',
        policy_bundle: 'nexus-default-v1',
      },
    });
    governOrchestrationDecisionMock.mockReturnValue({
      allowed: true,
      decision: 'sync',
      reason: 'Workspace email execution allowed.',
      risk_level: 'medium',
      decisionPayload: {
        version: 'v1',
        workspace_id: 'ws-1',
        selected_agent_id: 'agent-1',
        selected_agent_reason: 'Current execution agent is authorized to execute this Nexus tool.',
        allowed_tools: ['send_email'],
        allowed_skills: [],
        actions: [
          {
            id: 'act_nexus_email_1',
            kind: 'tool',
            key: 'nexus_tool_exec',
            executor: 'nexus-executor',
            mode: 'sync',
            approval: 'none',
            params: {
              tool_name: 'send_email',
              args: {
                to: 'client@example.com',
                subject: 'Test',
                body: 'Hello',
              },
            },
            risk_level: 'medium',
          },
        ],
        final_response_strategy: 'tool_then_agent',
        metadata: {
          trace_id: 'msg-4',
          policy_bundle: 'nexus-default-v1',
        },
      },
    });
    executeOrchestrationDecisionMock.mockResolvedValue([
      {
        action_id: 'act_nexus_email_1',
        success: true,
        status: 'completed',
        output_json: {
          id: 'email-1',
          messageId: 'msg-email-1',
        },
        error: null,
        artifacts: [],
      },
    ]);

    responses.push(
      JSON.stringify({
        id: 'chatcmpl-email-1',
        model: 'gpt-5.4',
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call-email-1',
                  type: 'function',
                  function: {
                    name: 'send_email',
                    arguments: JSON.stringify({
                      to: 'client@example.com',
                      subject: 'Test',
                      body: 'Hello',
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 11, completion_tokens: 6 },
      }),
      buildStopResponse('Email sent.')
    );

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        email: 'jarvis@starbox-group.com',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are an assistant.',
      },
      [{ role: 'user', content: 'Envoie ça à client@example.com maintenant.' }],
      db,
      {
        chatActionContext: {
          workspaceId: 'ws-1',
          messageId: 'msg-4',
          channelId: 'chan-1',
          requestedAgentId: 'agent-1',
          displayAgentId: 'agent-1',
          orchestratedBy: 'jarvis',
        },
      }
    );

    expect(result.content).toContain('Email sent.');
    expect(orchestrateToolCallMock).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'send_email',
      adapter: 'nexus',
      nexusNodeId: null,
    }));
    expect(executeOrchestrationDecisionMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        nexusNodeId: null,
      })
    );
    expect(actionRuns[0]).toMatchObject({
      chat_message_id: 'msg-4',
      action_key: 'send_email',
      adapter: 'nexus',
      status: 'success',
    });
  });

  test('prunes mail and contacts probes even when direct send is unavailable', async () => {
    nexusTools = [
      {
        name: 'read_emails',
        description: 'Read emails',
        input_schema: { type: 'object', properties: {} },
      },
      {
        name: 'read_contacts',
        description: 'Read contacts',
        input_schema: { type: 'object', properties: {} },
      },
    ];

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are an assistant.',
      },
      [{ role: 'user', content: 'Envoie ça à client@example.com.' }],
      db,
      {
        chatActionContext: {
          workspaceId: 'ws-1',
          messageId: 'msg-3',
          channelId: 'chan-1',
          requestedAgentId: 'agent-1',
          displayAgentId: 'agent-1',
          orchestratedBy: 'jarvis',
        },
      }
    );

    expect(result.content).toContain('Done.');
    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).not.toContain('read_emails');
    expect(toolNames).not.toContain('read_contacts');
  });
});
