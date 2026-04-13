'use strict';

const pool = require('../../lib/vaultbrix');
const { publishTaskEvent, parseJsonLike } = require('../workspaceRealtime');
const { ensureRunForTask } = require('./runStore');

const SCHEMA = 'tenant_vutler';

function resolveTaskWorkspaceId(task, workspaceId) {
  const value = typeof workspaceId === 'string' && workspaceId.trim()
    ? workspaceId.trim()
    : (typeof task?.workspace_id === 'string' && task.workspace_id.trim() ? task.workspace_id.trim() : task?.workspace_id);
  if (value) return value;
  throw new Error('workspaceId is required to bootstrap an orchestration run.');
}

function mergeTaskMetadata(task, patch = {}, {
  runSeed,
  requestedAgent = null,
  displayAgent = null,
  orchestratedBy = 'jarvis',
  workflowMode = null,
} = {}) {
  const metadata = parseJsonLike(task?.metadata);
  return {
    ...metadata,
    ...patch,
    execution_backend: patch.execution_backend || metadata.execution_backend || 'orchestration_run',
    execution_mode: patch.execution_mode || metadata.execution_mode || 'autonomous',
    workflow_mode: workflowMode || patch.workflow_mode || metadata.workflow_mode || null,
    orchestration_run_id: runSeed?.run?.id || metadata.orchestration_run_id || null,
    orchestration_step_id: runSeed?.step?.id || metadata.orchestration_step_id || null,
    orchestration_status: runSeed?.run?.status || metadata.orchestration_status || 'queued',
    orchestrated_by: runSeed?.run?.orchestrated_by || metadata.orchestrated_by || orchestratedBy,
    requested_agent_id: requestedAgent?.id || metadata.requested_agent_id || null,
    display_agent_id: displayAgent?.id || requestedAgent?.id || metadata.display_agent_id || null,
  };
}

async function persistTaskProjection(db, task, {
  status = 'in_progress',
  metadata = {},
} = {}) {
  const updates = ['updated_at = NOW()'];
  const params = [];
  let idx = 1;

  if (status !== undefined && status !== null) {
    updates.unshift(`status = $${idx++}`);
    params.push(status);
  }

  updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${idx++}::jsonb`);
  params.push(JSON.stringify(metadata || {}));

  params.push(task.id);

  const result = await db.query(
    `UPDATE ${SCHEMA}.tasks
        SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *`,
    params
  );

  const updatedTask = result.rows[0] || null;
  if (updatedTask) {
    publishTaskEvent(updatedTask, {
      type: 'task.updated',
      origin: 'orchestration-bootstrap',
      reason: metadata.orchestration_run_id ? 'orchestration_run_seeded' : 'orchestration_projection_updated',
    });
  }
  return updatedTask;
}

async function bootstrapTaskRun({
  db = pool,
  task,
  workspaceId,
  requestedAgent = null,
  displayAgent = null,
  orchestratedBy = 'jarvis',
  coordinatorAgent = null,
  mode = 'autonomous',
  summary = null,
  plan = {},
  context = {},
  taskStatus = 'in_progress',
  taskMetadataPatch = {},
} = {}) {
  const resolvedWorkspaceId = resolveTaskWorkspaceId(task, workspaceId);
  if (!task?.id) {
    throw new Error('bootstrapTaskRun requires a persisted task.');
  }

  const runSeed = await ensureRunForTask({
    db,
    workspaceId: resolvedWorkspaceId,
    task,
    requestedAgent,
    displayAgent,
    orchestratedBy,
    coordinatorAgent,
    mode,
    summary,
    plan,
    context,
  });

  const mergedMetadata = mergeTaskMetadata(task, taskMetadataPatch, {
    runSeed,
    requestedAgent,
    displayAgent,
    orchestratedBy,
    workflowMode: taskMetadataPatch.workflow_mode,
  });

  const updatedTask = await persistTaskProjection(db, task, {
    status: taskStatus,
    metadata: mergedMetadata,
  });

  return {
    ...runSeed,
    task: updatedTask || task,
  };
}

module.exports = {
  bootstrapTaskRun,
  mergeTaskMetadata,
  persistTaskProjection,
  resolveTaskWorkspaceId,
};
