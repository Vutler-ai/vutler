const express = require('express');
const router = express.Router();

const pool = require("../lib/vaultbrix");

const SCHEMA = 'tenant_vutler';

// GET /api/v1/tasks — List tasks with filters
router.get('/', async (req, res) => {
  try {
    
    const { status, priority, assignee_id, search, limit = 50, offset = 0 } = req.query;
    let query = `SELECT * FROM ${SCHEMA}.tasks WHERE 1=1`;
    const params = [];
    let idx = 1;
    
    if (status) { query += ` AND status = $${idx++}`; params.push(status); }
    if (priority) { query += ` AND priority = $${idx++}`; params.push(priority); }
    if (assignee_id) { query += ` AND assignee_id = $${idx++}`; params.push(assignee_id); }
    if (search) { query += ` AND (title ILIKE $${idx} OR description ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    
    query += ` ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, position ASC, created_at DESC`;
    query += ` LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await pool.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM ${SCHEMA}.tasks WHERE 1=1`;
    const countParams = [];
    let ci = 1;
    if (status) { countQuery += ` AND status = $${ci++}`; countParams.push(status); }
    if (priority) { countQuery += ` AND priority = $${ci++}`; countParams.push(priority); }
    if (assignee_id) { countQuery += ` AND assignee_id = $${ci++}`; countParams.push(assignee_id); }
    if (search) { countQuery += ` AND (title ILIKE $${ci} OR description ILIKE $${ci})`; countParams.push(`%${search}%`); ci++; }
    
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({ tasks: result.rows, total: parseInt(countResult.rows[0].count), limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('[TASKS] List error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/tasks — Create task
router.post('/', async (req, res) => {
  try {
    
    const { title, description, status = 'todo', priority = 'medium', assignee_id, assignee_type = 'human', due_date, labels = [] } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    
    const created_by = req.user?.id || 'system';
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.tasks (title, description, status, priority, created_by, assignee_id, assignee_type, due_date, labels) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, description, status, priority, created_by, assignee_id, assignee_type, due_date, labels]
    );
    
    // Activity log
    await pool.query(
      `INSERT INTO ${SCHEMA}.task_activity (task_id, actor_id, action, new_value) VALUES ($1,$2,'created',$3)`,
      [result.rows[0].id, created_by, title]
    );
    
    // Redis agentBus publish if available
    const redis = req.app.get('redisClient');
    if (redis) {
      redis.publish('agentBus', JSON.stringify({ type: 'task.created', data: result.rows[0] }));
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[TASKS] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/tasks/:id — Update task
router.put('/:id', async (req, res) => {
  try {
    
    const { id } = req.params;
    const fields = ['title', 'description', 'status', 'priority', 'assignee_id', 'assignee_type', 'due_date', 'labels', 'position'];
    const updates = [];
    const params = [];
    let idx = 1;
    const actor = req.user?.id || 'system';
    
    // Get old values for activity log
    const old = await pool.query(`SELECT * FROM ${SCHEMA}.tasks WHERE id = $1`, [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    
    for (const field of fields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        params.push(field === 'labels' ? req.body[field] : req.body[field]);
        
        // Log changes
        const oldVal = old.rows[0][field];
        const newVal = req.body[field];
        if (String(oldVal) !== String(newVal)) {
          await pool.query(
            `INSERT INTO ${SCHEMA}.task_activity (task_id, actor_id, action, field_name, old_value, new_value) VALUES ($1,$2,'updated',$3,$4,$5)`,
            [id, actor, field, String(oldVal), String(newVal)]
          );
        }
      }
    }
    
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    
    // Set completed_at when status changes to done
    if (req.body.status === 'done' && old.rows[0].status !== 'done') {
      updates.push(`completed_at = NOW()`);
    } else if (req.body.status && req.body.status !== 'done') {
      updates.push(`completed_at = NULL`);
    }
    
    updates.push(`updated_at = NOW()`);
    params.push(id);
    
    const result = await pool.query(
      `UPDATE ${SCHEMA}.tasks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );
    
    const redis = req.app.get('redisClient');
    if (redis) {
      redis.publish('agentBus', JSON.stringify({ type: 'task.updated', data: result.rows[0] }));
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[TASKS] Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/tasks/:id/move — Move task (status change for drag-drop)
router.put('/:id/move', async (req, res) => {
  try {
    
    const { id } = req.params;
    const { status, position } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    
    const actor = req.user?.id || 'system';
    const old = await pool.query(`SELECT status, position FROM ${SCHEMA}.tasks WHERE id = $1`, [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    
    const updates = [`status = $1`, `updated_at = NOW()`];
    const params = [status];
    let idx = 2;
    
    if (position !== undefined) { updates.push(`position = $${idx++}`); params.push(position); }
    if (status === 'done') updates.push(`completed_at = NOW()`);
    else updates.push(`completed_at = NULL`);
    
    params.push(id);
    const result = await pool.query(`UPDATE ${SCHEMA}.tasks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    
    if (old.rows[0].status !== status) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.task_activity (task_id, actor_id, action, field_name, old_value, new_value) VALUES ($1,$2,'moved','status',$3,$4)`,
        [id, actor, old.rows[0].status, status]
      );
    }
    
    const redis = req.app.get('redisClient');
    if (redis) redis.publish('agentBus', JSON.stringify({ type: 'task.moved', data: result.rows[0] }));
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[TASKS] Move error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    
    const result = await pool.query(`DELETE FROM ${SCHEMA}.tasks WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    console.error('[TASKS] Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/tasks/:id/comments — Add comment
router.post('/:id/comments', async (req, res) => {
  try {
    
    const { content, author_type = 'human' } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    const author_id = req.user?.id || 'system';
    
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.task_comments (task_id, author_id, author_type, content) VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, author_id, author_type, content]
    );
    
    await pool.query(
      `INSERT INTO ${SCHEMA}.task_activity (task_id, actor_id, action, new_value) VALUES ($1,$2,'commented',$3)`,
      [req.params.id, author_id, content.substring(0, 100)]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[TASKS] Comment error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tasks/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.task_comments WHERE task_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );
    res.json({ comments: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/tasks/:id/activity
router.get('/:id/activity', async (req, res) => {
  try {
    
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.task_activity WHERE task_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json({ activity: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
