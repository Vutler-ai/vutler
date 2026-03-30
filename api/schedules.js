'use strict';

/**
 * Schedules API — REST endpoints for recurring task management
 *
 * All routes are workspace-scoped via req.workspaceId (set by JWT middleware).
 *
 * Mount in index.js:
 *   const schedulesRouter = require('./api/schedules');
 *   app.use('/api/v1/schedules', authMiddleware, schedulesRouter);
 *
 * And in startup:
 *   const { initScheduler } = require('./services/scheduler');
 *   await initScheduler();
 */

const express = require('express');
const router  = express.Router();
const pool    = require('../lib/vaultbrix');
const scheduler = require('../services/scheduler');

const SCHEMA = 'tenant_vutler';

// ── Workspace guard ──────────────────────────────────────────────────────────
router.use((req, res, next) => {
  if (!req.workspaceId) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  next();
});

// ── POST /parse ──────────────────────────────────────────────────────────────
// Preview: parse natural-language text into a schedule without saving it.
router.post('/parse', async (req, res) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'text is required' });
    }

    const parsed = await scheduler.parseScheduleFromText(text, {
      provider: req.body.provider,
      model:    req.body.model,
      apiKey:   req.body.apiKey,
    });

    // Enrich with next run preview
    const nextRun = scheduler.getNextRun(parsed.cron);

    return res.json({
      success: true,
      data: {
        ...parsed,
        next_run_at:  nextRun?.toISOString() || null,
        cron_preview: parsed.cron,
      },
    });
  } catch (err) {
    console.error('[Schedules] Parse error:', err.message);
    return res.status(422).json({ success: false, error: err.message });
  }
});

// ── POST / ───────────────────────────────────────────────────────────────────
// Create a new schedule.
router.post('/', async (req, res) => {
  try {
    const {
      cron,
      description,
      task_template,
      agent_id,
      // Convenience: accept flat fields and build task_template automatically
      task_title,
      task_description,
      priority,
    } = req.body || {};

    if (!cron) {
      return res.status(400).json({ success: false, error: 'cron is required' });
    }
    if (!description) {
      return res.status(400).json({ success: false, error: 'description is required' });
    }

    // Allow caller to pass task_template directly OR use flat fields
    const template = task_template || {
      title:       task_title       || description,
      description: task_description || description,
      priority:    priority         || 'P2',
    };

    if (!template.title) {
      return res.status(400).json({ success: false, error: 'task_template.title (or task_title) is required' });
    }

    const schedule = await scheduler.createSchedule({
      workspaceId:  req.workspaceId,
      agentId:      agent_id || null,
      cron,
      description,
      taskTemplate: template,
      createdBy:    req.user?.id || req.user?.email || null,
    });

    return res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    console.error('[Schedules] Create error:', err.message);
    const status = err.message.includes('Invalid cron') ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// ── GET / ────────────────────────────────────────────────────────────────────
// List all schedules for this workspace.
router.get('/', async (req, res) => {
  try {
    const schedules = await scheduler.listSchedules(req.workspaceId);
    return res.json({ success: true, count: schedules.length, data: schedules });
  } catch (err) {
    console.error('[Schedules] List error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /:id ─────────────────────────────────────────────────────────────────
// Schedule detail with last 20 runs.
router.get('/:id', async (req, res) => {
  try {
    const schedule = await scheduler.getSchedule(req.workspaceId, req.params.id);
    if (!schedule) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    return res.json({ success: true, data: schedule });
  } catch (err) {
    console.error('[Schedules] Get error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── PATCH /:id ───────────────────────────────────────────────────────────────
// Update cron, description, task_template or is_active.
router.patch('/:id', async (req, res) => {
  try {
    const {
      cron_expression,
      cron,            // alias for cron_expression
      description,
      task_template,
      is_active,
      agent_id,
    } = req.body || {};

    const updates = {};
    if (cron_expression !== undefined || cron !== undefined) {
      updates.cron_expression = cron_expression || cron;
    }
    if (description   !== undefined) updates.description   = description;
    if (task_template !== undefined) updates.task_template = task_template;
    if (is_active     !== undefined) updates.is_active     = Boolean(is_active);
    if (agent_id      !== undefined) updates.agent_id      = agent_id;

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    const updated = await scheduler.updateSchedule(req.workspaceId, req.params.id, updates);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('[Schedules] Update error:', err.message);
    const status = err.message.includes('Invalid cron') ? 400 : 500;
    return res.status(status).json({ success: false, error: err.message });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await scheduler.deleteSchedule(req.workspaceId, req.params.id);
    return res.json({ success: true, message: 'Schedule deleted' });
  } catch (err) {
    console.error('[Schedules] Delete error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/activate ───────────────────────────────────────────────────────
router.post('/:id/activate', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE ${SCHEMA}.scheduled_tasks
       SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $2
       RETURNING *`,
      [req.params.id, req.workspaceId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    const schedule = result.rows[0];
    scheduler.activateSchedule(schedule);
    return res.json({ success: true, data: schedule });
  } catch (err) {
    console.error('[Schedules] Activate error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/deactivate ─────────────────────────────────────────────────────
router.post('/:id/deactivate', async (req, res) => {
  try {
    await scheduler.deactivateSchedule(req.params.id);
    // Verify it belongs to this workspace
    const result = await pool.query(
      `SELECT id FROM ${SCHEMA}.scheduled_tasks WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }
    return res.json({ success: true, message: 'Schedule deactivated' });
  } catch (err) {
    console.error('[Schedules] Deactivate error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /:id/run-now ────────────────────────────────────────────────────────
// Manual trigger — execute immediately regardless of cron timing.
router.post('/:id/run-now', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.scheduled_tasks WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const schedule = result.rows[0];
    const execution = await scheduler._executeScheduledTask(schedule);

    return res.json({
      success: true,
      message: 'Schedule executed immediately',
      data:    execution,
    });
  } catch (err) {
    console.error('[Schedules] Run-now error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /:id/history ─────────────────────────────────────────────────────────
// Execution history with optional pagination.
router.get('/:id/history', async (req, res) => {
  try {
    // Verify schedule belongs to this workspace
    const check = await pool.query(
      `SELECT id FROM ${SCHEMA}.scheduled_tasks WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );
    if (!check.rows.length) {
      return res.status(404).json({ success: false, error: 'Schedule not found' });
    }

    const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0,  0);

    const runs = await pool.query(
      `SELECT * FROM ${SCHEMA}.scheduled_task_runs
       WHERE schedule_id = $1
       ORDER BY started_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );

    const total = await pool.query(
      `SELECT COUNT(*) FROM ${SCHEMA}.scheduled_task_runs WHERE schedule_id = $1`,
      [req.params.id]
    );

    return res.json({
      success: true,
      total:  parseInt(total.rows[0].count, 10),
      limit,
      offset,
      data:   runs.rows,
    });
  } catch (err) {
    console.error('[Schedules] History error:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
