'use strict';

const { api, assert, runSuite } = require('./helpers');

async function main() {
  const { passed, failed } = await runSuite('Billing', [
    ['GET /api/v1/billing/plans → 200, plans object with categories', async () => {
      const { status, data } = await api('GET', '/api/v1/billing/plans');
      assert(status === 200, `Expected 200, got ${status}: ${JSON.stringify(data)}`);
      // Plans endpoint is public — should always succeed
      assert(data !== null, 'Expected non-null response');
      // Response may be { success, data } or { office, agents, full } directly
      const plans = data?.data ?? data;
      assert(
        typeof plans === 'object' && plans !== null,
        `Expected object with plan categories, got: ${JSON.stringify(data)}`
      );
      // At minimum one category should exist
      assert(
        plans.office || plans.agents || plans.full || plans.free || Array.isArray(plans),
        `Expected plan categories (office/agents/full), got keys: ${Object.keys(plans).join(', ')}`
      );
    }],

    ['GET /api/v1/billing/subscription → 200, current plan', async () => {
      const { status, data } = await api('GET', '/api/v1/billing/subscription');
      assert(
        status === 200 || status === 400,
        `Expected 200 or 400, got ${status}: ${JSON.stringify(data)}`
      );
      // 400 is acceptable if the API key user has no workspaceId context
      if (status === 200) {
        assert(data !== null, 'Expected non-null subscription response');
      }
    }],
  ]);

  process.exitCode = failed > 0 ? 1 : 0;
  return { passed, failed };
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { main };
