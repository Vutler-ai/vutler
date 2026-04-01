'use strict';

jest.mock('../services/agentIntegrationService', () => ({
  normalizeAgentIntegrationProviders: jest.fn((values = []) => Array.from(new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  ))),
  listAgentIntegrationProviders: jest.fn(),
  workspaceHasAgentAccessOverrides: jest.fn(),
  listConnectedSocialPlatforms: jest.fn(),
}));

const {
  listAgentIntegrationProviders,
  workspaceHasAgentAccessOverrides,
  listConnectedSocialPlatforms,
} = require('../services/agentIntegrationService');
const {
  normalizeAccessPolicy,
  mergeAgentConfiguration,
  reconcileSandboxCapability,
  validateSandboxConfiguration,
  resolveAgentAccessPolicy,
} = require('../services/agentAccessPolicyService');

describe('agentAccessPolicyService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('flags sandbox access as invalid for non-technical agent types', () => {
    expect(normalizeAccessPolicy({
      sandbox: { allowed: true },
    }, {
      agentTypes: ['marketing'],
    })).toEqual({
      sandbox: {
        allowed: true,
        invalid: true,
      },
    });

    expect(validateSandboxConfiguration({
      agentTypes: ['marketing'],
      capabilities: ['code_execution'],
      accessPolicy: { sandbox: { allowed: true } },
    })).toMatch(/Sandbox is restricted/);
  });

  test('merges nested config sections and keeps memory_mode aligned', () => {
    const nextConfig = mergeAgentConfiguration(
      {
        access_policy: { email: { allowed: true } },
        provisioning: { email: { address: 'old@workspace.vutler.ai', provisioned: true } },
      },
      {
        accessPolicy: { social: { allowed: true, platforms: ['linkedin'] } },
        provisioning: { drive: { root: '/projects/Vutler/agents/nora' } },
        memoryPolicy: { mode: 'active' },
        governance: { approvals: 'strict' },
      }
    );

    expect(nextConfig).toMatchObject({
      access_policy: {
        email: { allowed: true },
        social: { allowed: true, platforms: ['linkedin'] },
      },
      provisioning: {
        email: { address: 'old@workspace.vutler.ai', provisioned: true },
        drive: { root: '/projects/Vutler/agents/nora' },
      },
      memory_policy: { mode: 'active' },
      memory_mode: 'active',
      governance: { approvals: 'strict' },
    });
  });

  test('resolves access policy from config first, then legacy overrides', async () => {
    listConnectedSocialPlatforms.mockResolvedValue(['linkedin', 'twitter']);
    listAgentIntegrationProviders.mockResolvedValue(['email', 'linkedin']);
    workspaceHasAgentAccessOverrides.mockImplementation(async (_workspaceId, providers) => providers.includes('email'));

    const policy = await resolveAgentAccessPolicy({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      agent: {
        id: 'agent-1',
        type: ['marketing'],
        capabilities: ['email_outreach'],
        config: {
          access_policy: {
            email: { allowed: false },
            social: { allowed: true, platforms: ['linkedin'] },
          },
          provisioning: {
            social: { allowed_platforms: ['linkedin'] },
          },
        },
      },
      db: { query: jest.fn() },
    });

    expect(policy).toMatchObject({
      email: { allowed: false, source: 'config' },
      social: { allowed: true, platforms: ['linkedin'] },
      sandbox: { allowed: false, eligible: false },
    });
  });

  test('reconciles sandbox capability with access policy', () => {
    const enabled = reconcileSandboxCapability(['task_management'], { sandbox: { allowed: true } }, ['technical']);
    const disabled = reconcileSandboxCapability(['task_management', 'code_execution'], { sandbox: { allowed: false } }, ['technical']);

    expect(enabled).toEqual(expect.arrayContaining(['task_management', 'code_execution']));
    expect(disabled).toEqual(expect.arrayContaining(['task_management']));
    expect(disabled).not.toContain('code_execution');
  });
});
