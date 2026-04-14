'use strict';

describe('jira integration connection flow', () => {
  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  function loadRouter({ query = jest.fn().mockResolvedValue({ rows: [] }), listProjects = jest.fn().mockResolvedValue([]), encrypt = jest.fn((value) => `enc:${value}`) } = {}) {
    const JiraAdapter = jest.fn().mockImplementation(() => ({
      listProjects,
    }));

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../lib/schemaReadiness', () => ({
      assertColumnsExist: jest.fn(),
      assertTableExists: jest.fn(),
      runtimeSchemaMutationsAllowed: jest.fn(() => false),
    }));
    jest.doMock('../services/google/googleApi', () => ({}));
    jest.doMock('../services/microsoft/graphApi', () => ({}));
    jest.doMock('../services/integrations/jira', () => ({ JiraAdapter }));
    jest.doMock('../services/crypto', () => ({
      CryptoService: jest.fn().mockImplementation(() => ({
        encrypt,
      })),
    }));

    const router = require('../api/integrations');
    return { router, JiraAdapter, query, listProjects, encrypt };
  }

  test('validates jira credentials before saving them', async () => {
    const listProjects = jest.fn().mockResolvedValue([
      { id: '1', key: 'OPS', name: 'Operations' },
      { id: '2', key: 'ENG', name: 'Engineering' },
    ]);
    const { router, JiraAdapter } = loadRouter({ listProjects });

    const result = await router._private.validateJiraCredentials({
      baseUrl: 'https://acme.atlassian.net/',
      email: 'ops@acme.com',
      apiToken: 'secret-token',
    });

    expect(JiraAdapter).toHaveBeenCalledWith(
      'https://acme.atlassian.net',
      'ops@acme.com',
      'secret-token'
    );
    expect(result).toEqual({
      normalizedUrl: 'https://acme.atlassian.net',
      projects: [
        { id: '1', key: 'OPS', name: 'Operations' },
        { id: '2', key: 'ENG', name: 'Engineering' },
      ],
      projectCount: 2,
      sampleProjects: [
        { id: '1', key: 'OPS', name: 'Operations' },
        { id: '2', key: 'ENG', name: 'Engineering' },
      ],
    });
  });

  test('persists encrypted jira credentials when the workspace saves the connector', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });
    const encrypt = jest.fn(() => 'encrypted-token');
    const { router } = loadRouter({ query, encrypt });

    await router._private.persistJiraIntegrationConnection({
      workspaceId: 'ws-1',
      normalizedUrl: 'https://acme.atlassian.net',
      email: 'ops@acme.com',
      apiToken: 'secret-token',
      connectedBy: 'user@acme.com',
    });

    expect(encrypt).toHaveBeenCalledWith('secret-token');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tenant_vutler.workspace_integrations'),
      [
        'ws-1',
        JSON.stringify({
          baseUrl: 'https://acme.atlassian.net',
          email: 'ops@acme.com',
          connectMode: 'api_token',
          projectKeys: [],
          sampleProjects: [],
        }),
        JSON.stringify({
          baseUrl: 'https://acme.atlassian.net',
          email: 'ops@acme.com',
          apiToken: 'encrypted-token',
        }),
        'user@acme.com',
      ]
    );
  });

  test('jira detail payload exposes saved base url and email without leaking the token', () => {
    const { router } = loadRouter();

    const detail = router._private.buildIntegrationDetailPayload({
      provider: 'jira',
      name: 'Jira',
      description: 'Project tracking',
      icon: '🔷',
      category: 'project-management',
      source: 'internal',
      connected: true,
      status: 'connected',
      connected_at: '2026-04-03T10:00:00.000Z',
      connected_by: 'user@acme.com',
      scopes: ['read:jira-user', 'read:jira-work'],
      config: { health: 'connected' },
      credentials: {
        baseUrl: 'https://acme.atlassian.net',
        email: 'ops@acme.com',
        apiToken: 'encrypted-token',
      },
    });

    expect(detail.config).toEqual({
      health: 'connected',
      baseUrl: 'https://acme.atlassian.net',
      email: 'ops@acme.com',
      connectMode: 'api_token',
    });
    expect(detail.config.apiToken).toBeUndefined();
    expect(detail.connected).toBe(true);
  });
});
