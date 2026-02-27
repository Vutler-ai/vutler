/**
 * Sprint 7.3 → 8.1 — Agent Memory API (workspace_id)
 */
const express = require('express');
const router = express.Router();
const pool = require("/app/lib/vaultbrix");

const VALID_TYPES = ['fact', 'decision', 'learning', 'preference', 'todo'];

// POST /api/memory — Store a memory
router.post('/', async (req, res) => {
  try {
    const { agent_id, type, content, metadata } = req.body;
    const workspaceId = req.workspaceId;

    if (!agent_id || !type || !content) {
      return res.status(400).json({ success: false, error: 'agent_id, type, and content are required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const { rows } = await pool.query(
      `INSERT INTO agent_memories (agent_id, type, content, metadata, workspace_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [agent_id, type, content.trim(), JSON.stringify(metadata || {}), workspaceId]
    );

    res.status(201).json({ success: true, memory: rows[0] });
  } catch (err) {
    console.error('[MEMORY] Store error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/memory/:agent_id — List memories
router.get('/:agent_id', async (req, res) => {
  try {
    const { agent_id } = req.params;
    const { type, search, limit = 50, offset = 0 } = req.query;
    const workspaceId = req.workspaceId;

    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type filter' });
    }

    let query = 'SELECT * FROM agent_memories WHERE agent_id = $1 AND workspace_id = $2';
    const params = [agent_id, workspaceId];
    let idx = 3;

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
    let countQuery = 'SELECT COUNT(*) as total FROM agent_memories WHERE agent_id = $1 AND workspace_id = $2';
    const countParams = [agent_id, workspaceId];
    if (type) { countQuery += ' AND type = $3'; countParams.push(type); }

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

// DELETE /api/memory/:id — Delete a memory
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workspaceId = req.workspaceId;

    const { rowCount } = await pool.query(
      'DELETE FROM agent_memories WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId]
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
