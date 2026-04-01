/**
 * Vutler Agent Runtime API
 * Control agent runtime state
 */

const express = require('express');
const pool = require('../../../lib/vaultbrix');
const { authenticateAgent } = require('../lib/auth');

const router = express.Router();
const SCHEMA = 'tenant_vutler';
const START_TIME = Date.now();
const RUNTIME_VERSION = process.env.RUNTIME_VERSION || '1.0.0';

async function getAgentStatusCounts(workspaceId) {
  const result = await pool.query(
    `SELECT status, COUNT(*)::int AS count
       FROM ${SCHEMA}.agents
      WHERE workspace_id = $1
      GROUP BY status`,
    [workspaceId]
  );
  return result.rows.reduce((acc, row) => {
    acc[row.status || 'unknown'] = row.count;
    return acc;
  }, {});
}

async function readLastRestart(workspaceId) {
  try {
    const result = await pool.query(
      `SELECT value, updated_at
         FROM ${SCHEMA}.workspace_settings
        WHERE workspace_id = $1 AND key = 'runtime_last_restart'
        LIMIT 1`,
      [workspaceId]
    );
    return result.rows[0] || null;
  } catch (error) {
    return null;
  }
}

async function writeLastRestart(workspaceId, payload) {
  const serialized = JSON.stringify(payload);
  try {
    await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'runtime_last_restart', $2::jsonb, NOW(), NOW())
       ON CONFLICT (workspace_id, key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [workspaceId, serialized]
    );
  } catch (error) {
    console.warn('[Runtime API] Failed to persist runtime restart:', error.message);
  }
}

/**
 * GET /api/v1/runtime/status
 * Get runtime status
 */
router.get('/runtime/status', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ success: false, error: 'Workspace context required' });
    }

    const statusCounts = await getAgentStatusCounts(workspaceId);
    const totalAgents = Object.values(statusCounts).reduce((sum, value) => sum + value, 0);
    const hasError = Boolean(statusCounts.error || statusCounts.failed);
    const statusLabel = totalAgents === 0 ? 'idle' : hasError ? 'degraded' : 'running';

    const lastRestartRow = await readLastRestart(workspaceId);
    const lastRestart = lastRestartRow?.value || null;

    res.json({
      success: true,
      data: {
        status: statusLabel,
        version: RUNTIME_VERSION,
        uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
        agents: {
          total: totalAgents,
          active: statusCounts.active || statusCounts.online || 0,
          processing: statusCounts.processing || 0,
          error: statusCounts.error || statusCounts.failed || 0,
          breakdown: statusCounts,
        },
        lastRestart,
        lastRestartAt: lastRestart?.requested_at || lastRestartRow?.updated_at || null,
      },
    });
  } catch (error) {
    console.error('[Runtime API] Error fetching status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch runtime status',
      message: error.message,
    });
  }
});

/**
 * POST /api/v1/runtime/restart
 * Restart agent runtime
 */
router.post('/runtime/restart', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ success: false, error: 'Workspace context required' });
    }

    const payload = {
      requested_by: req.user?.id || null,
      requested_by_email: req.user?.email || null,
      reason: req.body?.reason || null,
      requested_at: new Date().toISOString(),
    };

    await writeLastRestart(workspaceId, payload);

    console.log(`[Runtime API] Restart requested for workspace ${workspaceId} by ${payload.requested_by || 'anonymous'}`);

    res.json({
      success: true,
      data: {
        ...payload,
        status: 'restarting',
        message: 'Runtime restart requested',
      },
    });
  } catch (error) {
    console.error('[Runtime API] Error restarting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart runtime',
      message: error.message,
    });
  }
});

module.exports = router;
