'use strict';

describe('taskExecutor locking', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('two claims do not return the same task', async () => {
    const pending = [{ id: 'task-1', status: 'pending', title: 'One' }];
    const poolQuery = jest.fn(async (sql, params) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return { rows: pending.splice(0, params[0]).map((task) => ({ ...task, status: 'in_progress' })) };
      }
      return { rows: [] };
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query: poolQuery }));
    jest.doMock('../../services/llmRouter', () => ({ chat: jest.fn() }));
    jest.doMock('../../services/swarmCoordinator', () => ({ getSwarmCoordinator: jest.fn() }));
    jest.doMock('../../api/ws-chat', () => ({ publishMessage: jest.fn() }));

    const taskExecutor = require('../../app/custom/services/taskExecutor');
    const first = await taskExecutor.claimPendingTasks(1);
    const second = await taskExecutor.claimPendingTasks(1);

    expect(first).toHaveLength(1);
    expect(first[0].id).toBe('task-1');
    expect(second).toHaveLength(0);
    expect(poolQuery.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
  });
});
