'use strict';

describe('task and mail placement outputs', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('project management task creation returns a direct task link and placement metadata', async () => {
    const createTask = jest.fn().mockResolvedValue({
      id: 'task-1',
      title: 'Launch brief',
      status: 'todo',
      assigned_agent: 'mike',
      priority: 'P1',
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../../services/taskRouter', () => ({
      createTask,
      updateTask: jest.fn(),
      listTasks: jest.fn(),
    }));

    const { ProjectManagementAdapter } = require('../../services/skills/adapters/ProjectManagementAdapter');
    const adapter = new ProjectManagementAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      params: {
        action: 'create',
        title: 'Launch brief',
        description: 'Draft the go-to-market plan.',
        priority: 'high',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      id: 'task-1',
      title: 'Launch brief',
      taskUrl: '/tasks?task=task-1',
      placement: {
        root: '/tasks',
        defaulted: true,
        reason: 'task_created',
      },
    });
  });

  test('gmail draft creation returns a draft link and placement metadata', async () => {
    const query = jest.fn().mockResolvedValue({
      rows: [{ id: 'draft-1' }],
    });

    jest.doMock('../../lib/vaultbrix', () => ({
      query,
    }));
    jest.doMock('../../services/google/googleApi', () => ({
      listGmailMessages: jest.fn(),
      getGmailMessage: jest.fn(),
      listGmailLabels: jest.fn(),
    }));

    const { GmailAdapter } = require('../../services/skills/adapters/GmailAdapter');
    const adapter = new GmailAdapter();

    const result = await adapter.execute({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      params: {
        action: 'send_message',
        to: 'client@example.com',
        subject: 'Follow-up',
        body: 'Hello from Vutler',
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      status: 'pending_approval',
      draftId: 'draft-1',
      draftUrl: '/email?folder=drafts&uid=draft-1',
      placement: {
        root: '/email',
        folder: 'drafts',
        defaulted: true,
        reason: 'draft_created',
      },
    });
    expect(query).toHaveBeenCalled();
  });
});
