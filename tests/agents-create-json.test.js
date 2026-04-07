'use strict';

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('agents create payload serialization', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('POST /api/v1/agents stringifies capabilities for jsonb insert', async () => {
    const clientQuery = jest.fn(async (sql, params) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
        return { rows: [] };
      }

      if (sql.includes('SELECT plan FROM tenant_vutler.workspaces')) {
        return { rows: [{ plan: 'pro' }] };
      }

      if (sql.includes('INSERT INTO tenant_vutler.agents')) {
        expect(params[15]).toBe(JSON.stringify(['email_outreach', 'workspace_drive_write']));
        expect(params[16]).toBe(JSON.stringify({
          accessPolicy: {},
          provisioning: { email: { provisioned: false } },
          memoryPolicy: {},
          governance: {},
        }));
        return {
          rows: [{
            id: params[0],
            name: params[1],
            username: params[2],
            email: params[3],
            type: params[4],
            role: params[5],
            mbti: params[6],
            model: params[7],
            provider: params[8],
            description: params[9],
            system_prompt: params[10],
            temperature: params[11],
            max_tokens: params[12],
            avatar: params[13],
            workspace_id: params[14],
            capabilities: JSON.parse(params[15]),
            config: JSON.parse(params[16]),
          }],
        };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const client = {
      query: clientQuery,
      release: jest.fn(),
    };

    jest.doMock('../lib/vaultbrix', () => ({
      connect: jest.fn().mockResolvedValue(client),
      query: jest.fn(),
    }));
    jest.doMock('../lib/avatarPath', () => ({
      normalizeStoredAvatar: jest.fn(() => null),
      buildSpriteAvatar: jest.fn(() => '/sprite.png'),
    }));
    jest.doMock('../services/agentConfigPolicy', () => ({
      normalizeCapabilities: jest.fn((value) => value || []),
      splitCapabilities: jest.fn(() => ({ skills: [], tools: [] })),
      buildAgentConfigUpdate: jest.fn(() => ({})),
      countCountedSkills: jest.fn(() => 2),
      mergeCapabilities: jest.fn((body) => body.capabilities || []),
    }));
    jest.doMock('../services/agentIntegrationService', () => ({
      normalizeAgentIntegrationProviders: jest.fn(() => []),
      listAgentIntegrationProviders: jest.fn(async () => []),
      replaceAgentIntegrationProviders: jest.fn(),
    }));
    jest.doMock('../services/agentDriveService', () => ({
      ensureAgentDriveProvisioned: jest.fn(async () => {}),
      resolveAgentDriveRoot: jest.fn(async () => '/drive/root'),
    }));
    jest.doMock('../services/agentSchemaService', () => ({
      ensureAgentConfigurationSchema: jest.fn(async () => {}),
    }));
    jest.doMock('../services/agentTypeProfiles', () => ({
      getDefaultCapabilitiesForAgentTypes: jest.fn(() => []),
    }));
    jest.doMock('../services/agentAccessPolicyService', () => ({
      getAgentConfigSections: jest.fn(() => ({
        accessPolicy: {},
        provisioning: { email: { provisioned: false } },
        memoryPolicy: {},
        governance: {},
      })),
      normalizeAgentConfig: jest.fn(() => ({})),
      normalizeAccessPolicy: jest.fn(() => ({})),
      normalizeProvisioning: jest.fn(() => ({ email: { provisioned: false } })),
      normalizeMemoryPolicy: jest.fn(() => ({})),
      normalizeGovernance: jest.fn(() => ({})),
      mergeAgentConfiguration: jest.fn((_existing, next) => next),
      reconcileSandboxCapability: jest.fn((value) => value),
      validateSandboxConfiguration: jest.fn(() => null),
    }));
    jest.doMock('../services/agentCapabilityMatrixService', () => ({
      resolveAgentCapabilityMatrix: jest.fn(() => ({})),
    }));
    jest.doMock('../services/workspaceEmailService', () => ({
      parseEmailDomain: jest.fn(),
      requireManagedAgentEmailAccess: jest.fn(),
      resolveWorkspaceEmailDomain: jest.fn(),
      resolveWorkspaceEmailEntitlements: jest.fn(async () => ({
        managedAgentEmail: false,
        planId: 'pro',
      })),
    }));

    const router = require('../api/agents');
    const handler = findRouteHandler(router, 'post', '/');
    const req = {
      headers: { 'x-workspace-id': 'ws-1' },
      body: {
        name: 'Nora',
        username: 'nora',
        role: 'support',
        model: 'gpt-5.4',
        provider: 'codex',
        capabilities: ['email_outreach', 'workspace_drive_write'],
        provisioning: {
          email: {
            provisioned: false,
          },
        },
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      agent: expect.objectContaining({
        username: 'nora',
        capabilities: ['email_outreach', 'workspace_drive_write'],
      }),
    }));
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
