'use strict';

describe('sniparaService.createProject', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SNIPARA_INTEGRATION_KEY = 'int-key';
    process.env.SNIPARA_WEBHOOK_URL = 'https://app.vutler.ai/api/v1/webhooks/snipara';
    process.env.SNIPARA_WEBHOOK_SECRET = 'whsec-test';
  });

  afterEach(() => {
    delete process.env.SNIPARA_INTEGRATION_KEY;
    delete process.env.SNIPARA_WEBHOOK_URL;
    delete process.env.SNIPARA_WEBHOOK_SECRET;
  });

  test('sends webhook configuration when creating a client project', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        data: {
          id: 'project-1',
          api_key: 'rlm-project-key',
          slug: 'test-workspace-api',
          mcp_url: 'https://api.snipara.com/mcp/test-workspace-api',
        },
      },
    });

    jest.doMock('axios', () => ({ post }));

    const service = require('../services/sniparaService');
    const result = await service.createProject({
      workspaceName: 'Vutler',
      workspaceId: 'ws-1',
      workspaceSlug: 'test-workspace-api',
      ownerEmail: 'ops@vutler.ai',
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.snipara.com/v1/integrator/clients',
      expect.objectContaining({
        name: 'Vutler',
        slug: 'test-workspace-api',
        webhook_url: 'https://app.vutler.ai/api/v1/webhooks/snipara',
        webhook_secret: 'whsec-test',
      }),
      expect.any(Object)
    );
    expect(result).toMatchObject({
      project_id: 'project-1',
      api_key: 'rlm-project-key',
      project_slug: 'test-workspace-api',
      api_url: 'https://api.snipara.com/mcp/test-workspace-api',
    });
  });

  test('retries without webhook fields when the integrator API rejects them', async () => {
    const post = jest.fn()
      .mockRejectedValueOnce({
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: { detail: 'Unknown field webhook_secret' },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            id: 'project-2',
            api_key: 'rlm-project-key-2',
            slug: 'test-workspace-api',
            mcp_url: 'https://api.snipara.com/mcp/test-workspace-api',
          },
        },
      });

    jest.doMock('axios', () => ({ post }));

    const service = require('../services/sniparaService');
    const result = await service.createProject({
      workspaceName: 'Vutler',
      workspaceId: 'ws-2',
      workspaceSlug: 'test-workspace-api',
      ownerEmail: 'ops@vutler.ai',
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][1]).toEqual(expect.not.objectContaining({
      webhook_url: expect.anything(),
      webhook_secret: expect.anything(),
    }));
    expect(result.project_id).toBe('project-2');
  });

  test('prefers an rlm key for integrator auth when SNIPARA_INTEGRATION_KEY is not compatible', async () => {
    process.env.SNIPARA_INTEGRATION_KEY = 'int-key';
    process.env.SNIPARA_PROJECT_KEY = 'rlm_project_key';

    const post = jest.fn().mockResolvedValue({
      data: {
        data: {
          id: 'project-3',
          api_key: 'rlm-project-key-3',
          slug: 'test-workspace-api',
          mcp_url: 'https://api.snipara.com/mcp/test-workspace-api',
        },
      },
    });

    jest.doMock('axios', () => ({ post }));

    const service = require('../services/sniparaService');
    await service.createProject({
      workspaceName: 'Vutler',
      workspaceId: 'ws-3',
      workspaceSlug: 'test-workspace-api',
      ownerEmail: 'ops@vutler.ai',
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.snipara.com/v1/integrator/clients',
      expect.any(Object),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'rlm_project_key',
        }),
      })
    );
  });

  test('creates a client API key when create client does not return one', async () => {
    const post = jest.fn()
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            client_id: 'client-1',
            project_id: 'project-4',
            project_slug: 'test-workspace-api',
          },
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            api_key: 'rlm-client-key',
          },
        },
      });

    jest.doMock('axios', () => ({ post }));

    const service = require('../services/sniparaService');
    const result = await service.createProject({
      workspaceName: 'Vutler',
      workspaceId: 'ws-4',
      workspaceSlug: 'test-workspace-api',
      ownerEmail: 'ops@vutler.ai',
    });

    expect(post).toHaveBeenNthCalledWith(
      2,
      'https://api.snipara.com/v1/integrator/clients/client-1/api-keys',
      { name: 'test-workspace-api-workspace-key', access_level: 'ADMIN' },
      expect.any(Object)
    );
    expect(result).toMatchObject({
      client_id: 'client-1',
      project_id: 'project-4',
      api_key: 'rlm-client-key',
    });
  });

  test('createSwarm throws when Snipara returns an access error without a swarm id', async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: 'Access denied: rlm_swarm_create requires ADMIN access',
                access_level: 'EDITOR',
                required_level: 'ADMIN',
              }),
            },
          ],
        },
      },
    });

    jest.doMock('axios', () => ({ post }));

    const service = require('../services/sniparaService');
    await expect(service.createSwarm({
      apiKey: 'snipara_ic_key',
      apiUrl: 'https://api.snipara.com/mcp/test-project',
      name: 'client-swarm',
    })).rejects.toThrow('Access denied: rlm_swarm_create requires ADMIN access');
  });

  test('createClientSwarm uses the integrator swarms endpoint', async () => {
    process.env.SNIPARA_INTEGRATION_KEY = 'rlm_integrator_key';
    const post = jest.fn().mockResolvedValue({
      data: {
        success: true,
        data: {
          swarm_id: 'swarm-1',
          project_id: 'project-1',
        },
      },
    });

    jest.doMock('axios', () => ({ post }));

    const service = require('../services/sniparaService');
    const result = await service.createClientSwarm({
      clientId: 'client-1',
      name: 'Default Swarm',
      description: 'Created by integrator API',
    });

    expect(post).toHaveBeenCalledWith(
      'https://api.snipara.com/v1/integrator/clients/client-1/swarms',
      {
        name: 'Default Swarm',
        description: 'Created by integrator API',
      },
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-API-Key': 'rlm_integrator_key',
        }),
      })
    );
    expect(result).toMatchObject({ swarm_id: 'swarm-1' });
  });
});
