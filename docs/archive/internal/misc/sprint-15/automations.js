/**
 * Vutler Automations CRUD — Sprint 15 Epic 1
 * Routes: /api/v1/automations
 * DB: tenant_vutler.automation_rules (Vaultbrix)
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
function uuidv4() { return crypto.randomUUID(); }

function getPool(req) {
  return req.app.locals.pg || require('/app/lib/vaultbrix');
}

// GET /api/v1/automations — list rules
router.get('/', async (req, res) => {
  try {
    const pool = getPool(req);
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const { enabled, search } = req.query;

    let sql = 'SELECT * FROM tenant_vutler.automation_rules WHERE workspace_id = $1';
    const params = [wsId];
    let idx = 2;

    if (enabled !== undefined) {
      sql += ` AND enabled = $${idx++}`;
      params.push(enabled === 'true');
    }
    if (search) {
      sql += ` AND name ILIKE $${idx++}`;
      params.push(`%${search}%`);
    }
    sql += ' ORDER BY created_at DESC';

    const result = await pool.query(sql, params);
    res.json({ success: true, data: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('[AUTOMATIONS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/automations — create rule
router.post('/', async (req, res) => {
  try {
    const pool = getPool(req);
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const { name, trigger_type, action_type, agent_id, enabled, config } = req.body;

    if (!name || !trigger_type) {
      return res.status(400).json({ success: false, error: 'name and trigger_type are required' });
    }

    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO tenant_vutler.automation_rules 
       (id, workspace_id, name, trigger_type, action_type, agent_id, enabled, config, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING *`,
      [id, wsId, name, trigger_type, action_type || null, agent_id || null, enabled !== false, config ? JSON.stringify(config) : '{}']
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[AUTOMATIONS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/automations/:id — get rule
router.get('/:id', async (req, res) => {
  try {
    const pool = getPool(req);
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await pool.query(
      'SELECT * FROM tenant_vutler.automation_rules WHERE id = $1 AND workspace_id = $2',
      [req.params.id, wsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[AUTOMATIONS] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/automations/:id — update rule
router.put('/:id', async (req, res) => {
  try {
    const pool = getPool(req);
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const { name, trigger_type, action_type, agent_id, enabled, config } = req.body;

    const result = await pool.query(
      `UPDATE tenant_vutler.automation_rules 
       SET name = COALESCE($3, name),
           trigger_type = COALESCE($4, trigger_type),
           action_type = COALESCE($5, action_type),
           agent_id = COALESCE($6, agent_id),
           enabled = COALESCE($7, enabled),
           config = COALESCE($8, config)
       WHERE id = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, wsId, name || null, trigger_type || null, action_type || null, agent_id || null, enabled !== undefined ? enabled : null, config ? JSON.stringify(config) : null]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[AUTOMATIONS] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/automations/:id — delete rule
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool(req);
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const result = await pool.query(
      'DELETE FROM tenant_vutler.automation_rules WHERE id = $1 AND workspace_id = $2 RETURNING id',
      [req.params.id, wsId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[AUTOMATIONS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/automations/:id/execute — manual execution
router.post('/:id/execute', async (req, res) => {
  try {
    const pool = getPool(req);
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    // Get the rule
    const ruleResult = await pool.query(
      'SELECT * FROM tenant_vutler.automation_rules WHERE id = $1 AND workspace_id = $2',
      [req.params.id, wsId]
    );

    if (ruleResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Automation not found' });
    }

    const rule = ruleResult.rows[0];

    // Log the execution in automation_logs (actual schema)
    const logId = uuidv4();
    const payload = req.body.trigger_data || {};
    const startedAt = new Date();

    await pool.query(
      `INSERT INTO tenant_vutler.automation_logs 
       (id, automation_id, status, started_at, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [logId, rule.id, 'running', startedAt, JSON.stringify(payload)]
    );

    // For now, mark as success (actual engine execution comes in later stories)
    const completedAt = new Date();
    const durationMs = completedAt - startedAt;
    await pool.query(
      `UPDATE tenant_vutler.automation_logs SET status = 'success', completed_at = $2, duration_ms = $3, result = $4 WHERE id = $1`,
      [logId, completedAt, durationMs, JSON.stringify({ message: 'Manual execution completed' })]
    );

    res.json({
      success: true,
      data: {
        log_id: logId,
        rule_id: rule.id,
        rule_name: rule.name,
        status: 'success',
        message: 'Manual execution completed'
      }
    });
  } catch (err) {
    console.error('[AUTOMATIONS] Execute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
