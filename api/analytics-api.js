'use strict';

const express = require('express');
const router = express.Router();

function getPool() {
  try { return require('../lib/vaultbrix'); } catch(e) {}
  try { return require('../lib/postgres'); } catch(e) {}
  return null;
}

const SCHEMA = 'tenant_vutler';

// GET /api/v1/analytics
// Returns workspace-level stats aggregated from existing tables
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.json({ success: true, data: {} });
    const wsId = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    const [agents, executions, tasks, notifications] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM ${SCHEMA}.agents WHERE workspace_id = $1`, [wsId]),
      pool.query(`SELECT COUNT(*), AVG(duration_ms) FROM ${SCHEMA}.sandbox_executions WHERE workspace_id = $1`, [wsId])
        .catch(() => ({ rows: [{ count: 0, avg: null }] })),
      pool.query(`SELECT status, COUNT(*) FROM ${SCHEMA}.tasks WHERE workspace_id = $1 GROUP BY status`, [wsId])
        .catch(() => ({ rows: [] })),
      pool.query(`SELECT COUNT(*) FROM ${SCHEMA}.notifications WHERE workspace_id = $1 AND read = false`, [wsId])
        .catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    const tasksByStatus = {};
    for (const row of tasks.rows) tasksByStatus[row.status] = parseInt(row.count);

    res.json({
      success: true,
      data: {
        agents: {
          total: parseInt(agents.rows[0].count),
        },
        executions: {
          total: parseInt(executions.rows[0].count),
          avg_duration_ms: executions.rows[0].avg ? Math.round(parseFloat(executions.rows[0].avg)) : null,
        },
        tasks: {
          total: Object.values(tasksByStatus).reduce((a, b) => a + b, 0),
          by_status: tasksByStatus,
        },
        notifications: {
          unread: parseInt(notifications.rows[0].count),
        },
      },
    });
  } catch (err) {
    console.error('[ANALYTICS] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
