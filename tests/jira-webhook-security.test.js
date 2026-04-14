'use strict';

function getRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

describe('jira webhook tenant isolation', () => {
  const originalSecret = process.env.JIRA_WEBHOOK_SECRET;

  beforeEach(() => {
    jest.resetModules();
    process.env.JIRA_WEBHOOK_SECRET = 'jira-secret';
  });

  afterAll(() => {
    process.env.JIRA_WEBHOOK_SECRET = originalSecret;
  });

  test('routes an event only to the matching workspace', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({
        rows: [
          {
            workspace_id: 'ws-acme',
            credentials: { baseUrl: 'https://acme.atlassian.net' },
            config: { baseUrl: 'https://acme.atlassian.net', projectKeys: ['AC'] },
          },
          {
            workspace_id: 'ws-other',
            credentials: { baseUrl: 'https://other.atlassian.net' },
            config: { baseUrl: 'https://other.atlassian.net', projectKeys: ['OT'] },
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const router = require('../api/webhooks/jira');
    const handler = getRouteHandler(router, 'post', '/');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await handler({
      query: { secret: 'jira-secret' },
      headers: {},
      body: {
        webhookEvent: 'jira:issue_updated',
        issue: {
          key: 'AC-42',
          self: 'https://acme.atlassian.net/rest/api/3/issue/10001',
          fields: {
            summary: 'Security fix',
            status: { name: 'In Progress' },
            project: { key: 'AC' },
          },
        },
      },
    }, res);

    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO tenant_vutler.workspace_integration_logs'),
      ['ws-acme', 'issue_updated', expect.any(String)]
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, event: 'issue_updated', issueKey: 'AC-42' });
  });

  test('ignores ambiguous workspace matches instead of fan-out', async () => {
    const query = jest.fn().mockResolvedValueOnce({
      rows: [
        {
          workspace_id: 'ws-1',
          credentials: { baseUrl: 'https://shared.atlassian.net' },
          config: { baseUrl: 'https://shared.atlassian.net', projectKeys: [] },
        },
        {
          workspace_id: 'ws-2',
          credentials: { baseUrl: 'https://shared.atlassian.net' },
          config: { baseUrl: 'https://shared.atlassian.net', projectKeys: [] },
        },
      ],
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const router = require('../api/webhooks/jira');
    const handler = getRouteHandler(router, 'post', '/');
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    await handler({
      query: { secret: 'jira-secret' },
      headers: {},
      body: {
        webhookEvent: 'jira:issue_created',
        issue: {
          key: 'SHARED-1',
          self: 'https://shared.atlassian.net/rest/api/3/issue/10001',
          fields: {
            project: { key: 'SHARED' },
          },
        },
      },
    }, res);

    expect(query).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      ignored: true,
      reason: 'ambiguous_workspace_match',
    });
  });
});
