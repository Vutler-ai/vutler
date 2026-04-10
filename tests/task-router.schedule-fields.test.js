'use strict';

describe('taskRouter schedule fields', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('forwards due_date and reminder_at to the swarm coordinator', async () => {
    const createTaskMock = jest.fn().mockResolvedValue({
      id: 'task-1',
      title: 'Publish',
      status: 'pending',
      assigned_agent: 'max',
      priority: 'P2',
    });

    jest.doMock('../lib/postgres', () => ({
      pool: {
        query: jest.fn().mockResolvedValue({
          rows: [{ config: { skills: [] } }],
        }),
      },
    }));
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({
        createTask: createTaskMock,
      })),
    }));

    const taskRouter = require('../services/taskRouter');

    await taskRouter.createTask({
      title: 'Publish queued post',
      description: 'Use the approved LinkedIn copy.',
      workspace_id: 'ws-1',
      assigned_agent: 'max',
      due_date: '2026-04-15T09:00:00.000Z',
      reminder_at: '2026-04-15T08:30:00.000Z',
      metadata: {
        origin: 'test',
      },
    });

    expect(createTaskMock).toHaveBeenCalledWith(
      expect.objectContaining({
        due_date: '2026-04-15T09:00:00.000Z',
        reminder_at: '2026-04-15T08:30:00.000Z',
        metadata: expect.objectContaining({
          due_date: '2026-04-15T09:00:00.000Z',
          reminder_at: '2026-04-15T08:30:00.000Z',
          origin: 'test',
        }),
      }),
      'ws-1'
    );
  });
});
