'use strict';

jest.mock('../services/sniparaMemoryService', () => ({
  buildAgentMemoryBindings: jest.fn((agent, workspaceId) => ({
    workspaceId,
    agentId: agent.id || 'agent-1',
    sniparaInstanceId: null,
    agentRef: agent.username || 'atlas',
    role: agent.role || 'general',
  })),
  resolveAgentRecord: jest.fn((_db, _workspaceId, agentIdOrUsername) => Promise.resolve({
    id: agentIdOrUsername,
    username: agentIdOrUsername === 'agent-1' ? 'atlas' : String(agentIdOrUsername),
    role: 'operations',
  })),
}));

const {
  getWorkspaceJournal,
  saveAgentJournal,
  saveJournalAutomationPolicy,
  saveWorkspaceJournal,
  getJournalAutomationPolicy,
  runJournalAutomationSweep,
  summarizeAgentJournalToBrief,
} = require('../services/journalCompactionService');

function createWorkspaceSettingsDb(initialValues = {}) {
  const store = new Map(Object.entries(initialValues));

  return {
    store,
    query(sql, params) {
      if (sql.includes('FROM tenant_vutler.workspace_settings')) {
        const keys = params[1] || [];
        return Promise.resolve({
          rows: keys
            .filter((key) => store.has(key))
            .map((key) => ({ key, value: store.get(key) })),
        });
      }

      if (sql.includes('UPDATE tenant_vutler.workspace_settings')) {
        const key = params[1];
        const value = JSON.parse(params[2]);
        if (store.has(key)) {
          store.set(key, value);
          return Promise.resolve({ rowCount: 1 });
        }
        return Promise.resolve({ rowCount: 0 });
      }

      if (sql.includes('INSERT INTO tenant_vutler.workspace_settings')) {
        const key = params[1];
        const value = JSON.parse(params[2]);
        store.set(key, value);
        return Promise.resolve({ rowCount: 1 });
      }

      return Promise.reject(new Error(`Unexpected SQL in test: ${sql}`));
    },
  };
}

describe('journal compaction service', () => {
  test('loads workspace journal state for a specific date', async () => {
    const db = createWorkspaceSettingsDb({
      'journal:workspace:2026-04-12': 'Morning deploy completed.\nObserved one retry.',
      'journal:workspace:2026-04-12:meta': {
        updatedAt: '2026-04-12T11:00:00.000Z',
        updatedByEmail: 'ops@vutler.ai',
      },
    });

    const journal = await getWorkspaceJournal({
      db,
      workspaceId: 'ws-1',
      date: '2026-04-12',
    });

    expect(journal.path).toBe('journals/workspace/2026-04-12.md');
    expect(journal.content).toContain('Morning deploy completed');
    expect(journal.updatedByEmail).toBe('ops@vutler.ai');
    expect(journal.automationPolicy.mode).toBe('manual');
  });

  test('saves workspace journal and mirrors it to Snipara', async () => {
    const db = createWorkspaceSettingsDb();
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));
    const appendJournal = jest.fn(() => Promise.resolve({ ok: true }));

    const journal = await saveWorkspaceJournal({
      db,
      workspaceId: 'ws-1',
      date: '2026-04-12',
      content: 'Rolled out continuity briefs.\nNeed to monitor operator adoption.',
      user: { id: 'u-1', email: 'admin@vutler.ai' },
      gatewayFactory: () => ({
        sync: { uploadDocument },
        journal: { append: appendJournal },
      }),
    });

    expect(uploadDocument).toHaveBeenCalledWith({
      path: 'journals/workspace/2026-04-12.md',
      title: 'Workspace Journal 2026-04-12',
      content: 'Rolled out continuity briefs.\nNeed to monitor operator adoption.',
    });
    expect(appendJournal).toHaveBeenCalledWith(expect.objectContaining({
      date: '2026-04-12',
      path: 'journals/workspace/2026-04-12.md',
      text: 'Rolled out continuity briefs.\nNeed to monitor operator adoption.',
    }));
    expect(journal.updatedByEmail).toBe('admin@vutler.ai');
    expect(journal.automation.status).toBe('skipped');
    expect(journal.automation.reason).toBe('manual_mode');
  });

  test('summarizes an agent journal into the session brief', async () => {
    const db = createWorkspaceSettingsDb({
      'journal:atlas:2026-04-12': 'Validated smoke tests.\nNeed to review one memory sync warning.',
    });
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));
    const appendJournal = jest.fn(() => Promise.resolve({ ok: true }));
    const summarizeJournal = jest.fn(() => Promise.resolve({
      result: 'Smoke tests passed; follow up on one memory sync warning.',
    }));
    const storeSummary = jest.fn(() => Promise.resolve({ ok: true }));

    const result = await summarizeAgentJournalToBrief({
      db,
      workspaceId: 'ws-1',
      agentIdOrUsername: 'agent-1',
      date: '2026-04-12',
      user: { id: 'u-1', email: 'admin@vutler.ai' },
      gatewayFactory: () => ({
        sync: { uploadDocument },
        journal: { append: appendJournal, summarize: summarizeJournal },
        summaries: { store: storeSummary },
      }),
    });

    expect(result.brief.content).toBe('Smoke tests passed; follow up on one memory sync warning.');
    expect(uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      path: 'agents/atlas/SESSION.md',
      title: 'Agent Session Brief',
      content: 'Smoke tests passed; follow up on one memory sync warning.',
    }));
    expect(storeSummary).toHaveBeenCalledWith(expect.objectContaining({
      path: 'agents/atlas/SESSION.md',
      type: 'agent-session',
    }));
  });

  test('stores and retrieves journal automation policy per workspace scope', async () => {
    const db = createWorkspaceSettingsDb();

    const updated = await saveJournalAutomationPolicy({
      db,
      workspaceId: 'ws-1',
      scope: 'workspace',
      policy: {
        mode: 'on_save',
        minimum_length: 220,
        sweep_enabled: true,
      },
      user: { email: 'admin@vutler.ai' },
    });

    expect(updated.mode).toBe('on_save');
    expect(updated.enabled).toBe(true);
    expect(updated.minimum_length).toBe(220);
    expect(updated.sweep_enabled).toBe(true);

    const fetched = await getJournalAutomationPolicy({
      db,
      workspaceId: 'ws-1',
      scope: 'workspace',
    });

    expect(fetched.mode).toBe('on_save');
    expect(fetched.updatedByEmail).toBe('admin@vutler.ai');
    expect(fetched.sweep_enabled).toBe(true);
  });

  test('auto-refreshes the workspace session brief when journal automation is enabled', async () => {
    const db = createWorkspaceSettingsDb({
      'journal_automation:workspace:policy': {
        scope: 'workspace',
        mode: 'on_save',
        minimum_length: 10,
      },
    });
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));
    const appendJournal = jest.fn(() => Promise.resolve({ ok: true }));
    const summarizeJournal = jest.fn(() => Promise.resolve({
      result: 'Deploy finished, monitor one retry path.',
    }));
    const storeSummary = jest.fn(() => Promise.resolve({ ok: true }));

    const journal = await saveWorkspaceJournal({
      db,
      workspaceId: 'ws-1',
      date: '2026-04-12',
      content: 'Deploy finished.\nMonitor one retry path.',
      user: { id: 'u-1', email: 'admin@vutler.ai' },
      gatewayFactory: () => ({
        sync: { uploadDocument },
        journal: { append: appendJournal, summarize: summarizeJournal },
        summaries: { store: storeSummary },
      }),
    });

    expect(journal.automation.triggered).toBe(true);
    expect(journal.automation.status).toBe('refreshed');
    expect(journal.automation.brief_path).toBe('continuity/WORKSPACE-SESSION.md');
    expect(storeSummary).toHaveBeenCalledWith(expect.objectContaining({
      path: 'continuity/WORKSPACE-SESSION.md',
      type: 'workspace-session',
    }));
  });

  test('skips agent auto-refresh when the journal is below the configured threshold', async () => {
    const db = createWorkspaceSettingsDb({
      'journal_automation:agent:policy': {
        scope: 'agent',
        mode: 'on_save',
        minimum_length: 120,
      },
    });
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));
    const appendJournal = jest.fn(() => Promise.resolve({ ok: true }));
    const summarizeJournal = jest.fn(() => Promise.resolve({
      result: 'Should not run.',
    }));
    const storeSummary = jest.fn(() => Promise.resolve({ ok: true }));

    const journal = await saveAgentJournal({
      db,
      workspaceId: 'ws-1',
      agentIdOrUsername: 'agent-1',
      date: '2026-04-12',
      content: 'Short note.',
      user: { id: 'u-1', email: 'admin@vutler.ai' },
      gatewayFactory: () => ({
        sync: { uploadDocument },
        journal: { append: appendJournal, summarize: summarizeJournal },
        summaries: { store: storeSummary },
      }),
    });

    expect(journal.automation.triggered).toBe(false);
    expect(journal.automation.reason).toBe('below_minimum_length');
    expect(summarizeJournal).not.toHaveBeenCalled();
    expect(storeSummary).not.toHaveBeenCalled();
  });

  test('runs a workspace sweep only when the journal is newer than the current brief', async () => {
    const db = createWorkspaceSettingsDb({
      'journal_automation:workspace:policy': {
        scope: 'workspace',
        mode: 'manual',
        minimum_length: 10,
        sweep_enabled: true,
      },
      'journal:workspace:2026-04-12': 'Deploy completed.\nMonitor the rollback guard for one more hour.',
      'journal:workspace:2026-04-12:meta': {
        updatedAt: '2026-04-12T12:00:00.000Z',
      },
      'session_continuity:workspace': 'Older brief',
      'session_continuity:workspace:meta': {
        updatedAt: '2026-04-12T10:00:00.000Z',
      },
    });
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));
    const summarizeJournal = jest.fn(() => Promise.resolve({
      result: 'Deploy completed; keep watching the rollback guard.',
    }));
    const storeSummary = jest.fn(() => Promise.resolve({ ok: true }));

    const result = await runJournalAutomationSweep({
      db,
      workspaceId: 'ws-1',
      scope: 'workspace',
      date: '2026-04-12',
      gatewayFactory: () => ({
        sync: { uploadDocument },
        journal: { summarize: summarizeJournal, append: jest.fn(() => Promise.resolve({ ok: true })) },
        summaries: { store: storeSummary },
      }),
    });

    expect(result.workspace.refreshed).toBe(1);
    expect(result.totals.refreshed).toBe(1);
    expect(result.workspace.result).toEqual(expect.objectContaining({
      status: 'refreshed',
      brief_path: 'continuity/WORKSPACE-SESSION.md',
    }));
    expect(db.store.get('journal_automation:sweep:last_result')).toEqual(expect.objectContaining({
      scope: 'workspace',
      totals: expect.objectContaining({ refreshed: 1 }),
    }));
    expect(storeSummary).toHaveBeenCalledWith(expect.objectContaining({
      path: 'continuity/WORKSPACE-SESSION.md',
      type: 'workspace-session',
    }));
  });
});
