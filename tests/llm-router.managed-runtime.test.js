'use strict';

const { EventEmitter } = require('events');

describe('llmRouter managed runtime', () => {
  let chat;
  let requestLog;
  let ledgerInsert;
  let debitUpdate;
  const originalAllowRuntimeSchemaMutations = process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS;

  beforeEach(() => {
    jest.resetModules();
    requestLog = [];
    ledgerInsert = null;
    debitUpdate = null;
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = 'false';
    process.env.OPENROUTER_API_KEY = 'shared-openrouter-key';

    jest.doMock('../services/memory/runtime', () => ({
      createMemoryRuntimeService: jest.fn(() => ({
        recordToolObservation: jest.fn().mockResolvedValue(undefined),
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

    jest.doMock('../services/snipara/gateway', () => ({
      createSniparaGateway: jest.fn(() => ({
        memory: {
          recall: jest.fn().mockResolvedValue({ memories: [] }),
          rememberForAgent: jest.fn().mockResolvedValue({ success: true }),
        },
      })),
    }));

    jest.doMock('../services/agentIntegrationService', () => ({
      resolveAgentRuntimeIntegrations: jest.fn().mockResolvedValue({
        derivedSkillKeys: [],
        connectedSocialPlatforms: [],
        allowedSocialPlatforms: [],
        allowedSocialAccountIds: [],
        allowedSocialBrandIds: [],
        hasSocialAccessOverrides: false,
        hasSocialMediaAccess: false,
      }),
      getSkillKeysForIntegrationProviders: jest.fn(() => []),
    }));

    jest.doMock('../services/runtimeCapabilityAvailability', () => ({
      resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
        planId: 'free',
        planLabel: 'Free',
        planFeatures: [],
        planProducts: [],
        planLimits: {},
        connectedProviders: [],
        providerStates: {},
        availableProviders: [],
        unavailableProviders: [],
      }),
      filterAvailableProviders: jest.fn((providers) => providers || []),
      getUnavailableProviders: jest.fn(() => []),
      filterAvailableSkillKeys: jest.fn((skills) => skills || []),
      isProviderAvailable: jest.fn(() => false),
      inferProviderForSkill: jest.fn(() => null),
    }));

    jest.doMock('../services/agentProvisioningService', () => ({
      resolveAgentEmailProvisioning: jest.fn().mockResolvedValue({
        provisioned: false,
        email: null,
        source: 'none',
      }),
      filterProvisionedSkillKeys: jest.fn((skills) => skills || []),
      getProvisioningReasonForSkill: jest.fn(() => null),
      getUnavailableAgentProviders: jest.fn(() => []),
    }));

    jest.doMock('https', () => ({
      request: jest.fn((options, callback) => {
        const req = new EventEmitter();
        let body = '';

        req.write = (chunk) => {
          body += chunk;
        };

        req.end = () => {
          requestLog.push({ options, body: JSON.parse(body) });
          const res = new EventEmitter();
          res.statusCode = 200;
          res.headers = { 'content-type': 'application/json' };
          callback(res);

          const payload = JSON.stringify({
            id: 'chatcmpl-managed',
            model: 'openrouter/auto',
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  role: 'assistant',
                  content: 'Managed runtime response.',
                },
              },
            ],
            usage: { prompt_tokens: 12, completion_tokens: 8 },
          });

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
      Agent: class {},
    }));

    chat = require('../services/llmRouter').chat;
  });

  afterEach(() => {
    delete process.env.OPENROUTER_API_KEY;
    process.env.ALLOW_RUNTIME_SCHEMA_MUTATIONS = originalAllowRuntimeSchemaMutations;
  });

  test('routes managed runtime through the provisioned upstream provider and records ledger usage', async () => {
    const db = {
      query: jest.fn(async (sql, params) => {
        if (/WHERE workspace_id = \$1 AND key = 'default_provider'/i.test(sql)) return { rows: [] };
        if (/SELECT default_provider/i.test(sql)) return { rows: [] };
        if (/WHERE workspace_id = \$1 AND is_enabled = true AND is_default = true/i.test(sql)) return { rows: [] };

        if (/WHERE workspace_id = \$1 AND key IN \('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at'\)/i.test(sql)) {
          return {
            rows: [
              { key: 'trial_tokens_total', value: '50000' },
              { key: 'trial_tokens_used', value: '100' },
              { key: 'trial_expires_at', value: new Date(Date.now() + 60 * 60 * 1000).toISOString() },
            ],
          };
        }

        if (/FROM tenant_vutler\.llm_providers/i.test(sql) && params?.[1] === 'vutler-trial') {
          return {
            rows: [{
              id: 'managed-provider-1',
              provider: 'vutler-trial',
              api_key: 'workspace-openrouter-key',
              base_url: 'https://openrouter.ai/api/v1',
              config: {
                source: 'credits',
                upstream_provider: 'openrouter',
                upstream_model: 'openrouter/auto',
              },
              is_enabled: true,
              is_default: true,
            }],
          };
        }

        if (/INSERT INTO tenant_vutler\.llm_usage_logs/i.test(sql)) {
          return { rows: [] };
        }

        if (/UPDATE tenant_vutler\.workspace_settings/i.test(sql) && /trial_tokens_used/.test(sql)) {
          debitUpdate = params;
          return { rows: [] };
        }

        if (/INSERT INTO tenant_vutler\.credit_transactions/i.test(sql)) {
          ledgerInsert = params;
          return { rows: [{ id: 'credit-tx-1' }] };
        }

        return { rows: [] };
      }),
    };

    const result = await chat(
      {
        id: 'agent-managed-1',
        name: 'Managed Agent',
        username: 'managed-agent',
        workspace_id: 'ws-managed',
        provider: 'vutler-trial',
        model: 'claude-haiku-4-5',
        system_prompt: 'You are a managed agent.',
      },
      [{ role: 'user', content: 'Hello there' }],
      db
    );

    expect(result.content).toBe('Managed runtime response.');
    expect(result.provider).toBe('openrouter');
    expect(requestLog[0].options.hostname).toBe('openrouter.ai');
    expect(requestLog[0].body.model).toBe('openrouter/auto');
    expect(debitUpdate).toEqual([20, 'ws-managed']);
    expect(ledgerInsert[0]).toBe('ws-managed');
    expect(ledgerInsert[1]).toBe('usage');
    expect(ledgerInsert[2]).toBe(-20);
    expect(ledgerInsert[3]).toContain('"source":"credits"');
    expect(ledgerInsert[3]).toContain('"provider":"openrouter"');
  });
});
