/**
 * Automation Logs Routes — Sprint 15
 * Mounted on the existing automations router
 */
const express = require('express');
const router = express.Router();

function getPool(req) {
  return req.app.locals.pg || require('/app/lib/vaultbrix');
}

// GET /api/v1/automations/:id/logs — run history
router.get('/:id/logs', async (req, res) => {
  try {
    const pool = getPool(req);
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT * FROM tenant_vutler.automation_logs WHERE automation_id = $1 ORDER BY started_at DESC LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    const countRes = await pool.query(
      `SELECT COUNT(*) as total FROM tenant_vutler.automation_logs WHERE automation_id = $1`, [id]
    );

    res.json({ success: true, data: result.rows, total: parseInt(countRes.rows[0].total), limit, offset });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/automations/logs/:logId — step-by-step detail
router.get('/logs/:logId', async (req, res) => {
  try {
    const pool = getPool(req);
    const { logId } = req.params;

    const logResult = await pool.query(
      `SELECT * FROM tenant_vutler.automation_logs WHERE id = $1`, [logId]
    );
    if (logResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }

    const actionsResult = await pool.query(
      `SELECT * FROM tenant_vutler.automation_action_logs WHERE automation_log_id = $1 ORDER BY started_at ASC`, [logId]
    );

    res.json({
      success: true,
      data: {
        ...logResult.rows[0],
        actions: actionsResult.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
