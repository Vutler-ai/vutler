'use strict';

const { EventEmitter } = require('events');

describe('llmRouter schedule tool', () => {
  let recordedBodies;
  let responses;
  let actionRuns;
  let handleScheduleToolMock;
  let chat;
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
    handleScheduleToolMock = jest.fn();

    jest.doMock('../services/scheduler', () => ({
      SCHEDULE_TOOL: {
        type: 'function',
        function: {
          name: 'vutler_create_schedule',
          description: 'Create a recurring schedule.',
          parameters: {
            type: 'object',
            properties: {
              cron: { type: 'string' },
              description: { type: 'string' },
              task_title: { type: 'string' },
              task_description: { type: 'string' },
            },
            required: ['cron', 'description', 'task_title', 'task_description'],
          },
        },
      },
      handleScheduleTool: handleScheduleToolMock,
    }));
    jest.doMock('../services/agentIntegrationService', () => ({
      resolveAgentRuntimeIntegrations: jest.fn().mockResolvedValue({
        enabledProviders: [],
        availableProviders: [],
        connectedProviders: [],
        connectedSocialPlatforms: [],
        derivedSkillKeys: [],
        hasSocialMediaAccess: false,
        hasSocialAccessOverrides: false,
      }),
      getSkillKeysForIntegrationProviders: jest.fn(() => []),
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
      isProviderAvailable: jest.fn(() => false),
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

  test('exposes and executes the schedule tool for workspace runs', async () => {
    handleScheduleToolMock.mockResolvedValue({
      schedule_id: 'sched-1',
      cron: '0 9 * * *',
      description: 'Every day at 9am',
      next_run_at: '2026-04-11T09:00:00.000Z',
      message: 'Schedule created.',
    });

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
                    name: 'vutler_create_schedule',
                    arguments: JSON.stringify({
                      cron: '0 9 * * *',
                      description: 'Every day at 9am',
                      task_title: 'Publish daily LinkedIn post',
                      task_description: 'Publish the next approved LinkedIn post.',
                    }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      buildStopResponse('Schedule ready.')
    );

    const result = await chat(
      {
        id: 'agent-1',
        username: 'max',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Max.',
      },
      [{ role: 'user', content: 'Schedule a daily LinkedIn post for the next days.' }],
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

    expect(result.content).toBe('Schedule ready.');
    expect(recordedBodies[0].tools.map((tool) => tool.function.name)).toContain('vutler_create_schedule');
    expect(handleScheduleToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        cron: '0 9 * * *',
        task_title: 'Publish daily LinkedIn post',
      }),
      expect.objectContaining({
        workspaceId: 'ws-1',
        agentId: 'max',
      })
    );
    expect(actionRuns[0]).toMatchObject({
      adapter: 'scheduler',
      status: 'success',
    });
    expect(actionRuns[0].output_json).toMatchObject({
      schedule_id: 'sched-1',
      description: 'Every day at 9am',
    });
    expect(recordedBodies[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          name: 'vutler_create_schedule',
          content: 'Schedule created.',
        }),
      ])
    );
  });
});
