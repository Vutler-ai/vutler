'use strict';

const pool = require('../../lib/vaultbrix');
const { publishRunEvent } = require('../workspaceRealtime');

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

function humanizeMetricKey(value, fallback = 'Unknown') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
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

async function listRunEvents(db = pool, runId, { limit = 200 } = {}) {
  if (!runId) return [];
  const result = await db.query(
    `SELECT *
       FROM (
         SELECT *
           FROM ${SCHEMA}.orchestration_run_events
          WHERE run_id = $1
          ORDER BY created_at DESC
          LIMIT $2
       ) events
      ORDER BY created_at ASC`,
    [runId, limit]
  );
  return result.rows;
}

async function getAutonomyMetrics(db = pool, workspaceId, {
  windowDays = 14,
  runLimit = 300,
} = {}) {
  if (!workspaceId) {
    throw new Error('getAutonomyMetrics requires workspaceId.');
  }

  const safeWindowDays = Math.max(1, Math.min(Number(windowDays) || 14, 90));
  const safeRunLimit = Math.max(1, Math.min(Number(runLimit) || 300, 1000));

  const runsResult = await db.query(
    `SELECT id,
            status,
            requested_agent_id,
            requested_agent_username,
            display_agent_id,
            display_agent_username,
            created_at,
            updated_at
       FROM ${SCHEMA}.orchestration_runs
      WHERE workspace_id = $1
        AND created_at >= NOW() - ($2 * INTERVAL '1 day')
      ORDER BY created_at DESC
      LIMIT $3`,
    [workspaceId, safeWindowDays, safeRunLimit]
  );

  const runs = runsResult.rows || [];
  if (runs.length === 0) {
    return {
      workspace_id: workspaceId,
      window_days: safeWindowDays,
      updated_at: new Date().toISOString(),
      totals: {
        total_runs: 0,
        autonomy_limited_runs: 0,
        blocked_runs: 0,
        awaiting_approval_runs: 0,
        completed_runs: 0,
        failed_runs: 0,
        cancelled_runs: 0,
      },
      blocker_counts: [],
      suggestion_counts: [],
      run_status_counts: [],
      agent_breakdown: [],
    };
  }

  const runIds = runs.map((run) => run.id).filter(Boolean);
  const overlayEventsResult = await db.query(
    `SELECT run_id,
            payload,
            created_at
       FROM ${SCHEMA}.orchestration_run_events
      WHERE run_id = ANY($1::uuid[])
        AND event_type = 'overlay.resolved'
      ORDER BY created_at DESC`,
    [runIds]
  );

  const overlayByRun = new Map();
  for (const row of overlayEventsResult.rows || []) {
    const current = overlayByRun.get(row.run_id) || {
      providers: new Set(),
      toolCapabilities: new Set(),
      skills: new Set(),
      suggestions: new Set(),
      last_event_at: null,
    };
    const payload = parseJsonLike(row.payload);
    const blocked = parseJsonLike(payload.blocked_overlay);
    const providers = Array.isArray(blocked.providers) ? blocked.providers : [];
    const toolCapabilities = Array.isArray(blocked.toolCapabilities) ? blocked.toolCapabilities : [];
    const skills = Array.isArray(blocked.skills) ? blocked.skills : [];
    const suggestions = Array.isArray(payload.suggestions) ? payload.suggestions : [];

    for (const provider of providers) {
      const normalized = String(provider || '').trim();
      if (normalized) current.providers.add(normalized);
    }
    for (const toolCapability of toolCapabilities) {
      const normalized = String(toolCapability || '').trim();
      if (normalized) current.toolCapabilities.add(normalized);
    }
    for (const skill of skills) {
      const normalized = String(skill || '').trim();
      if (normalized) current.skills.add(normalized);
    }
    for (const suggestion of suggestions) {
      const normalized = String(suggestion || '').trim();
      if (normalized) current.suggestions.add(normalized);
    }

    current.last_event_at = row.created_at || current.last_event_at;
    overlayByRun.set(row.run_id, current);
  }

  const blockerCounts = new Map();
  const suggestionCounts = new Map();
  const statusCounts = new Map();
  const agentBreakdown = new Map();
  const totals = {
    total_runs: runs.length,
    autonomy_limited_runs: 0,
    blocked_runs: 0,
    awaiting_approval_runs: 0,
    completed_runs: 0,
    failed_runs: 0,
    cancelled_runs: 0,
  };

  function incrementCount(map, key, nextValue) {
    const current = map.get(key);
    if (current) {
      current.count += 1;
      return current;
    }
    map.set(key, { ...nextValue, count: 1 });
    return map.get(key);
  }

  for (const run of runs) {
    const status = String(run.status || '').trim() || 'unknown';
    const agentId = run.display_agent_id || run.requested_agent_id || null;
    const agentUsername = run.display_agent_username || run.requested_agent_username || 'Unassigned';
    const agentKey = `${agentId || 'none'}:${agentUsername}`;
    const overlay = overlayByRun.get(run.id) || {
      providers: new Set(),
      toolCapabilities: new Set(),
      skills: new Set(),
      suggestions: new Set(),
      last_event_at: null,
    };
    const hasBlockedOverlay = overlay.providers.size > 0
      || overlay.toolCapabilities.size > 0
      || overlay.skills.size > 0;

    incrementCount(statusCounts, status, {
      key: status,
      label: humanizeMetricKey(status),
    });

    if (hasBlockedOverlay) totals.autonomy_limited_runs += 1;
    if (status === 'blocked') totals.blocked_runs += 1;
    if (status === 'awaiting_approval') totals.awaiting_approval_runs += 1;
    if (status === 'completed') totals.completed_runs += 1;
    if (status === 'failed') totals.failed_runs += 1;
    if (status === 'cancelled') totals.cancelled_runs += 1;

    const agentEntry = agentBreakdown.get(agentKey) || {
      agent_id: agentId,
      agent_username: agentUsername,
      run_count: 0,
      autonomy_limited_runs: 0,
      blocked_runs: 0,
      awaiting_approval_runs: 0,
      completed_runs: 0,
      blocker_counts: new Map(),
      suggestion_counts: new Map(),
      updated_at: run.updated_at || run.created_at || null,
    };

    agentEntry.run_count += 1;
    if (hasBlockedOverlay) agentEntry.autonomy_limited_runs += 1;
    if (status === 'blocked') agentEntry.blocked_runs += 1;
    if (status === 'awaiting_approval') agentEntry.awaiting_approval_runs += 1;
    if (status === 'completed') agentEntry.completed_runs += 1;
    agentEntry.updated_at = run.updated_at || agentEntry.updated_at;

    for (const provider of overlay.providers) {
      incrementCount(blockerCounts, `provider:${provider}`, {
        kind: 'provider',
        key: provider,
        label: humanizeMetricKey(provider),
      });
      incrementCount(agentEntry.blocker_counts, `provider:${provider}`, {
        kind: 'provider',
        key: provider,
        label: humanizeMetricKey(provider),
      });
    }

    for (const toolCapability of overlay.toolCapabilities) {
      incrementCount(blockerCounts, `tool_capability:${toolCapability}`, {
        kind: 'tool_capability',
        key: toolCapability,
        label: humanizeMetricKey(toolCapability),
      });
      incrementCount(agentEntry.blocker_counts, `tool_capability:${toolCapability}`, {
        kind: 'tool_capability',
        key: toolCapability,
        label: humanizeMetricKey(toolCapability),
      });
    }

    for (const skill of overlay.skills) {
      incrementCount(blockerCounts, `skill:${skill}`, {
        kind: 'skill',
        key: skill,
        label: humanizeMetricKey(skill),
      });
      incrementCount(agentEntry.blocker_counts, `skill:${skill}`, {
        kind: 'skill',
        key: skill,
        label: humanizeMetricKey(skill),
      });
    }

    for (const suggestion of overlay.suggestions) {
      incrementCount(suggestionCounts, suggestion, {
        key: suggestion,
        label: suggestion,
      });
      incrementCount(agentEntry.suggestion_counts, suggestion, {
        key: suggestion,
        label: suggestion,
      });
    }

    agentBreakdown.set(agentKey, agentEntry);
  }

  const sortByCount = (left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    return String(left.label || left.key || '').localeCompare(String(right.label || right.key || ''));
  };

  return {
    workspace_id: workspaceId,
    window_days: safeWindowDays,
    updated_at: new Date().toISOString(),
    totals,
    blocker_counts: Array.from(blockerCounts.values()).sort(sortByCount).slice(0, 12),
    suggestion_counts: Array.from(suggestionCounts.values()).sort(sortByCount).slice(0, 8),
    run_status_counts: Array.from(statusCounts.values()).sort(sortByCount),
    agent_breakdown: Array.from(agentBreakdown.values())
      .map((entry) => ({
        agent_id: entry.agent_id,
        agent_username: entry.agent_username,
        run_count: entry.run_count,
        autonomy_limited_runs: entry.autonomy_limited_runs,
        blocked_runs: entry.blocked_runs,
        awaiting_approval_runs: entry.awaiting_approval_runs,
        completed_runs: entry.completed_runs,
        blocker_counts: Array.from(entry.blocker_counts.values()).sort(sortByCount).slice(0, 3),
        suggestion_counts: Array.from(entry.suggestion_counts.values()).sort(sortByCount).slice(0, 2),
        updated_at: entry.updated_at,
      }))
      .sort((left, right) => {
        if (right.autonomy_limited_runs !== left.autonomy_limited_runs) {
          return right.autonomy_limited_runs - left.autonomy_limited_runs;
        }
        if (right.run_count !== left.run_count) {
          return right.run_count - left.run_count;
        }
        return String(left.agent_username || '').localeCompare(String(right.agent_username || ''));
      })
      .slice(0, 8),
  };
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
  const run = result.rows[0] || null;
  if (run) {
    publishRunEvent(run, {
      reason: patch.status || 'run_updated',
      payload: {
        current_step_id: run.current_step_id || null,
      },
    });
  }
  return run;
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
  getAutonomyMetrics,
  claimQueuedRuns,
  claimRunnableRuns,
  createRunStep,
  ensureRunForTask,
  getCurrentRunStep,
  getLatestActiveRunForRootTask,
  getRunById,
  heartbeatRunLease,
  isMissingOrchestrationSchemaError,
  listRunEvents,
  listRunSteps,
  parseJsonLike,
  updateRun,
  updateRunStep,
};
