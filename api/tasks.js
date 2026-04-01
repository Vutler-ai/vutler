'use strict';

const express = require('express');
const router = express.Router();
const taskRouter = require('../services/taskRouter');
const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');

function workspaceIdOf(req) {
  return req.workspaceId || '00000000-0000-0000-0000-000000000001';
}

// GET / — list tasks (was Snipara, now uses taskRouter PG)
router.get('/', async (req, res) => {
  try {
    const { status, assigned_agent } = req.query;
    const tasks = await taskRouter.listTasks({ status, assigned_agent, workspace_id: workspaceIdOf(req) });
    res.json({ success: true, count: tasks.length, tasks, source: 'task-router' });
  } catch (err) {
    console.error('[TASKS] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST / — create task
router.post('/', async (req, res) => {
  try {
    const { title, description, priority, assignee, assigned_agent, due_date, hierarchical, execution_mode, workflow_mode } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });
    let task;
    const workspaceId = workspaceIdOf(req);

    if (hierarchical === true || execution_mode === 'hierarchical_htask' || workflow_mode === 'FULL') {
      const coordinator = getSwarmCoordinator();
      const created = await coordinator.createHtask({
        level: req.body?.level || 'N1_FEATURE',
        title,
        description: description || '',
        owner: assigned_agent || assignee || 'jarvis',
        workstreamType: req.body?.workstream_type,
      }, workspaceId);
      const projected = await coordinator.projectWebhookEvent('htask.created', {
        task_id: created?.task_id || created?.id || created?.task?.id,
        title,
        description: description || '',
        owner: assigned_agent || assignee || 'jarvis',
        level: req.body?.level || 'N1_FEATURE',
      }, workspaceId).catch(() => null);
      task = {
        success: true,
        mode: 'hierarchical_htask',
        remote_task_id: created?.task_id || created?.id || null,
        task: created,
        projection: projected,
      };
    } else {
      task = await taskRouter.createTask({
        title,
        description,
        priority: priority || 'medium',
        due_date,
        created_by: assignee || 'user',
        assigned_agent: assigned_agent || assignee || undefined,
        workspace_id: workspaceId
      });
    }

    // Push notification for task creation (best-effort)
    if (req.user?.id) {
      try {
        const { sendPushToUser } = require('../services/pushService');
        sendPushToUser(req.user.id, {
          title: 'New task created',
          body: title,
          url: '/tasks',
          tag: 'task-created',
        }).catch(() => {});
      } catch { /* push unavailable */ }
    }

    res.status(201).json({ success: true, data: task });
  } catch (err) {
    console.error('[TASKS] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const task = await taskRouter.getTask(req.params.id, workspaceIdOf(req));
    if (!task) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /:id
router.put('/:id', async (req, res) => {
  try {
    const task = await taskRouter.updateTask(req.params.id, req.body, workspaceIdOf(req));
    res.json({ success: true, data: task });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req, res) => {
  try {
    await taskRouter.deleteTask(req.params.id, workspaceIdOf(req));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
