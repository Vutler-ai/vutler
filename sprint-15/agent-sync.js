/**
 * Agent Sync API - On-prem ↔ Cloud synchronization
 */
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');

// POST /register - agent registers with cloud
router.post('/register', async (req, res) => {
  try {
    const { agent_id, hostname, ip, capabilities, version } = req.body;
    if (!agent_id) return res.status(400).json({ success: false, error: 'agent_id required' });

    // Upsert into agent_runtime_status
    const { rows } = await pool.query(`
      INSERT INTO tenant_vutler.agent_runtime_status (id, agent_id, status, started_at, last_activity, config, created_at, workspace_id)
      VALUES (gen_random_uuid(), $1, 'connected', NOW(), NOW(), $2, NOW(), '00000000-0000-0000-0000-000000000001')
      ON CONFLICT (agent_id) WHERE agent_id IS NOT NULL
      DO UPDATE SET status = 'connected', last_activity = NOW(), config = $2
      RETURNING *`,
      [agent_id, JSON.stringify({ hostname, ip, capabilities, version })]
    );

    // If no unique constraint on agent_id, fallback
    if (rows.length === 0) {
      // Try update first
      const upd = await pool.query(
        `UPDATE tenant_vutler.agent_runtime_status SET status='connected', last_activity=NOW(), config=$2 WHERE agent_id=$1 RETURNING *`,
        [agent_id, JSON.stringify({ hostname, ip, capabilities, version })]
      );
      if (upd.rows.length === 0) {
        const ins = await pool.query(
          `INSERT INTO tenant_vutler.agent_runtime_status (id, agent_id, status, started_at, last_activity, config, created_at, workspace_id)
           VALUES (gen_random_uuid(), $1, 'connected', NOW(), NOW(), $2, NOW(), '00000000-0000-0000-0000-000000000001') RETURNING *`,
          [agent_id, JSON.stringify({ hostname, ip, capabilities, version })]
        );
        return res.json({ success: true, runtime: ins.rows[0] });
      }
      return res.json({ success: true, runtime: upd.rows[0] });
    }

    res.json({ success: true, runtime: rows[0] });
  } catch (err) {
    // Fallback if ON CONFLICT fails (no unique index)
    if (err.message.includes('there is no unique')) {
      try {
        const { agent_id, hostname, ip, capabilities, version } = req.body;
        const upd = await pool.query(
          `UPDATE tenant_vutler.agent_runtime_status SET status='connected', last_activity=NOW(), config=$2 WHERE agent_id=$1 RETURNING *`,
          [agent_id, JSON.stringify({ hostname, ip, capabilities, version })]
        );
        if (upd.rows.length > 0) return res.json({ success: true, runtime: upd.rows[0] });
        const ins = await pool.query(
          `INSERT INTO tenant_vutler.agent_runtime_status (id, agent_id, status, started_at, last_activity, config, created_at, workspace_id)
           VALUES (gen_random_uuid(), $1, 'connected', NOW(), NOW(), $2, NOW(), '00000000-0000-0000-0000-000000000001') RETURNING *`,
          [agent_id, JSON.stringify({ hostname, ip, capabilities, version })]
        );
        return res.json({ success: true, runtime: ins.rows[0] });
      } catch (e2) {
        return res.status(500).json({ success: false, error: e2.message });
      }
    }
    console.error('[AgentSync] register error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /heartbeat
router.post('/heartbeat', async (req, res) => {
  try {
    const { agent_id, status, metrics } = req.body;
    if (!agent_id) return res.status(400).json({ success: false, error: 'agent_id required' });

    const config = metrics ? JSON.stringify({ metrics }) : '{}';
    const { rows } = await pool.query(
      `UPDATE tenant_vutler.agent_runtime_status SET status=$2, last_activity=NOW(), config=config || $3::jsonb WHERE agent_id=$1 RETURNING *`,
      [agent_id, status || 'connected', config]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Agent not registered' });
    res.json({ success: true, runtime: rows[0] });
  } catch (err) {
    console.error('[AgentSync] heartbeat error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /config/:agent_id
router.get('/config/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { rows } = await pool.query(
      `SELECT agent_id, provider, model, temperature, max_tokens FROM tenant_vutler.agent_llm_configs WHERE agent_id = $1`,
      [agent_id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'No config found' });
    res.json({ success: true, config: rows[0] });
  } catch (err) {
    console.error('[AgentSync] config error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /report
router.post('/report', async (req, res) => {
  try {
    const { agent_id, task_id, result, logs } = req.body;
    if (!agent_id) return res.status(400).json({ success: false, error: 'agent_id required' });

    const { rows } = await pool.query(
      `INSERT INTO tenant_vutler.automation_logs (id, automation_id, trigger_id, status, started_at, completed_at, payload, result)
       VALUES (gen_random_uuid(), $1, $2, 'success', NOW(), NOW(), $3, $4) RETURNING *`,
      [task_id || '00000000-0000-0000-0000-000000000000', task_id || '00000000-0000-0000-0000-000000000000', JSON.stringify({ agent_id, logs: logs || [] }), JSON.stringify(result || {})]
    );
    res.json({ success: true, log: rows[0] });
  } catch (err) {
    console.error('[AgentSync] report error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /tasks/:agent_id
router.get('/tasks/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM tenant_vutler.tasks WHERE assignee = $1 AND status IN ('pending', 'todo', 'in_progress') ORDER BY created_at DESC`,
      [agent_id]
    );
    res.json({ success: true, tasks: rows });
  } catch (err) {
    console.error('[AgentSync] tasks error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /tasks/:task_id/complete
router.post('/tasks/:task_id/complete', async (req, res) => {
  try {
    const { task_id } = req.params;
    const { rows } = await pool.query(
      `UPDATE tenant_vutler.tasks SET status = 'done', updated_at = NOW() WHERE id = $1 RETURNING *`,
      [task_id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, task: rows[0] });
  } catch (err) {
    console.error('[AgentSync] complete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
