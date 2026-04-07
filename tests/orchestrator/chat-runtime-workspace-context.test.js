'use strict';

describe('chatRuntime workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SNIPARA_API_KEY = '';
  });

  afterEach(() => {
    delete process.env.SNIPARA_API_KEY;
  });

  function loadRuntime() {
    jest.doMock('../../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        analyzeAndRoute: jest.fn(),
        resolveAgentExecutionContext: jest.fn(),
      }),
    }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../../services/memory/runtime', () => ({
      createMemoryRuntimeService: () => ({
        preparePromptContext: jest.fn(),
        recordConversation: jest.fn(),
      }),
    }));
    jest.doMock('../../services/snipara/gateway', () => ({
      createSniparaGateway: jest.fn(() => ({
        resolveConfig: jest.fn(),
        call: jest.fn(),
      })),
    }));
    jest.doMock('../../services/sniparaMemoryService', () => ({
      resolveAgentRecord: jest.fn(),
    }));
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn(),
    }));
    jest.doMock('../../services/agentProvisioningService', () => ({
      resolveAgentEmailProvisioning: jest.fn(),
      agentHasProvisionedEmail: jest.fn(() => false),
    }));
    jest.doMock('../../services/executionOverlayService', () => ({
      buildOverlaySuggestionMessages: jest.fn(() => []),
      filterExecutionOverlay: jest.fn(async ({ overlay }) => overlay),
      isOverlayEmpty: jest.fn(() => true),
    }));

    return require('../../app/custom/services/chatRuntime');
  }

  test('does not synthesize a default workspace id', () => {
    const chatRuntime = loadRuntime();
    expect(() => chatRuntime._test.normalizeWorkspaceId()).toThrow('workspaceId is required for chat runtime operations');
  });

  test('rejects processing a message by id without workspace context', async () => {
    const chatRuntime = loadRuntime();
    await expect(chatRuntime.processMessageById('msg-1')).rejects.toThrow('workspaceId is required for chat runtime operations');
  });
});
