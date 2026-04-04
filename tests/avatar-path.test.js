'use strict';

const { buildSpriteAvatar, normalizeStoredAvatar } = require('../lib/avatarPath');

describe('avatar path normalization', () => {
  test('keeps local classic avatar slugs on the static avatar path', () => {
    expect(normalizeStoredAvatar('marketing-campaign', { username: 'andrea' }))
      .toBe('/static/avatars/marketing-campaign.png');
  });

  test('keeps local persona avatar slugs on the static avatar path', () => {
    expect(normalizeStoredAvatar('operations-oracle', { username: 'andrea' }))
      .toBe('/static/avatars/operations-oracle.svg');
  });

  test('normalizes explicit static avatar paths back to canonical local paths', () => {
    expect(normalizeStoredAvatar('/static/avatars/legal-sentinel.svg', { username: 'andrea' }))
      .toBe('/static/avatars/legal-sentinel.svg');
    expect(normalizeStoredAvatar('/static/avatars/hr-assistant.png', { username: 'andrea' }))
      .toBe('/static/avatars/hr-assistant.png');
  });

  test('falls back to sprite avatars for unknown values', () => {
    expect(normalizeStoredAvatar('unknown-avatar', { username: 'agent-zero' }))
      .toBe('/sprites/agent-unknown-avatar.png');
    expect(buildSpriteAvatar('agent zero'))
      .toBe('/sprites/agent-agent-zero.png');
  });
});
