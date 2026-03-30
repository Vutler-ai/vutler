'use strict';

jest.mock('../services/sniparaMemoryService', () => ({
  rememberScopedMemory: jest.fn(async () => ({ success: true })),
}));

jest.mock('../services/memoryConsolidationService', () => ({
  recallScopeMemories: jest.fn(async () => []),
  isNearDuplicate: jest.fn((left, right) => left.text === right.text),
}));

const { rememberScopedMemory } = require('../services/sniparaMemoryService');
const {
  recallScopeMemories,
  isNearDuplicate,
} = require('../services/memoryConsolidationService');
const {
  computePromotionScore,
  getPromotionTarget,
  maybeAutoPromoteMemory,
} = require('../services/memoryPromotionService');

describe('memoryPromotionService', () => {
  beforeEach(() => {
    rememberScopedMemory.mockClear();
    recallScopeMemories.mockClear();
    isNearDuplicate.mockClear();
  });

  test('targets template promotion for repeated local decisions by default', () => {
    expect(getPromotionTarget({
      type: 'decision',
      scopeKey: 'instance',
      metadata: {},
    })).toBe('template');
  });

  test('promotes repeated instance decisions to template scope', async () => {
    recallScopeMemories
      .mockResolvedValueOnce([
        { text: 'Decision: Always use Codex for development.' },
        { text: 'Decision: Always use Codex for development.' },
      ])
      .mockResolvedValueOnce([]);

    const result = await maybeAutoPromoteMemory({
      db: {},
      workspaceId: 'ws-1',
      agent: { username: 'alex', role: 'engineering' },
      memory: {
        scopeKey: 'instance',
        type: 'decision',
        text: 'Decision: Always use Codex for development.',
        importance: 0.78,
        metadata: { preferred_target_scope: 'template' },
      },
    });

    expect(result).toBe('template');
    expect(rememberScopedMemory).toHaveBeenCalledWith(expect.objectContaining({
      scopeKey: 'template',
      type: 'decision',
      visibility: 'reviewable',
      source: 'memory-auto-promotion',
    }));
  });

  test('does not promote when target scope already contains the decision', async () => {
    recallScopeMemories
      .mockResolvedValueOnce([
        { text: 'Decision: Keep Tailwind as the default UI layer.' },
        { text: 'Decision: Keep Tailwind as the default UI layer.' },
      ])
      .mockResolvedValueOnce([
        { text: 'Decision: Keep Tailwind as the default UI layer.' },
      ]);

    const result = await maybeAutoPromoteMemory({
      db: {},
      workspaceId: 'ws-1',
      agent: { username: 'alex', role: 'engineering' },
      memory: {
        scopeKey: 'instance',
        type: 'decision',
        text: 'Decision: Keep Tailwind as the default UI layer.',
        importance: 0.78,
        metadata: { preferred_target_scope: 'template' },
      },
    });

    expect(result).toBeNull();
    expect(rememberScopedMemory).not.toHaveBeenCalled();
  });

  test('computes a promotion score from duplicates and importance', () => {
    expect(computePromotionScore({
      type: 'decision',
      importance: 0.8,
      metadata: { promotion_score: 0.4 },
    }, 2)).toBeGreaterThan(1.7);
  });
});
