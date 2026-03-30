'use strict';

describe('IntegrationHandler', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('executes calendar adapter when google integration is connected', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const executeCalendar = jest.fn().mockResolvedValue({
      success: true,
      data: { events: [{ id: 'evt-1', summary: 'Demo' }] },
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/google/tokenManager', () => ({
      isGoogleConnected: jest.fn().mockResolvedValue(true),
      agentHasGoogleAccess: jest.fn().mockResolvedValue(true),
    }));
    jest.doMock('../../services/skills/adapters/GoogleCalendarAdapter', () => ({
      GoogleCalendarAdapter: jest.fn().mockImplementation(() => ({ execute: executeCalendar })),
    }));

    const { IntegrationHandler } = require('../../services/skills/handlers/IntegrationHandler');
    const handler = new IntegrationHandler();

    const result = await handler.execute({
      skillKey: 'calendar_management',
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      chatActionRunId: 'run-1',
      params: { action: 'list' },
      config: { integration_provider: 'google_calendar' },
    });

    expect(result.success).toBe(true);
    expect(executeCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        agentId: 'agent-1',
        params: { action: 'list' },
      })
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_integration_logs'),
      expect.arrayContaining(['ws-1', 'google', 'calendar_management', 'success', expect.anything(), null, expect.any(String), 'run-1'])
    );
  });

  test('remaps legacy drive provider to workspace drive adapter', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const executeDrive = jest.fn().mockResolvedValue({
      success: true,
      data: { files: [{ path: '/Shared/spec.md' }] },
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/google/tokenManager', () => ({
      isGoogleConnected: jest.fn(),
      agentHasGoogleAccess: jest.fn(),
    }));
    jest.doMock('../../services/skills/adapters/WorkspaceDriveAdapter', () => ({
      WorkspaceDriveAdapter: jest.fn().mockImplementation(() => ({ execute: executeDrive })),
    }));

    const { IntegrationHandler } = require('../../services/skills/handlers/IntegrationHandler');
    const handler = new IntegrationHandler();

    const result = await handler.execute({
      skillKey: 'workspace_drive_search',
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      chatActionRunId: 'run-3',
      params: { action: 'search', searchQuery: 'spec' },
      config: { integration_provider: 'drive' },
    });

    expect(result.success).toBe(true);
    expect(executeDrive).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        params: { action: 'search', searchQuery: 'spec' },
      })
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_integration_logs'),
      expect.arrayContaining(['ws-1', 'workspace', 'workspace_drive_search', 'success', expect.anything(), null, expect.any(String), 'run-3'])
    );
  });

  test('falls back to llm when integration is not connected', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const fallbackExecute = jest.fn().mockResolvedValue({
      success: true,
      data: { result: 'Advisory response' },
      meta: { handler: 'llm_prompt' },
    });

    jest.doMock('../../lib/vaultbrix', () => ({ query }));
    jest.doMock('../../services/google/tokenManager', () => ({
      isGoogleConnected: jest.fn().mockResolvedValue(false),
      agentHasGoogleAccess: jest.fn().mockResolvedValue(false),
    }));
    jest.doMock('../../services/skills/handlers/LLMPromptHandler', () => ({
      LLMPromptHandler: jest.fn().mockImplementation(() => ({ execute: fallbackExecute })),
    }));

    const { IntegrationHandler } = require('../../services/skills/handlers/IntegrationHandler');
    const handler = new IntegrationHandler();

    const result = await handler.execute({
      skillKey: 'email_outreach',
      workspaceId: 'ws-1',
      agentId: 'agent-1',
      chatActionRunId: 'run-2',
      params: { recipient_email: 'client@example.com' },
      config: { integration_provider: 'email' },
    });

    expect(result.success).toBe(true);
    expect(fallbackExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          recipient_email: 'client@example.com',
          _integration_unavailable: true,
          _integration_provider: 'email',
        }),
      })
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('workspace_integration_logs'),
      expect.arrayContaining(['ws-1', 'google', 'email_outreach', 'fallback', expect.anything(), null, expect.any(String), 'run-2'])
    );
  });
});
