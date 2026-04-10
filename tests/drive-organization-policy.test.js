'use strict';

const {
  DEFAULT_AGENT_DRIVE_LANE,
  listAgentDriveLaneFolders,
  resolveAgentDriveLane,
} = require('../services/driveOrganizationPolicy');

describe('driveOrganizationPolicy', () => {
  test('maps common agent types to readable drive lanes', () => {
    expect(resolveAgentDriveLane({ type: ['marketing'] })).toBe('Marketing');
    expect(resolveAgentDriveLane({ type: ['sales'] })).toBe('Sales');
    expect(resolveAgentDriveLane({ type: ['technical'] })).toBe('Technical');
    expect(resolveAgentDriveLane({ type: ['legal'] })).toBe('Documentation');
  });

  test('falls back to General when no strong lane is available', () => {
    expect(resolveAgentDriveLane({ type: ['unknown'] })).toBe(DEFAULT_AGENT_DRIVE_LANE);
    expect(resolveAgentDriveLane({})).toBe(DEFAULT_AGENT_DRIVE_LANE);
  });

  test('exposes the lane scaffold used by workspace provisioning', () => {
    expect(listAgentDriveLaneFolders()).toEqual(expect.arrayContaining([
      'Marketing',
      'Sales',
      'Technical',
      'Documentation',
      DEFAULT_AGENT_DRIVE_LANE,
    ]));
  });
});
