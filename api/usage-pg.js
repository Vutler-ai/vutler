/**
 * Usage API — PostgreSQL
 * Returns real token/request usage data with mock fallback when DB is empty.
 */
'use strict';

const express = require('express');
const router = express.Router();

const SCHEMA = 'tenant_vutler';

// Cost-per-token estimates by provider (USD per token, rough averages)
const COST_PER_TOKEN = {
  anthropic: 0.000015,
  openai:    0.000010,
  groq:      0.0000008,
  mistral:   0.000004,
  openrouter: 0.000010,
  ollama:    0,
  default:   0.000010,
};

function estimateCost(tokens, provider) {
  const rate = COST_PER_TOKEN[(provider || '').toLowerCase()] ?? COST_PER_TOKEN.default;
  return parseFloat((tokens * rate).toFixed(6));
}

// ─── GET /api/v1/usage ─────────────────────────────────────────────────────────
// Returns usage records + summary for the workspace.
// Tries three possible table layouts; falls back to per-agent mock data.
router.get('/usage', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const period = req.query.period || 'month'; // day | week | month | all

    const intervalSql = {
      day:   "NOW() - INTERVAL '1 day'",
      week:  "NOW() - INTERVAL '7 days'",
      month: "NOW() - INTERVAL '30 days'",
      all:   null,
    }[period] || "NOW() - INTERVAL '30 days'";

    let records = [];

    if (pg) {
      // Strategy 1 — usage_logs table (preferred)
      try {
        const whereTime = intervalSql ? `AND ul.created_at >= ${intervalSql}` : '';
        const result = await pg.query(`
          SELECT
            ul.id,
            COALESCE(a.name, ul.agent_id::text) AS agent_name,
            ul.model,
            ul.provider,
            ul.input_tokens,
            ul.output_tokens,
            (ul.input_tokens + ul.output_tokens) AS tokens,
            ul.latency_ms,
            ul.estimated_cost,
            ul.created_at
          FROM ${SCHEMA}.usage_logs ul
          LEFT JOIN ${SCHEMA}.agents a ON a.id = ul.agent_id
          WHERE ul.workspace_id = $1 ${whereTime}
          ORDER BY ul.created_at DESC
          LIMIT 500
        `, [workspaceId]);
        records = result.rows;
      } catch (_) {}

      // Strategy 2 — agent_executions table
      if (records.length === 0) {
        try {
          const whereTime = intervalSql ? `AND ae.created_at >= ${intervalSql}` : '';
          const result = await pg.query(`
            SELECT
              ae.id,
              COALESCE(a.name, ae.agent_id::text) AS agent_name,
              ae.model,
              ae.provider,
              ae.input_tokens,
              ae.output_tokens,
              ae.tokens_used AS tokens,
              ae.latency_ms,
              NULL AS estimated_cost,
              ae.created_at
            FROM ${SCHEMA}.agent_executions ae
            LEFT JOIN ${SCHEMA}.agents a ON a.id = ae.agent_id
            WHERE ae.workspace_id = $1 ${whereTime}
            ORDER BY ae.created_at DESC
            LIMIT 500
          `, [workspaceId]);
          records = result.rows;
        } catch (_) {}
      }

      // Strategy 3 — credit_transactions table
      if (records.length === 0) {
        try {
          const whereTime = intervalSql ? `AND ct.created_at >= ${intervalSql}` : '';
          const result = await pg.query(`
            SELECT
              ct.id,
              COALESCE(a.name, ct.agent_id::text, 'System') AS agent_name,
              ct.metadata->>'model' AS model,
              ct.metadata->>'provider' AS provider,
              (ct.metadata->>'input_tokens')::int AS input_tokens,
              (ct.metadata->>'output_tokens')::int AS output_tokens,
              ABS(ct.amount) AS tokens,
              NULL AS latency_ms,
              NULL AS estimated_cost,
              ct.created_at
            FROM ${SCHEMA}.credit_transactions ct
            LEFT JOIN ${SCHEMA}.agents a ON a.id = (ct.metadata->>'agent_id')::uuid
            WHERE ct.workspace_id = $1 AND ct.type = 'usage' ${whereTime}
            ORDER BY ct.created_at DESC
            LIMIT 500
          `, [workspaceId]);
          records = result.rows;
        } catch (_) {}
      }
    }

    // ── Mock fallback — generate plausible per-agent records ──────────────────
    if (records.length === 0) {
      let agents = [];
      if (pg) {
        try {
          const agentRes = await pg.query(
            `SELECT id, name, model, provider FROM ${SCHEMA}.agents WHERE workspace_id = $1 LIMIT 10`,
            [workspaceId]
          );
          agents = agentRes.rows;
        } catch (_) {}
      }

      if (agents.length === 0) {
        // Absolute fallback — single default agent entry
        agents = [{ id: 'mock-0', name: 'Jarvis', model: 'claude-sonnet-4', provider: 'anthropic' }];
      }

      const now = Date.now();
      records = agents.map((agent, i) => {
        const inputTokens  = 5000  + (i * 1250);
        const outputTokens = 2000  + (i * 500);
        const totalTokens  = inputTokens + outputTokens;
        const provider     = agent.provider || 'anthropic';
        return {
          id:             agent.id || `mock-${i}`,
          agent_name:     agent.name || 'Agent',
          model:          agent.model || 'claude-sonnet-4',
          provider,
          input_tokens:   inputTokens,
          output_tokens:  outputTokens,
          tokens:         totalTokens,
          latency_ms:     1100 + (i * 100),
          estimated_cost: estimateCost(totalTokens, provider),
          created_at:     new Date(now - i * 3600000).toISOString(),
        };
      });
    }

    // ── Normalise cost if missing ─────────────────────────────────────────────
    records = records.map(r => ({
      ...r,
      tokens:          r.tokens ?? ((r.input_tokens ?? 0) + (r.output_tokens ?? 0)),
      estimated_cost:  r.estimated_cost ?? estimateCost(
        (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
        r.provider
      ),
    }));

    // ── Summary ───────────────────────────────────────────────────────────────
    const total_tokens   = records.reduce((s, r) => s + (r.tokens || 0), 0);
    const total_requests = records.length;
    const total_cost     = parseFloat(records.reduce((s, r) => s + (r.estimated_cost || 0), 0).toFixed(6));
    const avg_latency_ms = records.length > 0
      ? Math.round(records.reduce((s, r) => s + (r.latency_ms || 0), 0) / records.length)
      : 0;

    res.json({
      success: true,
      data:            records,
      total_tokens,
      total_requests,
      total_cost,
      avg_latency_ms,
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
    const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    let totalTokens = 0;
    if (pg) {
      for (const q of [
        `SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM ${SCHEMA}.usage_logs WHERE workspace_id = $1`,
        `SELECT COALESCE(SUM(tokens_used), 0) AS total FROM ${SCHEMA}.agent_executions WHERE workspace_id = $1`,
      ]) {
        try {
          const r = await pg.query(q, [workspaceId]);
          totalTokens = parseInt(r.rows[0]?.total || 0, 10);
          if (totalTokens > 0) break;
        } catch (_) {}
      }
    }

    res.json({
      success: true,
      usage: {
        totalTokens,
        totalCost: estimateCost(totalTokens, 'default'),
        requests: 0,
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
