/**
 * Vutler Tasks API v2
 * Task management for agents + Snipara sync
 * Supports htasks (hierarchical tasks / subtasks)
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const pool = require('../../../lib/vaultbrix');
const { getSwarmCoordinator } = require('../services/swarmCoordinator');
const router = express.Router();

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// ─── Ensure parent_id column exists ──────────────────────────────────────────

async function ensureParentIdColumn() {
  try {
    const { rows } = await pool.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema=$1 AND table_name='tasks' AND column_name='parent_id'
    `, [SCHEMA]);
    if (rows.length > 0) return; // already exists, skip ALTER
    await pool.query(`
      ALTER TABLE ${SCHEMA}.tasks
      ADD COLUMN parent_id UUID REFERENCES ${SCHEMA}.tasks(id) ON DELETE CASCADE
    `);
  } catch (err) {
    console.warn('[Tasks API] Could not add parent_id column:', err.message);
  }
}

ensureParentIdColumn();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getTaskWithCounts(id) {
  const q = await pool.query(
    `SELECT t.*,
       COUNT(s.id) FILTER (WHERE s.id IS NOT NULL) AS subtask_count,
       COUNT(s.id) FILTER (WHERE s.status = 'completed' OR s.status = 'done') AS subtask_completed_count
     FROM ${SCHEMA}.tasks t
     LEFT JOIN ${SCHEMA}.tasks s ON s.parent_id = t.id
     WHERE t.id::text = $1 OR t.snipara_task_id = $1 OR t.swarm_task_id = $1
     GROUP BY t.id
     LIMIT 1`,
    [id]
  );
  return q.rows[0] || null;
}

// ─── GET /tasks-v2 ────────────────────────────────────────────────────────────

router.get('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status;
    const parentId = req.query.parent_id;
    const params = [DEFAULT_WORKSPACE];
    let where = 't.workspace_id = $1';

    if (status) {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }

    // By default, only show top-level tasks (parent_id IS NULL)
    // unless ?parent_id is explicitly provided
    if (parentId === undefined) {
      where += ` AND t.parent_id IS NULL`;
    } else if (parentId === 'null') {
      where += ` AND t.parent_id IS NULL`;
    } else {
      params.push(parentId);
      where += ` AND t.parent_id = $${params.length}`;
    }

    params.push(limit);
    const q = await pool.query(
      `SELECT t.*,
         COUNT(s.id) FILTER (WHERE s.id IS NOT NULL) AS subtask_count,
         COUNT(s.id) FILTER (WHERE s.status = 'completed' OR s.status = 'done') AS subtask_completed_count
       FROM ${SCHEMA}.tasks t
       LEFT JOIN ${SCHEMA}.tasks s ON s.parent_id = t.id
       WHERE ${where}
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT $${params.length}`,
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

// ─── POST /tasks-v2 ───────────────────────────────────────────────────────────

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

// ─── GET /tasks-v2/:id ────────────────────────────────────────────────────────

router.get('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const task = await getTaskWithCounts(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[Tasks API] Error fetching task:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch task', message: error.message });
  }
});

// ─── PATCH /tasks-v2/:id ──────────────────────────────────────────────────────

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
      // Check if all subtasks are done before completing in Snipara
      const subtasks = await pool.query(
        `SELECT status FROM ${SCHEMA}.tasks WHERE parent_id = $1`,
        [task.id]
      );
      const allDone = subtasks.rows.every(
        (s) => s.status === 'completed' || s.status === 'done'
      );
      if (!allDone && subtasks.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot complete task: not all subtasks are done',
          subtasks_remaining: subtasks.rows.filter(
            (s) => s.status !== 'completed' && s.status !== 'done'
          ).length
        });
      }
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

// ─── GET /tasks-v2/:id/subtasks ───────────────────────────────────────────────

router.get('/tasks-v2/:id/subtasks', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;

    // Resolve parent UUID
    const parent = await pool.query(
      `SELECT id FROM ${SCHEMA}.tasks WHERE id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [id]
    );
    if (!parent.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });

    const parentUUID = parent.rows[0].id;
    const q = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE parent_id = $1 ORDER BY created_at ASC`,
      [parentUUID]
    );

    res.json({ success: true, data: q.rows, meta: { total: q.rows.length, parent_id: parentUUID } });
  } catch (error) {
    console.error('[Tasks API] Error fetching subtasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subtasks', message: error.message });
  }
});

// ─── POST /tasks-v2/:id/subtasks ──────────────────────────────────────────────

router.post('/tasks-v2/:id/subtasks', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, assignee, priority, status } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Missing required field: title' });

    // Resolve parent UUID
    const parent = await pool.query(
      `SELECT id FROM ${SCHEMA}.tasks WHERE id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [id]
    );
    if (!parent.rows.length) return res.status(404).json({ success: false, error: 'Parent task not found' });

    const parentUUID = parent.rows[0].id;

    const ins = await pool.query(
      `INSERT INTO ${SCHEMA}.tasks
         (title, description, status, priority, assignee, assigned_agent,
          workspace_id, parent_id, source, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, 'pending'), COALESCE($4, 'medium'), $5, $5,
               $6, $7, 'vutler-subtask', NOW(), NOW())
       RETURNING *`,
      [
        title,
        description || '',
        status,
        priority,
        assignee || null,
        DEFAULT_WORKSPACE,
        parentUUID
      ]
    );

    res.status(201).json({ success: true, data: ins.rows[0] });
  } catch (error) {
    console.error('[Tasks API] Error creating subtask:', error);
    res.status(500).json({ success: false, error: 'Failed to create subtask', message: error.message });
  }
});

// ─── DELETE /tasks-v2/:id ─────────────────────────────────────────────────────

router.delete('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const { id } = req.params;
    const del = await pool.query(
      `DELETE FROM ${SCHEMA}.tasks WHERE id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1 RETURNING id`,
      [id]
    );
    if (!del.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Tasks API] Error deleting task:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task', message: error.message });
  }
});

// ─── POST /tasks-v2/sync ──────────────────────────────────────────────────────

router.post('/tasks-v2/sync', authenticateAgent, async (req, res) => {
  try {
    const swarmCoordinator = req.app.locals.swarmCoordinator || getSwarmCoordinator();
    const result = await swarmCoordinator.syncFromSnipara();
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Tasks API] Error syncing from Snipara:', error);
    res.status(500).json({ success: false, error: 'Sync failed', message: error.message });
  }
});

module.exports = router;
