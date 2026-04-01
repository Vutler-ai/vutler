'use strict';

describe('workspacePlanService', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('syncs workspace plan to both workspaces and workspace_settings', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes('UPDATE tenant_vutler.workspace_settings')) {
        return { rows: [], rowCount: 0 };
      }
      return { rows: [] };
    });

    jest.doMock('../lib/vaultbrix', () => ({ query }));

    const { syncWorkspacePlan, buildPlanSnapshot } = require('../services/workspacePlanService');
    const snapshot = await syncWorkspacePlan({
      workspaceId: 'ws-1',
      planId: 'agents_pro',
      source: 'billing.change_plan',
      status: 'active',
      interval: 'monthly',
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
    });

    expect(snapshot).toMatchObject({
      plan: 'agents_pro',
      source: 'billing.change_plan',
      status: 'active',
      interval: 'monthly',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(`UPDATE tenant_vutler.workspaces`),
      ['agents_pro', 'ws-1']
    );
    expect(query.mock.calls[1][0]).toContain('UPDATE tenant_vutler.workspace_settings');
    expect(query.mock.calls[2][0]).toContain('INSERT INTO tenant_vutler.workspace_settings');
    expect(query.mock.calls[2][1][0]).toBe('ws-1');
    expect(JSON.parse(query.mock.calls[2][1][2])).toMatchObject({
      plan: 'agents_pro',
      source: 'billing.change_plan',
      status: 'active',
      interval: 'monthly',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
    });
    expect(query.mock.calls[3][0]).toContain('UPDATE tenant_vutler.workspace_settings');
    expect(query.mock.calls[4][0]).toContain('INSERT INTO tenant_vutler.workspace_settings');
    expect(query.mock.calls[4][1]).toEqual(['ws-1', 'memory_mode', JSON.stringify('active')]);
    expect(query.mock.calls[5][0]).toContain('UPDATE tenant_vutler.workspace_settings');
    expect(query.mock.calls[6][0]).toContain('INSERT INTO tenant_vutler.workspace_settings');
    expect(query.mock.calls[6][1]).toEqual(['ws-1', 'snipara_memory_mode', JSON.stringify('active')]);
  });

  test('reads workspace plan from billing_plan settings before falling back to workspaces.plan', async () => {
    const query = jest.fn(async (sql) => {
      if (sql.includes(`FROM tenant_vutler.workspace_settings`) && sql.includes(`key = 'billing_plan'`)) {
        return { rows: [{ value: { plan: 'agents_pro' } }] };
      }
      return { rows: [] };
    });

    const { getWorkspacePlanId } = require('../services/workspacePlanService');
    await expect(getWorkspacePlanId({ query }, 'ws-1')).resolves.toBe('agents_pro');
  });

  test('falls back to free for unknown plans', () => {
    jest.doMock('../lib/vaultbrix', () => ({ query: jest.fn() }));
    const { normalizePlanId } = require('../services/workspacePlanService');
    expect(normalizePlanId('unknown-plan')).toBe('free');
  });
});
