/**
 * Sprint 7.3 — Agent Memory API (v2)
 * UUID-based, types: fact|decision|learning|preference|todo
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../../lib/vaultbrix');

const VALID_TYPES = ['fact', 'decision', 'learning', 'preference', 'todo'];

// ─── Ensure table exists ────────────────────────────────────────────────────

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agent_memories (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      agent_id VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('fact','decision','learning','preference','todo')),
      content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_agent_memories_agent ON agent_memories(agent_id);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(agent_id, type);
    CREATE INDEX IF NOT EXISTS idx_agent_memories_created ON agent_memories(created_at DESC);
  `);
  tableReady = true;
}

// ─── POST /api/memory — Store a memory ──────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { agent_id, type, content, metadata } = req.body;

    if (!agent_id || !type || !content) {
      return res.status(400).json({ success: false, error: 'agent_id, type, and content are required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    await ensureTable();

    const { rows } = await pool.query(
      `INSERT INTO agent_memories (agent_id, type, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [agent_id, type, content.trim(), JSON.stringify(metadata || {})]
    );

    res.status(201).json({ success: true, memory: rows[0] });
  } catch (err) {
    console.error('[MEMORY] Store error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /api/memory/:agent_id — List memories ─────────────────────────────

router.get('/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { type, search, limit = 50, offset = 0 } = req.query;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `Invalid type filter` });
    }

    await ensureTable();

    let query = 'SELECT * FROM agent_memories WHERE agent_id = $1';
    const params = [agent_id];
    let idx = 2;

    if (type) {
      query += ` AND type = $${idx}`;
      params.push(type);
      idx++;
    }

    if (search) {
      query += ` AND content ILIKE $${idx}`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit) || 50, parseInt(offset) || 0);

    const { rows } = await pool.query(query, params);

    // Count
    let countQuery = 'SELECT COUNT(*) as total FROM agent_memories WHERE agent_id = $1';
    const countParams = [agent_id];
    if (type) { countQuery += ` AND type = $2`; countParams.push(type); }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      success: true,
      memories: rows,
      total: parseInt(countResult.rows[0]?.total || 0),
      count: rows.length,
    });
  } catch (err) {
    console.error('[MEMORY] List error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DELETE /api/memory/:id — Delete a memory ──────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    await ensureTable();
    const { id } = req.params;

    const { rowCount } = await pool.query(
      'DELETE FROM agent_memories WHERE id = $1',
      [id]
    );

    if (rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Memory not found' });
    }

    res.json({ success: true, deleted: id });
  } catch (err) {
    console.error('[MEMORY] Delete error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
