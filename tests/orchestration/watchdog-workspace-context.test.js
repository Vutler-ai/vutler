'use strict';

describe('watchdog workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('rejects nudges when the task has no workspace context', async () => {
    const pool = { query: jest.fn() };
    const postTaskMessageToAgentChannel = jest.fn();

    jest.doMock('../../lib/postgres', () => ({ pool }));
    jest.doMock('../../services/orchestration/runSignals', () => ({
      appendRunEventForTask: jest.fn(),
      signalRunFromTask: jest.fn(),
      wakeRunFromTask: jest.fn(),
    }));
    jest.doMock('../../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: () => ({
        postTaskMessageToAgentChannel,
      }),
    }));

    const { AgentWatchdog } = require('../../services/watchdog');
    const watchdog = new AgentWatchdog({ checkIntervalMs: 1000, stallThresholdMs: 1000, maxNudges: 1 });

    await expect(watchdog._nudgeAgent({
      id: 'task-1',
      title: 'Follow up task',
      assigned_agent: 'mike',
      priority: 'medium',
    }, 1)).rejects.toThrow('workspace_id is required for watchdog task operations');

    expect(postTaskMessageToAgentChannel).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  });
});
