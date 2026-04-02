'use strict';

function parseJsonLike(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return value && typeof value === 'object' ? value : {};
}

function publishWorkspaceEvent(workspaceId, event = {}) {
  if (!workspaceId) return false;

  try {
    const { publishWorkspaceEvent: publish } = require('../api/ws-chat');
    if (typeof publish !== 'function') return false;
    return publish(workspaceId, event);
  } catch (_) {
    return false;
  }
}

function buildTaskRealtimePayload(task = {}) {
  const metadata = parseJsonLike(task.metadata);
  return {
    id: task.id || null,
    status: task.status || null,
    title: task.title || null,
    parent_id: task.parent_id || null,
    assignee: task.assignee || null,
    assigned_agent: task.assigned_agent || null,
    snipara_task_id: task.snipara_task_id || null,
    swarm_task_id: task.swarm_task_id || null,
    updated_at: task.updated_at || null,
    orchestration_run_id: metadata.orchestration_run_id || metadata.orchestration_parent_run_id || null,
    orchestration_status: metadata.orchestration_status || null,
  };
}

function buildRunRealtimePayload(run = {}) {
  return {
    id: run.id || null,
    status: run.status || null,
    root_task_id: run.root_task_id || null,
    current_step_id: run.current_step_id || null,
    next_wake_at: run.next_wake_at || null,
    updated_at: run.updated_at || null,
    completed_at: run.completed_at || null,
    cancelled_at: run.cancelled_at || null,
  };
}

function publishTaskEvent(task, {
  type = 'task.updated',
  origin = 'server',
  reason = null,
  payload = null,
} = {}) {
  if (!task?.workspace_id) return false;
  return publishWorkspaceEvent(task.workspace_id, {
    type,
    entity: 'task',
    origin,
    reason,
    task: buildTaskRealtimePayload(task),
    payload,
  });
}

function publishTaskDeleted({
  workspaceId,
  taskId,
  parentId = null,
  sniparaTaskId = null,
  swarmTaskId = null,
  reason = null,
  origin = 'server',
} = {}) {
  if (!workspaceId || !taskId) return false;
  return publishWorkspaceEvent(workspaceId, {
    type: 'task.deleted',
    entity: 'task',
    origin,
    reason,
    task: {
      id: taskId,
      parent_id: parentId,
      snipara_task_id: sniparaTaskId,
      swarm_task_id: swarmTaskId,
    },
  });
}

function publishRunEvent(run, {
  type = 'orchestration.run.updated',
  origin = 'orchestration',
  reason = null,
  payload = null,
} = {}) {
  if (!run?.workspace_id) return false;
  return publishWorkspaceEvent(run.workspace_id, {
    type,
    entity: 'orchestration_run',
    origin,
    reason,
    run: buildRunRealtimePayload(run),
    payload,
  });
}

module.exports = {
  buildRunRealtimePayload,
  buildTaskRealtimePayload,
  parseJsonLike,
  publishRunEvent,
  publishTaskDeleted,
  publishTaskEvent,
  publishWorkspaceEvent,
};
