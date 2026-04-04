'use strict';

describe('tasks-v2 hierarchy helpers', () => {
  let helpers;
  let warnSpy;

  beforeEach(() => {
    jest.resetModules();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    jest.doMock('../app/custom/lib/auth', () => ({
      authenticateAgent: (_req, _res, next) => next(),
    }));
    jest.doMock('../../../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }), { virtual: true });
    jest.doMock('../lib/vaultbrix', () => ({
      query: jest.fn().mockResolvedValue({ rows: [] }),
    }));
    jest.doMock('../services/orchestration/runSignals', () => ({
      signalRunFromTask: jest.fn().mockResolvedValue(null),
    }));
    jest.doMock('../services/workspaceRealtime', () => ({
      publishTaskDeleted: jest.fn(),
      publishTaskEvent: jest.fn(),
    }));

    ({ __test: helpers } = require('../app/custom/api/tasks-v2'));
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test('accepts N0 as a valid htask level', () => {
    expect(helpers.normalizeHtaskLevel('N0')).toBe('N0');
    expect(helpers.normalizeHtaskLevel('n0')).toBe('N0');
  });

  test('falls back to the requested default for unknown levels', () => {
    expect(helpers.normalizeHtaskLevel('N9', 'N0')).toBe('N0');
    expect(helpers.normalizeHtaskLevel('invalid', 'N2_WORKSTREAM')).toBe('N2_WORKSTREAM');
  });

  test('derives child defaults from the parent hierarchy level', () => {
    expect(helpers.getDefaultChildHtaskLevel({
      metadata: { snipara_hierarchy_level: 'N0' },
    })).toBe('N1_FEATURE');
    expect(helpers.getDefaultChildHtaskLevel({
      metadata: { snipara_hierarchy_level: 'N1_FEATURE' },
    })).toBe('N2_WORKSTREAM');
    expect(helpers.getDefaultChildHtaskLevel({
      metadata: { snipara_hierarchy_level: 'N2_WORKSTREAM' },
    })).toBe('N3_TASK');
  });
});
