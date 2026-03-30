'use strict';

const {
  canonicalizeText,
  overlapScore,
  isNearDuplicate,
} = require('../services/memoryConsolidationService');

describe('memoryConsolidationService', () => {
  test('canonicalizes text consistently', () => {
    expect(canonicalizeText(' Hello,   World! ')).toBe('hello world');
  });

  test('detects strong overlap between close memories', () => {
    const score = overlapScore(
      'User preference context alex prefers concise answers in french',
      'Alex prefers concise answers in French'
    );

    expect(score).toBeGreaterThan(0.6);
  });

  test('treats close same-type memories as duplicates', () => {
    const left = {
      type: 'user_profile',
      text: 'User preference/context: Alex prefers concise answers in French',
      metadata: { memory_lane: 'user_profile' },
    };
    const right = {
      type: 'user_profile',
      text: 'User preference/context: Alex prefers concise answers in french.',
      metadata: { memory_lane: 'user_profile' },
    };

    expect(isNearDuplicate(left, right)).toBe(true);
  });
});
