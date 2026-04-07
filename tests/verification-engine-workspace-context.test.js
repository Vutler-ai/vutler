'use strict';

describe('verificationEngine workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('passes the task workspace to verifier LLM calls', async () => {
    const chat = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        overall_pass: true,
        overall_score: 8,
        scores: [],
        summary: 'Looks good.',
      }),
    });

    jest.doMock('../lib/postgres', () => ({ pool: { query: jest.fn() } }));
    jest.doMock('../services/llmRouter', () => ({ chat }));

    const { VerificationEngine } = require('../services/verificationEngine');
    const engine = new VerificationEngine();

    await engine.evaluateTaskOutput({
      id: 'task-1',
      workspace_id: 'ws-verify-1',
      title: 'Review output',
      description: 'Task description',
      metadata: {
        acceptance_criteria: ['Criterion A'],
      },
    }, 'Completed output');

    expect(chat).toHaveBeenCalledWith(expect.objectContaining({
      name: 'verifier',
      workspace_id: 'ws-verify-1',
    }), expect.any(Array));
  });

  test('rejects missing task workspace before creating revision work', async () => {
    const pool = { query: jest.fn() };
    const createTask = jest.fn();

    jest.doMock('../lib/postgres', () => ({ pool }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        createTask,
        getTeamChannelId: jest.fn(),
        postSystemMessage: jest.fn(),
      }),
    }));

    const { VerificationEngine } = require('../services/verificationEngine');
    const engine = new VerificationEngine();
    engine.recordVerdict = jest.fn().mockResolvedValue(null);

    await expect(engine._requestRevision({
      id: 'task-2',
      title: 'Fix response',
      assigned_agent: 'mike',
    }, {}, {
      overall_score: 4,
      scores: [
        { criterion: 'Criterion A', score: 4, feedback: 'Missing details' },
      ],
    }, 1)).rejects.toThrow('workspace_id is required for verification tasks');

    expect(createTask).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
