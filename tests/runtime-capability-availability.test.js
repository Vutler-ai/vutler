'use strict';

jest.mock('../services/workspacePlanService', () => ({
  getWorkspacePlanId: jest.fn(),
}));

jest.mock('../services/agentIntegrationService', () => ({
  listConnectedWorkspaceIntegrationProviders: jest.fn(),
}));

const { getWorkspacePlanId } = require('../services/workspacePlanService');
const { listConnectedWorkspaceIntegrationProviders } = require('../services/agentIntegrationService');
const {
  resolveWorkspaceCapabilityAvailability,
  filterAvailableProviders,
  getUnavailableProviders,
  filterAvailableSkillKeys,
} = require('../services/runtimeCapabilityAvailability');

describe('runtimeCapabilityAvailability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('marks providers as unavailable when the plan does not allow them', async () => {
    getWorkspacePlanId.mockResolvedValue('free');
    listConnectedWorkspaceIntegrationProviders.mockResolvedValue(new Set());

    const snapshot = await resolveWorkspaceCapabilityAvailability({
      workspaceId: 'ws-1',
      db: { query: jest.fn() },
    });

    expect(snapshot.planId).toBe('free');
    expect(snapshot.providerStates.google).toMatchObject({
      available: false,
      reason: 'Google-backed tools are not enabled in the current workspace plan.',
    });
    expect(snapshot.providerStates.email).toMatchObject({
      available: false,
      reason: 'Email execution is not enabled in the current workspace plan.',
    });
    expect(snapshot.providerStates.social_media).toMatchObject({
      available: false,
      reason: 'Social tooling is not enabled in the current workspace plan.',
    });
    expect(filterAvailableProviders(['project_management', 'google'], snapshot)).toEqual([]);
    expect(getUnavailableProviders(['google', 'social_media'], snapshot)).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'google', available: false }),
      expect.objectContaining({ key: 'social_media', available: false }),
    ]));
  });

  test('distinguishes plan-enabled but disconnected providers', async () => {
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    listConnectedWorkspaceIntegrationProviders.mockResolvedValue(new Set());

    const snapshot = await resolveWorkspaceCapabilityAvailability({
      workspaceId: 'ws-1',
      db: { query: jest.fn() },
    });

    expect(snapshot.providerStates.google).toMatchObject({
      available: false,
      reason: 'Google is not connected for this workspace.',
    });
    expect(snapshot.providerStates.email).toMatchObject({
      available: true,
      reason: null,
    });
    expect(snapshot.providerStates.social_media).toMatchObject({
      available: false,
      reason: 'No social media account is connected for this workspace.',
    });
  });

  test('filters integration skills to only those backed by available providers', async () => {
    getWorkspacePlanId.mockResolvedValue('agents_pro');
    listConnectedWorkspaceIntegrationProviders.mockResolvedValue(new Set(['google', 'social_media']));

    const snapshot = await resolveWorkspaceCapabilityAvailability({
      workspaceId: 'ws-1',
      db: { query: jest.fn() },
    });

    expect(filterAvailableSkillKeys([
      'email_outreach',
      'google_calendar_create',
      'workspace_drive_write',
      'task_management',
    ], snapshot)).toEqual(expect.arrayContaining([
      'email_outreach',
      'google_calendar_create',
      'workspace_drive_write',
      'task_management',
    ]));
  });
});
