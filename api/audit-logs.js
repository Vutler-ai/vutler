'use strict';
const express = require('express');
const router = express.Router();

function getPool() {
  try { return require('../lib/postgres'); } catch(e) {}
  try { return require('../pg-updated'); } catch(e) {}
  try { return require('../services/postgres'); } catch(e) {}
  return null;
}

// GET /api/v1/audit-logs
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.json({ success: true, data: [] });
    const limit = Math.min(parseInt(req.query.limit) || 50, 500);
    const offset = parseInt(req.query.offset) || 0;
    const wsId = req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001';
    const r = await pool.query(
      "SELECT id, action, actor, target, details, created_at, workspace_id FROM tenant_vutler.audit_logs WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
      [wsId, limit, offset]
    );
    const count = await pool.query(
      "SELECT count(*)::int as total FROM tenant_vutler.audit_logs WHERE workspace_id = $1",
      [wsId]
    );
    res.json({ success: true, data: r.rows, meta: { total: count.rows[0].total, limit, offset } });
  } catch (err) {
    console.error('[AUDIT] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/audit-logs/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    const r = await pool.query(
      "SELECT * FROM tenant_vutler.audit_logs WHERE id = $1",
      [req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Log not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('[AUDIT] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
