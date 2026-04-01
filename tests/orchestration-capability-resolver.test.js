'use strict';

jest.mock('../services/agentIntegrationService', () => ({
  listConnectedWorkspaceIntegrationProviders: jest.fn().mockResolvedValue(new Set(['social_media', 'google'])),
  getSkillKeysForIntegrationProviders: jest.fn((providers = []) => {
    const values = [];
    if (providers.includes('social_media')) values.push('content_scheduling', 'social_analytics');
    if (providers.includes('email')) values.push('email_outreach');
    if (providers.includes('project_management')) values.push('task_management');
    return values;
  }),
}));

jest.mock('../services/runtimeCapabilityAvailability', () => ({
  resolveWorkspaceCapabilityAvailability: jest.fn().mockResolvedValue({
    planId: 'agents_pro',
    planLabel: 'Agents Pro',
    planFeatures: ['agents', 'tools', 'runtime'],
    planProducts: ['agents'],
    planLimits: { social_posts_month: 50 },
    connectedProviders: ['social_media', 'google'],
    providerStates: {
      project_management: { key: 'project_management', available: true, reason: null },
      social_media: { key: 'social_media', available: true, reason: null },
      email: { key: 'email', available: true, reason: null },
      google: { key: 'google', available: true, reason: null },
    },
    availableProviders: ['project_management', 'social_media', 'email', 'google'],
    unavailableProviders: [],
  }),
  filterAvailableProviders: jest.fn((providers = [], snapshot) =>
    providers.filter((provider) => snapshot.availableProviders.includes(provider))
  ),
  getUnavailableProviders: jest.fn((providers = [], snapshot) =>
    providers
      .filter((provider) => !snapshot.availableProviders.includes(provider))
      .map((provider) => ({ key: provider, available: false, reason: `${provider} unavailable` }))
  ),
  filterAvailableSkillKeys: jest.fn((skills = []) => skills),
}));

jest.mock('../services/agentProvisioningService', () => ({
  resolveAgentEmailProvisioning: jest.fn(async ({ agent } = {}) => ({
    provisioned: Boolean(agent?.email),
    email: agent?.email || null,
    source: agent?.email ? 'agent' : 'none',
  })),
  agentHasProvisionedEmail: jest.fn((agent, provisioning) => Boolean(provisioning?.provisioned || agent?.email)),
}));

jest.mock('../services/agentExpansionAdvisor', () => ({
  evaluateAgentExpansion: jest.fn().mockResolvedValue({
    workspacePressure: {
      planId: 'agents_pro',
      currentAgentCount: 2,
      agentLimit: 100,
      canAddAgents: true,
      atLimit: false,
    },
    specializationProfile: {
      status: 'stretching',
      persistentSkillCount: 6,
      detectedDomains: ['social'],
    },
    recommendations: [
      {
        type: 'create_specialist_agent',
        domain: 'social',
      },
    ],
  }),
}));

const { resolveOrchestrationCapabilities } = require('../services/orchestrationCapabilityResolver');

describe('orchestrationCapabilityResolver', () => {
  test('selects a social specialist and overlay capabilities for social requests', async () => {
    const plan = await resolveOrchestrationCapabilities({
      workspaceId: 'ws-1',
      messageText: 'Please publish this update on LinkedIn and monitor engagement this week.',
      requestedAgent: { id: 'agent-mike', username: 'mike', capabilities: ['workspace_drive_write'] },
      availableAgents: [
        { id: 'agent-mike', username: 'mike', capabilities: ['workspace_drive_write'] },
        { id: 'agent-nora', username: 'nora', capabilities: ['content_scheduling'] },
      ],
      db: { query: jest.fn() },
    });

    expect(plan.domains).toEqual(expect.arrayContaining(['social']));
    expect(plan.primaryDelegate).toMatchObject({
      agentId: 'agent-nora',
      agentRef: 'nora',
      reason: 'social_specialist',
    });
    expect(plan.overlayProviders).toEqual(expect.arrayContaining(['social_media', 'project_management']));
    expect(plan.overlaySkillKeys).toEqual(expect.arrayContaining(['content_scheduling', 'social_analytics']));
    expect(plan.availability).toMatchObject({
      planId: 'agents_pro',
      availableProviders: expect.arrayContaining(['project_management', 'social_media']),
    });
    expect(plan.unavailableDomains).toEqual([]);
    expect(plan.workspacePressure).toMatchObject({
      planId: 'agents_pro',
      currentAgentCount: 2,
    });
    expect(plan.specializationProfile).toMatchObject({
      status: 'stretching',
    });
    expect(plan.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'create_specialist_agent',
        domain: 'social',
      }),
    ]));
  });

  test('delegates email work to an email-provisioned specialist when the requested agent has no mailbox', async () => {
    const plan = await resolveOrchestrationCapabilities({
      workspaceId: 'ws-1',
      messageText: 'Draft an outreach email to luna@starbox-group.com and send it for approval.',
      requestedAgent: { id: 'agent-mike', username: 'mike', capabilities: ['workspace_drive_write'] },
      availableAgents: [
        { id: 'agent-mike', username: 'mike', capabilities: ['workspace_drive_write'] },
        { id: 'agent-andrea', username: 'andrea', email: 'andrea@workspace.vutler.ai', capabilities: ['email_outreach'] },
      ],
      db: { query: jest.fn() },
    });

    expect(plan.domains).toEqual(expect.arrayContaining(['email']));
    expect(plan.primaryDelegate).toMatchObject({
      agentId: 'agent-andrea',
      agentRef: 'andrea',
      reason: 'email_specialist',
    });
    expect(plan.overlayProviders).toEqual(expect.arrayContaining(['email', 'project_management']));
    expect(plan.overlaySkillKeys).toEqual(expect.arrayContaining(['email_outreach']));
  });
});
