'use strict';
const express = require('express');
const router = express.Router();

function getPool() {
  try { return require('../lib/postgres'); } catch(e) {}
  try { return require('../pg-updated'); } catch(e) {}
  try { return require('../services/postgres'); } catch(e) {}
  return null;
}

// GET /api/v1/clients
router.get('/', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.json({ success: true, data: [] });
    const r = await pool.query(
      "SELECT id, workspace_id, name, logo_url, contact_email, notes, created_at FROM tenant_vutler.client_companies WHERE workspace_id = \$1 ORDER BY created_at DESC",
      [req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001']
    );
    res.json({ success: true, data: r.rows });
  } catch (err) {
    console.error('[CLIENTS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/clients/:id
router.get('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.status(404).json({ success: false, error: 'DB not available' });
    const r = await pool.query(
      "SELECT * FROM tenant_vutler.client_companies WHERE id = \$1 AND workspace_id = \$2",
      [req.params.id, req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001']
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('[CLIENTS] Get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/clients
router.post('/', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    const { name, contact_email, notes, logo_url } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const wsId = req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001';
    const r = await pool.query(
      "INSERT INTO tenant_vutler.client_companies (id, workspace_id, name, contact_email, notes, logo_url, created_at) VALUES (gen_random_uuid(), \$1, \$2, \$3, \$4, \$5, NOW()) RETURNING *",
      [wsId, name, contact_email || null, notes || null, logo_url || null]
    );
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('[CLIENTS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/clients/:id
router.put('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    const { name, contact_email, notes, logo_url } = req.body;
    const wsId = req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001';
    const r = await pool.query(
      "UPDATE tenant_vutler.client_companies SET name=COALESCE(\$1,name), contact_email=COALESCE(\$2,contact_email), notes=COALESCE(\$3,notes), logo_url=COALESCE(\$4,logo_url) WHERE id=\$5 AND workspace_id=\$6 RETURNING *",
      [name, contact_email, notes, logo_url, req.params.id, wsId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (err) {
    console.error('[CLIENTS] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/clients/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = req.app.locals.pg || getPool()?.pool || getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    const wsId = req.workspaceId || req.headers['x-workspace-id'] || '00000000-0000-0000-0000-000000000001';
    const r = await pool.query(
      "DELETE FROM tenant_vutler.client_companies WHERE id=\$1 AND workspace_id=\$2 RETURNING id",
      [req.params.id, wsId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Client not found' });
    res.json({ success: true, data: { deleted: r.rows[0].id } });
  } catch (err) {
    console.error('[CLIENTS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
