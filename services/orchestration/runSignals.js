'use strict';

const pool = require('../../lib/vaultbrix');
const {
  TERMINAL_RUN_STATUSES,
  appendRunEvent,
  getRunById,
  parseJsonLike,
  updateRun,
} = require('./runStore');

const TERMINAL_TASK_STATUSES = new Set([
  'completed',
  'done',
  'failed',
  'cancelled',
  'canceled',
  'blocked',
  'stalled',
  'timed_out',
  'timeout',
]);

function normalizeTaskStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function extractSignalRefs(task = {}) {
  const metadata = parseJsonLike(task.metadata);
  return {
    metadata,
    runId: metadata.orchestration_parent_run_id || null,
    stepId: metadata.orchestration_parent_step_id || null,
    rootTaskId: metadata.orchestration_root_task_id || null,
  };
}

async function signalRunFromTask(task, {
  reason = 'task_status_changed',
  eventType = null,
  force = false,
  triggerPoll = true,
} = {}) {
  if (!task || !task.id) {
    return { signaled: false, reason: 'missing_task' };
  }

  const status = normalizeTaskStatus(task.status);
  if (!force && !TERMINAL_TASK_STATUSES.has(status)) {
    return { signaled: false, reason: 'non_terminal_status', status };
  }

  const { metadata, runId, stepId, rootTaskId } = extractSignalRefs(task);
  if (!runId) {
    return { signaled: false, reason: 'not_orchestration_child', status };
  }

  const run = await getRunById(pool, runId);
  if (!run) {
    return { signaled: false, reason: 'run_not_found', runId, status };
  }

  if (TERMINAL_RUN_STATUSES.has(run.status)) {
    return { signaled: false, reason: 'run_already_terminal', runId, status };
  }

  const now = new Date();
  await updateRun(pool, runId, {
    nextWakeAt: now,
    lastProgressAt: now,
  });

  await appendRunEvent(pool, {
    runId,
    stepId: stepId || run.current_step_id || null,
    eventType: eventType || 'delegate.task_status_changed',
    actor: 'task-signal',
    payload: {
      task_id: task.id,
      task_status: status,
      reason,
      root_task_id: rootTaskId,
      source_task_status: task.status || null,
      source_task_metadata: {
        execution_backend: metadata.execution_backend || null,
        execution_mode: metadata.execution_mode || null,
        snipara_task_id: task.snipara_task_id || null,
        swarm_task_id: task.swarm_task_id || null,
      },
    },
  });

  if (triggerPoll) {
    try {
      const { getRunEngine } = require('./runEngine');
      const engine = getRunEngine();
      if (typeof engine.requestImmediatePoll === 'function') {
        engine.requestImmediatePoll();
      } else if (typeof engine.pollOnce === 'function') {
        engine.pollOnce().catch(() => {});
      }
    } catch (_) {}
  }

  return {
    signaled: true,
    runId,
    stepId,
    status,
    wakeAt: now,
  };
}

module.exports = {
  TERMINAL_TASK_STATUSES,
  extractSignalRefs,
  normalizeTaskStatus,
  signalRunFromTask,
};
