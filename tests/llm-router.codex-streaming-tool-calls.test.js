'use strict';

const { EventEmitter } = require('events');

describe('llmRouter codex streaming responses', () => {
  let chat;
  let db;
  let actionRuns;
  let responses;

  beforeEach(() => {
    jest.resetModules();
    actionRuns = [];
    responses = [];
    jest.doMock('../services/orchestration/orchestrator', () => ({
      orchestrateToolCall: jest.fn(() => ({
        version: 'v1',
        workspace_id: 'ws-1',
        selected_agent_id: 'agent-1',
        selected_agent_reason: 'Current execution agent is authorized to execute this Nexus tool.',
        allowed_tools: ['send_email'],
        allowed_skills: [],
        actions: [{
          id: 'act_email_1',
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
              body: 'Bonjour',
            },
          },
          risk_level: 'medium',
        }],
        final_response_strategy: 'tool_then_agent',
        metadata: {
          trace_id: 'msg-1',
        },
      })),
    }));
    jest.doMock('../services/orchestration/policy', () => ({
      governOrchestrationDecision: jest.fn(() => ({
        allowed: true,
        decision: 'sync',
        reason: 'Allowed.',
        risk_level: 'medium',
      })),
    }));
    jest.doMock('../services/orchestration/actionRouter', () => ({
      executeOrchestrationDecision: jest.fn(),
    }));
    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
        planId: 'agents_pro',
        providerStates: {
          email: { effective: true },
        },
        availableProviders: ['email'],
        unavailableProviders: [],
      }),
      filterAvailableProviders: jest.fn((providers = []) => providers),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: jest.fn((skills = []) => skills),
      isProviderAvailable: jest.fn((_availability, provider) => provider === 'email'),
      inferProviderForSkill: jest.fn(() => null),
    }));
    jest.doMock('../services/nexusTools', () => ({
      getNexusToolsForWorkspace: jest.fn().mockResolvedValue([
        {
          name: 'send_email',
          description: 'Send an email from the workspace mailbox.',
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
      ]),
      getOnlineNexusNode: jest.fn().mockResolvedValue(null),
      getMailboxSourceOptionsForWorkspace: jest.fn().mockResolvedValue([]),
      getEmailSendSourceOptionsForWorkspace: jest.fn().mockResolvedValue([{ key: 'agent', label: 'Agent mailbox' }]),
      NEXUS_TOOL_NAMES: new Set(['send_email']),
      executeNexusTool: jest.fn().mockResolvedValue({
        success: true,
        data: {
          id: 'email-1',
          messageId: 'msg-email-1',
        },
      }),
    }));
    jest.doMock('../services/agentIntegrationService', () => ({
      getSkillKeysForIntegrationProviders: jest.fn(() => []),
      resolveAgentRuntimeIntegrations: jest.fn().mockResolvedValue({
        derivedSkillKeys: [],
        hasSocialMediaAccess: false,
        hasSocialAccessOverrides: false,
        connectedSocialPlatforms: [],
        allowedSocialPlatforms: [],
      }),
    }));
    jest.doMock('../services/skills', () => ({
      getSkillRegistry: jest.fn(() => ({
        getSkillTools: () => [],
      })),
    }));
    jest.doMock('../services/memory/runtime', () => ({
      createMemoryRuntimeService: jest.fn(() => ({
        persistMany: jest.fn().mockResolvedValue([]),
      })),
    }));
    jest.doMock('../services/memory/modeResolver', () => ({
      resolveMemoryMode: jest.fn().mockResolvedValue({
        mode: 'disabled',
        read: false,
        write: false,
        inject: false,
        source: 'test',
      }),
    }));
    jest.doMock('../services/agentProvisioningService', () => ({
      resolveAgentEmailProvisioning: jest.fn().mockResolvedValue({
        provisioned: true,
        email: 'jarvis@starbox-group.com',
        source: 'agent',
      }),
      filterProvisionedSkillKeys: jest.fn((skills = []) => skills),
      getProvisioningReasonForSkill: jest.fn(() => null),
      getUnavailableAgentProviders: jest.fn(() => []),
    }));

    const realHttps = jest.requireActual('https');
    jest.doMock('https', () => ({
      request: jest.fn((options, callback) => {
        const req = new EventEmitter();
        req.write = () => {};
        req.end = () => {
          const res = new EventEmitter();
          res.statusCode = 200;
          res.headers = { 'content-type': 'text/event-stream' };
          callback(res);

          const chunks = responses.shift() || [];
          process.nextTick(() => {
            for (const chunk of chunks) {
              res.emit('data', chunk);
            }
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
        if (sql.includes('FROM tenant_vutler.workspace_integrations')) {
          return {
            rows: [{
              access_token: 'chatgpt-oauth-token',
              refresh_token: 'refresh-token',
              token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            }],
          };
        }

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

    chat = require('../services/llmRouter').chat;
  });

  test('reconstructs streamed function calls and final text from Codex SSE events', async () => {
    responses.push(
      [
        'data: {"type":"response.output_item.added","output_index":0,"item":{"id":"fc_1","type":"function_call","call_id":"call-email-1","name":"send_email","arguments":""}}\n\n',
        'data: {"type":"response.function_call_arguments.delta","output_index":0,"item_id":"fc_1","delta":"{\\"to\\":\\"client@example.com\\",\\"subject\\":\\"Test\\",\\"body\\":\\"Bonjour\\"}"}\n\n',
        'data: {"type":"response.completed","response":{"id":"resp-tool-1","model":"gpt-5.4","status":"completed","usage":{"input_tokens":12,"output_tokens":7}}}\n\n',
        'data: [DONE]\n\n',
      ],
      [
        'data: {"type":"response.output_text.delta","output_index":0,"item_id":"msg_1","delta":"Email "}\n\n',
        'data: {"type":"response.output_text.delta","output_index":0,"item_id":"msg_1","delta":"sent."}\n\n',
        'data: {"type":"response.completed","response":{"id":"resp-final-1","model":"gpt-5.4","status":"completed","usage":{"input_tokens":8,"output_tokens":4}}}\n\n',
        'data: [DONE]\n\n',
      ]
    );

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        email: 'jarvis@starbox-group.com',
        provider: 'codex',
        model: 'codex/gpt-5.4',
        system_prompt: 'You are Jarvis.',
      },
      [{ role: 'user', content: 'Envoie un email de test à client@example.com.' }],
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

    expect(result.content).toBe('Email sent.');
    expect(actionRuns[0]).toMatchObject({
      action_key: 'send_email',
      adapter: 'nexus',
    });
    expect(['success', 'error']).toContain(actionRuns[0].status);
  });
});
