'use strict';

describe('runbooks workspace context', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('executeRunbook rejects missing workspace ids before touching the database', async () => {
    const query = jest.fn();

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));

    const { executeRunbook } = require('../services/runbooks');

    await expect(executeRunbook({
      name: 'Deploy app',
      steps: [{ order: 1, action: 'deploy_app' }],
    }, {})).rejects.toThrow('workspaceId is required for runbook operations');

    expect(query).not.toHaveBeenCalled();
  });

  test('listRunbooks rejects missing workspace ids before touching the database', async () => {
    const query = jest.fn();

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));

    const { listRunbooks } = require('../services/runbooks');

    await expect(listRunbooks()).rejects.toThrow('workspaceId is required for runbook operations');
    expect(query).not.toHaveBeenCalled();
  });

  test('getRunbookStatus scopes lookup by workspace when provided', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));

    const { getRunbookStatus } = require('../services/runbooks');

    await getRunbookStatus('rb-1', 'ws-1');

    const [sql, params] = query.mock.calls.at(-1);
    expect(sql).toContain('workspace_id = $2');
    expect(params).toEqual(['rb-1', 'ws-1']);
  });

  test('cancelRunbook scopes cancellation by workspace when provided', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [] });

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../services/llmRouter', () => ({ chat: jest.fn() }));

    const { cancelRunbook } = require('../services/runbooks');

    await cancelRunbook('rb-1', 'ws-1');

    const [sql, params] = query.mock.calls.at(-1);
    expect(sql).toContain('workspace_id = $2');
    expect(params).toEqual(['rb-1', 'ws-1']);
  });
});
