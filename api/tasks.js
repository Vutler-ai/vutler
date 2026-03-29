'use strict';

const express = require('express');
const router = express.Router();
const taskRouter = require('../services/taskRouter');

// GET / — list tasks (was Snipara, now uses taskRouter PG)
router.get('/', async (req, res) => {
  try {
    const { status, assigned_agent, workspace_id } = req.query;
    const tasks = await taskRouter.listTasks({ status, assigned_agent, workspace_id });
    res.json({ success: true, count: tasks.length, tasks, source: 'task-router' });
  } catch (err) {
    console.error('[TASKS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST / — create task
router.post('/', async (req, res) => {
  try {
    const { title, description, priority, assignee, assigned_agent, due_date, workspace_id } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });
    const task = await taskRouter.createTask({
      title, description, priority: priority || 'medium',
      due_date, created_by: assignee || 'user',
      assigned_agent: assigned_agent || assignee || undefined,
      workspace_id: req.workspaceId // SECURITY: workspace from JWT only (audit 2026-03-29)
    });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[TASKS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const task = await taskRouter.getTask(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /:id
router.put('/:id', async (req, res) => {
  try {
    const task = await taskRouter.updateTask(req.params.id, req.body);
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await taskRouter.deleteTask(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
