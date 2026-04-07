'use strict';

describe('runEngine workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../services/orchestrationCapabilityResolver', () => ({
      resolveOrchestrationCapabilities: jest.fn().mockResolvedValue({
        domains: [],
        overlayProviders: [],
        overlaySkillKeys: [],
        overlayToolCapabilities: [],
        primaryDelegate: null,
        delegatedAgents: [],
        reasons: [],
        availability: null,
        unavailableDomains: [],
        workspacePressure: null,
        specializationProfile: null,
        recommendations: [],
      }),
    }));
  });

  test('rejects chat result posting when the root task has no workspace context', async () => {
    const insertChatMessage = jest.fn();
    const poolQuery = jest.fn();

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/chatMessages', () => ({ insertChatMessage }));
    jest.doMock('../../services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({}),
    }));
    jest.doMock('../../services/verificationEngine', () => ({
      getVerificationEngine: () => ({
        maxRetries: 3,
        passThreshold: 7,
        evaluateTaskOutput: jest.fn(),
        recordVerdict: jest.fn(),
      }),
    }));
    jest.doMock('../../services/workspaceRealtime', () => ({ publishTaskEvent: jest.fn() }));
    jest.doMock('../../services/executionOverlayService', () => ({
      buildOverlaySuggestionMessages: jest.fn(() => []),
      filterExecutionOverlay: jest.fn((value) => value),
      isOverlayEmpty: jest.fn(() => true),
    }));
    jest.doMock('../../services/orchestration/runStore', () => ({
      DEFAULT_LEASE_MS: 60_000,
      TERMINAL_RUN_STATUSES: new Set(['completed', 'failed', 'cancelled', 'timed_out']),
      appendRunEvent: jest.fn(),
      claimRunnableRuns: jest.fn(),
      createRunStep: jest.fn(),
      getCurrentRunStep: jest.fn(),
      getRunById: jest.fn(),
      heartbeatRunLease: jest.fn(),
      listRunEvents: jest.fn(),
      listRunSteps: jest.fn(),
      parseJsonLike: jest.requireActual('../../services/orchestration/runStore').parseJsonLike,
      updateRun: jest.fn(),
      updateRunStep: jest.fn(),
    }));
    jest.doMock('../../services/orchestration/runPlanner', () => ({
      buildRunPlan: jest.fn(),
      getPlanPhaseCount: jest.fn(() => 0),
      resolveNextPlanPhase: jest.fn(),
      resolvePlanPhase: jest.fn(),
    }));

    const { OrchestrationRunEngine } = require('../../services/orchestration/runEngine');
    const engine = new OrchestrationRunEngine();

    await expect(engine.postRootTaskFailure({
      id: 'root-task-1',
      title: 'Broken task',
      metadata: {
        origin: 'chat',
        origin_chat_channel_id: 'channel-1',
      },
    }, 'failure details')).rejects.toThrow('workspaceId is required for run engine operations');

    expect(insertChatMessage).not.toHaveBeenCalled();
    expect(poolQuery).not.toHaveBeenCalled();
  });
});
