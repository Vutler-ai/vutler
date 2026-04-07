'use strict';

describe('SwarmCoordinator workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  function loadCoordinator() {
    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../../services/fetchWithTimeout', () => ({ fetchWithTimeout: jest.fn() }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/sniparaTaskAdapter', () => ({ getSniparaTaskAdapter: jest.fn() }));
    jest.doMock('../../services/snipara/gateway', () => ({ createSniparaGateway: jest.fn() }));
    jest.doMock('../../services/sniparaResolver', () => ({ DEFAULT_SNIPARA_SWARM_ID: null }));
    jest.doMock('../../services/agentConfigPolicy', () => ({
      ALWAYS_ON_TOOL_SKILL_KEYS: [],
      buildInternalPlacementInstruction: jest.fn(() => 'Use drive roots consistently.'),
      normalizeCapabilities: jest.fn((caps) => caps || []),
      splitCapabilities: jest.fn(() => ({})),
    }));
    jest.doMock('../../services/drivePlacementPolicy', () => ({ resolveWorkspaceDriveRoot: jest.fn() }));
    jest.doMock('../../services/agentDriveService', () => ({
      buildAgentDrivePlacementInstruction: jest.fn(() => ''),
      resolveAgentDriveRoot: jest.fn(),
    }));
    jest.doMock('../../services/orchestration/runSignals', () => ({ signalRunFromTask: jest.fn() }));
    jest.doMock('../../services/workspaceRealtime', () => ({ publishTaskEvent: jest.fn() }));
    jest.doMock('../../services/taskHierarchyRollupService', () => ({ refreshTaskHierarchyRollups: jest.fn() }));

    return require('../../app/custom/services/swarmCoordinator');
  }

  test('does not synthesize a default workspace id', () => {
    const { normalizeWorkspaceId } = loadCoordinator();
    expect(() => normalizeWorkspaceId()).toThrow('workspaceId is required for swarm coordination');
  });

  test('rejects chat task creation without workspace context', async () => {
    const { SwarmCoordinator } = loadCoordinator();
    const coordinator = new SwarmCoordinator();

    await expect(coordinator.createTaskFromChatMessage('create task: test follow-up'))
      .rejects.toThrow('workspaceId is required for swarm coordination');
  });
});
