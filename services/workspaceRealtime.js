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

function asFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
    description: task.description || null,
    priority: task.priority || null,
    parent_id: task.parent_id || null,
    assignee: task.assignee || null,
    assigned_agent: task.assigned_agent || null,
    due_date: task.due_date || null,
    subtask_count: asFiniteNumber(task.subtask_count),
    subtask_completed_count: asFiniteNumber(task.subtask_completed_count),
    snipara_task_id: task.snipara_task_id || null,
    swarm_task_id: task.swarm_task_id || null,
    source: task.source || null,
    updated_at: task.updated_at || null,
    execution_backend: metadata.execution_backend || null,
    orchestration_run_id: metadata.orchestration_run_id || metadata.orchestration_parent_run_id || null,
    orchestration_status: metadata.orchestration_status || null,
    blocker_type: metadata.orchestration_blocker_type || metadata.snipara_blocker_type || metadata.blocker_type || null,
    blocker_reason: metadata.orchestration_blocker_reason || metadata.snipara_blocker_reason || metadata.blocker_reason || null,
    last_resolution: metadata.orchestration_last_resolution || metadata.snipara_resolution || null,
    closure_ready: metadata.orchestration_closure_ready === true,
    closed_with_waiver: metadata.orchestration_closed_with_waiver === true,
    auto_closed_parent: metadata.orchestration_auto_closed_parent || metadata.snipara_auto_closed_parent || null,
    pending_approval_summary: metadata.pending_approval?.summary || null,
    phase_title: metadata.orchestration_phase_title || null,
    phase_index: metadata.orchestration_phase_index ?? null,
    phase_count: metadata.orchestration_phase_count ?? null,
    snipara_last_event: metadata.snipara_last_event || null,
    autonomy_recommendation_summary: metadata.orchestration_autonomy_recommendation_summary || null,
    autonomy_recurring_blocker: metadata.orchestration_autonomy_recurring_blocker || null,
    autonomy_escalation_recommended: metadata.orchestration_autonomy_escalation_recommended === true,
  };
}

function buildRunRealtimePayload(run = {}) {
  const error = parseJsonLike(run.error_json);
  const result = parseJsonLike(run.result_json);
  return {
    id: run.id || null,
    status: run.status || null,
    root_task_id: run.root_task_id || null,
    current_step_id: run.current_step_id || null,
    next_wake_at: run.next_wake_at || null,
    updated_at: run.updated_at || null,
    completed_at: run.completed_at || null,
    cancelled_at: run.cancelled_at || null,
    summary: run.summary || null,
    error_message: error.message || null,
    result_message: result.result || null,
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
