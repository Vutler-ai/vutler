'use strict';

const {
  calculateCreditsDebited,
  getPlanIncludedCredits,
  getWorkspaceAiSummary,
  getWorkspaceCreditBalance,
  resolveBillingTier,
} = require('../services/workspaceCreditService');

describe('workspaceCreditService', () => {
  test('maps managed models to billing tiers and debited credits', () => {
    expect(resolveBillingTier('openai', 'gpt-5.4-mini')).toBe('standard');
    expect(resolveBillingTier('openai', 'gpt-5.4')).toBe('advanced');
    expect(resolveBillingTier('anthropic', 'claude-opus-4-20250514')).toBe('premium');
    expect(calculateCreditsDebited({ totalTokens: 2500, tier: 'advanced' })).toBe(9);
  });

  test('reads legacy workspace token balance as normalized managed balance', async () => {
    const db = {
      query: jest.fn(async sql => {
        if (sql.includes('UPDATE tenant_vutler.workspace_credit_grants')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM tenant_vutler.workspace_credit_grants')) return { rows: [] };
        if (sql.includes(`key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at')`)) {
          return {
            rows: [
              { key: 'trial_tokens_total', value: '4200' },
              { key: 'trial_tokens_used', value: '1200' },
            ],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    await expect(getWorkspaceCreditBalance(db, 'ws-1')).resolves.toMatchObject({
      total_remaining: 3,
      legacy_remaining: 3,
      trial_remaining: 0,
      total_remaining_tokens_legacy: 3000,
    });
  });

  test('builds AI summary from plan entitlements and current period usage', async () => {
    const db = {
      query: jest.fn(async sql => {
        if (sql.includes('UPDATE tenant_vutler.workspace_credit_grants')) return { rowCount: 0, rows: [] };
        if (sql.includes('FROM tenant_vutler.workspace_credit_grants')) return { rows: [] };
        if (sql.includes(`key = 'billing_plan'`)) {
          return { rows: [{ value: { plan: 'office_starter' } }] };
        }
        if (sql.includes(`key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at')`)) {
          return { rows: [] };
        }
        if (sql.includes('FROM tenant_vutler.llm_usage_logs')) {
          return {
            rows: [
              {
                credits_consumed: 55,
                standard_credits: 10,
                advanced_credits: 20,
                premium_credits: 25,
                byok_tokens: 1000,
                managed_tokens: 4000,
              },
            ],
          };
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };

    await expect(getWorkspaceAiSummary(db, 'ws-2')).resolves.toMatchObject({
      monthly_included_credits: getPlanIncludedCredits('office_starter'),
      current_period: {
        credits_consumed: 55,
        by_tier: {
          standard: 10,
          advanced: 20,
          premium: 25,
        },
      },
    });
  });
});
