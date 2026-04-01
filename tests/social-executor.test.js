'use strict';

describe('socialExecutor', () => {
  let createSocialPostMock;
  let listSocialAccountsMock;
  let executeSocialPlan;

  beforeEach(() => {
    jest.resetModules();

    createSocialPostMock = jest.fn().mockResolvedValue({
      id: 'post-1',
      status: 'processing',
    });
    listSocialAccountsMock = jest.fn().mockResolvedValue([
      {
        id: 'remote-account-1',
        platform: 'linkedin',
        metadata: { organization_id: '106026474' },
      },
      {
        id: 'remote-account-2',
        platform: 'linkedin',
        metadata: { organization_id: '111276245' },
      },
      {
        id: 'remote-account-3',
        platform: 'twitter',
        metadata: { user_id: 'starboxgroup' },
      },
    ]);

    jest.doMock('../services/postForMeClient', () => ({
      createSocialPost: createSocialPostMock,
      listSocialAccounts: listSocialAccountsMock,
      toInternalPlatform: jest.fn((value) => String(value || '').trim().toLowerCase() === 'x' ? 'twitter' : String(value || '').trim().toLowerCase()),
    }));

    ({ executeSocialPlan } = require('../services/executors/socialExecutor'));
  });

  test('filters posting to explicitly allowed local social accounts', async () => {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM tenant_vutler.social_accounts')) {
          return {
            rows: [
              {
                id: 'local-account-1',
                platform: 'linkedin',
                platform_account_id: 'remote-account-1',
                metadata: { organization_id: '106026474' },
              },
              {
                id: 'local-account-2',
                platform: 'linkedin',
                platform_account_id: 'remote-account-2',
                metadata: { organization_id: '111276245' },
              },
            ],
          };
        }

        return { rows: [] };
      }),
    };

    const result = await executeSocialPlan({
      workspace_id: 'ws-1',
      params: {
        caption: 'Post only to Snipara',
        allowed_platforms: ['linkedin'],
        allowed_account_ids: ['local-account-2'],
        allowed_brand_ids: ['111276245'],
      },
    }, { db });

    expect(createSocialPostMock).toHaveBeenCalledWith(expect.objectContaining({
      caption: 'Post only to Snipara',
      socialAccounts: ['remote-account-2'],
    }));
    expect(result.data).toMatchObject({
      account_count: 1,
      allowed_account_ids: ['local-account-2'],
      allowed_brand_ids: ['111276245'],
    });
  });

  test('can match allowed brand ids directly from remote account metadata', async () => {
    const db = {
      query: jest.fn(async () => ({ rows: [] })),
    };

    const result = await executeSocialPlan({
      workspace_id: 'ws-1',
      params: {
        caption: 'Post only to brand 111276245',
        allowed_platforms: ['linkedin'],
        allowed_brand_ids: ['111276245'],
      },
    }, { db });

    expect(createSocialPostMock).toHaveBeenCalledWith(expect.objectContaining({
      socialAccounts: ['remote-account-2'],
    }));
    expect(result.data.account_count).toBe(1);
  });
});
