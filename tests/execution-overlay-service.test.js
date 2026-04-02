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
const { filterExecutionOverlay } = require('../services/executionOverlayService');

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
});
