'use strict';

describe('TaskExecutor due date gating', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('claimPendingTasks skips tasks whose due_date is still in the future', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../services/swarmCoordinator', () => ({ getSwarmCoordinator: jest.fn() }));
    jest.doMock('../services/chatMessages', () => ({ insertChatMessage: jest.fn() }));
    jest.doMock('../services/memory/runtime', () => ({
      createMemoryRuntimeService: jest.fn(() => ({
        preparePromptContext: jest.fn().mockResolvedValue({ prompt: '', mode: null }),
      })),
    }));
    jest.doMock('../services/sniparaMemoryService', () => ({
      resolveAgentRecord: jest.fn(),
    }));
    jest.doMock('../services/orchestration/runSignals', () => ({
      signalRunFromTask: jest.fn(),
    }));
    jest.doMock('../services/executionOverlayService', () => ({
      buildOverlaySuggestionMessages: jest.fn(() => []),
      filterExecutionOverlay: jest.fn(() => ({})),
      isOverlayEmpty: jest.fn(() => true),
    }));
    jest.doMock('../services/orchestration/runStore', () => ({
      ensureRunForTask: jest.fn(),
      isMissingOrchestrationSchemaError: jest.fn(() => false),
    }));

    const taskExecutor = require('../app/custom/services/taskExecutor');

    await taskExecutor.claimPendingTasks(3);

    expect(query).toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain('(due_date IS NULL OR due_date <= NOW())');
  });
});
