'use strict';

describe('nexusTools terminal support', () => {
  let dispatchNodeActionMock;

  beforeEach(() => {
    jest.resetModules();
    dispatchNodeActionMock = jest.fn();

    jest.doMock('../services/nexusCommandService', () => ({
      dispatchNodeAction: dispatchNodeActionMock,
    }));
  });

  test('getNexusToolsForWorkspace only exposes terminal tools when explicitly allowed', async () => {
    const { getNexusToolsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{ id: 'node-1', name: 'Nexus Node' }],
      }),
    };

    const readOnlyTools = await getNexusToolsForWorkspace('ws-1', db);
    const terminalTools = await getNexusToolsForWorkspace('ws-1', db, {
      allowTerminalSessions: true,
    });

    expect(readOnlyTools.some((tool) => tool.name === 'open_terminal_session')).toBe(false);
    expect(terminalTools.some((tool) => tool.name === 'open_terminal_session')).toBe(true);
    expect(terminalTools.some((tool) => tool.name === 'exec_terminal_session')).toBe(true);
  });

  test('executeNexusTool uses the Nexus command queue when db and workspace are provided', async () => {
    dispatchNodeActionMock.mockResolvedValue({
      queued: false,
      done: {
        status: 'completed',
        result: {
          status: 'completed',
          data: {
            sessionId: 'sess-1',
            cwd: '/tmp/project',
          },
        },
      },
    });

    const { executeNexusTool } = require('../services/nexusTools');
    const result = await executeNexusTool(
      'node-1',
      'open_terminal_session',
      { cwd: '/tmp/project' },
      { workspaceId: 'ws-1', db: { query: jest.fn() } }
    );

    expect(dispatchNodeActionMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      nodeId: 'node-1',
      action: 'terminal_open',
      args: { cwd: '/tmp/project' },
      wait: true,
    }));
    expect(result).toEqual({
      success: true,
      data: {
        sessionId: 'sess-1',
        cwd: '/tmp/project',
      },
    });
  });

  test('executeNexusTool normalizes terminal session arguments before dispatch', async () => {
    dispatchNodeActionMock.mockResolvedValue({
      queued: false,
      done: {
        status: 'completed',
        result: {
          status: 'completed',
          data: {
            sessionId: 'sess-1',
            cursor: 42,
            output: 'ok',
          },
        },
      },
    });

    const { executeNexusTool } = require('../services/nexusTools');
    await executeNexusTool(
      'node-1',
      'exec_terminal_session',
      {
        session_id: 'sess-1',
        input: 'pwd',
        wait_ms: 250,
        append_newline: false,
      },
      { workspaceId: 'ws-1', db: { query: jest.fn() } }
    );

    expect(dispatchNodeActionMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'terminal_exec',
      args: {
        sessionId: 'sess-1',
        input: 'pwd',
        waitMs: 250,
        appendNewline: false,
      },
    }));
  });
});
