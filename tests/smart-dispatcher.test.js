'use strict';

describe('SmartDispatcher memory relevance workspace routing', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadDispatcher({
    recallForAgent = jest.fn().mockResolvedValue({ text: 'Worked on a similar task recently.' }),
    createSniparaGateway = jest.fn(() => ({
      memory: {
        recallForAgent,
      },
    })),
  } = {}) {
    jest.doMock('../lib/postgres', () => ({
      pool: {
        query: jest.fn(),
      },
    }));
    jest.doMock('../services/snipara/gateway', () => ({
      createSniparaGateway,
      extractSniparaText: jest.fn((result) => result?.text || ''),
    }));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      AGENT_CAPABILITIES: { mike: ['task'] },
    }));

    const { SmartDispatcher } = require('../services/smartDispatcher');
    return { SmartDispatcher, createSniparaGateway, recallForAgent };
  }

  test('uses the task workspace when recalling agent memory relevance', async () => {
    const { SmartDispatcher, createSniparaGateway, recallForAgent } = loadDispatcher();
    const dispatcher = new SmartDispatcher();

    const score = await dispatcher._memoryRelevanceScore('mike', {
      title: 'Fix onboarding issue',
      workspace_id: 'ws-1',
    });

    expect(score).toBe(0.8);
    expect(createSniparaGateway).toHaveBeenCalledWith({ workspaceId: 'ws-1' });
    expect(recallForAgent).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'mike' }),
      expect.objectContaining({ query: 'Fix onboarding issue' })
    );
  });

  test('falls back to the baseline score when the task has no workspace context', async () => {
    const { SmartDispatcher, createSniparaGateway } = loadDispatcher();
    const dispatcher = new SmartDispatcher();

    const score = await dispatcher._memoryRelevanceScore('mike', {
      title: 'Fix onboarding issue',
    });

    expect(score).toBe(0.2);
    expect(createSniparaGateway).not.toHaveBeenCalled();
  });
});
