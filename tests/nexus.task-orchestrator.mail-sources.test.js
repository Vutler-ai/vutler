'use strict';

const { TaskOrchestrator } = require('../packages/nexus/lib/task-orchestrator');

describe('TaskOrchestrator mail source routing', () => {
  test('uses workspace mail for explicit google sources on Nexus Local', async () => {
    const workspaceMail = {
      searchEmails: jest.fn().mockResolvedValue([{ id: 'g-1', source: 'google' }]),
    };
    const localMail = {
      searchEmails: jest.fn(),
    };

    const orchestrator = new TaskOrchestrator({
      workspaceMail,
      mail: localMail,
    }, null);

    const result = await orchestrator.execute({
      taskId: 'task-1',
      action: 'search_emails',
      params: {
        source: 'google',
        query: 'invoice',
      },
      agentId: 'agent-1',
      timestamp: new Date().toISOString(),
    });

    expect(result.status).toBe('completed');
    expect(workspaceMail.searchEmails).toHaveBeenCalledWith('invoice', expect.objectContaining({
      source: 'google',
    }));
    expect(localMail.searchEmails).not.toHaveBeenCalled();
  });

  test('uses the local mail provider for local mailbox reads', async () => {
    const workspaceMail = {
      listEmails: jest.fn(),
    };
    const localMail = {
      listEmails: jest.fn().mockResolvedValue([{ id: 'l-1', source: 'local' }]),
    };

    const orchestrator = new TaskOrchestrator({
      workspaceMail,
      mail: localMail,
    }, null);

    const result = await orchestrator.execute({
      taskId: 'task-2',
      action: 'list_emails',
      params: {
        source: 'local',
      },
      agentId: 'agent-1',
      timestamp: new Date().toISOString(),
    });

    expect(result.status).toBe('completed');
    expect(localMail.listEmails).toHaveBeenCalledWith(expect.objectContaining({
      source: 'local',
    }));
    expect(workspaceMail.listEmails).not.toHaveBeenCalled();
  });
});
