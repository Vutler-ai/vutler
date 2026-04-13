'use strict';

const { EventEmitter } = require('events');

describe('llmRouter swarm backlog tools', () => {
  let recordedBodies;
  let chat;
  let resolveMemoryModeMock;
  let sniparaCallMock;
  let resolveConfigMock;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];
    process.env.OPENAI_API_KEY = 'test-openai-key';

    resolveMemoryModeMock = jest.fn().mockResolvedValue({
      mode: 'disabled',
      read: false,
      write: false,
      inject: false,
      source: 'test',
    });
    sniparaCallMock = jest.fn(async (toolName, args) => {
      if (toolName === 'rlm_tasks') {
        return {
          tasks: [
            {
              id: 'task-1',
              title: 'Social publish: Vutler launch',
              description: 'Publish the next launch post',
              status: 'pending',
              assigned_to: 'max',
              priority: 80,
            },
            {
              id: 'task-2',
              title: 'Follow-up analytics',
              description: 'Check engagement after publish',
              status: 'done',
              assigned_to: 'max',
              priority: 40,
            },
          ],
        };
      }
      if (toolName === 'rlm_swarm_events') {
        return {
          events: [
            {
              id: 'evt-1',
              type: 'task.created',
              task_id: 'task-1',
              agent_id: 'max',
              message: 'Task created',
              timestamp: '2026-04-13T11:00:00.000Z',
            },
          ],
        };
      }
      return {};
    });
    resolveConfigMock = jest.fn().mockResolvedValue({
      configured: true,
      swarmId: 'swarm-1',
    });

    jest.doMock('../services/memory/modeResolver', () => ({
      resolveMemoryMode: resolveMemoryModeMock,
    }));

    jest.doMock('../services/snipara/gateway', () => ({
      createSniparaGateway: jest.fn(() => ({
        resolveConfig: resolveConfigMock,
        call: sniparaCallMock,
      })),
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

          const toolNames = Array.isArray(recordedBodies[recordedBodies.length - 1]?.tools)
            ? recordedBodies[recordedBodies.length - 1].tools.map((tool) => tool.function?.name)
            : [];

          let payload;
          if (toolNames.includes('vutler_list_swarm_tasks') && recordedBodies.length === 1) {
            payload = JSON.stringify({
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
                          name: 'vutler_list_swarm_tasks',
                          arguments: JSON.stringify({
                            status: ['pending'],
                            agent_id: 'max',
                            query: 'social',
                            limit: 5,
                          }),
                        },
                      },
                    ],
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            });
          } else {
            payload = JSON.stringify({
              id: `chatcmpl-${recordedBodies.length + 1}`,
              model: 'gpt-5.4',
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    content: 'Checked the swarm backlog.',
                  },
                },
              ],
              usage: { prompt_tokens: 8, completion_tokens: 6 },
            });
          }

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

    chat = require('../services/llmRouter').chat;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  test('exposes and executes swarm backlog tools when Snipara swarm config is available', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        username: 'max',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Max.',
      },
      [{ role: 'user', content: 'Check whether a social post is already queued.' }],
      { query: jest.fn(async () => ({ rows: [] })) }
    );

    expect(result.content).toBe('Checked the swarm backlog.');
    expect(resolveConfigMock).toHaveBeenCalled();
    expect(recordedBodies[0].tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['vutler_list_swarm_tasks', 'vutler_list_swarm_events'])
    );
    expect(sniparaCallMock).toHaveBeenCalledWith('rlm_tasks', { swarm_id: 'swarm-1' });
    expect(recordedBodies[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          name: 'vutler_list_swarm_tasks',
          content: expect.stringContaining('Social publish: Vutler launch'),
        }),
      ])
    );
  });
});
