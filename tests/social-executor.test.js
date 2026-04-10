'use strict';

describe('socialExecutor', () => {
  let createSocialPostMock;
  let listSocialAccountsMock;
  let createTaskMock;
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
    createTaskMock = jest.fn().mockResolvedValue({
      id: 'task-queued-1',
      status: 'pending',
    });
    jest.doMock('../app/custom/services/swarmCoordinator', () => ({
      getSwarmCoordinator: jest.fn(() => ({
        createTask: createTaskMock,
      })),
    }));

    ({ executeSocialPlan } = require('../services/executors/socialExecutor'));
  });

  test('queues a task instead of publishing when no origin task exists', async () => {
    const result = await executeSocialPlan({
      workspace_id: 'ws-1',
      selectedAgentId: 'agent-1',
      params: {
        caption: 'Queue this post first',
        platforms: ['linkedin'],
      },
    }, { db: { query: jest.fn() } });

    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining('Social publish:'),
      for_agent_id: 'agent-1',
      due_date: null,
      metadata: expect.objectContaining({
        social_publication_request: expect.objectContaining({
          caption: 'Queue this post first',
          platforms: ['linkedin'],
        }),
      }),
    }), 'ws-1');
    expect(createSocialPostMock).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({
      queued: true,
      task_id: 'task-queued-1',
      task_status: 'pending',
    });
  });

  test('propagates scheduled_at into due_date for queued social tasks', async () => {
    await executeSocialPlan({
      workspace_id: 'ws-1',
      selectedAgentId: 'agent-1',
      params: {
        caption: 'Queue this post for tomorrow',
        platforms: ['linkedin'],
        scheduled_at: '2026-04-11T08:30:00.000Z',
      },
    }, { db: { query: jest.fn() } });

    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      due_date: '2026-04-11T08:30:00.000Z',
      metadata: expect.objectContaining({
        social_publication_request: expect.objectContaining({
          scheduled_at: '2026-04-11T08:30:00.000Z',
        }),
      }),
    }), 'ws-1');
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
        origin_task_id: 'task-1',
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
        origin_task_id: 'task-1',
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
