'use strict';

const { queryTokenUsageTotal, queryUsageBillingAnalytics } = require('../api/usage-pg');

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

  test('aggregates billing source and tier from llm usage logs when metadata is available', async () => {
    const pg = {
      query: jest.fn(async (sql, params) => {
        expect(params).toEqual(['ws-managed']);

        if (sql.includes('FROM tenant_vutler.llm_usage_logs')) {
          return {
            rows: [
              {
                byok_tokens: 1200,
                managed_tokens: 3400,
                standard_credits: 10,
                advanced_credits: 22,
                premium_credits: 5,
                credits_consumed: 37,
              },
            ],
          };
        }

        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    await expect(queryUsageBillingAnalytics(pg, 'ws-managed')).resolves.toEqual({
      billing_sources: {
        byok_tokens: 1200,
        managed_tokens: 3400,
      },
      billing_tiers: {
        standard: 10,
        advanced: 22,
        premium: 5,
      },
      credits_consumed: 37,
    });
  });
});
