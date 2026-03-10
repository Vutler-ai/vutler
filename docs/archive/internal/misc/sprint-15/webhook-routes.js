/**
 * Webhook Trigger Routes — Sprint 15
 * POST /api/v1/webhooks/:webhook_id
 */
const express = require('express');
const router = express.Router();
const { executeRule } = require('/app/runtime/automation-executor');

function getPool(req) {
  return req.app.locals.pg || require('/app/lib/vaultbrix');
}

// POST /api/v1/webhooks/:webhook_id
router.post('/:webhook_id', async (req, res) => {
  try {
    const pool = getPool(req);
    const { webhook_id } = req.params;

    // Find trigger by webhook_id (stored in config or webhook_url)
    const triggerResult = await pool.query(
      `SELECT t.id as trigger_id, t.automation_id, t.config as trigger_config, t.trigger_type as t_trigger_type,
              r.id as rule_id, r.workspace_id, r.name, r.trigger_type, r.action_type, r.agent_id, r.config as rule_config
       FROM tenant_vutler.automation_triggers t
       JOIN tenant_vutler.automation_rules r ON r.id = t.automation_id
       WHERE (t.config->>'webhook_id' = $1 OR t.id::text = $1)
       AND t.is_enabled = true AND r.enabled = true
       LIMIT 1`,
      [webhook_id]
    );

    if (triggerResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Webhook not found or disabled' });
    }

    const row = triggerResult.rows[0];

    // Verify webhook secret if configured
    const triggerConfig = row.trigger_config || {};
    const expectedSecret = triggerConfig.webhook_secret;
    if (expectedSecret) {
      const providedSecret = req.headers['x-webhook-secret'];
      if (providedSecret !== expectedSecret) {
        return res.status(401).json({ success: false, error: 'Invalid webhook secret' });
      }
    }

    // Update last_triggered_at
    await pool.query(
      `UPDATE tenant_vutler.automation_triggers SET last_triggered_at = NOW() WHERE id = $1`,
      [row.trigger_id]
    );

    // Build rule object from joined row
    const rule = {
      id: row.rule_id,
      workspace_id: row.workspace_id,
      name: row.name,
      trigger_type: row.trigger_type,
      action_type: row.action_type,
      agent_id: row.agent_id,
      config: row.rule_config || {},
    };

    // Execute async (don't block webhook response)
    const result = await executeRule(rule, req.body, pool, row.trigger_id);

    res.json({ success: true, log_id: result.logId, status: result.status });
  } catch (err) {
    console.error('[WEBHOOK] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
