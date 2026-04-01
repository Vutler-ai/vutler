'use strict';

const { EventEmitter } = require('events');

describe('llmRouter memory modes', () => {
  let recordedBodies;
  let chat;
  let recallMock;
  let rememberForAgentMock;
  let resolveMemoryModeMock;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];
    process.env.OPENAI_API_KEY = 'test-openai-key';

    recallMock = jest.fn().mockResolvedValue({
      memories: [{ text: 'User prefers concise answers in French.' }],
    });
    rememberForAgentMock = jest.fn().mockResolvedValue({ success: true });
    resolveMemoryModeMock = jest.fn().mockResolvedValue({
      mode: 'active',
      read: true,
      write: true,
      inject: true,
      source: 'test',
    });

    jest.doMock('../services/memory/modeResolver', () => ({
      resolveMemoryMode: resolveMemoryModeMock,
    }));

    jest.doMock('../services/snipara/gateway', () => ({
      createSniparaGateway: jest.fn(() => ({
        memory: {
          recall: recallMock,
          rememberForAgent: rememberForAgentMock,
        },
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
          if (toolNames.includes('recall') && recordedBodies.length === 1) {
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
                          name: 'recall',
                          arguments: JSON.stringify({ query: 'language preference' }),
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
                    content: 'Final answer.',
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

  test('active mode exposes remember and recall, then executes recall tool calls', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        username: 'mike',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Mike.',
      },
      [{ role: 'user', content: 'What language should you use?' }],
      { query: jest.fn(async () => ({ rows: [] })) }
    );

    expect(result.content).toBe('Final answer.');
    expect(resolveMemoryModeMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      agent: expect.objectContaining({ username: 'mike' }),
    }));
    expect(recordedBodies[0].tools.map((tool) => tool.function.name)).toEqual(
      expect.arrayContaining(['remember', 'recall'])
    );
    expect(recallMock).toHaveBeenCalledWith(expect.objectContaining({
      query: 'language preference',
      agentId: 'agent-1',
    }));
    expect(recordedBodies[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          name: 'recall',
          content: expect.stringContaining('concise answers in French'),
        }),
      ])
    );
  });

  test('passive mode exposes remember only', async () => {
    resolveMemoryModeMock.mockResolvedValue({
      mode: 'passive',
      read: false,
      write: true,
      inject: false,
      source: 'test',
    });

    await chat(
      {
        id: 'agent-1',
        username: 'mike',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Mike.',
      },
      [{ role: 'user', content: 'Remember that I prefer French.' }],
      { query: jest.fn(async () => ({ rows: [] })) }
    );

    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).toEqual(expect.arrayContaining(['remember']));
  });

  test('disabled mode exposes no memory tools', async () => {
    resolveMemoryModeMock.mockResolvedValue({
      mode: 'disabled',
      read: false,
      write: false,
      inject: false,
      source: 'test',
    });

    await chat(
      {
        id: 'agent-1',
        username: 'mike',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Mike.',
      },
      [{ role: 'user', content: 'Hello.' }],
      { query: jest.fn(async () => ({ rows: [] })) }
    );

    const memoryToolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name).filter((name) => name?.includes('remember'));
    expect(memoryToolNames).toEqual([]);
  });
});
