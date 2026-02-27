/**
 * Goals API - CRUD for tenant_vutler.goals
 */
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');

// GET /api/v1/goals
router.get('/', async (req, res) => {
  try {
    const { workspace_id } = req.query;
    let query = 'SELECT * FROM tenant_vutler.goals';
    const params = [];
    if (workspace_id) {
      query += ' WHERE workspace_id = $1';
      params.push(workspace_id);
    }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, goals: rows });
  } catch (err) {
    console.error('[Goals] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/goals
router.post('/', async (req, res) => {
  try {
    const { workspace_id, agent_id, title, description, status, progress, deadline, phases, checkins, priority } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO tenant_vutler.goals (id, workspace_id, agent_id, title, description, status, progress, deadline, phases, checkins, priority, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW()) RETURNING *`,
      [workspace_id || '00000000-0000-0000-0000-000000000001', agent_id, title, description, status || 'active', progress || 0, deadline || null, JSON.stringify(phases || []), JSON.stringify(checkins || []), priority || 'medium']
    );
    res.status(201).json({ success: true, goal: rows[0] });
  } catch (err) {
    console.error('[Goals] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/goals/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body;
    delete fields.id;
    delete fields.created_at;
    fields.updated_at = new Date().toISOString();
    
    const keys = Object.keys(fields);
    if (keys.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    const vals = keys.map(k => (k === 'phases' || k === 'checkins') ? JSON.stringify(fields[k]) : fields[k]);
    
    const { rows } = await pool.query(
      `UPDATE tenant_vutler.goals SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...vals]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Goal not found' });
    res.json({ success: true, goal: rows[0] });
  } catch (err) {
    console.error('[Goals] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/goals/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM tenant_vutler.goals WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ success: false, error: 'Goal not found' });
    res.json({ success: true, deleted: id });
  } catch (err) {
    console.error('[Goals] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
