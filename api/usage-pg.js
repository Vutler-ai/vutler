/**
 * Usage API — PostgreSQL
 * Returns real token/request usage data. Returns zeros when DB tables are empty.
 */
'use strict';

const express = require('express');
const router = express.Router();
const { getWorkspaceCreditBalance, getWorkspaceCurrentPeriodUsage } = require('../services/workspaceCreditService');

const SCHEMA = 'tenant_vutler';

// Cost-per-token estimates by provider (USD per token, rough averages)
const COST_PER_TOKEN = {
  anthropic: 0.000015,
  codex: 0.00001,
  openai: 0.00001,
  groq: 0.0000008,
  mistral: 0.000004,
  openrouter: 0.00001,
  ollama: 0,
  default: 0.00001,
};

function estimateCost(tokens, provider) {
  const rate = COST_PER_TOKEN[(provider || '').toLowerCase()] ?? COST_PER_TOKEN.default;
  return parseFloat((tokens * rate).toFixed(6));
}

async function queryTokenUsageRecords(pg, workspaceId, intervalSql) {
  const strategies = [
    {
      timeColumn: 'ul.created_at',
      query: `
        SELECT
          ul.id,
          COALESCE(a.name, ul.agent_id::text, 'Unknown agent') AS agent_name,
          ul.model,
          ul.provider,
          ul.tokens_input AS input_tokens,
          ul.tokens_output AS output_tokens,
          (ul.tokens_input + ul.tokens_output) AS tokens,
          ul.latency_ms,
          ul.billing_source,
          ul.billing_tier,
          ul.credit_multiplier,
          ul.credits_debited,
          NULL::numeric AS estimated_cost,
          ul.created_at
        FROM ${SCHEMA}.llm_usage_logs ul
        LEFT JOIN ${SCHEMA}.agents a ON a.id = ul.agent_id
        WHERE ul.workspace_id = $1 %TIME_FILTER%
        ORDER BY ul.created_at DESC
        LIMIT 500
      `,
    },
    {
      timeColumn: 'ul.created_at',
      query: `
        SELECT
          ul.id,
          COALESCE(a.name, ul.agent_id::text, 'Unknown agent') AS agent_name,
          ul.model,
          ul.provider,
          ul.tokens_input AS input_tokens,
          ul.tokens_output AS output_tokens,
          (ul.tokens_input + ul.tokens_output) AS tokens,
          ul.latency_ms,
          NULL::text AS billing_source,
          NULL::text AS billing_tier,
          NULL::numeric AS credit_multiplier,
          NULL::bigint AS credits_debited,
          NULL::numeric AS estimated_cost,
          ul.created_at
        FROM ${SCHEMA}.llm_usage_logs ul
        LEFT JOIN ${SCHEMA}.agents a ON a.id = ul.agent_id
        WHERE ul.workspace_id = $1 %TIME_FILTER%
        ORDER BY ul.created_at DESC
        LIMIT 500
      `,
    },
    {
      timeColumn: 'ul.created_at',
      query: `
        SELECT
          ul.id,
          COALESCE(a.name, ul.agent_id::text, 'Unknown agent') AS agent_name,
          ul.model,
          ul.provider,
          ul.input_tokens,
          ul.output_tokens,
          (ul.input_tokens + ul.output_tokens) AS tokens,
          ul.latency_ms,
          NULL::text AS billing_source,
          NULL::text AS billing_tier,
          NULL::numeric AS credit_multiplier,
          NULL::bigint AS credits_debited,
          ul.estimated_cost,
          ul.created_at
        FROM ${SCHEMA}.usage_logs ul
        LEFT JOIN ${SCHEMA}.agents a ON a.id = ul.agent_id
        WHERE ul.workspace_id = $1 %TIME_FILTER%
        ORDER BY ul.created_at DESC
        LIMIT 500
      `,
    },
    {
      timeColumn: 'ae.created_at',
      query: `
        SELECT
          ae.id,
          COALESCE(a.name, ae.agent_id::text, 'Unknown agent') AS agent_name,
          ae.model,
          ae.provider,
          ae.input_tokens,
          ae.output_tokens,
          ae.tokens_used AS tokens,
          ae.latency_ms,
          NULL::text AS billing_source,
          NULL::text AS billing_tier,
          NULL::numeric AS credit_multiplier,
          NULL::bigint AS credits_debited,
          NULL::numeric AS estimated_cost,
          ae.created_at
        FROM ${SCHEMA}.agent_executions ae
        LEFT JOIN ${SCHEMA}.agents a ON a.id = ae.agent_id
        WHERE ae.workspace_id = $1 %TIME_FILTER%
        ORDER BY ae.created_at DESC
        LIMIT 500
      `,
    },
    {
      timeColumn: 'ct.created_at',
      query: `
        SELECT
          ct.id,
          COALESCE(a.name, ct.metadata->>'agent_name', ct.metadata->>'agent_id', 'System') AS agent_name,
          ct.metadata->>'model' AS model,
          ct.metadata->>'provider' AS provider,
          (ct.metadata->>'input_tokens')::int AS input_tokens,
          (ct.metadata->>'output_tokens')::int AS output_tokens,
          ABS(ct.amount) AS tokens,
          NULL::int AS latency_ms,
          COALESCE(ct.billing_source, ct.metadata->>'billing_source', ct.metadata->>'source') AS billing_source,
          COALESCE(ct.billing_tier, ct.metadata->>'billing_tier') AS billing_tier,
          ct.credit_multiplier,
          COALESCE(ct.credits_amount, (ct.metadata->>'credits_debited')::bigint) AS credits_debited,
          NULL::numeric AS estimated_cost,
          ct.created_at
        FROM ${SCHEMA}.credit_transactions ct
        LEFT JOIN ${SCHEMA}.agents a ON a.id = (ct.metadata->>'agent_id')::uuid
        WHERE ct.workspace_id = $1 AND ct.type = 'usage' %TIME_FILTER%
        ORDER BY ct.created_at DESC
        LIMIT 500
      `,
    },
  ];

  for (const strategy of strategies) {
    try {
      const whereTime = intervalSql ? `AND ${strategy.timeColumn} >= ${intervalSql}` : '';
      const query = strategy.query.replace('%TIME_FILTER%', whereTime);
      const result = await pg.query(query, [workspaceId]);
      if (result.rows.length > 0) return result.rows;
    } catch (_) {
      continue;
    }
  }

  return [];
}

async function queryTokenUsageTotal(pg, workspaceId) {
  const queries = [
    `SELECT COALESCE(SUM(tokens_input + tokens_output), 0) AS total FROM ${SCHEMA}.llm_usage_logs WHERE workspace_id = $1`,
    `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM ${SCHEMA}.usage_logs WHERE workspace_id = $1`,
    `SELECT COALESCE(SUM(tokens_used), 0) AS total FROM ${SCHEMA}.agent_executions WHERE workspace_id = $1`,
    `SELECT COALESCE(SUM(ABS(amount)), 0) AS total FROM ${SCHEMA}.credit_transactions WHERE workspace_id = $1 AND type = 'usage'`,
  ];

  for (const query of queries) {
    try {
      const result = await pg.query(query, [workspaceId]);
      const total = parseInt(result.rows[0]?.total || 0, 10);
      if (total > 0) return total;
    } catch (_) {
      continue;
    }
  }

  return 0;
}

async function queryUsageBillingAnalytics(pg, workspaceId, intervalSql) {
  if (!pg || !workspaceId) {
    return {
      billing_sources: {
        byok_tokens: 0,
        managed_tokens: 0,
      },
      billing_tiers: {
        standard: 0,
        advanced: 0,
        premium: 0,
      },
      credits_consumed: 0,
    };
  }

  const whereTime = intervalSql ? `AND created_at >= ${intervalSql}` : '';

  try {
    const result = await pg.query(
      `SELECT
          COALESCE(SUM(CASE WHEN billing_source = 'byok' THEN tokens_input + tokens_output ELSE 0 END), 0) AS byok_tokens,
          COALESCE(SUM(CASE WHEN billing_source <> 'byok' OR billing_source IS NULL THEN tokens_input + tokens_output ELSE 0 END), 0) AS managed_tokens,
          COALESCE(SUM(CASE WHEN billing_tier = 'standard' THEN COALESCE(credits_debited, 0) ELSE 0 END), 0) AS standard_credits,
          COALESCE(SUM(CASE WHEN billing_tier = 'advanced' THEN COALESCE(credits_debited, 0) ELSE 0 END), 0) AS advanced_credits,
          COALESCE(SUM(CASE WHEN billing_tier = 'premium' THEN COALESCE(credits_debited, 0) ELSE 0 END), 0) AS premium_credits,
          COALESCE(SUM(COALESCE(credits_debited, 0)), 0) AS credits_consumed
         FROM ${SCHEMA}.llm_usage_logs
        WHERE workspace_id = $1 ${whereTime}`,
      [workspaceId]
    );

    const row = result.rows?.[0] || {};
    return {
      billing_sources: {
        byok_tokens: parseInt(row.byok_tokens || 0, 10),
        managed_tokens: parseInt(row.managed_tokens || 0, 10),
      },
      billing_tiers: {
        standard: parseInt(row.standard_credits || 0, 10),
        advanced: parseInt(row.advanced_credits || 0, 10),
        premium: parseInt(row.premium_credits || 0, 10),
      },
      credits_consumed: parseInt(row.credits_consumed || 0, 10),
    };
  } catch (_) {
    return {
      billing_sources: {
        byok_tokens: 0,
        managed_tokens: 0,
      },
      billing_tiers: {
        standard: 0,
        advanced: 0,
        premium: 0,
      },
      credits_consumed: 0,
    };
  }
}

// ─── GET /api/v1/usage ─────────────────────────────────────────────────────────
// Returns usage records + summary for the workspace.
// Tries three possible table layouts; returns zeros when all tables are empty.
router.get('/usage', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const workspaceId = req.workspaceId; // SECURITY: workspace from JWT only (audit 2026-03-29)
    const period = req.query.period || 'month'; // day | week | month | all

    const intervalSql =
      {
        day: "NOW() - INTERVAL '1 day'",
        week: "NOW() - INTERVAL '7 days'",
        month: "NOW() - INTERVAL '30 days'",
        all: null,
      }[period] || "NOW() - INTERVAL '30 days'";

    const records = pg ? await queryTokenUsageRecords(pg, workspaceId, intervalSql) : [];
    const billingAnalytics = pg ? await queryUsageBillingAnalytics(pg, workspaceId, intervalSql) : null;
    const creditSummary = pg ? await getWorkspaceCreditBalance(pg, workspaceId) : null;
    const periodUsage = pg ? await getWorkspaceCurrentPeriodUsage(pg, workspaceId) : null;

    // ── Normalise cost if missing ─────────────────────────────────────────────
    const normalizedRecords = records.map(r => ({
      ...r,
      tokens: r.tokens ?? (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      billing_source: r.billing_source ?? null,
      billing_tier: r.billing_tier ?? null,
      credit_multiplier: r.credit_multiplier ?? null,
      credits_debited: r.credits_debited ?? 0,
      estimated_cost: r.estimated_cost ?? estimateCost((r.input_tokens ?? 0) + (r.output_tokens ?? 0), r.provider),
    }));

    // ── Summary ───────────────────────────────────────────────────────────────
    const total_tokens = normalizedRecords.reduce((s, r) => s + (r.tokens || 0), 0);
    const total_requests = normalizedRecords.length;
    const total_cost = parseFloat(normalizedRecords.reduce((s, r) => s + (r.estimated_cost || 0), 0).toFixed(6));
    const avg_latency_ms =
      normalizedRecords.length > 0
        ? Math.round(normalizedRecords.reduce((s, r) => s + (r.latency_ms || 0), 0) / normalizedRecords.length)
        : 0;

    res.json({
      success: true,
      data: normalizedRecords,
      total_tokens,
      total_requests,
      total_cost,
      avg_latency_ms,
      billing_sources: billingAnalytics?.billing_sources ?? {
        byok_tokens: 0,
        managed_tokens: 0,
      },
      billing_tiers: billingAnalytics?.billing_tiers ?? {
        standard: 0,
        advanced: 0,
        premium: 0,
      },
      credits_consumed: billingAnalytics?.credits_consumed ?? 0,
      credit_summary: creditSummary ?? {
        total_remaining: 0,
        trial_remaining: 0,
        plan_remaining: 0,
        topup_remaining: 0,
        legacy_remaining: 0,
      },
      current_period: periodUsage ?? {
        credits_consumed: 0,
        by_tier: {
          standard: 0,
          advanced: 0,
          premium: 0,
        },
        by_source: {
          byok_tokens: 0,
          managed_tokens: 0,
        },
      },
      period,
    });
  } catch (err) {
    console.error('[Usage] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v1/usage/summary ─────────────────────────────────────────────────
router.get('/usage/summary', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const workspaceId = req.workspaceId;

    const totalTokens = pg ? await queryTokenUsageTotal(pg, workspaceId) : 0;
    const creditSummary = pg ? await getWorkspaceCreditBalance(pg, workspaceId) : null;
    const currentPeriod = pg ? await getWorkspaceCurrentPeriodUsage(pg, workspaceId) : null;

    res.json({
      success: true,
      usage: {
        totalTokens,
        totalCost: estimateCost(totalTokens, 'default'),
        requests: 0,
      },
      ai: {
        balances: creditSummary,
        current_period: currentPeriod,
      },
    });
  } catch (err) {
    console.error('[Usage] Summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/v1/usage/tiers ───────────────────────────────────────────────────
router.get('/usage/tiers', (req, res) => {
  const { PLANS } = require('../packages/core/middleware/featureGate');
  const tiers = Object.entries(PLANS).map(([id, plan]) => ({
    id,
    name: plan.label,
    maxTokens: plan.limits.tokens_month ?? plan.limits.tokens ?? 0,
    maxAgents: plan.limits.agents ?? 0,
    storageGb: plan.limits.storage_gb ?? 0,
  }));
  res.json({ success: true, tiers });
});

module.exports = router;
module.exports.estimateCost = estimateCost;
module.exports.queryUsageBillingAnalytics = queryUsageBillingAnalytics;
module.exports.queryTokenUsageRecords = queryTokenUsageRecords;
module.exports.queryTokenUsageTotal = queryTokenUsageTotal;
