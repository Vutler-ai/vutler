'use strict';

const {
  getMemoryTypePolicy,
  getRuntimeBudget,
  getPromotionThreshold,
  buildGovernanceMetadata,
  deriveMemoryTier,
  isMemoryExpired,
  isMemoryInGraveyard,
} = require('../services/memoryPolicy');

describe('memoryPolicy', () => {
  test('exposes stricter thresholds for global promotion than template', () => {
    expect(getPromotionThreshold('global').minDuplicateCount).toBeGreaterThan(getPromotionThreshold('template').minDuplicateCount);
    expect(getPromotionThreshold('global').minPromotionScore).toBeGreaterThan(getPromotionThreshold('template').minPromotionScore);
  });

  test('assigns short ttl to action logs and longer ttl to decisions', () => {
    expect(getMemoryTypePolicy('action_log').ttlDays).toBeLessThan(getMemoryTypePolicy('decision').ttlDays);
  });

  test('builds governance metadata with expiration and counters', () => {
    const metadata = buildGovernanceMetadata({
      type: 'tool_observation',
      scopeKey: 'instance',
      metadata: {},
      createdAt: '2026-03-01T00:00:00.000Z',
    });

    expect(metadata.usage_count).toBe(0);
    expect(metadata.duplicate_count).toBe(0);
    expect(metadata.expires_at).toBeTruthy();
  });

  test('detects expired memories from governance metadata', () => {
    expect(isMemoryExpired({
      metadata: { expires_at: '2020-01-01T00:00:00.000Z' },
    })).toBe(true);
  });

  test('moves invalidated memories into the graveyard tier', () => {
    const memory = {
      type: 'fact',
      metadata: { invalidated: true, invalidated_at: '2026-04-01T00:00:00.000Z' },
    };

    expect(isMemoryInGraveyard(memory)).toBe(true);
    expect(deriveMemoryTier(memory)).toBe('graveyard');
  });

  test('elevates canonical or frequently used memories to hot tier', () => {
    const memory = {
      type: 'fact',
      importance: 0.6,
      usage_count: 5,
      created_at: '2026-04-10T00:00:00.000Z',
      metadata: { canonical_memory: true },
    };

    expect(deriveMemoryTier(memory)).toBe('hot');
  });

  test('exposes a tighter chat budget than dashboard budget', () => {
    expect(getRuntimeBudget('chat').total).toBeLessThan(getRuntimeBudget('dashboard').total);
  });
});
