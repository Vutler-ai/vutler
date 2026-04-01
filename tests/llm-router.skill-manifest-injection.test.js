'use strict';

const { EventEmitter } = require('events');

describe('llmRouter manifest-backed skill tool injection', () => {
  let recordedBodies;
  let chat;
  let filterAvailableSkillKeysMock;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];
    filterAvailableSkillKeysMock = jest.fn((skills = []) => skills);

    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../services/s3Storage', () => ({
      listFiles: jest.fn().mockResolvedValue([]),
      uploadFile: jest.fn().mockResolvedValue(''),
      downloadFile: jest.fn().mockResolvedValue({ buffer: Buffer.from(''), contentType: 'text/plain' }),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    }));
    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
        planId: 'agents_pro',
        providerStates: {
          workspace_drive: { key: 'workspace_drive', available: true, reason: null },
          email: { key: 'email', available: true, reason: null },
          google: { key: 'google', available: true, reason: null },
          project_management: { key: 'project_management', available: true, reason: null },
          sandbox: { key: 'sandbox', available: true, reason: null },
          social_media: { key: 'social_media', available: true, reason: null },
          vutler_calendar: { key: 'vutler_calendar', available: true, reason: null },
        },
        availableProviders: ['workspace_drive', 'email', 'google', 'project_management', 'sandbox', 'social_media', 'vutler_calendar'],
        unavailableProviders: [],
      }),
      filterAvailableProviders: jest.fn((providers = []) => providers),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: filterAvailableSkillKeysMock,
      isProviderAvailable: jest.fn(() => true),
      inferProviderForSkill: jest.fn((skillKey) => {
        if (String(skillKey).startsWith('workspace_drive')) return 'workspace_drive';
        if (String(skillKey).startsWith('email_')) return 'email';
        if (String(skillKey).startsWith('google_')) return 'google';
        if (String(skillKey).startsWith('task_')) return 'project_management';
        return null;
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
          res.headers = { 'content-type': 'application/json' };
          callback(res);

          process.nextTick(() => {
            res.emit('data', JSON.stringify({
              id: 'chatcmpl-manifest-1',
              model: 'gpt-5.4',
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    content: 'Ready.',
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
            }));
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

    process.env.OPENAI_API_KEY = 'test-openai-key';
    chat = require('../services/llmRouter').chat;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  test('injects explicit workspace drive and google calendar tools from the skill registry', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        skills: ['workspace_drive_write', 'google_calendar_create'],
        system_prompt: 'You are an operations agent.',
      },
      [{ role: 'user', content: 'Prepare the workspace and schedule the kickoff.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Ready.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({
            name: 'skill_workspace_drive_write',
          }),
        }),
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({
            name: 'skill_google_calendar_create',
          }),
        }),
      ])
    );
    expect(recordedBodies[0].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({
            parameters: expect.objectContaining({
              required: ['content'],
            }),
          }),
        }),
        expect.objectContaining({
          function: expect.objectContaining({
            parameters: expect.objectContaining({
              required: ['event'],
            }),
          }),
        }),
      ])
    );
  });

  test('injects the canonical Vutler placement policy for all agents', async () => {
    const result = await chat(
      {
        id: 'agent-2',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are a general assistant.',
      },
      [{ role: 'user', content: 'Prepare the document and save it somewhere sensible.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Ready.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].messages[0].content).toContain('/projects/Vutler');
    expect(recordedBodies[0].messages[0].content).toContain('Generated/');
    expect(recordedBodies[0].messages[0].content).toContain('direct link');
  });

  test('injects orchestration overlay skills even when the agent profile does not persist them', async () => {
    const result = await chat(
      {
        id: 'agent-3',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are a general assistant.',
        execution_overlay: {
          skillKeys: ['task_management'],
          integrationProviders: [],
        },
      },
      [{ role: 'user', content: 'Create a follow-up task for the marketing team.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Ready.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'function',
          function: expect.objectContaining({
            name: 'skill_task_management',
          }),
        }),
      ])
    );
  });

  test('does not inject integration skills that are unavailable for the workspace run', async () => {
    filterAvailableSkillKeysMock.mockImplementation((skills = []) =>
      skills.filter((skillKey) => skillKey !== 'google_calendar_create')
    );

    const result = await chat(
      {
        id: 'agent-4',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        skills: ['workspace_drive_write', 'google_calendar_create'],
        system_prompt: 'You are an operations agent.',
      },
      [{ role: 'user', content: 'Prepare the workspace and schedule the kickoff.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Ready.');
    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).toContain('skill_workspace_drive_write');
    expect(toolNames).not.toContain('skill_google_calendar_create');
  });
});
