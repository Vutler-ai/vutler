'use strict';

const { EventEmitter } = require('events');

describe('llmRouter task resource artifacts', () => {
  let skillExecuteMock;
  let getSkillRegistryMock;
  let recordedBodies;
  let chat;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];

    skillExecuteMock = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'task-123',
        title: 'Launch brief',
        status: 'todo',
        taskUrl: '/tasks?task=task-123',
      },
    });

    getSkillRegistryMock = jest.fn(() => ({
      getSkillTools: () => [
        {
          type: 'function',
          function: {
            name: 'skill_task_management',
            description: 'Create or update a task',
            parameters: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                task: { type: 'object' },
              },
              required: ['action'],
            },
          },
        },
      ],
      execute: skillExecuteMock,
    }));

    const responses = [
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
                    name: 'skill_task_management',
                    arguments: JSON.stringify({ action: 'create', task: { title: 'Launch brief' } }),
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      JSON.stringify({
        id: 'chatcmpl-2',
        model: 'gpt-5.4',
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: 'Task created successfully.',
            },
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 6 },
      }),
    ];

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

          const nextResponse = responses.shift();
          process.nextTick(() => {
            res.emit('data', nextResponse);
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

    jest.doMock('../services/skills', () => ({
      getSkillRegistry: getSkillRegistryMock,
    }));

    process.env.OPENAI_API_KEY = 'test-openai-key';
    chat = require('../services/llmRouter').chat;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  test('appends a task link to the final assistant message', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        skills: ['task_management'],
        system_prompt: 'You manage work items.',
      },
      [{ role: 'user', content: 'Create a task for the launch brief.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) },
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

    expect(result.content).toContain('/tasks?task=task-123');
    expect(result.content).toContain('Liens utiles');
    expect(skillExecuteMock).toHaveBeenCalledWith(
      'task_management',
      expect.objectContaining({
        workspaceId: 'ws-1',
        agentId: 'agent-1',
        params: expect.objectContaining({ action: 'create' }),
      })
    );
    expect(recordedBodies).toHaveLength(2);
    expect(recordedBodies[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          name: 'skill_task_management',
          content: JSON.stringify({
            id: 'task-123',
            title: 'Launch brief',
            status: 'todo',
            taskUrl: '/tasks?task=task-123',
          }),
        }),
      ])
    );
  });
});
