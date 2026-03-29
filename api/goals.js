/**
 * Goals API — PostgreSQL-backed
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
let tableReady = false;

async function ensureTable(pool) {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.goals (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      title        TEXT NOT NULL,
      description  TEXT,
      status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','cancelled')),
      progress     INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      due_date     TIMESTAMPTZ,
      assigned_to  UUID,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  tableReady = true;
}

// SECURITY: workspace from JWT only (audit 2026-03-29)
router.use((req, res, next) => {
  if (!req.workspaceId) return res.status(401).json({ success: false, error: 'Authentication required' });
  next();
});

function wsId(req) {
  return req.workspaceId;
}

// GET /api/v1/goals
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.json({ success: true, goals: [] });
    await ensureTable(pool);
    const { status } = req.query;
    const params = [wsId(req)];
    let where = 'WHERE workspace_id = $1';
    if (status) { params.push(status); where += ` AND status = $${params.length}`; }
    const r = await pool.query(
      `SELECT * FROM ${SCHEMA}.goals ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ success: true, goals: r.rows });
  } catch (err) {
    console.error('[GOALS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/goals
router.post('/', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    await ensureTable(pool);
    const { title, description, due_date, assigned_to, progress = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'title required' });
    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.goals (workspace_id, title, description, due_date, assigned_to, progress)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [wsId(req), title, description || null, due_date || null, assigned_to || null, progress]
    );
    res.json({ success: true, goal: r.rows[0] });
  } catch (err) {
    console.error('[GOALS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/goals/:id
router.put('/:id', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    await ensureTable(pool);
    const { title, description, status, progress, due_date, assigned_to } = req.body;
    const r = await pool.query(
      `UPDATE ${SCHEMA}.goals
       SET title       = COALESCE($1, title),
           description = COALESCE($2, description),
           status      = COALESCE($3, status),
           progress    = COALESCE($4, progress),
           due_date    = COALESCE($5, due_date),
           assigned_to = COALESCE($6, assigned_to),
           updated_at  = NOW()
       WHERE id = $7 AND workspace_id = $8 RETURNING *`,
      [title, description, status, progress, due_date, assigned_to, req.params.id, wsId(req)]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Goal not found' });
    res.json({ success: true, goal: r.rows[0] });
  } catch (err) {
    console.error('[GOALS] Update error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/goals/:id
router.delete('/:id', async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB not available' });
    await ensureTable(pool);
    const r = await pool.query(
      `DELETE FROM ${SCHEMA}.goals WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [req.params.id, wsId(req)]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Goal not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('[GOALS] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
