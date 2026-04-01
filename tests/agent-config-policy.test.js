'use strict';

const {
  ALWAYS_ON_TOOL_SKILL_KEYS,
  buildAgentConfigUpdate,
  buildInternalPlacementInstruction,
  countCountedSkills,
  splitCapabilities,
} = require('../services/agentConfigPolicy');

describe('agentConfigPolicy', () => {
  test('splits internal tools from skill capabilities', () => {
    const result = splitCapabilities([
      'workspace_drive',
      'workspace_drive_read',
      'google_calendar',
      'email_outreach',
      'task_management',
    ]);

    expect(result.tools).toEqual([
      'workspace_drive_list',
      'workspace_drive_search',
      'workspace_drive_read',
      'workspace_drive_write',
      'workspace_drive_create_folder',
      'workspace_drive',
      'google_calendar',
    ]);
    expect(result.skills).toEqual(['email_outreach', 'task_management']);
  });

  test('keeps coordinator prompt locked while allowing skill/tool updates', () => {
    const result = buildAgentConfigUpdate({
      body: {
        system_prompt: 'new prompt',
        skills: ['email_outreach'],
        tools: ['workspace_drive'],
      },
      existing: {
        system_prompt: 'locked prompt',
        capabilities: ['workspace_drive'],
      },
      isCoordinator: true,
    });

    expect(result.ignored).toContain('system_prompt');
    expect(result.updates.system_prompt).toBeUndefined();
    expect(result.capabilities).toEqual([
      ...ALWAYS_ON_TOOL_SKILL_KEYS,
      'email_outreach',
      'workspace_drive',
    ]);
    expect(result.tools).toEqual([
      ...ALWAYS_ON_TOOL_SKILL_KEYS,
      'workspace_drive',
    ]);
    expect(result.skills).toEqual(['email_outreach']);
  });

  test('does not count internal and integration tools toward the 8-skill limit', () => {
    const skillCount = countCountedSkills([
      'workspace_drive_list',
      'workspace_drive_read',
      'google_calendar_create',
      'email_outreach',
      'task_management',
      'policy_lookup',
    ]);

    expect(skillCount).toBe(3);
  });

  test('describes the canonical artifact placement policy', () => {
    const instruction = buildInternalPlacementInstruction();

    expect(instruction).toContain('/projects/Vutler');
    expect(instruction).toContain('Generated/');
    expect(instruction).toContain('direct link');
  });
});
