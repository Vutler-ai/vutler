'use strict';

function createRes() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('workspace context hardening', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('memory API rejects requests without workspace context', async () => {
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    jest.doMock('../services/sniparaMemoryService', () => ({
      DEFAULT_COUNT_LIMIT: 50,
      normalizeRole: jest.fn((value) => value),
      resolveAgentRecord: jest.fn(),
      listAgentMemories: jest.fn(),
      listTemplateMemories: jest.fn(),
      buildAgentContext: jest.fn(),
      loadWorkspaceKnowledge: jest.fn(),
      rememberAgentMemory: jest.fn(),
      getAgentMemoryById: jest.fn(),
      attachMemorySource: jest.fn(),
      verifyAgentMemory: jest.fn(),
      invalidateAgentMemory: jest.fn(),
      supersedeAgentMemory: jest.fn(),
      softDeleteAgentMemory: jest.fn(),
      promoteAgentMemoryToTemplate: jest.fn(),
    }));
    jest.doMock('../services/workspaceKnowledgeService', () => ({
      normalizeSharedMemoryPolicy: jest.fn(),
      canReadSharedMemory: jest.fn(),
      canWriteSharedMemory: jest.fn(),
      getWorkspaceKnowledgeState: jest.fn(),
      saveWorkspaceKnowledge: jest.fn(),
      saveSharedMemoryPolicy: jest.fn(),
    }));
    jest.doMock('../services/sessionContinuityService', () => ({
      AGENT_PROFILE_KIND: 'profile',
      AGENT_SESSION_KIND: 'session',
      getWorkspaceSessionBrief: jest.fn(),
      saveWorkspaceSessionBrief: jest.fn(),
      getAgentContinuityBrief: jest.fn(),
      saveAgentContinuityBrief: jest.fn(),
    }));
    jest.doMock('../services/journalCompactionService', () => ({
      WORKSPACE_SCOPE: 'workspace',
      AGENT_SCOPE: 'agent',
      JOURNAL_AUTOMATION_MODE_MANUAL: 'manual',
      JOURNAL_AUTOMATION_MODE_ON_SAVE: 'on_save',
      normalizeJournalDate: jest.fn(),
      normalizeJournalAutomationScope: jest.fn(),
      getWorkspaceJournal: jest.fn(),
      saveWorkspaceJournal: jest.fn(),
      summarizeWorkspaceJournalToBrief: jest.fn(),
      getAgentJournal: jest.fn(),
      saveAgentJournal: jest.fn(),
      summarizeAgentJournalToBrief: jest.fn(),
      listJournalAutomationPolicies: jest.fn(),
      getJournalAutomationSweepStatus: jest.fn(),
      getJournalAutomationRuntimeStatus: jest.fn(),
      saveJournalAutomationPolicy: jest.fn(),
      runJournalAutomationSweep: jest.fn(),
    }));
    jest.doMock('../services/groupMemoryService', () => ({
      listGroupMemorySpaces: jest.fn(),
      createGroupMemorySpace: jest.fn(),
      updateGroupMemorySpace: jest.fn(),
      deleteGroupMemorySpace: jest.fn(),
      listAgentGroupMemories: jest.fn(),
      autoPromoteVerifiedMemoryToGroupSpaces: jest.fn(),
    }));

    const router = require('../api/memory');
    const middlewareLayer = router.stack.find((entry) => !entry.route && typeof entry.handle === 'function');
    const req = {};
    const res = createRes();
    const next = jest.fn();

    await middlewareLayer.handle(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'workspace context is required' });
  });

  test('workspace features rejects requests without workspace context', async () => {
    const router = require('../api/workspace');
    const layer = router.stack.find((entry) => entry.route?.path === '/features' && entry.route?.methods?.get);
    const [requireWorkspace] = layer.route.stack.map((entry) => entry.handle);
    const req = {};
    const res = createRes();
    const next = jest.fn();

    await requireWorkspace(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'workspace context is required' });
  });
});
