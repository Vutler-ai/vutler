'use strict';

const {
  resolveAgentEmailProvisioning,
  agentHasProvisionedEmail,
  filterProvisionedSkillKeys,
  getProvisioningReasonForSkill,
} = require('../services/agentProvisioningService');

describe('agentProvisioningService', () => {
  test('uses the agent email directly when it is already hydrated', async () => {
    const provisioning = await resolveAgentEmailProvisioning({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      agent: { email: 'nora@workspace.vutler.ai' },
      db: { query: jest.fn() },
    });

    expect(provisioning).toEqual({
      provisioned: true,
      email: 'nora@workspace.vutler.ai',
      source: 'agent',
    });
  });

  test('filters email skills when the agent mailbox is not provisioned', () => {
    expect(filterProvisionedSkillKeys(
      ['email_outreach', 'task_management'],
      { agent: {}, emailProvisioning: { provisioned: false, email: null } }
    )).toEqual(['task_management']);

    expect(getProvisioningReasonForSkill(
      'email_outreach',
      { agent: {}, emailProvisioning: { provisioned: false, email: null } }
    )).toBe('Email is not provisioned for this agent.');
  });

  test('uses config provisioning before direct agent email', async () => {
    const provisioning = await resolveAgentEmailProvisioning({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      agent: {
        email: 'legacy@workspace.vutler.ai',
        config: {
          provisioning: {
            email: {
              address: 'configured@workspace.vutler.ai',
              provisioned: true,
            },
          },
        },
      },
      db: { query: jest.fn() },
    });

    expect(provisioning).toEqual({
      provisioned: true,
      email: 'configured@workspace.vutler.ai',
      source: 'config',
    });
  });

  test('lets config explicitly disable email provisioning', () => {
    expect(agentHasProvisionedEmail({
      email: 'legacy@workspace.vutler.ai',
      config: {
        provisioning: {
          email: {
            provisioned: false,
          },
        },
      },
    })).toBe(false);
  });
});
