'use strict';

describe('custom API workspace context enforcement', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function expectWorkspaceGuard(router, accessor = '_private') {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    router[accessor].ensureWorkspaceContext({ headers: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'workspace context is required',
    });
  }

  test('custom chat API requires explicit workspace context', () => {
    jest.doMock('../services/chatMessages', () => ({ insertChatMessage: jest.fn(), normalizeChatMessage: jest.fn() }));
    jest.doMock('../services/chatChannelMaintenance', () => ({
      canonicalDmNameForContact: jest.fn(),
      ensureChatPreferencesTable: jest.fn(),
      findExistingDmChannelId: jest.fn(),
      normalizeLegacyDmRows: jest.fn(),
    }));
    jest.doMock('../services/memory/runtime', () => ({ createMemoryRuntimeService: jest.fn(() => ({ preparePromptContext: jest.fn() })) }));
    jest.doMock('../services/agentDriveService', () => ({ uploadFileToAgentDrive: jest.fn() }));
    const router = require('../app/custom/api/chat');
    expect(router._private.wsId({ headers: {} })).toBeNull();
    expectWorkspaceGuard(router);
  });

  test('custom orchestration API requires explicit workspace context', () => {
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    jest.doMock('../services/orchestration/runEngine', () => ({ getRunEngine: jest.fn() }));
    jest.doMock('../services/orchestration/runStore', () => ({
      getAutonomyMetrics: jest.fn(),
      getRunById: jest.fn(),
      getCurrentRunStep: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps: jest.fn(),
    }));
    const router = require('../app/custom/api/orchestration');
    expect(router._private.workspaceIdOf({ headers: {} })).toBeNull();
    expectWorkspaceGuard(router);
  });

  test('custom nexus API requires explicit workspace context', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    const router = require('../app/custom/api/nexus');
    expect(router._private.getWorkspaceId({ headers: {} })).toBeNull();
    expectWorkspaceGuard(router);
  });

  test('custom tasks-v2 API requires explicit workspace context', () => {
    jest.doMock('../app/custom/lib/auth', () => ({ authenticateAgent: (_req, _res, next) => next() }));
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({ getSwarmCoordinator: jest.fn() }));
    jest.doMock('../services/orchestration/runSignals', () => ({ signalRunFromTask: jest.fn() }));
    jest.doMock('../services/workspaceRealtime', () => ({ publishTaskDeleted: jest.fn(), publishTaskEvent: jest.fn() }));
    jest.doMock('../services/taskHierarchyRollupService', () => ({ refreshTaskHierarchyRollups: jest.fn() }));
    const router = require('../app/custom/api/tasks-v2');
    expect(router.__test.wsId({ headers: {} })).toBeNull();
    expectWorkspaceGuard(router, '__test');
  });
});
