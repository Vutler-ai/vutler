'use strict';

const { EventEmitter } = require('events');

describe('llmRouter codex legacy tool normalization', () => {
  let recordedBodies;
  let chat;
  let db;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];

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
      executeNexusTool: jest.fn(),
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
          res.headers = { 'content-type': 'text/event-stream' };
          callback(res);

          process.nextTick(() => {
            res.emit('data', 'data: {"type":"response.completed","response":{"id":"resp-1","model":"gpt-5.4","status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"Ready."}]}],"usage":{"input_tokens":12,"output_tokens":4}}}\n\n');
            res.emit('data', 'data: [DONE]\n\n');
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
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.workspace_integrations')) {
          return {
            rows: [{
              access_token: 'chatgpt-oauth-token',
              refresh_token: 'refresh-token',
              token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            }],
          };
        }

        return { rows: [] };
      }),
    };

    chat = require('../services/llmRouter').chat;
  });

  test('converts legacy Nexus tool definitions before sending a Codex responses request', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'codex',
        model: 'codex/gpt-5.4',
        system_prompt: 'You are a filesystem assistant.',
      },
      [{ role: 'user', content: 'Check if the brief exists locally.' }],
      db,
      { wsConnections: new Map([['ws-1', { ws: { send: jest.fn() } }]]) }
    );

    expect(result.content).toBe('Ready.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].tools).toEqual(
      expect.arrayContaining([
        {
          type: 'function',
          name: 'search_files',
          description: 'Search files on the Nexus node',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
            required: ['query'],
          },
          strict: false,
        },
      ])
    );
    expect(recordedBodies[0].tools.every((tool) => tool.type === 'function')).toBe(true);
  });
});
