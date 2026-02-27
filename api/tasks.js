// routes/tasks.js - CRUD tasks in PostgreSQL (Sprint 8.1: workspace_id)
const express = require('express');
const router = express.Router();
const pool = require("../lib/vaultbrix");

// GET /api/v1/tasks - List tasks with optional filters
router.get('/', async (req, res) => {
  try {
    const { status, assignee } = req.query;
    const workspaceId = req.workspaceId;
    
    let query = 'SELECT * FROM tasks WHERE workspace_id = $1';
    const params = [workspaceId];
    let paramCount = 2;

    if (status) {
      query += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (assignee) {
      query += ` AND assignee = $${paramCount}`;
      params.push(assignee);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      count: result.rows.length,
      tasks: result.rows
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/tasks - Create new task
router.post('/', async (req, res) => {
  try {
    const { title, description, status = 'todo', priority = 'medium', assignee, due_date } = req.body;
    const workspaceId = req.workspaceId;

    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }

    const result = await pool.query(
      `INSERT INTO tasks (title, description, status, priority, assignee, due_date, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, description, status, priority, assignee, due_date || null, workspaceId]
    );

    res.status(201).json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/tasks/:id - Update task
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, assignee, due_date } = req.body;
    const workspaceId = req.workspaceId;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title !== undefined) { updates.push(`title = $${paramCount}`); params.push(title); paramCount++; }
    if (description !== undefined) { updates.push(`description = $${paramCount}`); params.push(description); paramCount++; }
    if (status !== undefined) { updates.push(`status = $${paramCount}`); params.push(status); paramCount++; }
    if (priority !== undefined) { updates.push(`priority = $${paramCount}`); params.push(priority); paramCount++; }
    if (assignee !== undefined) { updates.push(`assignee = $${paramCount}`); params.push(assignee); paramCount++; }
    if (due_date !== undefined) { updates.push(`due_date = $${paramCount}`); params.push(due_date); paramCount++; }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    params.push(id, workspaceId);

    const query = `
      UPDATE tasks SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND workspace_id = $${paramCount + 1}
      RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, task: result.rows[0] });
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workspaceId = req.workspaceId;

    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND workspace_id = $2 RETURNING *',
      [id, workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }

    res.json({ success: true, message: 'Task deleted', task: result.rows[0] });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
