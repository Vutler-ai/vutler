const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const pool = require("../lib/vaultbrix");
const SCHEMA = "tenant_vutler";


// POST /api/v1/agents/hybrid/heartbeat — Agent heartbeat + metrics
router.post('/heartbeat', async (req, res) => {
  try {
    
    const token = req.headers['x-tunnel-token'] || req.body.tunnel_token;
    if (!token) return res.status(401).json({ error: 'tunnel_token required' });

    const { metrics = {}, version } = req.body;

    const result = await pool.query(
      `UPDATE ${SCHEMA}.hybrid_agents SET last_heartbeat = NOW(), status = 'online', metrics = $1, version = COALESCE($2, version), updated_at = NOW() WHERE tunnel_token = $3 RETURNING id, name, config`,
      [JSON.stringify(metrics), version, token]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    // Check for pending tasks
    const tasks = await pool.query(
      `SELECT * FROM ${SCHEMA}.hybrid_agent_tasks WHERE agent_id = $1 AND status = 'pending' ORDER BY priority DESC, created_at ASC LIMIT 10`,
      [result.rows[0].id]
    );

    res.json({ ack: true, config: result.rows[0].config, pending_tasks: tasks.rows });
  } catch (err) {
    console.error('[HYBRID] Heartbeat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/agents/hybrid — List all hybrid agents
router.get('/', async (req, res) => {
  try {
    
    const result = await pool.query(`
      SELECT h.*,
        (SELECT COUNT(*) FROM ${SCHEMA}.hybrid_agent_tasks t WHERE t.agent_id = h.id AND t.status = 'completed') as completed_tasks,
        (SELECT COUNT(*) FROM ${SCHEMA}.hybrid_agent_tasks t WHERE t.agent_id = h.id AND t.status = 'pending') as pending_tasks
      FROM ${SCHEMA}.hybrid_agents h ORDER BY h.status ASC, h.name ASC
    `);

    // Mark offline agents (no heartbeat in 2 min)
    for (const agent of result.rows) {
      if (agent.status === 'online' && agent.last_heartbeat) {
        const diff = Date.now() - new Date(agent.last_heartbeat).getTime();
        if (diff > 120000) {
          agent.status = 'offline';
          await pool.query(`UPDATE ${SCHEMA}.hybrid_agents SET status = 'offline' WHERE id = $1`, [agent.id]);
        }
      }
    }

    res.json({ agents: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v1/agents/hybrid/:id — Agent detail + recent logs
router.get('/:id', async (req, res) => {
  try {
    
    const agent = await pool.query(`SELECT * FROM ${SCHEMA}.hybrid_agents WHERE id = $1`, [req.params.id]);
    if (agent.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const logs = await pool.query(
      `SELECT * FROM ${SCHEMA}.hybrid_agent_logs WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );

    const tasks = await pool.query(
      `SELECT * FROM ${SCHEMA}.hybrid_agent_tasks WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [req.params.id]
    );

    res.json({ agent: agent.rows[0], logs: logs.rows, tasks: tasks.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/v1/agents/hybrid/:id/config — Push config update
router.put('/:id/config', async (req, res) => {
  try {
    
    const { config } = req.body;
    if (!config) return res.status(400).json({ error: 'config required' });

    const result = await pool.query(
      `UPDATE ${SCHEMA}.hybrid_agents SET config = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [JSON.stringify(config), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    await pool.query(
      `INSERT INTO ${SCHEMA}.hybrid_agent_logs (agent_id, event, details) VALUES ($1,'config_pushed',$2)`,
      [req.params.id, JSON.stringify({ keys: Object.keys(config) })]
    );

    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/v1/agents/hybrid/:id/task — Assign task
router.post('/:id/task', async (req, res) => {
  try {
    
    const { task_type, payload = {}, priority = 0 } = req.body;
    if (!task_type) return res.status(400).json({ error: 'task_type required' });

    // Verify agent exists
    const agent = await pool.query(`SELECT id FROM ${SCHEMA}.hybrid_agents WHERE id = $1`, [req.params.id]);
    if (agent.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.hybrid_agent_tasks (agent_id, task_type, payload, priority) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, task_type, JSON.stringify(payload), priority]
    );

    await pool.query(
      `INSERT INTO ${SCHEMA}.hybrid_agent_logs (agent_id, event, details) VALUES ($1,'task_assigned',$2)`,
      [req.params.id, JSON.stringify({ task_id: result.rows[0].id, task_type })]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v1/agents/hybrid/:id/tasks
router.get('/:id/tasks', async (req, res) => {
  try {
    
    const { status } = req.query;
    let query = `SELECT * FROM ${SCHEMA}.hybrid_agent_tasks WHERE agent_id = $1`;
    const params = [req.params.id];
    if (status) { query += ` AND status = $2`; params.push(status); }
    query += ` ORDER BY created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);
    res.json({ tasks: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/v1/agents/hybrid/:id/report — Agent reports task result
router.post('/:id/report', async (req, res) => {
  try {
    
    const token = req.headers['x-tunnel-token'];
    const { task_id, status, result: taskResult, error_message } = req.body;
    if (!task_id || !status) return res.status(400).json({ error: 'task_id and status required' });

    // Verify agent owns this task
    const task = await pool.query(
      `SELECT t.id FROM ${SCHEMA}.hybrid_agent_tasks t JOIN ${SCHEMA}.hybrid_agents a ON t.agent_id = a.id WHERE t.id = $1 AND a.id = $2`,
      [task_id, req.params.id]
    );
    if (task.rows.length === 0) return res.status(404).json({ error: 'Task not found for this agent' });

    const updateResult = await pool.query(
      `UPDATE ${SCHEMA}.hybrid_agent_tasks SET status = $1, result = $2, error_message = $3, completed_at = CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE NULL END WHERE id = $4 RETURNING *`,
      [status, taskResult ? JSON.stringify(taskResult) : null, error_message, task_id]
    );

    // Apply data filter before storing result
    // (In production, check hybrid_agents.data_filter_rules here)

    await pool.query(
      `INSERT INTO ${SCHEMA}.hybrid_agent_logs (agent_id, event, details, data_transferred) VALUES ($1,'task_report',$2,$3)`,
      [req.params.id, JSON.stringify({ task_id, status }), taskResult != null]
    );

    res.json(updateResult.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/v1/agents/hybrid/:id — Deregister
router.delete('/:id', async (req, res) => {
  try {
    
    const result = await pool.query(`DELETE FROM ${SCHEMA}.hybrid_agents WHERE id = $1 RETURNING id, name`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json({ deleted: true, agent: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
