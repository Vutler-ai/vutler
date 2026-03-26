'use strict';

const express = require('express');
const router = express.Router();
const { getAllowedFeatures, PLANS } = require('../packages/core/middleware/featureGate');

let pool;
try { pool = require('../lib/vaultbrix'); } catch (e) {
  try { pool = require('../lib/postgres').pool; } catch (e2) { console.error('[WORKSPACE] No DB pool found'); }
}

const COORDINATOR_NAME = process.env.VUTLER_COORDINATOR_NAME || 'Jarvis';
const DEFAULT_WS_ID = '00000000-0000-0000-0000-000000000001';
const SCHEMA = 'tenant_vutler';

router.get('/', (req, res) => res.json({
  success: true,
  data: [],
  coordinator: {
    name: COORDINATOR_NAME,
    type: 'coordinator',
    includedInAllPlans: true,
    notCountedInAgentLimits: false,
    countsTowardsAgentLimits: true,
    nonDeletable: true,
    badge: 'system-coordinator'
  }
}));

// GET /api/v1/workspace/features
// Returns the workspace plan and its allowed features / Snipara capabilities.
router.get('/features', async (req, res) => {
  const wsId = req.workspaceId || DEFAULT_WS_ID;
  let plan = 'full';

  if (pool) {
    try {
      // Try key-value schema first (key='billing_plan', value=jsonb)
      const kvResult = await pool.query(
        `SELECT value FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 AND key = 'billing_plan' LIMIT 1`,
        [wsId]
      );

      if (kvResult.rows.length > 0) {
        const val = kvResult.rows[0].value;
        // value may be a parsed object (jsonb) or a raw JSON string
        const parsed = typeof val === 'string' ? JSON.parse(val) : val;
        if (parsed && parsed.plan) plan = parsed.plan;
      } else {
        // Fall back to single-row schema with a dedicated 'plan' column
        const colResult = await pool.query(
          `SELECT plan FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 LIMIT 1`,
          [wsId]
        );
        if (colResult.rows.length > 0 && colResult.rows[0].plan) {
          plan = colResult.rows[0].plan;
        }
      }
    } catch (err) {
      console.error('[WORKSPACE] features: DB error, defaulting to full plan:', err.message);
    }
  }

  const features = getAllowedFeatures(plan);
  const planDef = PLANS[plan] || PLANS.full || {};
  const snipara = planDef.snipara || { memory: true, context: true, tasks: true };

  res.json({ plan, features, snipara });
});

module.exports = router;
