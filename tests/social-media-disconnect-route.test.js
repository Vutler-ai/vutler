'use strict';

function findRouteHandler(router, method, path) {
  const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods?.[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

describe('social media disconnect routes', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('disconnecting a platform also disconnects remote accounts', async () => {
    const query = jest.fn(async (sql, params) => {
      if (sql.includes('SELECT platform_account_id') && sql.includes('FROM tenant_vutler.social_accounts')) {
        expect(params).toEqual(['ws-1', 'linkedin']);
        return {
          rows: [
            { platform_account_id: 'acct-1' },
            { platform_account_id: 'acct-2' },
          ],
        };
      }

      if (sql.includes('DELETE FROM tenant_vutler.social_accounts WHERE workspace_id = $1 AND platform = $2')) {
        expect(params).toEqual(['ws-1', 'linkedin']);
        return { rowCount: 2 };
      }

      if (sql.includes('SELECT DISTINCT platform') && sql.includes('FROM tenant_vutler.social_accounts')) {
        return { rows: [] };
      }

      if (sql.includes('UPDATE tenant_vutler.workspace_integrations')) {
        return { rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    });

    const disconnectSocialAccount = jest.fn(async () => ({ success: true }));

    jest.doMock('../lib/vaultbrix', () => ({ query }));
    jest.doMock('../packages/core/middleware/featureGate', () => ({
      getPlan: jest.fn(),
      normalizePlanId: jest.fn((value) => value),
    }));
    jest.doMock('../services/postForMeClient', () => ({
      createSocialAccountAuthUrl: jest.fn(),
      createSocialPost: jest.fn(),
      disconnectSocialAccount,
      listSocialAccounts: jest.fn(),
      toInternalPlatform: jest.fn((value) => String(value || '').toLowerCase()),
    }));
    jest.doMock('../services/socialAccountScope', () => ({
      extractSocialAccountIdentifiers: jest.fn(() => []),
      getPrimarySocialAccountIdentifier: jest.fn(() => null),
    }));

    const router = require('../api/social-media');
    const handler = findRouteHandler(router, 'delete', '/accounts/platform/:platform');
    const req = {
      workspaceId: 'ws-1',
      params: { platform: 'linkedin' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await handler(req, res);

    expect(disconnectSocialAccount).toHaveBeenCalledTimes(2);
    expect(disconnectSocialAccount).toHaveBeenNthCalledWith(1, 'acct-1');
    expect(disconnectSocialAccount).toHaveBeenNthCalledWith(2, 'acct-2');
    expect(res.json).toHaveBeenCalledWith({ success: true, deleted: 2 });
  });
});
