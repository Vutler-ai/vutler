'use strict';

const { EventEmitter } = require('events');

describe('llmRouter email runtime hints', () => {
  let chat;
  let recordedBodies;
  let emailProvisioning;
  let unavailableEmailProviders;
  let workspaceCapabilityAvailability;
  let mailboxSourceOptions;
  let outboundEmailSourceOptions;

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
    mailboxSourceOptions = [];
    outboundEmailSourceOptions = [];

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
      getMailboxSourceOptionsForWorkspace: jest.fn().mockImplementation(async () => mailboxSourceOptions),
      getEmailSendSourceOptionsForWorkspace: jest.fn().mockImplementation(async () => outboundEmailSourceOptions),
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

  test('still exposes direct email tools when the agent email is effective but no nexus node is online', async () => {
    jest.resetModules();
    recordedBodies = [];

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
      getOnlineNexusNode: jest.fn().mockResolvedValue(null),
      getNexusToolsForWorkspace: jest.fn().mockImplementation(async (_workspaceId, _db, opts = {}) => {
        if (opts.emailCapabilityEffective) {
          return [
            {
              name: 'send_email',
              description: 'Send immediately',
              input_schema: { type: 'object', properties: { to: { type: 'string' } } },
            },
          ];
        }
        return [];
      }),
      getMailboxSourceOptionsForWorkspace: jest.fn().mockResolvedValue([]),
      getEmailSendSourceOptionsForWorkspace: jest.fn().mockResolvedValue([]),
      NEXUS_TOOL_NAMES: new Set(['send_email']),
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
              id: 'chatcmpl-email-runtime-no-node',
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
    expect(recordedBodies[0].messages[0].content).toContain('Use send_email immediately.');
    const toolNames = (recordedBodies[0].tools || []).map((tool) => tool.function.name);
    expect(toolNames).toContain('send_email');
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

  test('tells the agent to ask before reading email when multiple mailbox sources are available', async () => {
    jest.resetModules();
    recordedBodies = [];
    mailboxSourceOptions = [
      { key: 'local', label: 'Nexus Local desktop mail' },
      { key: 'google', label: 'Google mail' },
      { key: 'microsoft365', label: 'Microsoft 365 / Outlook mail' },
    ];

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
      getNexusToolsForWorkspace: jest.fn().mockResolvedValue([
        {
          name: 'read_emails',
          description: 'Read emails',
          input_schema: { type: 'object', properties: { source: { type: 'string' } } },
        },
      ]),
      getMailboxSourceOptionsForWorkspace: jest.fn().mockImplementation(async () => mailboxSourceOptions),
      getEmailSendSourceOptionsForWorkspace: jest.fn().mockResolvedValue([]),
      NEXUS_TOOL_NAMES: new Set(['read_emails']),
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
              id: 'chatcmpl-email-runtime-clarify',
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

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Jarvis.',
      },
      [{ role: 'user', content: 'Check my email.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Done.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].messages[0].content).toContain('Multiple mailbox sources are available in this run');
    expect(recordedBodies[0].messages[0].content).toContain('Ask one short clarifying question first');
    expect(recordedBodies[0].messages[0].content).toContain('read_emails.source');
    expect(recordedBodies[0].messages[0].content).toContain('Nexus Local desktop mail');
    expect(recordedBodies[0].messages[0].content).toContain('Google mail');
    expect(recordedBodies[0].messages[0].content).toContain('Microsoft 365 / Outlook mail');
  });

  test('tells the agent to ask before sending on behalf when multiple personal mailbox sources are available', async () => {
    jest.resetModules();
    recordedBodies = [];
    outboundEmailSourceOptions = [
      { key: 'agent', label: 'Provisioned agent email' },
      { key: 'google', label: 'Google mail' },
      { key: 'microsoft365', label: 'Microsoft 365 / Outlook mail' },
    ];

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
      getNexusToolsForWorkspace: jest.fn().mockResolvedValue([
        {
          name: 'send_email',
          description: 'Send email',
          input_schema: { type: 'object', properties: { source: { type: 'string' }, to: { type: 'string' } } },
        },
        {
          name: 'draft_email',
          description: 'Draft email',
          input_schema: { type: 'object', properties: { source: { type: 'string' }, to: { type: 'string' } } },
        },
      ]),
      getMailboxSourceOptionsForWorkspace: jest.fn().mockResolvedValue([]),
      getEmailSendSourceOptionsForWorkspace: jest.fn().mockImplementation(async () => outboundEmailSourceOptions),
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
              id: 'chatcmpl-email-runtime-on-behalf',
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

    const result = await chat(
      {
        id: 'agent-1',
        workspace_id: 'ws-1',
        provider: 'openai',
        model: 'gpt-5.4',
        system_prompt: 'You are Jarvis.',
      },
      [{ role: 'user', content: 'Send this on my behalf to client@example.com.' }],
      { query: jest.fn().mockResolvedValue({ rows: [] }) }
    );

    expect(result.content).toBe('Done.');
    expect(recordedBodies).toHaveLength(1);
    expect(recordedBodies[0].messages[0].content).toContain('Use send_email or draft_email without a source override for the provisioned agent mailbox.');
    expect(recordedBodies[0].messages[0].content).toContain('Personal mailbox sends are approval-gated');
    expect(recordedBodies[0].messages[0].content).toContain('Multiple personal mailbox sources are available in this run');
    expect(recordedBodies[0].messages[0].content).toContain('Ask one short clarification question before calling send_email or draft_email.');
  });
});
