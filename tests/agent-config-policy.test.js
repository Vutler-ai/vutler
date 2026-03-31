'use strict';

const {
  buildAgentConfigUpdate,
  buildInternalPlacementInstruction,
  splitCapabilities,
} = require('../services/agentConfigPolicy');

describe('agentConfigPolicy', () => {
  test('splits internal tools from skill capabilities', () => {
    const result = splitCapabilities([
      'workspace_drive',
      'google_calendar',
      'email_outreach',
      'task_management',
    ]);

    expect(result.tools).toEqual(['workspace_drive', 'google_calendar']);
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
    expect(result.capabilities).toEqual(['email_outreach', 'workspace_drive']);
    expect(result.tools).toEqual(['workspace_drive']);
    expect(result.skills).toEqual(['email_outreach']);
  });

  test('describes the canonical artifact placement policy', () => {
    const instruction = buildInternalPlacementInstruction();

    expect(instruction).toContain('/projects/Vutler');
    expect(instruction).toContain('Generated/');
    expect(instruction).toContain('direct link');
  });
});
