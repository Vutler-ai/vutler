'use strict';

jest.mock('../services/runtimeCapabilityAvailability', () => ({
  resolveWorkspaceCapabilityAvailability: jest.fn(),
  isProviderAvailable: jest.fn((snapshot, provider) => Boolean(snapshot?.providerStates?.[provider]?.available)),
}));

jest.mock('../services/agentProvisioningService', () => ({
  resolveAgentEmailProvisioning: jest.fn(),
}));

jest.mock('../services/agentAccessPolicyService', () => ({
  resolveAgentAccessPolicy: jest.fn(),
  getAgentConfigSections: jest.fn(),
}));

jest.mock('../services/memory/modeResolver', () => ({
  resolveMemoryMode: jest.fn(),
}));

jest.mock('../services/workspacePlanService', () => ({
  getWorkspacePlanId: jest.fn(),
}));

jest.mock('../services/agentIntegrationService', () => ({
  listConnectedSocialPlatforms: jest.fn(),
}));

const { resolveWorkspaceCapabilityAvailability } = require('../services/runtimeCapabilityAvailability');
const { resolveAgentEmailProvisioning } = require('../services/agentProvisioningService');
const { resolveAgentAccessPolicy, getAgentConfigSections } = require('../services/agentAccessPolicyService');
const { resolveMemoryMode } = require('../services/memory/modeResolver');
const { getWorkspacePlanId } = require('../services/workspacePlanService');
const { listConnectedSocialPlatforms } = require('../services/agentIntegrationService');
const { resolveAgentCapabilityMatrix } = require('../services/agentCapabilityMatrixService');

describe('agentCapabilityMatrixService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('builds effective capability states and warnings', async () => {
    resolveWorkspaceCapabilityAvailability.mockResolvedValue({
      planId: 'agents_pro',
      availableProviders: ['email', 'workspace_drive', 'vutler_calendar', 'project_management', 'sandbox'],
      unavailableProviders: [{ key: 'social_media', available: false, reason: 'No social media account is connected for this workspace.' }],
      providerStates: {
        email: { available: true, reason: null },
        social_media: { available: false, reason: 'No social media account is connected for this workspace.' },
        workspace_drive: { available: true, reason: null },
        vutler_calendar: { available: true, reason: null },
        google: { available: false, reason: 'Google is not connected for this workspace.' },
        project_management: { available: true, reason: null },
        sandbox: { available: true, reason: null },
      },
    });
    resolveAgentAccessPolicy.mockResolvedValue({
      email: { allowed: true },
      social: { allowed: true, platforms: [] },
      drive: { allowed: true },
      calendar: { allowed: true },
      tasks: { allowed: false },
      memory: { allowed: true },
      sandbox: { allowed: true },
    });
    getAgentConfigSections.mockReturnValue({
      provisioning: {},
    });
    resolveAgentEmailProvisioning.mockResolvedValue({
      provisioned: false,
      email: null,
      source: 'none',
    });
    resolveMemoryMode.mockResolvedValue({
      mode: 'disabled',
      source: 'agent',
    });
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    listConnectedSocialPlatforms.mockResolvedValue([]);

    const matrix = await resolveAgentCapabilityMatrix({
      workspaceId: 'ws-1',
      agent: {
        id: 'agent-1',
        type: ['marketing'],
      },
      db: { query: jest.fn() },
    });

    expect(matrix.capabilities.email).toMatchObject({
      workspace_available: true,
      agent_allowed: true,
      provisioned: false,
      effective: false,
      reason: 'Email is not provisioned for this agent.',
    });
    expect(matrix.capabilities.social).toMatchObject({
      workspace_available: false,
      agent_allowed: true,
      effective: false,
      reason: 'No social media account is connected for this workspace.',
    });
    expect(matrix.capabilities.tasks).toMatchObject({
      workspace_available: true,
      agent_allowed: false,
      effective: false,
      reason: 'Task access is disabled for this agent.',
    });
    expect(matrix.capabilities.sandbox).toMatchObject({
      workspace_available: true,
      agent_allowed: true,
      provisioned: false,
      effective: false,
      reason: 'Sandbox is reserved for technical, security, QA, and devops agent types.',
    });
    expect(matrix.capabilities.memory).toMatchObject({
      workspace_available: true,
      agent_allowed: true,
      provisioned: false,
      effective: false,
      reason: 'Memory mode is disabled for this agent.',
    });
    expect(matrix.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'email_not_provisioned' }),
      expect.objectContaining({ key: 'social_not_connected' }),
      expect.objectContaining({ key: 'sandbox_ineligible_type' }),
    ]));
  });

  test('returns effective capabilities when workspace, access and provisioning align', async () => {
    resolveWorkspaceCapabilityAvailability.mockResolvedValue({
      planId: 'agents_pro',
      availableProviders: ['email', 'social_media', 'workspace_drive', 'vutler_calendar', 'project_management', 'sandbox'],
      unavailableProviders: [],
      providerStates: {
        email: { available: true, reason: null },
        social_media: { available: true, reason: null },
        workspace_drive: { available: true, reason: null },
        vutler_calendar: { available: true, reason: null },
        google: { available: false, reason: 'Google is not connected for this workspace.' },
        project_management: { available: true, reason: null },
        sandbox: { available: true, reason: null },
      },
    });
    resolveAgentAccessPolicy.mockResolvedValue({
      email: { allowed: true },
      social: { allowed: true, platforms: ['linkedin'] },
      drive: { allowed: true },
      calendar: { allowed: true },
      tasks: { allowed: true },
      memory: { allowed: true },
      sandbox: { allowed: true },
    });
    getAgentConfigSections.mockReturnValue({
      provisioning: { drive: { root: '/projects/Vutler/agents/mike' } },
    });
    resolveAgentEmailProvisioning.mockResolvedValue({
      provisioned: true,
      email: 'mike@workspace.vutler.ai',
      source: 'config',
    });
    resolveMemoryMode.mockResolvedValue({
      mode: 'active',
      source: 'agent',
    });
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    listConnectedSocialPlatforms.mockResolvedValue(['linkedin']);

    const matrix = await resolveAgentCapabilityMatrix({
      workspaceId: 'ws-1',
      agent: {
        id: 'agent-2',
        type: ['technical'],
      },
      db: { query: jest.fn() },
    });

    expect(matrix.capabilities.email).toMatchObject({
      effective: true,
      scope: { address: 'mike@workspace.vutler.ai' },
    });
    expect(matrix.capabilities.social).toMatchObject({
      effective: true,
      scope: { platforms: ['linkedin'] },
    });
    expect(matrix.capabilities.sandbox).toMatchObject({
      effective: true,
    });
    expect(matrix.capabilities.drive.scope).toEqual({ root: '/projects/Vutler/agents/mike' });
    expect(matrix.warnings).toEqual([]);
  });
});
