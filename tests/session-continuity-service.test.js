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
  getWorkspaceSessionBrief,
  saveAgentContinuityBrief,
  listRuntimeContinuitySummaries,
  AGENT_SESSION_KIND,
} = require('../services/sessionContinuityService');

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

describe('session continuity service', () => {
  test('loads workspace session brief from scoped workspace settings', async () => {
    const db = createWorkspaceSettingsDb({
      'session_continuity:workspace': 'Track the rollout status and pending operator tasks.',
      'session_continuity:workspace:meta': {
        updatedAt: '2026-04-12T08:00:00.000Z',
        updatedByEmail: 'ops@vutler.ai',
      },
    });

    const brief = await getWorkspaceSessionBrief({
      db,
      workspaceId: 'ws-1',
    });

    expect(brief.kind).toBe('workspace_session');
    expect(brief.path).toBe('continuity/WORKSPACE-SESSION.md');
    expect(brief.content).toContain('rollout status');
    expect(brief.updatedByEmail).toBe('ops@vutler.ai');
  });

  test('saves agent continuity as both Snipara doc and summary', async () => {
    const db = createWorkspaceSettingsDb();
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));
    const storeSummary = jest.fn(() => Promise.resolve({ ok: true }));

    const brief = await saveAgentContinuityBrief({
      db,
      workspaceId: 'ws-1',
      agentIdOrUsername: 'agent-1',
      kind: AGENT_SESSION_KIND,
      content: 'Continue from the billing migration checkpoint and verify webhook replay.',
      user: { id: 'u-1', email: 'admin@vutler.ai' },
      gatewayFactory: () => ({
        sync: { uploadDocument },
        summaries: { store: storeSummary },
      }),
    });

    expect(uploadDocument).toHaveBeenCalledWith({
      path: 'agents/atlas/SESSION.md',
      title: 'Agent Session Brief',
      content: 'Continue from the billing migration checkpoint and verify webhook replay.',
    });
    expect(storeSummary).toHaveBeenCalledWith(expect.objectContaining({
      path: 'agents/atlas/SESSION.md',
      type: 'agent-session',
      text: 'Continue from the billing migration checkpoint and verify webhook replay.',
    }));
    expect(brief.agent.username).toBe('atlas');
    expect(db.store.get('session_continuity:atlas:agent_session')).toBe(
      'Continue from the billing migration checkpoint and verify webhook replay.'
    );
  });

  test('builds targeted runtime summaries for workspace and agent scopes', async () => {
    const db = createWorkspaceSettingsDb({
      'session_continuity:workspace': 'Workspace handoff: keep tenant boundaries strict.',
      'session_continuity:atlas:agent_profile': 'Atlas owns platform operations and deployment hygiene.',
      'session_continuity:atlas:agent_session': 'Current session: validate the post-deploy smoke tests.',
    });

    const summaries = await listRuntimeContinuitySummaries({
      db,
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', role: 'operations' },
    });

    expect(summaries).toEqual([
      expect.objectContaining({ type: 'workspace-session', text: 'Workspace handoff: keep tenant boundaries strict.' }),
      expect.objectContaining({ type: 'agent-profile', text: 'Atlas owns platform operations and deployment hygiene.' }),
      expect.objectContaining({ type: 'agent-session', text: 'Current session: validate the post-deploy smoke tests.' }),
    ]);
  });
});
