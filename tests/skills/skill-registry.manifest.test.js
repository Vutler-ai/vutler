'use strict';

describe('SkillRegistry manifest wiring', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('loads explicit workspace and google integration skill configs', () => {
    const { SkillRegistry } = require('../../services/skills/SkillRegistry');
    const registry = new SkillRegistry();
    registry.load();

    expect(registry.getSkillConfig('workspace_drive_search')).toMatchObject({
      type: 'integration',
      integration_provider: 'workspace_drive',
    });
    expect(registry.getSkillConfig('google_drive_read')).toMatchObject({
      type: 'integration',
      integration_provider: 'google_drive',
    });
    expect(registry.getSkillConfig('google_calendar_create')).toMatchObject({
      type: 'integration',
      integration_provider: 'google_calendar',
    });
  });

  test('exposes new skills as tool definitions with metadata descriptions', () => {
    const { SkillRegistry } = require('../../services/skills/SkillRegistry');
    const registry = new SkillRegistry();
    registry.load();

    const tools = registry.getSkillTools([
      'workspace_drive_write',
      'google_drive_search',
      'google_calendar_check_availability',
    ]);

    expect(tools).toHaveLength(3);
    expect(tools[0]).toMatchObject({
      type: 'function',
      function: {
        name: 'skill_workspace_drive_write',
        description: expect.stringContaining('internal workspace drive'),
      },
    });
    expect(tools[1].function.parameters.required).toContain('searchQuery');
    expect(tools[2].function.name).toBe('skill_google_calendar_check_availability');
  });
});
