'use strict';

const express = require('express');
const router = express.Router();
const taskRouter = require('../services/taskRouter');
const { pool } = require('../lib/postgres');
const SCHEMA = 'tenant_vutler';

// POST /sync — Snipara webhook endpoint
router.post('/sync', async (req, res) => {
  try {
    const { event, task } = req.body;
    
    if (!event || !task) {
      return res.status(400).json({ success: false, error: 'event and task are required' });
    }

    console.log('[TaskSync] Received webhook:', event, task.swarm_task_id);

    const { swarm_task_id, title, description, priority, status, metadata } = task;
    const workspace_id = metadata?.workspace_id;

    if (!workspace_id) {
      console.warn('[TaskSync] Missing workspace_id in metadata');
      return res.status(400).json({ success: false, error: 'workspace_id required in metadata' });
    }

    // Check if this is an update to an existing Vutler task
    const existing = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE swarm_task_id = $1`,
      [swarm_task_id]
    );

    if (event === 'task_created' && existing.rows.length === 0) {
      // Create new task in Vutler from Snipara swarm
      const result = await pool.query(
        `INSERT INTO ${SCHEMA}.tasks (
          title, description, priority, status, source, workspace_id, 
          swarm_task_id, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *`,
        [
          title,
          description || null,
          priority || 'P2',
          'todo',
          'snipara_swarm',
          workspace_id,
          swarm_task_id,
          JSON.stringify(metadata || {})
        ]
      );

      console.log('[TaskSync] Created task from swarm:', result.rows[0].id);
      return res.json({ success: true, data: { task: result.rows[0], action: 'created' } });
    }

    if (event === 'task_completed' && existing.rows.length > 0) {
      const result = await pool.query(
        `UPDATE ${SCHEMA}.tasks 
         SET status = 'done', resolved_at = NOW(), updated_at = NOW()
         WHERE swarm_task_id = $1
         RETURNING *`,
        [swarm_task_id]
      );

      console.log('[TaskSync] Completed task from swarm:', result.rows[0].id);
      return res.json({ success: true, data: { task: result.rows[0], action: 'completed' } });
    }

    if (event === 'task_updated' && existing.rows.length > 0) {
      const updates = [];
      const params = [swarm_task_id];
      let idx = 2;

      if (title) { updates.push(`title = $${idx++}`); params.push(title); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
      if (priority) { updates.push(`priority = $${idx++}`); params.push(priority); }
      if (status) { 
        const vutlerStatus = status === 'completed' ? 'done' : status === 'in_progress' ? 'in_progress' : 'todo';
        updates.push(`status = $${idx++}`); 
        params.push(vutlerStatus); 
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        const result = await pool.query(
          `UPDATE ${SCHEMA}.tasks SET ${updates.join(', ')} WHERE swarm_task_id = $1 RETURNING *`,
          params
        );

        console.log('[TaskSync] Updated task from swarm:', result.rows[0].id);
        return res.json({ success: true, data: { task: result.rows[0], action: 'updated' } });
      }
    }

    res.json({ success: true, data: { action: 'ignored', reason: 'already exists or no action needed' } });

  } catch (err) {
    console.error('[TaskSync] Webhook error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST / — create task
router.post('/', async (req, res) => {
  try {
    const { title, description, source, source_ref, priority, due_date, created_by, workspace_id, assigned_agent, metadata } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    const task = await taskRouter.createTask({ title, description, source, source_ref, priority, due_date, created_by, workspace_id, assigned_agent, metadata });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[TasksAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /reminders/check — must be before /:id
router.get('/reminders/check', async (req, res) => {
  try {
    const reminders = await taskRouter.checkReminders();
    res.json({ success: true, data: reminders });
  } catch (err) {
    console.error('[TasksAPI] GET /reminders/check error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /overdue
router.get('/overdue', async (req, res) => {
  try {
    const tasks = await taskRouter.getOverdueTasks();
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[TasksAPI] GET /overdue error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /due
router.get('/due', async (req, res) => {
  try {
    const tasks = await taskRouter.getDueTasks();
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[TasksAPI] GET /due error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET / — list tasks
router.get('/', async (req, res) => {
  try {
    const { status, assigned_agent, workspace_id } = req.query;
    const tasks = await taskRouter.listTasks({ status, assigned_agent, workspace_id });
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[TasksAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id — get task
router.get('/:id', async (req, res) => {
  try {
    const task = await taskRouter.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[TasksAPI] GET /:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /:id — update task
router.put('/:id', async (req, res) => {
  try {
    const task = await taskRouter.updateTask(req.params.id, req.body);
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[TasksAPI] PUT /:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id — cancel task
router.delete('/:id', async (req, res) => {
  try {
    const task = await taskRouter.updateTask(req.params.id, { status: 'cancelled' });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    res.json({ success: true, data: task });
  } catch (err) {
    console.error('[TasksAPI] DELETE /:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
