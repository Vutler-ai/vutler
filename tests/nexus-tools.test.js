'use strict';

describe('nexusTools terminal support', () => {
  let dispatchNodeActionMock;
  const freshTimestamp = new Date().toISOString();

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
        rows: [{
          id: 'node-1',
          name: 'Nexus Node',
          status: 'online',
          updated_at: freshTimestamp,
          created_at: freshTimestamp,
        }],
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

  test('getNexusToolsForWorkspace filters local tools by consented actions and discovery readiness', async () => {
    const { getNexusToolsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'node-1',
          name: 'Nexus Node',
          status: 'online',
          type: 'local',
          mode: 'local',
          updated_at: freshTimestamp,
          created_at: freshTimestamp,
          config: {
            permissions: {
              allowedActions: ['search', 'read_document'],
            },
            discovery_snapshot: {
              providers: {
                search: { available: true },
                documents: { available: true },
                filesystem: { available: true },
                mail: { available: false },
                calendar: { available: true },
                contacts: { available: true },
                clipboard: { available: true },
              },
            },
          },
        }],
      }),
    };

    const tools = await getNexusToolsForWorkspace('ws-1', db);
    const names = tools.map((tool) => tool.name);

    expect(names).toEqual(expect.arrayContaining(['search_files', 'read_document']));
    expect(names).not.toContain('list_directory');
    expect(names).not.toContain('read_emails');
    expect(names).not.toContain('read_calendar');
    expect(names).not.toContain('read_contacts');
    expect(names).not.toContain('read_clipboard');
  });

  test('getNexusToolsForWorkspace exposes local mail reading when that consent is granted', async () => {
    const { getNexusToolsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'node-1',
          name: 'Nexus Node',
          status: 'online',
          type: 'local',
          mode: 'local',
          updated_at: freshTimestamp,
          created_at: freshTimestamp,
          config: {
            permissions: {
              allowedActions: ['list_emails'],
            },
            discovery_snapshot: {
              detectedApps: [{ key: 'mail', label: 'Apple Mail' }],
              providers: {
                mail: { available: true },
              },
            },
          },
        }],
      }),
    };

    const tools = await getNexusToolsForWorkspace('ws-1', db);
    const readEmailsTool = tools.find((tool) => tool.name === 'read_emails');

    expect(readEmailsTool).toBeTruthy();
    expect(readEmailsTool.input_schema.properties.source).toEqual(expect.objectContaining({
      type: 'string',
    }));
  });

  test('getNexusToolsForWorkspace keeps read_emails available on Nexus Local when workspace mail sources exist', async () => {
    const { getNexusToolsForWorkspace, getMailboxSourceOptionsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (String(sql).includes('FROM tenant_vutler.workspace_integrations')) {
          return {
            rows: [
              { provider: 'google' },
              { provider: 'microsoft365' },
            ],
          };
        }
        return {
          rows: [{
            id: 'node-1',
            name: 'Nexus Node',
            status: 'online',
            type: 'local',
            mode: 'local',
            updated_at: freshTimestamp,
            created_at: freshTimestamp,
            config: {
              permissions: {
                allowedActions: ['list_emails'],
              },
              discovery_snapshot: {
                detectedApps: [{ key: 'mail', label: 'Apple Mail' }],
                providers: {
                  mail: { available: false },
                },
              },
            },
          }],
        };
      }),
    };

    const tools = await getNexusToolsForWorkspace('ws-1', db, {
      workspaceMailAvailable: true,
    });
    const sources = await getMailboxSourceOptionsForWorkspace('ws-1', db, {
      workspaceMailAvailable: true,
    });

    expect(tools.some((tool) => tool.name === 'read_emails')).toBe(true);
    expect(sources.map((entry) => entry.key)).toEqual(['google', 'microsoft365', 'workspace']);
  });

  test('getNexusToolsForWorkspace exposes direct email tools on local nodes only when the agent email capability is effective', async () => {
    const { getNexusToolsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'node-1',
          name: 'Local Node',
          status: 'online',
          type: 'local',
          mode: 'local',
          updated_at: freshTimestamp,
          created_at: freshTimestamp,
          config: {},
        }],
      }),
    };

    const disabledTools = await getNexusToolsForWorkspace('ws-1', db, {
      emailCapabilityEffective: false,
    });
    const enabledTools = await getNexusToolsForWorkspace('ws-1', db, {
      emailCapabilityEffective: true,
      workspaceMailAvailable: true,
      workspaceCalendarAvailable: true,
      workspaceContactsAvailable: true,
    });

    expect(disabledTools.some((tool) => tool.name === 'send_email')).toBe(false);
    expect(disabledTools.some((tool) => tool.name === 'draft_email')).toBe(false);
    expect(enabledTools.some((tool) => tool.name === 'send_email')).toBe(true);
    expect(enabledTools.some((tool) => tool.name === 'draft_email')).toBe(true);
  });

  test('getNexusToolsForWorkspace still exposes workspace email tools when no online node is available', async () => {
    const { getNexusToolsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const tools = await getNexusToolsForWorkspace('ws-1', db, {
      emailCapabilityEffective: true,
    });

    expect(tools.map((tool) => tool.name)).toEqual(['send_email', 'draft_email']);
  });

  test('getNexusToolsForWorkspace still exposes workspace mail, calendar, and contacts tools on enterprise nodes', async () => {
    const { getNexusToolsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockResolvedValue({
        rows: [{
          id: 'node-1',
          name: 'Enterprise Node',
          status: 'online',
          type: 'docker',
          mode: 'enterprise',
          updated_at: freshTimestamp,
          created_at: freshTimestamp,
          config: {},
        }],
      }),
    };

    const enabledTools = await getNexusToolsForWorkspace('ws-1', db, {
      emailCapabilityEffective: true,
      workspaceMailAvailable: true,
      workspaceCalendarAvailable: true,
      workspaceContactsAvailable: true,
    });

    expect(enabledTools.some((tool) => tool.name === 'send_email')).toBe(true);
    expect(enabledTools.some((tool) => tool.name === 'draft_email')).toBe(true);
    expect(enabledTools.some((tool) => tool.name === 'read_emails')).toBe(true);
    expect(enabledTools.some((tool) => tool.name === 'read_calendar')).toBe(true);
    expect(enabledTools.some((tool) => tool.name === 'read_contacts')).toBe(true);
  });

  test('getEmailSendSourceOptionsForWorkspace exposes personal mailbox sends only when local on-behalf consent is granted', async () => {
    const { getEmailSendSourceOptionsForWorkspace } = require('../services/nexusTools');
    const db = {
      query: jest.fn().mockImplementation(async (sql) => {
        if (String(sql).includes('FROM tenant_vutler.workspace_integrations')) {
          return {
            rows: [
              { provider: 'google' },
              { provider: 'microsoft365' },
            ],
          };
        }
        return {
          rows: [{
            id: 'node-1',
            name: 'Local Node',
            status: 'online',
            type: 'local',
            mode: 'local',
            updated_at: freshTimestamp,
            created_at: freshTimestamp,
            config: {
              permissions: {
                allowedActions: ['list_emails', 'send_email_on_behalf'],
              },
            },
          }],
        };
      }),
    };

    const sources = await getEmailSendSourceOptionsForWorkspace('ws-1', db, {
      emailCapabilityEffective: true,
    });

    expect(sources.map((entry) => entry.key)).toEqual(['agent', 'google', 'microsoft365']);
  });

  test('selectBestOnlineNexusNode ignores stale online records without heartbeat and prefers a fresh heartbeat node', async () => {
    const { selectBestOnlineNexusNode } = require('../services/nexusTools');
    const now = Date.parse('2026-04-05T09:20:00.000Z');

    const selected = selectBestOnlineNexusNode([
      {
        id: 'stale-e2e',
        status: 'online',
        last_heartbeat: null,
        updated_at: '2026-03-31T07:05:19.468Z',
        created_at: '2026-03-31T07:05:19.468Z',
      },
      {
        id: 'fresh-node',
        status: 'online',
        last_heartbeat: '2026-04-05T09:19:40.000Z',
        updated_at: '2026-04-05T09:19:40.000Z',
        created_at: '2026-04-05T09:10:00.000Z',
      },
      {
        id: 'fresh-no-heartbeat',
        status: 'online',
        last_heartbeat: null,
        updated_at: '2026-04-05T09:19:50.000Z',
        created_at: '2026-04-05T09:19:50.000Z',
      },
    ], now);

    expect(selected).toEqual(expect.objectContaining({ id: 'fresh-node' }));
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

  test('executeNexusTool sends workspace email directly without dispatching to a Nexus node', async () => {
    const execute = jest.fn().mockResolvedValue({
      success: true,
      data: {
        id: 'email-1',
        status: 'sent',
      },
    });

    jest.doMock('../services/skills/adapters/EmailAdapter', () => ({
      EmailAdapter: jest.fn().mockImplementation(() => ({
        execute,
      })),
    }));

    const { executeNexusTool } = require('../services/nexusTools');
    const result = await executeNexusTool(
      'node-stale',
      'send_email',
      {
        to: 'client@example.com',
        subject: 'Hello',
        body: 'Body',
        agentId: 'agent-1',
      },
      {
        workspaceId: 'ws-1',
        db: {
          query: jest.fn().mockResolvedValue({
            rows: [{
              id: 'node-stale',
              type: 'local',
              mode: 'local',
              status: 'online',
              config: {},
            }],
          }),
        },
        agent: { id: 'agent-1', email: 'nora@starbox-group.com' },
        latestUserMessage: 'Envoie cet email maintenant.',
      }
    );

    expect(dispatchNodeActionMock).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      agent: { id: 'agent-1', email: 'nora@starbox-group.com' },
      latestUserMessage: 'Envoie cet email maintenant.',
      nexusNode: expect.objectContaining({
        id: 'node-stale',
        type: 'local',
        mode: 'local',
      }),
      params: {
        action: 'send_message',
        to: 'client@example.com',
        subject: 'Hello',
        body: 'Body',
        htmlBody: null,
        source: 'agent',
      },
    }));
    expect(result).toEqual({
      success: true,
      data: {
        id: 'email-1',
        status: 'sent',
      },
    });
  });

  test('executeNexusTool blocks on-behalf email when local consent is missing', async () => {
    const { executeNexusTool } = require('../services/nexusTools');
    const result = await executeNexusTool(
      'node-1',
      'send_email',
      {
        to: 'client@example.com',
        subject: 'Hello',
        body: 'Body',
        source: 'google',
      },
      {
        workspaceId: 'ws-1',
        db: {
          query: jest.fn().mockResolvedValue({
            rows: [{
              id: 'node-1',
              type: 'local',
              mode: 'local',
              status: 'online',
              config: {
                permissions: {
                  allowedActions: ['list_emails'],
                },
              },
            }],
          }),
        },
      }
    );

    expect(result).toEqual({
      success: false,
      error: 'Nexus Local is not authorized to send email on your behalf yet. Enable "Send on your behalf" in local mail consent first.',
    });
  });
});
