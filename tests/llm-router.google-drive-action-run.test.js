'use strict';

const { EventEmitter } = require('events');

describe('llmRouter google drive action runs', () => {
  let recordedBodies;
  let chat;
  let actionRuns;
  let db;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];
    actionRuns = [];

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
                    name: 'skill_google_drive_read',
                    arguments: JSON.stringify({
                      fileId: 'gdrv-123',
                    }),
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
              content: 'Google Drive file loaded.',
            },
          },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 6 },
      }),
    ];

    const execute = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'gdrv-123',
        name: 'Brief.pdf',
        mimeType: 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/gdrv-123/view',
      },
    });

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
      getSkillRegistry: jest.fn(() => ({
        getSkillTools: () => [
          {
            type: 'function',
            function: {
              name: 'skill_google_drive_read',
              description: 'Read a file from Google Drive',
              parameters: {
                type: 'object',
                properties: {
                  fileId: { type: 'string' },
                },
                required: ['fileId'],
              },
            },
          },
        ],
        execute,
      })),
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
            output_json: params[2],
            error_json: params[3],
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

  test('records chat_action_runs for google drive read skills', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        skills: ['google_drive_read'],
        system_prompt: 'You can inspect drive files.',
      },
      [{ role: 'user', content: 'Open the latest brief from Google Drive.' }],
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

    expect(result.content).toContain('Google Drive file loaded.');
    expect(actionRuns[0]).toMatchObject({
      workspace_id: 'ws-1',
      chat_message_id: 'msg-1',
      channel_id: 'chan-1',
      action_key: 'google_drive_read',
      adapter: 'skill',
      status: 'success',
    });
    expect(JSON.parse(actionRuns[0].output_json)).toEqual({
      id: 'gdrv-123',
      name: 'Brief.pdf',
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/file/d/gdrv-123/view',
    });
    expect(recordedBodies[1].messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          name: 'skill_google_drive_read',
          content: JSON.stringify({
            id: 'gdrv-123',
            name: 'Brief.pdf',
            mimeType: 'application/pdf',
            webViewLink: 'https://drive.google.com/file/d/gdrv-123/view',
          }),
        }),
      ])
    );
  });
});
