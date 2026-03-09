/**
 * Vutler Tasks API v2
 * Task management for agents + Snipara sync
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const pool = require('../../../lib/vaultbrix');
const { getSwarmCoordinator } = require('../services/swarmCoordinator');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

router.get('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    const params = [DEFAULT_WORKSPACE];
    let where = 'workspace_id = $1';

    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }

    params.push(limit);
    const q = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: q.rows,
      meta: { total: q.rows.length, limit, filter: status ? { status } : {} }
    });
  } catch (error) {
    console.error('[Tasks API] Error fetching tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks', message: error.message });
  }
});

router.post('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const { title, description, assignee, priority } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Missing required field: title' });

    const swarmCoordinator = req.app.locals.swarmCoordinator || getSwarmCoordinator();
    const created = await swarmCoordinator.createTask({
      title,
      description: description || '',
      priority: priority || 'medium',
      for_agent_id: assignee
    });

    res.json({ success: true, data: created });
  } catch (error) {
    console.error('[Tasks API] Error creating task:', error);
    res.status(500).json({ success: false, error: 'Failed to create task', message: error.message });
  }
});

router.get('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const q = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [id]
    );
    if (!q.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: q.rows[0] });
  } catch (error) {
    console.error('[Tasks API] Error fetching task:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch task', message: error.message });
  }
});

router.patch('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    const current = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [id]
    );
    if (!current.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });

    const task = current.rows[0];
    const swarmCoordinator = req.app.locals.swarmCoordinator || getSwarmCoordinator();

    if ((updates.status === 'in_progress' || updates.status === 'claimed') && task.snipara_task_id) {
      await swarmCoordinator.claimTask(task.snipara_task_id, updates.assignee || task.assignee || req.agent.id);
    }

    if (updates.status === 'completed' && task.snipara_task_id) {
      await swarmCoordinator.completeTask(task.snipara_task_id, updates.assignee || task.assignee || req.agent.id, updates.output);
    }

    const merged = {
      title: updates.title ?? task.title,
      description: updates.description ?? task.description,
      status: updates.status ?? task.status,
      priority: updates.priority ?? task.priority,
      assignee: updates.assignee ?? task.assignee,
      assigned_agent: updates.assigned_agent ?? task.assigned_agent
    };

    const saved = await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET title = $1, description = $2, status = $3, priority = $4,
           assignee = $5, assigned_agent = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [merged.title, merged.description, merged.status, merged.priority, merged.assignee, merged.assigned_agent, task.id]
    );

    res.json({ success: true, data: saved.rows[0] });
  } catch (error) {
    console.error('[Tasks API] Error updating task:', error);
    res.status(500).json({ success: false, error: 'Failed to update task', message: error.message });
  }
});

module.exports = router;
