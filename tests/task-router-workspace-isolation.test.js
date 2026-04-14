'use strict';

describe('task router workspace isolation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('getDueTasks scopes by workspace when provided', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    jest.doMock('../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../services/orchestration/runSignals', () => ({ signalRunFromTask: jest.fn() }));

    const taskRouter = require('../services/taskRouter');
    await taskRouter.getDueTasks('ws-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $1'),
      ['ws-1']
    );
  });

  test('getOverdueTasks scopes by workspace when provided', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    jest.doMock('../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../services/orchestration/runSignals', () => ({ signalRunFromTask: jest.fn() }));

    const taskRouter = require('../services/taskRouter');
    await taskRouter.getOverdueTasks('ws-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $1'),
      ['ws-1']
    );
  });

  test('checkReminders scopes by workspace when provided', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    jest.doMock('../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../services/orchestration/runSignals', () => ({ signalRunFromTask: jest.fn() }));

    const taskRouter = require('../services/taskRouter');
    await taskRouter.checkReminders('ws-1');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_id = $1'),
      ['ws-1']
    );
  });

  test('createTask rejects calls without workspace context', async () => {
    const query = jest.fn(async () => ({ rows: [] }));
    const createTask = jest.fn();
    jest.doMock('../lib/postgres', () => ({ pool: { query } }));
    jest.doMock('../services/orchestration/runSignals', () => ({ signalRunFromTask: jest.fn() }));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({ createTask })),
    }));

    const taskRouter = require('../services/taskRouter');

    await expect(taskRouter.createTask({
      title: 'Tenant-safe task',
      description: 'Should fail closed',
      assigned_agent: 'agent-1',
    })).rejects.toThrow('workspace_id is required for taskRouter.createTask');

    expect(createTask).not.toHaveBeenCalled();
  });
});
