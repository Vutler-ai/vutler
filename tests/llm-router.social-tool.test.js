'use strict';

const { EventEmitter } = require('events');

describe('llmRouter social tool orchestration', () => {
  let recordedBodies;
  let chat;
  let orchestrateToolCallMock;
  let governOrchestrationDecisionMock;
  let executeOrchestrationDecisionMock;
  let responses;
  let actionRuns;
  let db;

  function buildStopResponse(content = 'Final answer.') {
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
    jest.doMock('../services/agentIntegrationService', () => ({
      resolveAgentRuntimeIntegrations: jest.fn().mockResolvedValue({
        enabledProviders: ['social_media'],
        availableProviders: ['social_media', 'linkedin', 'twitter'],
        connectedProviders: ['social_media'],
        connectedSocialPlatforms: ['linkedin', 'twitter'],
        derivedSkillKeys: [],
        hasSocialMediaAccess: true,
        hasSocialAccessOverrides: false,
        allowedSocialPlatforms: ['linkedin', 'twitter'],
      }),
      getSkillKeysForIntegrationProviders: jest.fn(() => []),
    }));
    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
        planId: 'agents_pro',
        providerStates: {
          social_media: { key: 'social_media', available: true, reason: null },
        },
        availableProviders: ['social_media'],
        unavailableProviders: [],
      }),
      filterAvailableProviders: jest.fn((providers = []) => providers),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: jest.fn((skills = []) => skills),
      isProviderAvailable: jest.fn((snapshot, provider) => provider === 'social_media'),
      inferProviderForSkill: jest.fn(() => null),
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

  test('routes social posting through the orchestration pipeline', async () => {
    orchestrateToolCallMock.mockReturnValue({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'test',
      allowed_tools: ['vutler_post_social_media'],
      allowed_skills: [],
      actions: [
        {
          id: 'act_social_1',
          kind: 'tool',
          key: 'social_post',
          executor: 'social-executor',
          mode: 'sync',
          approval: 'none',
          params: {
            caption: 'Launch update',
            platforms: ['linkedin'],
            allowed_platforms: ['linkedin', 'twitter'],
            external_id: 'ws_ws-1',
          },
          risk_level: 'medium',
        },
      ],
      final_response_strategy: 'tool_then_agent',
      metadata: {
        trace_id: 'msg-1',
        policy_bundle: 'social-default-v1',
      },
    });
    governOrchestrationDecisionMock.mockReturnValue({
      allowed: true,
      decision: 'sync',
      reason: 'Social execution allowed.',
      risk_level: 'medium',
      decisionPayload: {
        version: 'v1',
        workspace_id: 'ws-1',
        selected_agent_id: 'agent-1',
        selected_agent_reason: 'test',
        allowed_tools: ['vutler_post_social_media'],
        allowed_skills: [],
        actions: [
          {
            id: 'act_social_1',
            kind: 'tool',
            key: 'social_post',
            executor: 'social-executor',
            mode: 'sync',
            approval: 'none',
            params: {
              caption: 'Launch update',
              platforms: ['linkedin'],
              allowed_platforms: ['linkedin', 'twitter'],
              external_id: 'ws_ws-1',
            },
            risk_level: 'medium',
          },
        ],
        final_response_strategy: 'tool_then_agent',
        metadata: {
          trace_id: 'msg-1',
          policy_bundle: 'social-default-v1',
          execution_mode: 'sync',
        },
      },
    });
    executeOrchestrationDecisionMock.mockResolvedValue([
      {
        action_id: 'act_social_1',
        success: true,
        status: 'completed',
        output_json: {
          account_count: 2,
          post_id: 'post-1',
          status: 'processing',
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
                    name: 'vutler_post_social_media',
                    arguments: JSON.stringify({
                      caption: 'Launch update',
                      platforms: ['linkedin'],
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      buildStopResponse('Post queued.')
    );

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Nora.',
        capabilities: ['multi_platform_posting'],
      },
      [{ role: 'user', content: 'Publish this launch update on LinkedIn.' }],
      db,
      {
        chatActionContext: {
          workspaceId: 'ws-1',
          messageId: 'msg-1',
          channelId: 'channel-1',
          requestedAgentId: 'agent-1',
          displayAgentId: 'agent-1',
          orchestratedBy: 'jarvis',
        },
      }
    );

    expect(result.content).toBe('Post queued.');
    expect(orchestrateToolCallMock).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'vutler_post_social_media',
      allowedSocialPlatforms: ['linkedin', 'twitter'],
    }));
    expect(executeOrchestrationDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: [
          expect.objectContaining({
            executor: 'social-executor',
          }),
        ],
      }),
      expect.objectContaining({
        chatActionRunId: 'run-1',
        model: 'gpt-5.4',
        provider: 'openai',
      })
    );
    expect(actionRuns[0].output_json?.orchestration).toMatchObject({
      orchestration_decision: expect.objectContaining({
        allowed_tools: ['vutler_post_social_media'],
      }),
      decision: 'sync',
      governed_decision: expect.objectContaining({
        actions: [
          expect.objectContaining({
            key: 'social_post',
          }),
        ],
      }),
      action_results: [
        expect.objectContaining({
          action_id: 'act_social_1',
          status: 'completed',
        }),
      ],
    });
    expect(recordedBodies[0].tools.map((tool) => tool.function.name)).toContain('vutler_post_social_media');
    expect(recordedBodies[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          name: 'vutler_post_social_media',
          content: expect.stringContaining('Post published successfully to 2 account(s).'),
        }),
      ])
    );
  });
});
