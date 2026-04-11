'use strict';

const {
  applyLifecycleMarkers,
  buildAgentMemoryBindings,
  filterDashboardMemories,
  normalizeImportance,
  normalizeMemories,
  rankMemories,
  summarizeMemoryCollection,
} = require('../services/sniparaMemoryService');
const { normalizeType } = require('../services/memoryPolicy');

describe('sniparaMemoryService', () => {
  test('namespaces agent and template categories by workspace', () => {
    const bindings = buildAgentMemoryBindings({ id: 'agent-1', username: 'mike', role: 'Engineering' }, 'ws-1');

    expect(bindings.instance).toMatchObject({
      scope: 'agent',
      category: 'ws-1-agent-mike',
      categories: ['ws-1-agent-mike'],
    });
    expect(bindings.template).toMatchObject({
      scope: 'project',
      category: 'ws-1-template-engineering',
    });
  });

  test('rejects missing workspace ids when building memory bindings', () => {
    expect(() => buildAgentMemoryBindings({ id: 'agent-1', username: 'mike' }))
      .toThrow('workspaceId is required for Snipara memory calls');
  });

  test('filters tombstones and internal memories from dashboard lists', () => {
    const memories = normalizeMemories({
      memories: [
        { id: 'a', text: 'Visible fact', type: 'fact', importance: 0.7 },
        { id: 'b', text: '[DELETED memory old]', type: 'fact', importance: 0.1, metadata: { deleted: true } },
        { id: 'c', text: 'Internal action', type: 'action_log', importance: 0.5 },
      ],
    }, 'agent');

    expect(filterDashboardMemories(memories, false).map((memory) => memory.id)).toEqual(['a']);
    expect(filterDashboardMemories(memories, true).map((memory) => memory.id)).toEqual(['a', 'c']);
  });

  test('normalizes llm tool importance scale from 1-10 to 0-1', () => {
    expect(normalizeImportance(7)).toBe(0.7);
    expect(normalizeImportance(0.4)).toBe(0.4);
  });

  test('builds dedicated human and relationship bindings when a human context is present', () => {
    const bindings = buildAgentMemoryBindings(
      { id: 'agent-1', username: 'mike', role: 'Engineering' },
      'ws-1',
      { id: 'user-42', name: 'Alex' }
    );

    expect(bindings.human).toMatchObject({
      scope: 'project',
      category: 'ws-1-human-user-42',
    });
    expect(bindings.human_agent).toMatchObject({
      scope: 'agent',
      category: 'ws-1-agent-mike-human-user-42',
    });
    expect(bindings.humanId).toBe('user-42');
    expect(bindings.humanName).toBe('Alex');
  });

  test('maps llm preference memories to the internal user_profile type', () => {
    expect(normalizeType('preference')).toBe('user_profile');
  });

  test('summarizes visible, hidden and expired counts separately', () => {
    const memories = normalizeMemories({
      memories: [
        { id: 'a', text: 'Visible fact', type: 'fact', importance: 0.7 },
        { id: 'b', text: 'Old tool note', type: 'tool_observation', importance: 0.5, metadata: { expires_at: '2020-01-01T00:00:00.000Z' } },
        { id: 'c', text: 'Internal action', type: 'action_log', importance: 0.5 },
      ],
    }, 'instance');

    expect(summarizeMemoryCollection(memories, false)).toMatchObject({
      visible_count: 1,
      hidden_count: 1,
      expired_count: 1,
    });
  });

  test('separates active and graveyard memories in dashboard views', () => {
    const memories = normalizeMemories({
      memories: [
        { id: 'active', text: 'Current customer timezone is Europe/Zurich.', type: 'fact', importance: 0.7 },
        {
          id: 'graveyard',
          text: 'Customer timezone is PST.',
          type: 'fact',
          importance: 0.4,
          metadata: {
            invalidated: true,
            invalidated_at: '2026-04-08T00:00:00.000Z',
            invalidation_reason: 'Customer moved to Zurich',
          },
        },
      ],
    }, 'instance');

    expect(filterDashboardMemories(memories, false, { view: 'active' }).map((memory) => memory.id)).toEqual(['active']);
    expect(filterDashboardMemories(memories, false, { view: 'graveyard' }).map((memory) => memory.id)).toEqual(['graveyard']);
    expect(summarizeMemoryCollection(memories, false, { view: 'all' })).toMatchObject({
      graveyard_count: 1,
      active_count: 1,
      visible_count: 2,
    });
  });

  test('marks replacement memories as canonical and prior memories as superseded', () => {
    const projected = applyLifecycleMarkers(normalizeMemories({
      memories: [
        {
          id: 'old',
          text: 'Deploy on Friday at 18:00.',
          type: 'decision',
          importance: 0.7,
        },
        {
          id: 'new',
          text: 'Deploy on Saturday at 09:00.',
          type: 'decision',
          importance: 0.8,
          metadata: {
            supersedes_memory_id: 'old',
            created_from_supersede: true,
            canonical_memory: true,
            created_at: '2026-04-10T00:00:00.000Z',
          },
        },
      ],
    }, 'instance'));

    const oldMemory = projected.find((memory) => memory.id === 'old');
    const newMemory = projected.find((memory) => memory.id === 'new');

    expect(oldMemory).toMatchObject({
      status: 'superseded',
      tier: 'graveyard',
      contradiction_state: 'superseded',
      resolution_state: 'resolved',
      superseded_by_memory_id: 'new',
    });
    expect(newMemory).toMatchObject({
      canonical_memory: true,
      tier: 'hot',
      contradiction_state: 'canonical',
      resolution_state: 'resolved',
      supersedes_memory_id: 'old',
    });
  });

  test('ranks matching decisions ahead of low-signal action logs', () => {
    const ranked = rankMemories(normalizeMemories({
      memories: [
        { id: 'a', text: 'Decision: Always answer in French for this workspace.', type: 'decision', importance: 0.9 },
        { id: 'b', text: 'Conversation note: user said hello and agent replied hi.', type: 'action_log', importance: 0.2 },
      ],
    }, 'instance'), {
      query: 'answer in French for this workspace',
      runtime: 'chat',
      scopeKey: 'instance',
    });

    expect(ranked[0].id).toBe('a');
  });

  test('prefers query-specific memories over fresher generic matches', () => {
    const ranked = rankMemories(normalizeMemories({
      memories: [
        {
          id: 'specific',
          text: 'For project kiwi-20260406, the recall code is ORBIT-20260406.',
          type: 'fact',
          importance: 0.2,
          metadata: { created_at: '2026-02-01T00:00:00.000Z' },
        },
        {
          id: 'generic',
          text: 'For project kiwi, the recall code is MEM-LEGACY.',
          type: 'fact',
          importance: 0.95,
          metadata: { created_at: '2026-04-06T00:00:00.000Z' },
        },
      ],
    }, 'instance'), {
      query: 'what is the recall code for project kiwi-20260406',
      runtime: 'chat',
      scopeKey: 'instance',
    });

    expect(ranked[0].id).toBe('specific');
  });
});
