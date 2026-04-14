'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const taskRouter = require('../services/taskRouter');
const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');

function workspaceIdOf(req) {
  return req.workspaceId || null;
}

function timingSafeEqualString(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  if (!a.length || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function resolveSyncSecret() {
  const value = process.env.TASK_ROUTER_WEBHOOK_SECRET || process.env.SNIPARA_WEBHOOK_SECRET || '';
  return String(value).trim();
}

function requireSyncAuth(req, res, next) {
  const secret = resolveSyncSecret();
  if (!secret) {
    return res.status(503).json({ success: false, error: 'task-router sync webhook is not configured' });
  }

  const provided = req.headers['x-webhook-secret']
    || req.headers['x-vutler-webhook-secret']
    || req.query.secret;

  if (!timingSafeEqualString(provided, secret)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  return next();
}

function requireWorkspace(req, res, next) {
  if (!workspaceIdOf(req)) {
    return res.status(400).json({ success: false, error: 'workspace context is required' });
  }
  return next();
}

function mapLegacyEventName(event) {
  if (event === 'task_created') return 'task.created';
  if (event === 'task_completed') return 'task.completed';
  if (event === 'task_updated') return 'task.updated';
  if (event === 'task_failed') return 'task.failed';
  return event;
}

// POST /sync — Snipara webhook endpoint
router.post('/sync', requireSyncAuth, async (req, res) => {
  try {
    const { event, task } = req.body;
    
    if (!event || !task) {
      return res.status(400).json({ success: false, error: 'event and task are required' });
    }

    const workspaceId = task?.metadata?.workspace_id || task?.workspace_id || req.workspaceId;
    if (!workspaceId) {
      console.warn('[TaskSync] Missing workspace_id in metadata');
      return res.status(400).json({ success: false, error: 'workspace_id required in metadata' });
    }

    const projected = await getSwarmCoordinator().projectWebhookEvent(
      mapLegacyEventName(event),
      {
        task_id: task?.swarm_task_id || task?.task_id || task?.id,
        swarm_id: task?.swarm_id || task?.metadata?.snipara_swarm_id || null,
        title: task?.title,
        description: task?.description,
        priority: task?.priority,
        status: task?.status,
        assigned_to: task?.assigned_to || task?.assigned_agent || null,
        workspace_id: workspaceId,
        ...(task?.metadata || {}),
      },
      workspaceId
    );

    res.json({ success: true, data: { action: 'projected', task: projected } });

  } catch (err) {
    console.error('[TaskSync] Webhook error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.use(requireWorkspace);

// POST / — create task
router.post('/', async (req, res) => {
  try {
    const { title, description, source, source_ref, priority, due_date, created_by, workspace_id, assigned_agent, metadata } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    const task = await taskRouter.createTask({
      title,
      description,
      source,
      source_ref,
      priority,
      due_date,
      created_by,
      workspace_id: workspaceIdOf(req),
      assigned_agent,
      metadata
    });
    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[TasksAPI] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /reminders/check — must be before /:id
router.get('/reminders/check', async (req, res) => {
  try {
    const reminders = await taskRouter.checkReminders(workspaceIdOf(req));
    res.json({ success: true, data: reminders });
  } catch (err) {
    console.error('[TasksAPI] GET /reminders/check error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /overdue
router.get('/overdue', async (req, res) => {
  try {
    const tasks = await taskRouter.getOverdueTasks(workspaceIdOf(req));
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[TasksAPI] GET /overdue error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /due
router.get('/due', async (req, res) => {
  try {
    const tasks = await taskRouter.getDueTasks(workspaceIdOf(req));
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[TasksAPI] GET /due error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET / — list tasks
router.get('/', async (req, res) => {
  try {
    const { status, assigned_agent } = req.query;
    const tasks = await taskRouter.listTasks({ status, assigned_agent, workspace_id: workspaceIdOf(req) });
    res.json({ success: true, data: tasks });
  } catch (err) {
    console.error('[TasksAPI] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id — get task
router.get('/:id', async (req, res) => {
  try {
    const task = await taskRouter.getTask(req.params.id, workspaceIdOf(req));
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
    const task = await taskRouter.updateTask(req.params.id, req.body, workspaceIdOf(req));
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
    const task = await taskRouter.updateTask(req.params.id, { status: 'cancelled' }, workspaceIdOf(req));
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
