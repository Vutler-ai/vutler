'use strict';

const pool = require('../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const DEFAULT_LEASE_MS = 60_000;
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'cancelled', 'timed_out']);

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

function isMissingOrchestrationSchemaError(err) {
  const message = String(err?.message || '');
  return /orchestration_runs|orchestration_run_steps|orchestration_run_events/i.test(message);
}

function normalizeActor(value, fallback = 'jarvis') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

async function runInTransaction(db, work) {
  await db.query('BEGIN');
  try {
    const result = await work();
    await db.query('COMMIT');
    return result;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function getRunById(db = pool, runId) {
  if (!runId) return null;
  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.orchestration_runs
      WHERE id = $1
      LIMIT 1`,
    [runId]
  );
  return result.rows[0] || null;
}

async function getLatestActiveRunForRootTask(db = pool, workspaceId, rootTaskId) {
  if (!workspaceId || !rootTaskId) return null;
  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.orchestration_runs
      WHERE workspace_id = $1
        AND root_task_id = $2
        AND status NOT IN ('completed', 'failed', 'cancelled', 'timed_out')
      ORDER BY created_at DESC
      LIMIT 1`,
    [workspaceId, rootTaskId]
  );
  return result.rows[0] || null;
}

async function listRunSteps(db = pool, runId) {
  if (!runId) return [];
  const result = await db.query(
    `SELECT *
       FROM ${SCHEMA}.orchestration_run_steps
      WHERE run_id = $1
      ORDER BY sequence_no ASC, created_at ASC`,
    [runId]
  );
  return result.rows;
}

async function getCurrentRunStep(db = pool, runId) {
  if (!runId) return null;
  const result = await db.query(
    `SELECT s.*
       FROM ${SCHEMA}.orchestration_runs r
       JOIN ${SCHEMA}.orchestration_run_steps s
         ON s.id = r.current_step_id
      WHERE r.id = $1
      LIMIT 1`,
    [runId]
  );
  return result.rows[0] || null;
}

async function appendRunEvent(db = pool, {
  runId,
  stepId = null,
  eventType,
  actor = 'jarvis',
  payload = {},
} = {}) {
  if (!runId || !eventType) {
    throw new Error('Run events require runId and eventType.');
  }

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.orchestration_run_events
       (run_id, step_id, event_type, actor, payload)
     VALUES ($1, $2, $3, $4, $5::jsonb)
     RETURNING *`,
    [runId, stepId, eventType, normalizeActor(actor), JSON.stringify(payload || {})]
  );
  return result.rows[0] || null;
}

async function createRunStep(db = pool, {
  runId,
  parentStepId = null,
  sequenceNo,
  stepType,
  title,
  status = 'queued',
  executor = 'orchestrator',
  selectedAgentId = null,
  selectedAgentUsername = null,
  spawnedTaskId = null,
  toolName = null,
  skillKey = null,
  policyBundle = null,
  approvalMode = null,
  retryCount = 0,
  input = {},
  output = null,
  error = null,
  wait = null,
} = {}) {
  if (!runId || !sequenceNo || !stepType || !title || !executor) {
    throw new Error('Run steps require runId, sequenceNo, stepType, title, and executor.');
  }

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.orchestration_run_steps
       (run_id, parent_step_id, sequence_no, step_type, title, status, executor,
        selected_agent_id, selected_agent_username, spawned_task_id, tool_name,
        skill_key, policy_bundle, approval_mode, retry_count, input_json, output_json,
        error_json, wait_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
             $8, $9, $10, $11,
             $12, $13, $14, $15, $16::jsonb, $17::jsonb,
             $18::jsonb, $19::jsonb)
     RETURNING *`,
    [
      runId,
      parentStepId,
      sequenceNo,
      stepType,
      title,
      status,
      executor,
      selectedAgentId,
      selectedAgentUsername,
      spawnedTaskId,
      toolName,
      skillKey,
      policyBundle,
      approvalMode,
      retryCount,
      JSON.stringify(input || {}),
      output === undefined ? null : JSON.stringify(output),
      error === undefined ? null : JSON.stringify(error),
      wait === undefined ? null : JSON.stringify(wait),
    ]
  );

  return result.rows[0] || null;
}

async function updateRun(db = pool, runId, patch = {}) {
  if (!runId) throw new Error('updateRun requires runId.');

  const updates = [];
  const params = [];
  let idx = 1;

  const assign = (column, value, serializer = (entry) => entry) => {
    if (value === undefined) return;
    updates.push(`${column} = $${idx++}`);
    params.push(serializer(value));
  };

  assign('status', patch.status);
  assign('mode', patch.mode);
  assign('current_step_id', patch.currentStepId);
  assign('lock_token', patch.lockToken);
  assign('locked_by', patch.lockedBy);
  assign('locked_at', patch.lockedAt);
  assign('lease_expires_at', patch.leaseExpiresAt);
  assign('next_wake_at', patch.nextWakeAt);
  assign('last_progress_at', patch.lastProgressAt);
  assign('summary', patch.summary);
  assign('plan_json', patch.plan, (value) => JSON.stringify(value || {}));
  assign('context_json', patch.context, (value) => JSON.stringify(value || {}));
  assign('result_json', patch.result, (value) => JSON.stringify(value));
  assign('error_json', patch.error, (value) => JSON.stringify(value));
  assign('started_at', patch.startedAt);
  assign('completed_at', patch.completedAt);
  assign('cancelled_at', patch.cancelledAt);
  updates.push('updated_at = NOW()');

  params.push(runId);
  const result = await db.query(
    `UPDATE ${SCHEMA}.orchestration_runs
        SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function updateRunStep(db = pool, stepId, patch = {}) {
  if (!stepId) throw new Error('updateRunStep requires stepId.');

  const updates = [];
  const params = [];
  let idx = 1;

  const assign = (column, value, serializer = (entry) => entry) => {
    if (value === undefined) return;
    updates.push(`${column} = $${idx++}`);
    params.push(serializer(value));
  };

  assign('status', patch.status);
  assign('title', patch.title);
  assign('executor', patch.executor);
  assign('selected_agent_id', patch.selectedAgentId);
  assign('selected_agent_username', patch.selectedAgentUsername);
  assign('spawned_task_id', patch.spawnedTaskId);
  assign('tool_name', patch.toolName);
  assign('skill_key', patch.skillKey);
  assign('policy_bundle', patch.policyBundle);
  assign('approval_mode', patch.approvalMode);
  assign('retry_count', patch.retryCount);
  assign('input_json', patch.input, (value) => JSON.stringify(value || {}));
  assign('output_json', patch.output, (value) => JSON.stringify(value));
  assign('error_json', patch.error, (value) => JSON.stringify(value));
  assign('wait_json', patch.wait, (value) => JSON.stringify(value));
  assign('started_at', patch.startedAt);
  assign('completed_at', patch.completedAt);
  updates.push('updated_at = NOW()');

  params.push(stepId);
  const result = await db.query(
    `UPDATE ${SCHEMA}.orchestration_run_steps
        SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function claimQueuedRuns(db = pool, workerId, { limit = 1, leaseMs = DEFAULT_LEASE_MS } = {}) {
  if (!workerId) throw new Error('claimQueuedRuns requires workerId.');

  const result = await db.query(
    `WITH candidate AS (
       SELECT id
         FROM ${SCHEMA}.orchestration_runs
        WHERE status = 'queued'
          AND (next_wake_at IS NULL OR next_wake_at <= NOW())
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE ${SCHEMA}.orchestration_runs r
        SET status = 'running',
            lock_token = gen_random_uuid(),
            locked_by = $2,
            locked_at = NOW(),
            lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
            started_at = COALESCE(started_at, NOW()),
            last_progress_at = NOW(),
            updated_at = NOW()
       FROM candidate
      WHERE r.id = candidate.id
      RETURNING r.*`,
    [limit, workerId, leaseMs]
  );
  return result.rows;
}

async function claimRunnableRuns(db = pool, workerId, { limit = 1, leaseMs = DEFAULT_LEASE_MS } = {}) {
  if (!workerId) throw new Error('claimRunnableRuns requires workerId.');

  const result = await db.query(
    `WITH candidate AS (
       SELECT id
         FROM ${SCHEMA}.orchestration_runs
        WHERE status = 'queued'
           OR (
                status IN ('planning', 'running')
            AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
           )
           OR (
                status IN ('waiting_on_tasks', 'sleeping')
            AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
            AND (next_wake_at IS NULL OR next_wake_at <= NOW())
           )
           OR (
                status = 'blocked'
            AND (lease_expires_at IS NULL OR lease_expires_at <= NOW())
            AND next_wake_at IS NOT NULL
            AND next_wake_at <= NOW()
           )
        ORDER BY COALESCE(next_wake_at, created_at) ASC, created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE ${SCHEMA}.orchestration_runs r
        SET status = CASE WHEN r.status = 'queued' THEN 'planning' ELSE r.status END,
            lock_token = gen_random_uuid(),
            locked_by = $2,
            locked_at = NOW(),
            lease_expires_at = NOW() + ($3 * INTERVAL '1 millisecond'),
            started_at = COALESCE(started_at, NOW()),
            last_progress_at = NOW(),
            updated_at = NOW()
       FROM candidate
      WHERE r.id = candidate.id
      RETURNING r.*`,
    [limit, workerId, leaseMs]
  );
  return result.rows;
}

async function heartbeatRunLease(db = pool, runId, { lockToken, workerId, leaseMs = DEFAULT_LEASE_MS } = {}) {
  if (!runId || !lockToken || !workerId) {
    throw new Error('heartbeatRunLease requires runId, lockToken, and workerId.');
  }

  const result = await db.query(
    `UPDATE ${SCHEMA}.orchestration_runs
        SET lease_expires_at = NOW() + ($4 * INTERVAL '1 millisecond'),
            last_progress_at = NOW(),
            updated_at = NOW()
      WHERE id = $1
        AND lock_token = $2
        AND locked_by = $3
      RETURNING *`,
    [runId, lockToken, workerId, leaseMs]
  );

  return result.rows[0] || null;
}

async function ensureRunForTask({
  db = pool,
  workspaceId,
  task,
  requestedAgent = null,
  displayAgent = null,
  orchestratedBy = 'jarvis',
  coordinatorAgent = null,
  mode = 'autonomous',
  summary = null,
  plan = {},
  context = {},
} = {}) {
  if (!workspaceId || !task?.id) {
    throw new Error('ensureRunForTask requires workspaceId and task.id.');
  }

  const metadata = parseJsonLike(task.metadata);
  const explicitRunId = typeof metadata.orchestration_run_id === 'string' ? metadata.orchestration_run_id : null;
  let existingRun = explicitRunId ? await getRunById(db, explicitRunId) : null;

  if (!existingRun) {
    existingRun = await getLatestActiveRunForRootTask(db, workspaceId, task.id);
  }

  if (existingRun && !TERMINAL_RUN_STATUSES.has(existingRun.status)) {
    const currentStep = await getCurrentRunStep(db, existingRun.id);
    return {
      created: false,
      run: existingRun,
      step: currentStep,
    };
  }

  return runInTransaction(db, async () => {
    const normalizedActor = normalizeActor(orchestratedBy);
    const requested = requestedAgent || {};
    const display = displayAgent || requested;
    const coordinator = coordinatorAgent || {};
    const source = String(metadata.origin || 'task').trim() || 'task';
    const sourceRef = {
      task_id: task.id,
      source,
      ...(task.snipara_task_id ? { snipara_task_id: task.snipara_task_id } : {}),
      ...(task.swarm_task_id ? { swarm_task_id: task.swarm_task_id } : {}),
      ...(metadata.origin_chat_channel_id ? { origin_chat_channel_id: metadata.origin_chat_channel_id } : {}),
      ...(metadata.origin_chat_message_id ? { origin_chat_message_id: metadata.origin_chat_message_id } : {}),
    };
    const runResult = await db.query(
      `INSERT INTO ${SCHEMA}.orchestration_runs
         (workspace_id, source, source_ref, status, mode,
          requested_agent_id, requested_agent_username,
          display_agent_id, display_agent_username,
          orchestrated_by, coordinator_agent_id, coordinator_agent_username,
          root_task_id, summary, plan_json, context_json)
       VALUES ($1, $2, $3::jsonb, 'queued', $4,
               $5, $6,
               $7, $8,
               $9, $10, $11,
               $12, $13, $14::jsonb, $15::jsonb)
       RETURNING *`,
      [
        workspaceId,
        source,
        JSON.stringify(sourceRef),
        mode,
        requested.id || null,
        requested.username || null,
        display.id || requested.id || null,
        display.username || requested.username || null,
        normalizedActor,
        coordinator.id || null,
        coordinator.username || null,
        task.id,
        summary,
        JSON.stringify(plan || {}),
        JSON.stringify(context || {}),
      ]
    );
    const run = runResult.rows[0];
    const step = await createRunStep(db, {
      runId: run.id,
      sequenceNo: 1,
      stepType: 'plan',
      title: 'Plan orchestration run',
      status: 'queued',
      executor: 'orchestrator',
      selectedAgentId: requested.id || null,
      selectedAgentUsername: requested.username || null,
      input: {
        task_id: task.id,
        task_title: task.title || '',
        workflow_mode: metadata.workflow_mode || null,
      },
    });
    const updatedRun = await updateRun(db, run.id, {
      currentStepId: step.id,
    });
    await appendRunEvent(db, {
      runId: run.id,
      stepId: step.id,
      eventType: 'run.created',
      actor: normalizedActor,
      payload: {
        root_task_id: task.id,
        requested_agent_username: requested.username || null,
        workflow_mode: metadata.workflow_mode || null,
      },
    });
    await appendRunEvent(db, {
      runId: run.id,
      stepId: step.id,
      eventType: 'step.queued',
      actor: normalizedActor,
      payload: {
        sequence_no: 1,
        step_type: 'plan',
        title: 'Plan orchestration run',
      },
    });

    return {
      created: true,
      run: updatedRun || { ...run, current_step_id: step.id },
      step,
    };
  });
}

module.exports = {
  DEFAULT_LEASE_MS,
  TERMINAL_RUN_STATUSES,
  appendRunEvent,
  claimQueuedRuns,
  claimRunnableRuns,
  createRunStep,
  ensureRunForTask,
  getCurrentRunStep,
  getLatestActiveRunForRootTask,
  getRunById,
  heartbeatRunLease,
  isMissingOrchestrationSchemaError,
  listRunSteps,
  parseJsonLike,
  updateRun,
  updateRunStep,
};
