/**
 * Automations API — PostgreSQL-backed
 */
'use strict';

const express = require('express');
const router = express.Router();

function getPool() {
  try { return require('../lib/vaultbrix'); } catch(e) {}
  try { return require('../lib/postgres'); } catch(e) {}
  return null;
}

const SCHEMA = 'tenant_vutler';

async function ensureTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.automations (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      name        TEXT NOT NULL,
      trigger     JSONB,
      action      JSONB,
      enabled     BOOLEAN NOT NULL DEFAULT true,
      last_run    TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

let tableReady = false;
async function withTable(pool) {
  if (!tableReady) { await ensureTable(pool); tableReady = true; }
  return pool;
}

// SECURITY: workspace from JWT only (audit 2026-03-29)
router.use((req, res, next) => {
  if (!req.workspaceId) return res.status(401).json({ success: false, error: 'Authentication required' });
  next();
});

function wsId(req) {
  return req.workspaceId;
}

// GET /api/v1/automations
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.json({ success: true, automations: [] });
    await withTable(pool);
    const r = await pool.query(
      `SELECT * FROM ${SCHEMA}.automations WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [wsId(req)]
    );
    res.json({ success: true, automations: r.rows });
  } catch (err) {
    console.error('[AUTOMATIONS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/automations
router.post('/', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    await withTable(pool);
    const { name, trigger, action, enabled = true } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.automations (workspace_id, name, trigger, action, enabled)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [wsId(req), name, trigger ? JSON.stringify(trigger) : null, action ? JSON.stringify(action) : null, enabled]
    );
    res.json({ success: true, automation: r.rows[0] });
  } catch (err) {
    console.error('[AUTOMATIONS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/automations/:id
router.put('/:id', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    await withTable(pool);
    const { name, trigger, action, enabled } = req.body;
    const r = await pool.query(
      `UPDATE ${SCHEMA}.automations
       SET name = COALESCE($1, name),
           trigger = COALESCE($2, trigger),
           action = COALESCE($3, action),
           enabled = COALESCE($4, enabled),
           updated_at = NOW()
       WHERE id = $5 AND workspace_id = $6
       RETURNING *`,
      [
        name || null,
        trigger ? JSON.stringify(trigger) : null,
        action ? JSON.stringify(action) : null,
        enabled !== undefined ? enabled : null,
        req.params.id,
        wsId(req)
      ]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Automation not found' });
    res.json({ success: true, automation: r.rows[0] });
  } catch (err) {
    console.error('[AUTOMATIONS] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/automations/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    await withTable(pool);
    const r = await pool.query(
      `DELETE FROM ${SCHEMA}.automations WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [req.params.id, wsId(req)]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Automation not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[AUTOMATIONS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
