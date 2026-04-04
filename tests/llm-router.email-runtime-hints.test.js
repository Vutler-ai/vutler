'use strict';

const { EventEmitter } = require('events');

describe('llmRouter email runtime hints', () => {
  let chat;
  let recordedBodies;
  let emailProvisioning;
  let unavailableEmailProviders;
  let workspaceCapabilityAvailability;

  beforeEach(() => {
    jest.resetModules();
    recordedBodies = [];
    emailProvisioning = {
      provisioned: true,
      email: 'jarvis@starbox-group.com',
      source: 'workspace_mailbox',
    };
    unavailableEmailProviders = [];
    workspaceCapabilityAvailability = {
      planId: 'agents_pro',
      providerStates: {
        email: { key: 'email', available: true, reason: null },
      },
      availableProviders: ['email'],
      unavailableProviders: [],
    };

    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue(workspaceCapabilityAvailability),
      filterAvailableProviders: jest.fn((providers = []) => providers),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: jest.fn((skills = []) => skills),
      isProviderAvailable: jest.fn((availability, provider) => Boolean(availability?.providerStates?.[provider]?.available)),
      inferProviderForSkill: jest.fn(() => null),
    }));

    jest.doMock('../services/agentProvisioningService', () => ({
      resolveAgentEmailProvisioning: jest.fn().mockImplementation(async () => emailProvisioning),
      filterProvisionedSkillKeys: jest.fn((skills = []) => skills),
      getProvisioningReasonForSkill: jest.fn(() => null),
      getUnavailableAgentProviders: jest.fn((providers = []) => (
        providers.includes('email') ? unavailableEmailProviders : []
      )),
    }));

    jest.doMock('../services/nexusTools', () => ({
      getOnlineNexusNode: jest.fn().mockResolvedValue({ id: 'node-1' }),
      getNexusToolsForWorkspace: jest.fn().mockImplementation(async (_workspaceId, _db, opts = {}) => {
        if (opts.emailCapabilityEffective) {
          return [
            {
              name: 'send_email',
              description: 'Send immediately',
              input_schema: { type: 'object', properties: { to: { type: 'string' } } },
            },
            {
              name: 'draft_email',
              description: 'Draft an email',
              input_schema: { type: 'object', properties: { to: { type: 'string' } } },
            },
          ];
        }
        return [];
      }),
      NEXUS_TOOL_NAMES: new Set(['send_email', 'draft_email']),
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
              id: 'chatcmpl-email-runtime',
              model: 'gpt-5.4',
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    role: 'assistant',
                    content: 'Done.',
                  },
                },
              ],
              usage: { prompt_tokens: 12, completion_tokens: 5 },
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

  test('injects the provisioned sender identity when email is effective for the run', async () => {
    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Jarvis.',
      },
      [{ role: 'user', content: 'Envoie ce mail à client@example.com maintenant.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Done.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].messages[0].content).toContain(
      'Your provisioned email sending identity for this run is jarvis@starbox-group.com.'
    );
    expect(recordedBodies[0].messages[0].content).toContain('Use send_email immediately.');
    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).toContain('send_email');
    expect(toolNames).not.toContain('draft_email');
  });

  test('states that email is unavailable when the workspace provider exists but the agent mailbox is not provisioned', async () => {
    emailProvisioning = {
      provisioned: false,
      email: null,
      source: 'none',
    };
    unavailableEmailProviders = [
      {
        key: 'email',
        reason: 'Email is not provisioned for this agent.',
      },
    ];

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Jarvis.',
      },
      [{ role: 'user', content: 'Peux-tu envoyer un test à client@example.com ?' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Done.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].messages[0].content).toContain(
      'Email is unavailable in this run: Email is not provisioned for this agent.'
    );
    expect(recordedBodies[0].messages[0].content).not.toContain('Your provisioned email sending identity for this run is');
    expect(recordedBodies[0].messages[0].content).not.toContain('Use send_email immediately.');
    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).not.toContain('send_email');
    expect(toolNames).not.toContain('draft_email');
  });
});
