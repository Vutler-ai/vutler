'use strict';

jest.mock('../services/sniparaMemoryService', () => ({
  normalizeRole: jest.fn((value) => String(value || 'general').trim().toLowerCase() || 'general'),
  buildAgentMemoryBindings: jest.fn((agent, workspaceId) => ({
    workspaceId,
    agentId: agent.id || 'agent-1',
    sniparaInstanceId: null,
    agentRef: agent.username || 'atlas',
    role: String(agent.role || 'general').trim().toLowerCase() || 'general',
  })),
  resolveAgentRecord: jest.fn((_db, _workspaceId, agentIdOrUsername) => Promise.resolve({
    id: agentIdOrUsername,
    username: agentIdOrUsername === 'agent-1' ? 'atlas' : String(agentIdOrUsername),
    role: 'operations',
  })),
}));

const {
  listGroupMemorySpaces,
  createGroupMemorySpace,
  listRuntimeGroupMemories,
  autoPromoteVerifiedMemoryToGroupSpaces,
} = require('../services/groupMemoryService');

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

describe('group memory service', () => {
  test('filters admin-only spaces for non-admin readers', async () => {
    const db = createWorkspaceSettingsDb({
      'group_memory:index': [
        {
          id: 'ops',
          name: 'Operations',
          scope_type: 'workspace',
          read_access: 'workspace',
          write_access: 'admin',
          runtime_enabled: true,
        },
        {
          id: 'leadership',
          name: 'Leadership',
          scope_type: 'workspace',
          read_access: 'admin',
          write_access: 'admin',
          runtime_enabled: false,
        },
      ],
      'group_memory:ops:content': 'All operators can see this.',
      'group_memory:leadership:content': 'Admins only.',
    });

    const userSpaces = await listGroupMemorySpaces({
      db,
      workspaceId: 'ws-1',
      user: { id: 'u-1', role: 'user' },
    });
    const adminSpaces = await listGroupMemorySpaces({
      db,
      workspaceId: 'ws-1',
      user: { id: 'u-2', role: 'admin' },
    });

    expect(userSpaces.map((space) => space.id)).toEqual(['ops']);
    expect(adminSpaces.map((space) => space.id)).toEqual(['leadership', 'ops']);
  });

  test('creates a group memory space and syncs it to Snipara', async () => {
    const db = createWorkspaceSettingsDb({
      'group_memory:index': [],
    });
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));

    const created = await createGroupMemorySpace({
      db,
      workspaceId: 'ws-1',
      input: {
        name: 'Operations',
        description: 'Shared deploy and incident conventions',
        scope_type: 'role',
        target_role: 'operations',
        content: 'Use controlled windows and mandatory smoke tests.',
      },
      user: { id: 'u-1', email: 'admin@vutler.ai', role: 'admin' },
      gatewayFactory: () => ({
        sync: { uploadDocument },
      }),
    });

    expect(uploadDocument).toHaveBeenCalledWith({
      path: 'groups/operations/MEMORY.md',
      title: 'Group Memory · Operations',
      content: 'Use controlled windows and mandatory smoke tests.',
    });
    expect(created.scope_type).toBe('role');
    expect(created.target_role).toBe('operations');
    expect(db.store.get('group_memory:index')).toEqual([
      expect.objectContaining({ id: 'operations', name: 'Operations' }),
    ]);
  });

  test('returns only runtime-enabled readable spaces matching the agent role', async () => {
    const db = createWorkspaceSettingsDb({
      'group_memory:index': [
        {
          id: 'workspace-ops',
          name: 'Workspace Ops',
          scope_type: 'workspace',
          read_access: 'workspace',
          write_access: 'admin',
          runtime_enabled: true,
        },
        {
          id: 'ops',
          name: 'Operations',
          scope_type: 'role',
          target_role: 'operations',
          read_access: 'workspace',
          write_access: 'admin',
          runtime_enabled: true,
        },
        {
          id: 'sales',
          name: 'Sales',
          scope_type: 'role',
          target_role: 'sales',
          read_access: 'workspace',
          write_access: 'admin',
          runtime_enabled: true,
        },
        {
          id: 'admin-only',
          name: 'Admin Only',
          scope_type: 'workspace',
          read_access: 'admin',
          write_access: 'admin',
          runtime_enabled: true,
        },
      ],
      'group_memory:workspace-ops:content': 'Workspace-wide operational standards.',
      'group_memory:ops:content': 'Operations-only deployment conventions.',
      'group_memory:sales:content': 'Sales-only notes.',
      'group_memory:admin-only:content': 'Admins only.',
    });

    const spaces = await listRuntimeGroupMemories({
      db,
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', role: 'operations' },
    });

    expect(spaces).toHaveLength(2);
    expect(spaces).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'workspace-ops', name: 'Workspace Ops' }),
      expect.objectContaining({ id: 'ops', name: 'Operations' }),
    ]));
  });

  test('records runtime reuse analytics when runtime injection tracking is enabled', async () => {
    const db = createWorkspaceSettingsDb({
      'group_memory:index': [
        {
          id: 'ops',
          name: 'Operations',
          scope_type: 'role',
          target_role: 'operations',
          read_access: 'workspace',
          write_access: 'admin',
          runtime_enabled: true,
        },
      ],
      'group_memory:ops:content': 'Operations-only deployment conventions.',
      'group_memory:ops:meta': {
        updatedAt: '2026-04-13T09:00:00.000Z',
      },
    });

    const spaces = await listRuntimeGroupMemories({
      db,
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', role: 'operations' },
      recordUsage: true,
      runtime: 'task',
    });

    expect(spaces).toHaveLength(1);
    expect(db.store.get('group_memory:ops:meta')).toEqual(expect.objectContaining({
      runtime_injections: 1,
      usage_by_runtime: expect.objectContaining({ task: 1 }),
      last_runtime_kind: 'task',
      last_runtime_agent_ref: 'atlas',
    }));
  });

  test('auto-promotes verified discoveries into matching governed group memory spaces', async () => {
    const db = createWorkspaceSettingsDb({
      'group_memory:index': [
        {
          id: 'ops',
          name: 'Operations',
          scope_type: 'role',
          target_role: 'operations',
          read_access: 'workspace',
          write_access: 'admin',
          runtime_enabled: true,
          auto_promote_enabled: true,
          minimum_importance: 0.75,
        },
      ],
      'group_memory:ops:content': 'Shared operational conventions.',
      'group_memory:ops:meta': {
        updatedAt: '2026-04-13T09:00:00.000Z',
        updatedByEmail: 'admin@vutler.ai',
      },
      'group_memory:ops:auto_entries': [],
    });
    const uploadDocument = jest.fn(() => Promise.resolve({ ok: true }));

    const promotions = await autoPromoteVerifiedMemoryToGroupSpaces({
      db,
      workspaceId: 'ws-1',
      agent: { id: 'agent-1', username: 'atlas', role: 'operations' },
      memory: {
        id: 'mem-1',
        text: 'Decision: Always run smoke tests before deploy.',
        type: 'decision',
        importance: 0.9,
        visibility: 'reviewable',
        verified_at: '2026-04-13T10:00:00.000Z',
      },
      verificationNote: 'Validated after post-deploy review.',
      gatewayFactory: () => ({
        sync: { uploadDocument },
      }),
    });

    expect(promotions).toHaveLength(1);
    expect(db.store.get('group_memory:ops:auto_entries')).toEqual([
      expect.objectContaining({
        source_memory_id: 'mem-1',
        source_agent_ref: 'atlas',
        text: 'Decision: Always run smoke tests before deploy.',
      }),
    ]);
    expect(db.store.get('group_memory:ops:meta')).toEqual(expect.objectContaining({
      promoted_count: 1,
      last_promoted_by_agent_ref: 'atlas',
    }));
    expect(uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      path: 'groups/ops/MEMORY.md',
      title: 'Group Memory · Operations',
      content: expect.stringContaining('## Auto-Promoted Discoveries'),
    }));
  });
});
