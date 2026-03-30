'use strict';

const {
  getMemoryTypePolicy,
  getRuntimeBudget,
  getPromotionThreshold,
  buildGovernanceMetadata,
  isMemoryExpired,
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

  test('exposes a tighter chat budget than dashboard budget', () => {
    expect(getRuntimeBudget('chat').total).toBeLessThan(getRuntimeBudget('dashboard').total);
  });
});
