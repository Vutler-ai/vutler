'use strict';

const { EventEmitter } = require('events');

describe('llmRouter sandbox tool', () => {
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
    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
        planId: 'agents_pro',
        providerStates: {
          sandbox: { key: 'sandbox', available: true, reason: null },
        },
        availableProviders: ['sandbox'],
        unavailableProviders: [],
      }),
      filterAvailableProviders: jest.fn((providers = []) => providers),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: jest.fn((skills = []) => skills),
      isProviderAvailable: jest.fn(() => true),
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

  test('does not expose the sandbox tool when code execution is not enabled', async () => {
    responses.push(buildStopResponse('No execution needed.'));

    await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are a general assistant.',
      },
      [{ role: 'user', content: 'Say hello.' }],
      db
    );

    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).not.toContain('run_code_in_sandbox');
    expect(orchestrateToolCallMock).not.toHaveBeenCalled();
    expect(executeOrchestrationDecisionMock).not.toHaveBeenCalled();
  });

  test('executes the sandbox tool for agents with code_execution and reinjects the result', async () => {
    orchestrateToolCallMock.mockReturnValue({
      version: 'v1',
      workspace_id: 'ws-1',
      selected_agent_id: 'agent-1',
      selected_agent_reason: 'Current execution agent is authorized to fulfill this sandbox tool call.',
      allowed_tools: ['run_code_in_sandbox'],
      allowed_skills: [],
      actions: [
        {
          id: 'act_sandbox_1',
          kind: 'tool',
          key: 'sandbox_code_exec',
          executor: 'sandbox-worker',
          mode: 'sync',
          approval: 'none',
          timeout_ms: 15000,
          params: {
            language: 'python',
            code: 'print("hello")',
          },
          required_capabilities: ['code_execution'],
          risk_level: 'medium',
        },
      ],
      final_response_strategy: 'tool_then_agent',
      metadata: {
        trace_id: 'msg-1',
        policy_bundle: 'sandbox-default-v1',
      },
    });
    governOrchestrationDecisionMock.mockReturnValue({
      allowed: true,
      decision: 'sync',
      reason: 'Sandbox execution allowed.',
      risk_level: 'medium',
      decisionPayload: {
        version: 'v1',
        workspace_id: 'ws-1',
        selected_agent_id: 'agent-1',
        selected_agent_reason: 'Current execution agent is authorized to fulfill this sandbox tool call.',
        allowed_tools: ['run_code_in_sandbox'],
        allowed_skills: [],
        actions: [
          {
            id: 'act_sandbox_1',
            kind: 'tool',
            key: 'sandbox_code_exec',
            executor: 'sandbox-worker',
            mode: 'sync',
            approval: 'none',
            timeout_ms: 15000,
            params: {
              language: 'python',
              code: 'print("hello")',
            },
            required_capabilities: ['code_execution'],
            risk_level: 'medium',
          },
        ],
        final_response_strategy: 'tool_then_agent',
        metadata: {
          trace_id: 'msg-1',
          policy_bundle: 'sandbox-default-v1',
        },
      },
    });
    executeOrchestrationDecisionMock.mockResolvedValue([
      {
        action_id: 'act_sandbox_1',
        success: true,
        status: 'completed',
        output_json: {
          execution_id: 'exec-1',
          id: 'exec-1',
          language: 'python',
          stdout: 'hello\n',
          stderr: '',
          exit_code: 0,
          status: 'completed',
          duration_ms: 42,
        },
        error: null,
        artifacts: [],
        usage: { duration_ms: 42 },
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
                    name: 'run_code_in_sandbox',
                    arguments: JSON.stringify({
                      language: 'python',
                      code: 'print("hello")',
                      timeout_ms: 15000,
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      buildStopResponse('Sandbox complete.')
    );

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        capabilities: ['code_execution'],
        system_prompt: 'You are a technical agent.',
      },
      [{ role: 'user', content: 'Run a tiny Python check.' }],
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
      }
    );

    expect(result.content).toContain('Sandbox complete.');
    expect(recordedBodies[0].tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['run_code_in_sandbox'])
    );
    expect(orchestrateToolCallMock).toHaveBeenCalledWith(expect.objectContaining({
      toolName: 'run_code_in_sandbox',
      args: {
        language: 'python',
        code: 'print("hello")',
        timeout_ms: 15000,
      },
      adapter: 'sandbox',
      agent: expect.objectContaining({ id: 'agent-1' }),
      workspaceId: 'ws-1',
      chatActionContext: expect.objectContaining({
        workspaceId: 'ws-1',
        messageId: 'msg-1',
      }),
      nexusNodeId: null,
    }));
    expect(executeOrchestrationDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        version: 'v1',
        selected_agent_id: 'agent-1',
        actions: [
          expect.objectContaining({
            executor: 'sandbox-worker',
            timeout_ms: 15000,
            params: expect.objectContaining({
              language: 'python',
              code: 'print(\"hello\")',
            }),
          }),
        ],
      }),
      expect.objectContaining({
        chatActionContext: expect.objectContaining({
          workspaceId: 'ws-1',
        }),
      })
    );
    expect(actionRuns[0]).toMatchObject({
      workspace_id: 'ws-1',
      chat_message_id: 'msg-1',
      channel_id: 'chan-1',
      action_key: 'run_code_in_sandbox',
      adapter: 'sandbox',
      status: 'success',
    });

    const toolMessage = recordedBodies[1].messages.find(
      (message) => message.role === 'tool' && message.name === 'run_code_in_sandbox'
    );
    expect(toolMessage).toBeTruthy();
    expect(JSON.parse(toolMessage.content)).toEqual(expect.objectContaining({
      job_id: 'exec-1',
      execution_id: 'exec-1',
      language: 'python',
      status: 'completed',
      stdout: 'hello\n',
      stderr: '',
      exit_code: 0,
      duration_ms: 42,
    }));
    expect(actionRuns[0].output_json?.orchestration).toMatchObject({
      decision: 'sync',
      risk_level: 'medium',
      governed_decision: expect.objectContaining({
        selected_agent_id: 'agent-1',
        actions: [
          expect.objectContaining({
            executor: 'sandbox-worker',
            mode: 'sync',
          }),
        ],
      }),
    });
  });
});
