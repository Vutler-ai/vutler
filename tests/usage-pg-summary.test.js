'use strict';

const { queryTokenUsageTotal } = require('../api/usage-pg');

describe('usage summary totals', () => {
  test('falls back to managed credit usage when direct LLM usage tables are unavailable', async () => {
    const pg = {
      query: jest.fn(async (sql, params) => {
        expect(params).toEqual(['ws-managed']);

        if (sql.includes('FROM tenant_vutler.llm_usage_logs')) {
          throw new Error('relation does not exist');
        }

        if (sql.includes('FROM tenant_vutler.usage_logs')) {
          throw new Error('relation does not exist');
        }

        if (sql.includes('FROM tenant_vutler.agent_executions')) {
          throw new Error('relation does not exist');
        }

        if (sql.includes('FROM tenant_vutler.credit_transactions')) {
          return { rows: [{ total: 987 }] };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    await expect(queryTokenUsageTotal(pg, 'ws-managed')).resolves.toBe(987);
  });
});
