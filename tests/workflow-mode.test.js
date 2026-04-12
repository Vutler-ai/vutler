'use strict';

describe('WorkflowModeSelector', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  test('uses RELP decomposition and multi-query before falling back to a single context query', async () => {
    const inject = jest.fn().mockResolvedValue({ success: true });
    const decompose = jest.fn().mockResolvedValue({
      subqueries: ['login flow', 'jwt rotation', 'session invalidation'],
    });
    const multiQuery = jest.fn().mockResolvedValue({
      results: [
        { query: 'login flow', content: 'Login flow context' },
        { query: 'jwt rotation', content: 'JWT rotation context' },
      ],
    });
    const plan = jest.fn().mockRejectedValue(new Error('plan unavailable'));
    const rememberForAgent = jest.fn().mockResolvedValue({ success: true });
    const recallForAgent = jest.fn().mockResolvedValue({ memories: [] });
    const coordinator = {
      workspaceId: 'ws-1',
      swarmId: 'swarm-1',
      sniparaCall: jest.fn((toolName, args) => {
        if (toolName === 'rlm_recall') return Promise.resolve({ memories: [] });
        if (toolName === 'rlm_context_query') return Promise.resolve({ content: 'Fallback context' });
        return Promise.resolve(null);
      }),
    };

    jest.doMock('../services/snipara/gateway', () => ({
      createSniparaGateway: jest.fn(() => ({
        session: { inject },
        workflow: { decompose, plan },
        knowledge: { multiQuery },
        memory: { rememberForAgent, recallForAgent },
      })),
      extractSniparaText: jest.fn((value) => JSON.stringify(value)),
    }));
    jest.doMock('../services/llmRouter', () => ({
      chat: jest.fn(),
    }));

    const { WorkflowModeSelector } = require('../services/workflowMode');
    const selector = new WorkflowModeSelector();
    const result = await selector.gatherFullContext('agent-1', {
      title: 'Harden auth flow',
      description: 'Investigate login and refresh token behavior',
      workspace_id: 'ws-1',
    }, coordinator);

    expect(inject).toHaveBeenCalledWith({
      context: 'Task focus: Harden auth flow Investigate login and refresh token behavior',
      append: false,
    });
    expect(decompose).toHaveBeenCalledWith({
      query: 'Harden auth flow Investigate login and refresh token behavior',
      max_subqueries: 4,
    });
    expect(multiQuery).toHaveBeenCalledWith({
      queries: ['login flow', 'jwt rotation', 'session invalidation'],
      tokens_per_query: 2000,
    });
    expect(coordinator.sniparaCall).toHaveBeenCalledWith('rlm_recall', expect.any(Object));
    expect(coordinator.sniparaCall).not.toHaveBeenCalledWith('rlm_context_query', expect.any(Object));
    expect(result.deepContext).toMatchObject({
      results: expect.any(Array),
    });
  });
});
