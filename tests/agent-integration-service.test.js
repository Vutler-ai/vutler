'use strict';

const { getSkillKeysForIntegrationProviders } = require('../services/agentIntegrationService');

describe('agentIntegrationService', () => {
  test('derives non-prefixed integration skills from workspace providers', () => {
    expect(getSkillKeysForIntegrationProviders(['social_media'])).toEqual(
      expect.arrayContaining([
        'content_scheduling',
        'social_analytics',
        'engagement_monitoring',
        'multi_platform_posting',
      ])
    );

    expect(getSkillKeysForIntegrationProviders(['project_management'])).toEqual(
      expect.arrayContaining(['task_management'])
    );

    expect(getSkillKeysForIntegrationProviders(['email'])).toEqual(
      expect.arrayContaining(['email_outreach'])
    );
  });
});
