/**
 * Vutler Tasks API v2
 * Task management for agents + Snipara sync
 */
'use strict';

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const pool = require('../../../lib/vaultbrix');
const { getSwarmCoordinator } = require('../services/swarmCoordinator');
const { signalRunFromTask } = require('../../../services/orchestration/runSignals');
const {
  publishTaskDeleted,
  publishTaskEvent,
} = require('../../../services/workspaceRealtime');
const { refreshTaskHierarchyRollups } = require('../../../services/taskHierarchyRollupService');

const router = express.Router();
const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function wsId(req) {
  return req.workspaceId || DEFAULT_WORKSPACE;
}

function resolveSwarmCoordinator(req, capability = null) {
  const candidate = req.app.locals.swarmCoordinator;
  if (!candidate) return getSwarmCoordinator();
  if (!capability || typeof candidate[capability] === 'function') return candidate;
  return getSwarmCoordinator();
}

function parseTaskMetadata(task) {
  if (!task?.metadata) return {};
  if (typeof task.metadata === 'object') return task.metadata;
  try {
    return JSON.parse(task.metadata);
  } catch (_) {
    return {};
  }
}

const HTASK_LEVELS = ['N0', 'N1_FEATURE', 'N2_WORKSTREAM', 'N3_TASK'];

function normalizeHtaskLevel(level, fallback = 'N3_TASK') {
  const value = String(level || fallback).toUpperCase();
  return HTASK_LEVELS.includes(value) ? value : fallback;
}

function getDefaultChildHtaskLevel(parent = null) {
  const parentMeta = parseTaskMetadata(parent);
  const parentLevel = normalizeHtaskLevel(
    parentMeta.snipara_hierarchy_level || parent?.level || parent?.snipara_hierarchy_level || null,
    'N0'
  );

  if (parentLevel === 'N0') return 'N1_FEATURE';
  if (parentLevel === 'N1_FEATURE') return 'N2_WORKSTREAM';
  return 'N3_TASK';
}

function normalizeWorkstreamType(value) {
  if (!value) return undefined;
  return String(value).toUpperCase();
}

async function refreshHierarchyProjection(task, workspaceId, reason = 'hierarchy_rollup_refreshed') {
  if (!task?.id) return task;

  const refreshedRows = await refreshTaskHierarchyRollups({
    taskId: task.id,
    workspaceId,
    db: pool,
  }).catch(() => []);

  for (const row of refreshedRows) {
    if (!row?.id || row.id === task.id) continue;
    publishTaskEvent(row, {
      type: 'task.updated',
      origin: 'task-rollup',
      reason,
    });
  }

  return refreshedRows.find((row) => row.id === task.id) || task;
}

async function ensureTaskColumns() {
  try {
    const { rows } = await pool.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = 'tasks'
         AND column_name IN ('parent_id', 'snipara_task_id')`,
      [SCHEMA]
    );
    const columns = new Set(rows.map((row) => row.column_name));

    if (!columns.has('parent_id')) {
      console.warn('[Tasks API] parent_id column missing; subtask wiring requires the corresponding migration.');
    }

    if (!columns.has('snipara_task_id')) {
      console.warn('[Tasks API] snipara_task_id column missing; Snipara linkage requires the corresponding migration.');
    }
  } catch (err) {
    console.warn('[Tasks API] Could not ensure task columns:', err.message);
  }
}

ensureTaskColumns();

async function getTaskWithCounts(id, workspaceId) {
  const result = await pool.query(
    `SELECT t.*,
       COUNT(s.id) FILTER (WHERE s.id IS NOT NULL) AS subtask_count,
       COUNT(s.id) FILTER (WHERE s.status = 'completed' OR s.status = 'done') AS subtask_completed_count
     FROM ${SCHEMA}.tasks t
     LEFT JOIN ${SCHEMA}.tasks s ON s.parent_id = t.id AND s.workspace_id = t.workspace_id
     WHERE t.workspace_id = $2
       AND (t.id::text = $1 OR t.snipara_task_id = $1 OR t.swarm_task_id = $1)
     GROUP BY t.id
     LIMIT 1`,
    [id, workspaceId]
  );
  return result.rows[0] || null;
}

async function resolveTask(id, workspaceId) {
  const result = await pool.query(
    `SELECT * FROM ${SCHEMA}.tasks
     WHERE workspace_id = $2
       AND (id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1)
     LIMIT 1`,
    [id, workspaceId]
  );
  return result.rows[0] || null;
}

async function updateTaskMetadata(task, workspaceId, patch = {}) {
  const metadata = {
    ...parseTaskMetadata(task),
    ...patch,
  };

  const result = await pool.query(
    `UPDATE ${SCHEMA}.tasks
     SET metadata = $1::jsonb,
         updated_at = NOW()
     WHERE id = $2 AND workspace_id = $3
     RETURNING *`,
    [JSON.stringify(metadata), task.id, workspaceId]
  );

  return result.rows[0] || task;
}

async function insertHierarchicalTask({
  workspaceId,
  parent,
  title,
  description,
  assignee,
  priority,
  status,
  metadata,
  sniparaTaskId,
  source,
}) {
  const inserted = await pool.query(
    `INSERT INTO ${SCHEMA}.tasks
     (title, description, status, priority, assignee, assigned_agent, workspace_id, parent_id, source, metadata, snipara_task_id, swarm_task_id, created_at, updated_at)
     VALUES ($1, $2, COALESCE($3, 'pending'), COALESCE($4, 'medium'), $5, $5, $6, $7, $8, COALESCE($9::jsonb, '{}'::jsonb), $10, $10, NOW(), NOW())
     RETURNING *`,
    [
      title,
      description || '',
      status,
      priority,
      assignee || null,
      workspaceId,
      parent.id,
      source,
      JSON.stringify(metadata || {}),
      sniparaTaskId,
    ]
  );

  return inserted.rows[0];
}

async function insertRootHierarchicalTask({
  workspaceId,
  title,
  description,
  assignee,
  priority,
  status,
  metadata,
  sniparaTaskId,
  source,
}) {
  const inserted = await pool.query(
    `INSERT INTO ${SCHEMA}.tasks
     (title, description, status, priority, assignee, assigned_agent, workspace_id, source, metadata, snipara_task_id, swarm_task_id, created_at, updated_at)
     VALUES ($1, $2, COALESCE($3, 'pending'), COALESCE($4, 'medium'), $5, $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb), $9, $9, NOW(), NOW())
     RETURNING *`,
    [
      title,
      description || '',
      status,
      priority,
      assignee || null,
      workspaceId,
      source,
      JSON.stringify(metadata || {}),
      sniparaTaskId,
    ]
  );

  return inserted.rows[0];
}

async function ensureHierarchyRoot(parent, workspaceId, swarmCoordinator) {
  const meta = parseTaskMetadata(parent);
  if (meta.snipara_hierarchy_root_id) {
    return { parent, hierarchyRootId: meta.snipara_hierarchy_root_id };
  }

  const created = await swarmCoordinator.createHtask({
    level: 'N0',
    title: parent.title,
    description: parent.description || '',
    owner: parent.assigned_agent || parent.assignee || 'jarvis',
  }, workspaceId);

  const hierarchyRootId = created?.task_id || created?.id || created?.task?.id;
  if (!hierarchyRootId) {
    throw new Error('Snipara hierarchy root creation did not return a task id');
  }

  const updatedParent = await updateTaskMetadata(parent, workspaceId, {
    snipara_hierarchy_root_id: hierarchyRootId,
    snipara_hierarchy_level: 'N0',
  });

  return { parent: updatedParent, hierarchyRootId };
}

async function createHierarchicalSubtask({ parent, body, workspaceId, swarmCoordinator }) {
  const parentMeta = parseTaskMetadata(parent);
  const isParentHtask = parentMeta.snipara_task_kind === 'htask' && parent.snipara_task_id;
  const { parent: resolvedParent, hierarchyRootId } = isParentHtask
    ? { parent, hierarchyRootId: parent.snipara_task_id }
    : await ensureHierarchyRoot(parent, workspaceId, swarmCoordinator);

  const level = normalizeHtaskLevel(body.level, getDefaultChildHtaskLevel(resolvedParent));
  const remoteParentId = isParentHtask ? parent.snipara_task_id : hierarchyRootId;
  const owner = body.owner || body.assignee || body.assigned_agent || parent.assigned_agent || parent.assignee || 'jarvis';
  const created = await swarmCoordinator.createHtask({
    level,
    title: body.title,
    description: body.description || '',
    owner,
    parentId: remoteParentId,
    workstreamType: level === 'N2_WORKSTREAM' ? normalizeWorkstreamType(body.workstream_type) : undefined,
  }, workspaceId);

  const sniparaTaskId = created?.task_id || created?.id || created?.task?.id;
  if (!sniparaTaskId) {
    throw new Error('Snipara htask creation did not return a task id');
  }

  const inserted = await insertHierarchicalTask({
    workspaceId,
    parent: resolvedParent,
    title: body.title,
    description: body.description,
    assignee: body.assignee || body.assigned_agent || parent.assigned_agent || parent.assignee || null,
    priority: body.priority || 'medium',
    status: body.status || 'pending',
    metadata: {
      execution_backend: 'snipara',
      execution_mode: 'hierarchical_htask',
      sync_mode: 'primary',
      sync_status: 'synced',
      snipara_task_kind: 'htask',
      snipara_hierarchy_level: level,
      snipara_hierarchy_root_id: isParentHtask
        ? (parentMeta.snipara_hierarchy_root_id || parent.snipara_task_id)
        : hierarchyRootId,
      snipara_remote_parent_id: remoteParentId,
    },
    sniparaTaskId,
    source: 'vutler-htask',
  });

  return refreshHierarchyProjection(inserted, workspaceId, 'hierarchical_subtask_rollup');
}

async function createHierarchicalRootTask({ body, workspaceId, swarmCoordinator }) {
  const level = normalizeHtaskLevel(body.level, 'N0');
  const owner = body.owner || body.assignee || body.assigned_agent || 'jarvis';
  const created = await swarmCoordinator.createHtask({
    level,
    title: body.title,
    description: body.description || '',
    owner,
    workstreamType: level === 'N2_WORKSTREAM' ? normalizeWorkstreamType(body.workstream_type) : undefined,
  }, workspaceId);

  const sniparaTaskId = created?.task_id || created?.id || created?.task?.id;
  if (!sniparaTaskId) {
    throw new Error('Snipara root htask creation did not return a task id');
  }

  const inserted = await insertRootHierarchicalTask({
    workspaceId,
    title: body.title,
    description: body.description || '',
    assignee: body.assignee || body.assigned_agent || null,
    priority: body.priority || 'medium',
    status: body.status || 'pending',
    metadata: {
      execution_backend: 'snipara',
      execution_mode: 'hierarchical_htask',
      sync_mode: 'primary',
      sync_status: 'synced',
      snipara_task_kind: 'htask',
      snipara_hierarchy_level: level,
      ...(body.workflow_mode ? { workflow_mode: body.workflow_mode } : { workflow_mode: 'FULL' }),
    },
    sniparaTaskId,
    source: 'vutler-htask',
  });

  return refreshHierarchyProjection(inserted, workspaceId, 'hierarchical_root_rollup');
}

router.get('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const status = req.query.status;
    const parentId = req.query.parent_id;
    const params = [wsId(req)];
    let where = 't.workspace_id = $1';

    if (status) {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }

    if (parentId === undefined || parentId === 'null') {
      where += ' AND t.parent_id IS NULL';
    } else {
      params.push(parentId);
      where += ` AND t.parent_id = $${params.length}`;
    }

    params.push(limit);
    const result = await pool.query(
      `SELECT t.*,
         COUNT(s.id) FILTER (WHERE s.id IS NOT NULL) AS subtask_count,
         COUNT(s.id) FILTER (WHERE s.status = 'completed' OR s.status = 'done') AS subtask_completed_count
       FROM ${SCHEMA}.tasks t
       LEFT JOIN ${SCHEMA}.tasks s ON s.parent_id = t.id AND s.workspace_id = t.workspace_id
       WHERE ${where}
       GROUP BY t.id
       ORDER BY t.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      meta: { total: result.rows.length, limit, filter: status ? { status } : {} }
    });
  } catch (error) {
    console.error('[Tasks API] Error fetching tasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks', message: error.message });
  }
});

router.post('/tasks-v2', authenticateAgent, async (req, res) => {
  try {
    const { title, description, assignee, priority } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Missing required field: title' });
    }

    const shouldUseHierarchy = req.body?.hierarchical === true
      || req.body?.execution_mode === 'hierarchical_htask'
      || req.body?.workflow_mode === 'FULL';
    const swarmCoordinator = resolveSwarmCoordinator(req, shouldUseHierarchy ? 'createHtask' : 'createTask');

    if (shouldUseHierarchy) {
      const created = await createHierarchicalRootTask({
        body: req.body,
        workspaceId: wsId(req),
        swarmCoordinator,
      });
      publishTaskEvent(created, {
        type: 'task.created',
        origin: 'tasks-v2',
        reason: 'hierarchical_root_created',
      });
      return res.status(201).json({ success: true, data: created });
    }

    const created = await swarmCoordinator.createTask({
      title,
      description: description || '',
      priority: priority || 'medium',
      for_agent_id: assignee || null,
      metadata: {
        execution_mode: 'simple_task',
        workflow_mode: req.body?.workflow_mode || 'LITE',
      },
    }, wsId(req));

    const projected = await refreshHierarchyProjection(created, wsId(req), 'task_created_rollup');
    res.status(201).json({ success: true, data: projected });
  } catch (error) {
    console.error('[Tasks API] Error creating task:', error);
    res.status(500).json({ success: false, error: 'Failed to create task', message: error.message });
  }
});

router.get('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const task = await getTaskWithCounts(req.params.id, wsId(req));
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (error) {
    console.error('[Tasks API] Error fetching task:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch task', message: error.message });
  }
});

router.patch('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = wsId(req);
    const task = await resolveTask(req.params.id, workspaceId);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const updates = req.body || {};
    const assignee = updates.assignee || updates.assigned_agent || task.assignee || task.assigned_agent || req.agent.id;

    const meta = parseTaskMetadata(task);
    const isHtask = meta.snipara_task_kind === 'htask';
    const swarmCoordinator = resolveSwarmCoordinator(req, isHtask ? 'completeHtask' : 'claimTask');

    if ((updates.status === 'in_progress' || updates.status === 'claimed') && task.snipara_task_id && !isHtask) {
      await swarmCoordinator.claimTask(task.snipara_task_id, assignee, workspaceId);
    }

    if (updates.status === 'completed' && task.snipara_task_id) {
      const subtasks = await pool.query(
        `SELECT status FROM ${SCHEMA}.tasks WHERE parent_id = $1 AND workspace_id = $2`,
        [task.id, workspaceId]
      );
      const allDone = subtasks.rows.every((subtask) => subtask.status === 'completed' || subtask.status === 'done');
      if (!allDone && subtasks.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot complete task: not all subtasks are done',
          subtasks_remaining: subtasks.rows.filter((subtask) => subtask.status !== 'completed' && subtask.status !== 'done').length
        });
      }
      if (isHtask) {
        await swarmCoordinator.completeHtask(task.snipara_task_id, updates.output, updates.evidence, workspaceId);
        const closure = await swarmCoordinator.verifyHtaskClosure(task.snipara_task_id, workspaceId).catch(() => null);
        if (closure?.can_close || closure?.closure_ready || closure?.ready_to_close) {
          await swarmCoordinator.closeHtask(task.snipara_task_id, workspaceId).catch(() => {});
        }
      } else {
        await swarmCoordinator.completeTask(task.snipara_task_id, assignee, updates.output, workspaceId);
      }
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
       SET title = $1,
           description = $2,
           status = $3,
           priority = $4,
           assignee = $5,
           assigned_agent = $6,
           metadata = COALESCE(metadata, '{}'::jsonb) || $7::jsonb,
           updated_at = NOW()
       WHERE id = $8 AND workspace_id = $9
       RETURNING *`,
      [
        merged.title,
        merged.description,
        merged.status,
        merged.priority,
        merged.assignee,
        merged.assigned_agent,
        JSON.stringify(updates.metadata || {}),
        task.id,
        workspaceId
      ]
    );
    const projected = await refreshHierarchyProjection(saved.rows[0], workspaceId, 'task_patch_rollup');

    const remoteCompletionHandled = updates.status === 'completed' && task.snipara_task_id;
    if (!remoteCompletionHandled) {
      await signalRunFromTask(projected, {
        reason: 'tasks_v2_patch',
        eventType: updates.status === 'completed'
          ? 'delegate.task_completed'
          : updates.status === 'failed'
            ? 'delegate.task_failed'
            : updates.status === 'blocked'
              ? 'delegate.task_blocked'
              : 'delegate.task_status_changed',
      }).catch(() => {});
    }

    publishTaskEvent(projected, {
      type: 'task.updated',
      origin: 'tasks-v2',
      reason: updates.status || 'task_patched',
    });
    res.json({ success: true, data: projected });
  } catch (error) {
    console.error('[Tasks API] Error updating task:', error);
    res.status(500).json({ success: false, error: 'Failed to update task', message: error.message });
  }
});

router.get('/tasks-v2/:id/subtasks', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = wsId(req);
    const parent = await resolveTask(req.params.id, workspaceId);
    if (!parent) return res.status(404).json({ success: false, error: 'Task not found' });

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks
       WHERE parent_id = $1 AND workspace_id = $2
       ORDER BY created_at ASC`,
      [parent.id, workspaceId]
    );

    res.json({ success: true, data: result.rows, meta: { total: result.rows.length, parent_id: parent.id } });
  } catch (error) {
    console.error('[Tasks API] Error fetching subtasks:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch subtasks', message: error.message });
  }
});

router.post('/tasks-v2/:id/subtasks', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = wsId(req);
    const parent = await resolveTask(req.params.id, workspaceId);
    if (!parent) return res.status(404).json({ success: false, error: 'Parent task not found' });

    const { title, description, assignee, priority, status } = req.body;
    if (!title) return res.status(400).json({ success: false, error: 'Missing required field: title' });

    const parentMeta = parseTaskMetadata(parent);
    const shouldUseHierarchy = req.body?.hierarchical === true
      || parentMeta.snipara_task_kind === 'htask'
      || parentMeta.workflow_mode === 'FULL'
      || Boolean(parentMeta.snipara_hierarchy_root_id);
    const swarmCoordinator = resolveSwarmCoordinator(req, shouldUseHierarchy ? 'createHtask' : 'createTask');

    if (shouldUseHierarchy) {
      const created = await createHierarchicalSubtask({
        parent,
        body: req.body,
        workspaceId,
        swarmCoordinator,
      });
      publishTaskEvent(created, {
        type: 'task.created',
        origin: 'tasks-v2',
        reason: 'hierarchical_subtask_created',
      });
      return res.status(201).json({ success: true, data: created });
    }

    const created = await swarmCoordinator.createTask({
      title,
      description: description || '',
      priority: priority || 'medium',
      for_agent_id: assignee || null,
      parent_id: parent.id,
      metadata: {
        source: 'vutler-subtask',
      },
    }, workspaceId);

    const projected = await refreshHierarchyProjection(created, workspaceId, 'subtask_created_rollup');
    res.status(201).json({ success: true, data: projected });
  } catch (error) {
    console.error('[Tasks API] Error creating subtask:', error);
    res.status(500).json({ success: false, error: 'Failed to create subtask', message: error.message });
  }
});

router.delete('/tasks-v2/:id', authenticateAgent, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.tasks
       WHERE workspace_id = $2 AND (id::text = $1 OR snipara_task_id = $1 OR swarm_task_id = $1)
       RETURNING id, parent_id`,
      [req.params.id, wsId(req)]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Task not found' });
    if (result.rows[0].parent_id) {
      const refreshedRows = await refreshTaskHierarchyRollups({
        taskId: result.rows[0].parent_id,
        workspaceId: wsId(req),
        db: pool,
      }).catch(() => []);
      for (const row of refreshedRows) {
        publishTaskEvent(row, {
          type: 'task.updated',
          origin: 'task-rollup',
          reason: 'task_deleted_rollup',
        });
      }
    }
    publishTaskDeleted({
      workspaceId: wsId(req),
      taskId: result.rows[0].id,
      parentId: result.rows[0].parent_id,
      reason: 'task_deleted',
      origin: 'tasks-v2',
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[Tasks API] Error deleting task:', error);
    res.status(500).json({ success: false, error: 'Failed to delete task', message: error.message });
  }
});

router.post('/tasks-v2/sync', authenticateAgent, async (req, res) => {
  try {
    const swarmCoordinator = resolveSwarmCoordinator(req, 'syncFromSnipara');
    const result = await swarmCoordinator.syncFromSnipara(wsId(req));
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('[Tasks API] Error syncing from Snipara:', error);
    res.status(500).json({ success: false, error: 'Sync failed', message: error.message });
  }
});

module.exports = router;
module.exports.__test = {
  HTASK_LEVELS,
  normalizeHtaskLevel,
  getDefaultChildHtaskLevel,
};
