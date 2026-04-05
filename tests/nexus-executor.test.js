'use strict';

describe('nexusExecutor workspace-backed email execution', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('allows send_email execution without a nexus node id', async () => {
    const executeNexusToolMock = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'email-1',
      },
    });

    jest.doMock('../services/nexusTools', () => ({
      executeNexusTool: executeNexusToolMock,
    }));

    const { executeNexusPlan } = require('../services/executors/nexusExecutor');
    const result = await executeNexusPlan(
      {
        toolName: 'send_email',
        params: {
          args: {
            to: 'client@example.com',
            subject: 'Test',
            body: 'Hello',
          },
        },
      },
      {
        workspaceId: 'ws-1',
        db: { query: jest.fn() },
        agent: { id: 'agent-1' },
      }
    );

    expect(executeNexusToolMock).toHaveBeenCalledWith(
      null,
      'send_email',
      {
        to: 'client@example.com',
        subject: 'Test',
        body: 'Hello',
      },
      expect.objectContaining({
        workspaceId: 'ws-1',
        agent: { id: 'agent-1' },
      })
    );
    expect(result).toEqual({
      success: true,
      data: {
        id: 'email-1',
      },
    });
  });

  test('still requires a nexus node id for non-email tools', async () => {
    const { executeNexusPlan } = require('../services/executors/nexusExecutor');

    await expect(executeNexusPlan(
      {
        toolName: 'search_files',
        params: {
          args: {
            query: 'brief',
          },
        },
      },
      {
        workspaceId: 'ws-1',
        db: { query: jest.fn() },
      }
    )).rejects.toThrow('Nexus execution requires a node id.');
  });
});
