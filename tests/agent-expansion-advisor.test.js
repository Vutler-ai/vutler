'use strict';

jest.mock('../services/workspacePlanService', () => ({
  getWorkspacePlanId: jest.fn(),
}));

const { getWorkspacePlanId } = require('../services/workspacePlanService');
const { evaluateAgentExpansion } = require('../services/agentExpansionAdvisor');

describe('agentExpansionAdvisor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('recommends a specialist agent and plan upgrade when a free workspace is saturated', async () => {
    getWorkspacePlanId.mockResolvedValue('free');

    const result = await evaluateAgentExpansion({
      workspaceId: 'ws-1',
      requestedAgent: {
        id: 'agent-1',
        username: 'mike',
        type: ['technical', 'marketing'],
        capabilities: [
          'workspace_drive_write',
          'content_scheduling',
          'social_analytics',
          'email_outreach',
          'task_management',
          'status_reporting',
          'calendar_management',
        ],
      },
      availableAgents: [
        { id: 'agent-1', username: 'mike', capabilities: ['workspace_drive_write'] },
      ],
      matchedRules: [
        { key: 'social', delegateByDefault: true },
        { key: 'documentation', delegateByDefault: false },
      ],
      delegatedAgents: [],
      db: { query: jest.fn() },
    });

    expect(result.workspacePressure).toMatchObject({
      planId: 'free',
      currentAgentCount: 1,
      agentLimit: 1,
      canAddAgents: false,
      atLimit: true,
    });
    expect(result.specializationProfile).toMatchObject({
      status: 'stretching',
      persistentSkillCount: 5,
      detectedDomains: expect.arrayContaining(['social', 'documentation']),
    });
    expect(result.recommendations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'create_specialist_agent',
        domain: 'social',
        suggested_agent_type: 'marketing',
        upgrade_required: true,
      }),
      expect.objectContaining({
        type: 'split_agent_scope',
      }),
      expect.objectContaining({
        type: 'upgrade_plan_for_agents',
        current_plan: 'free',
        recommended_plan: 'agents_starter',
      }),
    ]));
  });

  test('stays quiet for a focused workspace with specialist coverage', async () => {
    getWorkspacePlanId.mockResolvedValue('agents_pro');

    const result = await evaluateAgentExpansion({
      workspaceId: 'ws-1',
      requestedAgent: {
        id: 'agent-nora',
        username: 'nora',
        type: ['marketing'],
        capabilities: ['content_scheduling', 'social_analytics'],
      },
      availableAgents: [
        { id: 'agent-nora', username: 'nora', capabilities: ['content_scheduling', 'social_analytics'] },
        { id: 'agent-luna', username: 'luna', capabilities: ['task_management'] },
      ],
      matchedRules: [
        { key: 'social', delegateByDefault: true },
      ],
      delegatedAgents: [],
      db: { query: jest.fn() },
    });

    expect(result.workspacePressure).toMatchObject({
      planId: 'agents_pro',
      canAddAgents: true,
      atLimit: false,
    });
    expect(result.specializationProfile).toMatchObject({
      status: 'focused',
      persistentSkillCount: 2,
      detectedDomains: ['social'],
    });
    expect(result.recommendations).toEqual([]);
  });
});
