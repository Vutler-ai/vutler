'use strict';

jest.mock('../services/agentCapabilityMatrixService', () => ({
  resolveAgentCapabilityMatrix: jest.fn(),
}));

jest.mock('../services/runtimeCapabilityAvailability', () => ({
  inferProviderForSkill: jest.fn((skillKey) => {
    if (skillKey === 'email_outreach') return 'email';
    if (skillKey === 'content_scheduling') return 'social_media';
    return null;
  }),
  isProviderAvailable: jest.fn((snapshot, provider) => Boolean(snapshot?.providerStates?.[provider]?.available)),
  resolveWorkspaceCapabilityAvailability: jest.fn(),
}));

const { resolveAgentCapabilityMatrix } = require('../services/agentCapabilityMatrixService');
const { resolveWorkspaceCapabilityAvailability } = require('../services/runtimeCapabilityAvailability');
const {
  buildOverlaySuggestionMessages,
  filterExecutionOverlay,
} = require('../services/executionOverlayService');

describe('executionOverlayService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('filters desired overlays against the agent capability matrix', async () => {
    resolveWorkspaceCapabilityAvailability.mockResolvedValue({
      providerStates: {
        email: { available: true, reason: null },
        social_media: { available: true, reason: null },
        sandbox: { available: true, reason: null },
      },
      availableProviders: ['email', 'social_media', 'sandbox'],
      unavailableProviders: [],
    });
    resolveAgentCapabilityMatrix.mockResolvedValue({
      capabilities: {
        email: { effective: false, reason: 'Email is not provisioned for this agent.' },
        social: { effective: true, reason: null },
        sandbox: { effective: false, reason: 'Sandbox is reserved for technical agent types.' },
      },
    });

    const overlay = await filterExecutionOverlay({
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', type: ['marketing'] },
      overlay: {
        integrationProviders: ['email', 'social_media'],
        skillKeys: ['email_outreach', 'content_scheduling', 'status_reporting'],
        toolCapabilities: ['code_execution'],
      },
      db: { query: jest.fn() },
    });

    expect(overlay.integrationProviders).toEqual(['social_media']);
    expect(overlay.skillKeys).toEqual(expect.arrayContaining(['content_scheduling', 'status_reporting']));
    expect(overlay.skillKeys).not.toContain('email_outreach');
    expect(overlay.toolCapabilities).toEqual([]);
    expect(overlay.blocked.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'email',
        capability: 'email',
        reason: 'Email is not provisioned for this agent.',
      }),
    ]));
    expect(overlay.blocked.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'email_outreach',
        capability: 'email',
      }),
    ]));
    expect(overlay.blocked.toolCapabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'code_execution',
        capability: 'sandbox',
      }),
    ]));
  });

  test('returns early for empty overlays without resolving capability state', async () => {
    const overlay = await filterExecutionOverlay({
      workspaceId: 'ws-1',
      agent: { id: 'agent-1' },
      overlay: {
        integrationProviders: [],
        skillKeys: [],
        toolCapabilities: [],
      },
      db: { query: jest.fn() },
    });

    expect(overlay).toEqual(expect.objectContaining({
      integrationProviders: [],
      skillKeys: [],
      toolCapabilities: [],
    }));
    expect(resolveWorkspaceCapabilityAvailability).not.toHaveBeenCalled();
    expect(resolveAgentCapabilityMatrix).not.toHaveBeenCalled();
  });

  test('adds recurring blocker insights when the same capability keeps blocking runs', async () => {
    resolveWorkspaceCapabilityAvailability.mockResolvedValue({
      providerStates: {
        email: { available: true, reason: null },
      },
      availableProviders: ['email'],
      unavailableProviders: [],
    });
    resolveAgentCapabilityMatrix.mockResolvedValue({
      capabilities: {
        email: { effective: false, reason: 'Email is not provisioned for this agent.' },
      },
    });

    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.orchestration_runs')) {
          return {
            rows: [
              {
                id: 'run-1',
                requested_agent_id: 'agent-1',
                requested_agent_username: 'andrea',
                display_agent_id: 'agent-1',
                display_agent_username: 'andrea',
              },
              {
                id: 'run-2',
                requested_agent_id: 'agent-1',
                requested_agent_username: 'andrea',
                display_agent_id: 'agent-1',
                display_agent_username: 'andrea',
              },
              {
                id: 'run-3',
                requested_agent_id: 'agent-2',
                requested_agent_username: 'mike',
                display_agent_id: 'agent-2',
                display_agent_username: 'mike',
              },
            ],
          };
        }

        if (sql.includes('FROM tenant_vutler.orchestration_run_events')) {
          return {
            rows: [
              {
                run_id: 'run-1',
                payload: {
                  blocked_overlay: {
                    providers: [{ key: 'email', capability: 'email', reason: 'Email is not provisioned for this agent.' }],
                    skills: [],
                    toolCapabilities: [],
                  },
                },
              },
              {
                run_id: 'run-2',
                payload: {
                  blocked_overlay: {
                    providers: [{ key: 'email', capability: 'email', reason: 'Email is not provisioned for this agent.' }],
                    skills: [],
                    toolCapabilities: [],
                  },
                },
              },
              {
                run_id: 'run-3',
                payload: {
                  blocked_overlay: {
                    providers: [{ key: 'email', capability: 'email', reason: 'Email is not provisioned for this agent.' }],
                    skills: [],
                    toolCapabilities: [],
                  },
                },
              },
            ],
          };
        }

        throw new Error(`Unexpected SQL in recurring blocker test: ${sql}`);
      }),
    };

    const overlay = await filterExecutionOverlay({
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'andrea', type: ['sales'] },
      overlay: {
        integrationProviders: ['email'],
      },
      db,
    });

    expect(overlay.insights).toEqual(expect.objectContaining({
      escalation_recommended: true,
      recommendation_summary: expect.stringContaining('Email has blocked 3 autonomous runs'),
    }));
    expect(overlay.insights.primary_blocker).toEqual(expect.objectContaining({
      key: 'email',
      workspace_count: 3,
      agent_count: 2,
      recurring: true,
    }));

    const suggestions = buildOverlaySuggestionMessages(overlay);
    expect(suggestions).toEqual(expect.arrayContaining([
      'Provision email for this agent or route the step to an email-enabled agent.',
      expect.stringContaining('Email has blocked 3 autonomous runs'),
    ]));
  });
});
