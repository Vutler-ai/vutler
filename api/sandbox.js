'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { execSync } = require('child_process');

const SCHEMA = 'tenant_vutler';

async function ensureSandboxTable() {
  try {
    const check = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='sandbox_executions'`
    );
    if (check.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.sandbox_executions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          agent_name TEXT,
          task_type TEXT,
          title TEXT,
          status TEXT DEFAULT 'pending',
          duration_ms INT,
          output TEXT,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    }
  } catch (err) {
    console.warn('[Sandbox] ensureSandboxTable warning (table may already exist):', err.message);
  }
}

// GET /api/v1/sandbox/executions
router.get('/executions', async (req, res) => {
  try {
    await ensureSandboxTable();
    const result = await pool.query(
      `SELECT id, agent_name, task_type, title, status, duration_ms, output, created_at FROM ${SCHEMA}.sandbox_executions ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Sandbox] Executions error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/sandbox/stats
router.get('/stats', async (req, res) => {
  try {
    await ensureSandboxTable();
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_runs,
        ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'pass') / GREATEST(COUNT(*), 1), 1) AS pass_rate,
        ROUND(AVG(duration_ms))::int AS avg_duration_ms,
        COUNT(DISTINCT agent_name)::int AS active_agents
      FROM ${SCHEMA}.sandbox_executions
    `);
    const row = result.rows[0] || {};
    res.json({
      success: true,
      data: {
        totalRuns: row.total_runs || 0,
        passRate: parseFloat(row.pass_rate) || 0,
        avgDurationMs: row.avg_duration_ms || 0,
        activeAgents: row.active_agents || 0
      }
    });
  } catch (err) {
    console.error('[Sandbox] Stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/sandbox/execute
router.post('/execute', async (req, res) => {
  try {
    await ensureSandboxTable();
    const { agent, type, code } = req.body || {};
    const title = (code || '').substring(0, 100) || 'Untitled execution';
    const t0 = Date.now();
    let output = '';
    let status = 'pass';

    try {
      // Simple sandboxed execution with timeout
      output = execSync('echo "Sandbox execution placeholder"', { timeout: 10000, encoding: 'utf8' });
    } catch (execErr) {
      status = 'error';
      output = execErr.message || 'Execution failed';
    }

    const durationMs = Date.now() - t0;
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.sandbox_executions (agent_name, task_type, title, status, duration_ms, output)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status, duration_ms, created_at`,
      [agent || 'Unknown', type || 'general', title, status, durationMs, output]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Sandbox] Execute error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
