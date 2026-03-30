'use strict';

const {
  buildAgentMemoryBindings,
  filterDashboardMemories,
  normalizeImportance,
  normalizeMemories,
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
});
