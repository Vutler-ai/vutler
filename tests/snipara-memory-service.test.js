'use strict';

const {
  buildAgentMemoryBindings,
  filterDashboardMemories,
  normalizeImportance,
  normalizeMemories,
  rankMemories,
  summarizeMemoryCollection,
} = require('../services/sniparaMemoryService');

describe('sniparaMemoryService', () => {
  test('namespaces agent and template categories by workspace', () => {
    const bindings = buildAgentMemoryBindings({ id: 'agent-1', username: 'mike', role: 'Engineering' }, 'ws-1');

    expect(bindings.instance).toEqual({
      scope: 'agent',
      category: 'ws-1-agent-mike',
    });
    expect(bindings.template).toEqual({
      scope: 'project',
      category: 'ws-1-template-engineering',
    });
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
});
