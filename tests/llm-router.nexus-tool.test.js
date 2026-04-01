'use strict';

const { EventEmitter } = require('events');

describe('llmRouter nexus tool orchestration', () => {
  let recordedBodies;
  let chat;
  let orchestrateToolCallMock;
  let governOrchestrationDecisionMock;
  let executeOrchestrationDecisionMock;
  let responses;
  let actionRuns;
  let db;

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
      getNexusToolsForWorkspace: jest.fn().mockResolvedValue([
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
      ]),
      getOnlineNexusNode: jest.fn().mockResolvedValue({ id: 'node-1' }),
      NEXUS_TOOL_NAMES: new Set(['search_files']),
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
    expect(orchestrateToolCallMock).toHaveBeenCalledWith({
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
    });
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
});
