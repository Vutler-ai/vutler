'use strict';

const { getWorkspacePlanId } = require('./workspacePlanService');

const SCHEMA = 'tenant_vutler';
const CREDIT_TOKEN_UNIT = 1000;

const PLAN_INCLUDED_CREDITS = Object.freeze({
  free: 0,
  office_starter: 3000,
  office_team: 10000,
  agents_starter: 3000,
  agents_pro: 10000,
  full: 20000,
  nexus_enterprise: 0,
  enterprise: 0,
});

const TIER_MULTIPLIERS = Object.freeze({
  standard: 1.0,
  advanced: 3.5,
  premium: 6.0,
});

function hasManagedRuntimeProfile() {
  const keys = [
    'VUTLER_TRIAL_API_KEY',
    'VUTLER_TRIAL_OPENAI_KEY',
    'VUTLER_TRIAL_ANTHROPIC_KEY',
    'VUTLER_TRIAL_OPENROUTER_KEY',
    'VUTLER_MANAGED_API_KEY',
    'VUTLER_MANAGED_OPENAI_KEY',
    'VUTLER_MANAGED_ANTHROPIC_KEY',
    'VUTLER_MANAGED_OPENROUTER_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENROUTER_API_KEY',
  ];

  return keys.some(name => typeof process.env[name] === 'string' && process.env[name].trim());
}

function parseInteger(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeJson(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value;
    }
  }
  return value;
}

function ceilCreditsFromTokens(tokens) {
  const normalized = parseInteger(tokens);
  if (normalized <= 0) return 0;
  return Math.ceil(normalized / CREDIT_TOKEN_UNIT);
}

function getPlanIncludedCredits(planId) {
  const normalized = String(planId || 'free').toLowerCase();
  return PLAN_INCLUDED_CREDITS[normalized] || 0;
}

function getTierMultiplier(tier) {
  return TIER_MULTIPLIERS[String(tier || 'standard').toLowerCase()] || TIER_MULTIPLIERS.standard;
}

function resolveBillingTier(provider, model) {
  const normalizedProvider = String(provider || '').toLowerCase();
  const normalizedModel = String(model || '').toLowerCase();
  const value = `${normalizedProvider} ${normalizedModel}`;

  if (!normalizedModel && normalizedProvider === 'anthropic') return 'standard';
  if (value.includes('opus')) return 'premium';
  if (
    value.includes('haiku') ||
    value.includes('mini') ||
    value.includes('nano') ||
    value.includes('flash') ||
    value.includes('3.5-haiku')
  ) {
    return 'standard';
  }
  if (
    value.includes('sonnet') ||
    value.includes('gpt-5.4') ||
    value.includes('gpt-5 ') ||
    value.includes('gpt-5,') ||
    value.includes('gpt-5\n') ||
    value.includes('o1') ||
    value.includes('o3') ||
    value.includes('o4')
  ) {
    return 'advanced';
  }

  if (normalizedProvider === 'anthropic') return 'advanced';
  if (normalizedProvider === 'openai') return 'advanced';
  return 'standard';
}

function calculateCreditsDebited({ totalTokens = 0, tier = 'standard' } = {}) {
  const normalizedTokens = parseInteger(totalTokens);
  if (normalizedTokens <= 0) return 0;
  return Math.ceil((normalizedTokens / CREDIT_TOKEN_UNIT) * getTierMultiplier(tier));
}

function mapGrantSourceToBalanceKey(source) {
  switch (String(source || '').toLowerCase()) {
    case 'trial':
      return 'trial_remaining';
    case 'plan_monthly':
      return 'plan_remaining';
    case 'topup':
      return 'topup_remaining';
    case 'manual_adjustment':
      return 'manual_remaining';
    case 'contract':
      return 'contract_remaining';
    case 'legacy_pool':
    default:
      return 'legacy_remaining';
  }
}

function mapGrantSourceToBillingSource(source) {
  switch (String(source || '').toLowerCase()) {
    case 'trial':
      return 'trial';
    case 'plan_monthly':
      return 'managed_plan';
    case 'topup':
      return 'managed_topup';
    case 'manual_adjustment':
      return 'manual_adjustment';
    case 'contract':
      return 'managed_contract';
    case 'legacy_pool':
    default:
      return 'managed_legacy';
  }
}

async function expireStaleCreditGrants(db, workspaceId) {
  if (!db || !workspaceId) return 0;

  try {
    const result = await db.query(
      `UPDATE ${SCHEMA}.workspace_credit_grants
          SET status = CASE
                WHEN credits_remaining <= 0 THEN 'depleted'
                ELSE 'expired'
              END,
              updated_at = NOW()
        WHERE workspace_id = $1
          AND status = 'active'
          AND (
            credits_remaining <= 0
            OR (expires_at IS NOT NULL AND expires_at <= NOW())
            OR (source = 'plan_monthly' AND period_end IS NOT NULL AND period_end <= NOW())
          )`,
      [workspaceId]
    );
    return result.rowCount || 0;
  } catch (_) {
    return 0;
  }
}

async function getActiveCreditGrants(db, workspaceId) {
  if (!db || !workspaceId) return [];
  await expireStaleCreditGrants(db, workspaceId).catch(() => {});

  try {
    const result = await db.query(
      `SELECT id, source, status, credits_total, credits_remaining, period_start, period_end,
              expires_at, stripe_checkout_session_id, stripe_payment_intent_id, grant_label,
              metadata, created_at, updated_at
         FROM ${SCHEMA}.workspace_credit_grants
        WHERE workspace_id = $1
          AND status = 'active'
          AND credits_remaining > 0
        ORDER BY
          CASE source
            WHEN 'trial' THEN 1
            WHEN 'plan_monthly' THEN 2
            WHEN 'legacy_pool' THEN 3
            WHEN 'topup' THEN 4
            WHEN 'manual_adjustment' THEN 5
            WHEN 'contract' THEN 6
            ELSE 99
          END,
          COALESCE(expires_at, period_end, NOW() + INTERVAL '100 years') ASC,
          created_at ASC`,
      [workspaceId]
    );

    return result.rows.map(row => ({
      ...row,
      metadata: normalizeJson(row.metadata) || {},
    }));
  } catch (_) {
    return [];
  }
}

async function getLegacyWorkspaceTokenBalance(db, workspaceId) {
  if (!db || !workspaceId) {
    return {
      totalTokens: 0,
      usedTokens: 0,
      remainingTokens: 0,
      expiresAt: null,
      bucket: null,
    };
  }

  try {
    const result = await db.query(
      `SELECT key, value
         FROM ${SCHEMA}.workspace_settings
        WHERE workspace_id = $1
          AND key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at')`,
      [workspaceId]
    );

    const map = {};
    for (const row of result.rows) {
      map[row.key] = row.value;
    }

    const totalTokens = parseInteger(map.trial_tokens_total);
    const usedTokens = parseInteger(map.trial_tokens_used);
    const expiresAt = map.trial_expires_at ? new Date(map.trial_expires_at) : null;
    const remainingTokens = Math.max(totalTokens - usedTokens, 0);
    const isTrial = expiresAt && expiresAt > new Date();

    return {
      totalTokens,
      usedTokens,
      remainingTokens,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      bucket: remainingTokens > 0 ? (isTrial ? 'trial_remaining' : 'legacy_remaining') : null,
    };
  } catch (_) {
    return {
      totalTokens: 0,
      usedTokens: 0,
      remainingTokens: 0,
      expiresAt: null,
      bucket: null,
    };
  }
}

async function getWorkspaceCreditBalance(db, workspaceId) {
  const summary = {
    total_remaining: 0,
    trial_remaining: 0,
    plan_remaining: 0,
    topup_remaining: 0,
    legacy_remaining: 0,
    manual_remaining: 0,
    contract_remaining: 0,
    total_remaining_tokens_legacy: 0,
    grants: [],
  };

  const grants = await getActiveCreditGrants(db, workspaceId);
  for (const grant of grants) {
    const key = mapGrantSourceToBalanceKey(grant.source);
    const remaining = parseInteger(grant.credits_remaining);
    summary[key] += remaining;
    summary.total_remaining += remaining;
    summary.grants.push({
      id: grant.id,
      source: grant.source,
      label: grant.grant_label || null,
      credits_total: parseInteger(grant.credits_total),
      credits_remaining: remaining,
      expires_at: grant.expires_at || null,
      period_end: grant.period_end || null,
    });
  }

  const legacy = await getLegacyWorkspaceTokenBalance(db, workspaceId);
  if (legacy.remainingTokens > 0 && summary.legacy_remaining === 0 && summary.trial_remaining === 0) {
    const remainingCredits = ceilCreditsFromTokens(legacy.remainingTokens);
    if (legacy.bucket) {
      summary[legacy.bucket] += remainingCredits;
      summary.total_remaining += remainingCredits;
      summary.total_remaining_tokens_legacy = legacy.remainingTokens;
    }
  } else if (legacy.remainingTokens > 0) {
    summary.total_remaining_tokens_legacy = legacy.remainingTokens;
  }

  return summary;
}

async function grantMonthlyPlanCredits(db, workspaceId, { planId, periodStart, periodEnd, metadata = {} } = {}) {
  if (!db || !workspaceId || !periodStart || !periodEnd) return null;
  const credits = getPlanIncludedCredits(planId);
  if (credits <= 0) return null;

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.workspace_credit_grants
       (workspace_id, source, status, credits_total, credits_remaining, period_start, period_end, grant_label, metadata, created_at, updated_at)
     SELECT $1, 'plan_monthly', 'active', $2, $2, $3, $4, $5, $6::jsonb, NOW(), NOW()
     WHERE NOT EXISTS (
       SELECT 1
         FROM ${SCHEMA}.workspace_credit_grants
        WHERE workspace_id = $1
          AND source = 'plan_monthly'
          AND period_start = $3
          AND period_end = $4
     )
     RETURNING id, source, credits_total, credits_remaining, period_start, period_end`,
    [
      workspaceId,
      credits,
      periodStart,
      periodEnd,
      `Included credits for ${planId || 'plan'}`,
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows?.[0] || null;
}

async function grantTopupCredits(
  db,
  workspaceId,
  { credits, stripeCheckoutSessionId = null, stripePaymentIntentId = null, label = null, metadata = {} } = {}
) {
  const normalizedCredits = parseInteger(credits);
  if (!db || !workspaceId || normalizedCredits <= 0) return null;

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.workspace_credit_grants
       (workspace_id, source, status, credits_total, credits_remaining, stripe_checkout_session_id,
        stripe_payment_intent_id, grant_label, metadata, created_at, updated_at)
     VALUES ($1, 'topup', 'active', $2, $2, $3, $4, $5, $6::jsonb, NOW(), NOW())
     RETURNING id, source, credits_total, credits_remaining`,
    [
      workspaceId,
      normalizedCredits,
      stripeCheckoutSessionId,
      stripePaymentIntentId,
      label || 'Managed AI top-up',
      JSON.stringify(metadata || {}),
    ]
  );

  return result.rows?.[0] || null;
}

async function backfillLegacyCreditPool(db, workspaceId) {
  if (!db || !workspaceId) return null;
  const legacy = await getLegacyWorkspaceTokenBalance(db, workspaceId);
  const credits = ceilCreditsFromTokens(legacy.remainingTokens);
  if (credits <= 0) return null;

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.workspace_credit_grants
       (workspace_id, source, status, credits_total, credits_remaining, grant_label, metadata, created_at, updated_at)
     SELECT $1, 'legacy_pool', 'active', $2, $2, 'Legacy managed balance', $3::jsonb, NOW(), NOW()
     WHERE NOT EXISTS (
       SELECT 1
         FROM ${SCHEMA}.workspace_credit_grants
        WHERE workspace_id = $1
          AND source = 'legacy_pool'
          AND status IN ('active', 'depleted', 'expired')
     )
     RETURNING id, source, credits_total, credits_remaining`,
    [
      workspaceId,
      credits,
      JSON.stringify({
        legacy_tokens_remaining: legacy.remainingTokens,
        legacy_tokens_total: legacy.totalTokens,
        legacy_tokens_used: legacy.usedTokens,
      }),
    ]
  );

  return result.rows?.[0] || null;
}

async function debitWorkspaceCredits(
  db,
  workspaceId,
  { credits, billingTier = 'standard', providerId = null, model = null, usage = null } = {}
) {
  const normalizedCredits = parseInteger(credits);
  if (!db || !workspaceId || normalizedCredits <= 0) return null;

  const grants = await getActiveCreditGrants(db, workspaceId);
  const grant = grants.find(entry => parseInteger(entry.credits_remaining) >= normalizedCredits);
  if (!grant?.id) return null;

  const result = await db.query(
    `UPDATE ${SCHEMA}.workspace_credit_grants
        SET credits_remaining = credits_remaining - $2,
            status = CASE
              WHEN credits_remaining - $2 <= 0 THEN 'depleted'
              ELSE status
            END,
            updated_at = NOW()
      WHERE id = $1
        AND workspace_id = $3
        AND status = 'active'
        AND credits_remaining >= $2
      RETURNING id, source, credits_total, credits_remaining, status`,
    [grant.id, normalizedCredits, workspaceId]
  );

  const updated = result.rows?.[0] || null;
  if (!updated) return null;

  return {
    grant_id: updated.id,
    source: mapGrantSourceToBillingSource(updated.source),
    grant_source: updated.source,
    billing_tier: billingTier,
    provider_id: providerId,
    model_canonical: model || null,
    credits_debited: normalizedCredits,
    remaining_credits: parseInteger(updated.credits_remaining),
    usage: usage || null,
  };
}

async function getWorkspaceCurrentPeriodUsage(db, workspaceId, { periodStart = null } = {}) {
  if (!db || !workspaceId) {
    return {
      credits_consumed: 0,
      by_tier: {
        standard: 0,
        advanced: 0,
        premium: 0,
      },
      by_source: {},
    };
  }

  const periodSql = periodStart ? '$2::timestamptz' : "date_trunc('month', NOW())";
  const params = periodStart ? [workspaceId, periodStart] : [workspaceId];

  try {
    const result = await db.query(
      `SELECT
          COALESCE(SUM(COALESCE(credits_debited, 0)), 0) AS credits_consumed,
          COALESCE(SUM(CASE WHEN billing_tier = 'standard' THEN COALESCE(credits_debited, 0) ELSE 0 END), 0) AS standard_credits,
          COALESCE(SUM(CASE WHEN billing_tier = 'advanced' THEN COALESCE(credits_debited, 0) ELSE 0 END), 0) AS advanced_credits,
          COALESCE(SUM(CASE WHEN billing_tier = 'premium' THEN COALESCE(credits_debited, 0) ELSE 0 END), 0) AS premium_credits,
          COALESCE(SUM(CASE WHEN billing_source = 'byok' THEN tokens_input + tokens_output ELSE 0 END), 0) AS byok_tokens,
          COALESCE(SUM(CASE WHEN billing_source <> 'byok' THEN tokens_input + tokens_output ELSE 0 END), 0) AS managed_tokens
         FROM ${SCHEMA}.llm_usage_logs
        WHERE workspace_id = $1
          AND created_at >= ${periodSql}`,
      params
    );

    const row = result.rows?.[0] || {};
    return {
      credits_consumed: parseInteger(row.credits_consumed),
      by_tier: {
        standard: parseInteger(row.standard_credits),
        advanced: parseInteger(row.advanced_credits),
        premium: parseInteger(row.premium_credits),
      },
      by_source: {
        byok_tokens: parseInteger(row.byok_tokens),
        managed_tokens: parseInteger(row.managed_tokens),
      },
    };
  } catch (_) {
    return {
      credits_consumed: 0,
      by_tier: {
        standard: 0,
        advanced: 0,
        premium: 0,
      },
      by_source: {},
    };
  }
}

async function getWorkspaceAiSummary(db, workspaceId) {
  const planId = await getWorkspacePlanId(db, workspaceId).catch(() => 'free');
  const balances = await getWorkspaceCreditBalance(db, workspaceId);
  const currentPeriod = await getWorkspaceCurrentPeriodUsage(db, workspaceId);

  return {
    byok_enabled: true,
    managed_runtime_available: hasManagedRuntimeProfile(),
    monthly_included_credits: getPlanIncludedCredits(planId),
    balances,
    current_period: currentPeriod,
  };
}

module.exports = {
  CREDIT_TOKEN_UNIT,
  PLAN_INCLUDED_CREDITS,
  TIER_MULTIPLIERS,
  calculateCreditsDebited,
  ceilCreditsFromTokens,
  debitWorkspaceCredits,
  expireStaleCreditGrants,
  getActiveCreditGrants,
  getLegacyWorkspaceTokenBalance,
  getPlanIncludedCredits,
  getTierMultiplier,
  getWorkspaceAiSummary,
  getWorkspaceCreditBalance,
  getWorkspaceCurrentPeriodUsage,
  grantMonthlyPlanCredits,
  grantTopupCredits,
  backfillLegacyCreditPool,
  mapGrantSourceToBillingSource,
  resolveBillingTier,
};
