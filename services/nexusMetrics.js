'use strict';

/**
 * Nexus Metrics Service
 * In-memory metrics collection for Nexus task execution.
 * No DB dependency — pure in-process counters with hourly buckets.
 *
 * Lifecycle:
 *  - recordTaskStart()  → called when a task is dispatched to an agent
 *  - recordTaskEnd()    → called when the agent reports completion/failure
 *  - getMetrics()       → workspace-level snapshot
 *  - getAgentMetrics()  → per-agent snapshot
 *  - resetMetrics()     → flush (workspace or global)
 */

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Top-level map: workspaceId → WorkspaceMetrics
 *
 * WorkspaceMetrics shape:
 * {
 *   totalTasks: number,
 *   successCount: number,
 *   failureCount: number,
 *   byAgent: Map<agentId, AgentBucket>,
 *   byTaskType: Map<taskType, TypeBucket>,
 *   hourlyBuckets: HourlyBucket[],   // last 24 h, sorted newest-last
 * }
 *
 * AgentBucket: { tasks, success, failures, totalDurationMs }
 * TypeBucket:  { count, totalDurationMs }           ← avgDuration computed on read
 * HourlyBucket: { hour: ISO-string, tasks, errors }
 */
const taskMetrics = new Map();

/**
 * In-flight tasks: taskId → { workspaceId, agentId, taskType, startedAt }
 * Cleaned up in recordTaskEnd().
 */
const inFlight = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get or create the workspace metrics bucket.
 * @param {string} workspaceId
 * @returns {object}
 */
function getOrCreateWorkspace(workspaceId) {
  if (!taskMetrics.has(workspaceId)) {
    taskMetrics.set(workspaceId, {
      totalTasks: 0,
      successCount: 0,
      failureCount: 0,
      byAgent: new Map(),
      byTaskType: new Map(),
      hourlyBuckets: [],
    });
  }
  return taskMetrics.get(workspaceId);
}

/**
 * Return the ISO-8601 hour string for the current UTC hour.
 * e.g. "2025-06-15T14:00:00.000Z"
 * @returns {string}
 */
function currentHourISO() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

/**
 * Upsert an entry in the hourlyBuckets array for the current hour.
 * @param {object[]} buckets  — mutated in place
 * @param {boolean}  isError
 */
function recordHourly(buckets, isError) {
  const hour = currentHourISO();
  let bucket = buckets.find(b => b.hour === hour);
  if (!bucket) {
    bucket = { hour, tasks: 0, errors: 0 };
    buckets.push(bucket);
  }
  bucket.tasks += 1;
  if (isError) bucket.errors += 1;
}

/**
 * Purge hourly buckets older than 24 hours.
 * @param {object[]} buckets — mutated in place
 */
function purgeStaleHourlyBuckets(buckets) {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  let i = 0;
  while (i < buckets.length) {
    if (new Date(buckets[i].hour).getTime() < cutoff) {
      buckets.splice(i, 1);
    } else {
      i++;
    }
  }
}

// ---------------------------------------------------------------------------
// Automatic cleanup — purge stale hourly buckets every hour
// ---------------------------------------------------------------------------

const _cleanupInterval = setInterval(() => {
  const now = Date.now();
  const cutoff = now - 24 * 60 * 60 * 1000;

  for (const ws of taskMetrics.values()) {
    purgeStaleHourlyBuckets(ws.hourlyBuckets);
  }

  console.log(`[NEXUS-METRICS] Hourly cleanup done — ${taskMetrics.size} workspace(s) tracked.`);
}, 60 * 60 * 1000); // every hour

// Allow the process to exit cleanly even if the interval is active
if (_cleanupInterval.unref) _cleanupInterval.unref();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record the start of a task.
 *
 * @param {string} workspaceId
 * @param {string} agentId     — UUID of the agent handling the task
 * @param {string} taskType    — e.g. 'feature', 'bug', 'deploy'
 * @param {string} taskId      — unique task identifier (used to correlate with recordTaskEnd)
 */
function recordTaskStart(workspaceId, agentId, taskType, taskId) {
  if (!workspaceId || !taskId) return;

  // Register in-flight entry for duration tracking
  inFlight.set(taskId, {
    workspaceId,
    agentId: agentId || 'unknown',
    taskType: (taskType || 'unknown').toLowerCase(),
    startedAt: Date.now(),
  });

  console.log(`[NEXUS-METRICS] taskStart workspace=${workspaceId} agent=${agentId} type=${taskType} task=${taskId}`);
}

/**
 * Record the end of a task and update all counters.
 *
 * @param {string}  taskId      — must match a prior recordTaskStart call
 * @param {boolean} success     — true = success, false = failure
 * @param {number}  [durationMs] — override duration (ms); computed from startedAt if omitted
 */
function recordTaskEnd(taskId, success, durationMs) {
  const flight = inFlight.get(taskId);
  if (!flight) {
    // Task was not started via recordTaskStart — ignore silently
    return;
  }

  inFlight.delete(taskId);

  const { workspaceId, agentId, taskType, startedAt } = flight;
  const duration = typeof durationMs === 'number' ? durationMs : Date.now() - startedAt;
  const isSuccess = Boolean(success);

  const ws = getOrCreateWorkspace(workspaceId);

  // Global counters
  ws.totalTasks += 1;
  if (isSuccess) ws.successCount += 1;
  else ws.failureCount += 1;

  // Per-agent bucket
  if (!ws.byAgent.has(agentId)) {
    ws.byAgent.set(agentId, { tasks: 0, success: 0, failures: 0, totalDurationMs: 0 });
  }
  const agentBucket = ws.byAgent.get(agentId);
  agentBucket.tasks += 1;
  if (isSuccess) agentBucket.success += 1;
  else agentBucket.failures += 1;
  agentBucket.totalDurationMs += duration;

  // Per-task-type bucket
  if (!ws.byTaskType.has(taskType)) {
    ws.byTaskType.set(taskType, { count: 0, totalDurationMs: 0 });
  }
  const typeBucket = ws.byTaskType.get(taskType);
  typeBucket.count += 1;
  typeBucket.totalDurationMs += duration;

  // Hourly bucket
  recordHourly(ws.hourlyBuckets, !isSuccess);

  console.log(
    `[NEXUS-METRICS] taskEnd workspace=${workspaceId} agent=${agentId} ` +
    `type=${taskType} task=${taskId} success=${isSuccess} duration=${duration}ms`
  );
}

/**
 * Return a serialisable snapshot of workspace-level metrics.
 *
 * @param {string} workspaceId
 * @returns {{
 *   workspaceId: string,
 *   totalTasks: number,
 *   successCount: number,
 *   failureCount: number,
 *   errorRate: number,
 *   byAgent: object[],
 *   byTaskType: object[],
 *   hourlyBuckets: object[],
 *   inFlightCount: number,
 *   snapshotAt: string,
 * }}
 */
function getMetrics(workspaceId) {
  const ws = taskMetrics.get(workspaceId);

  if (!ws) {
    return _emptySnapshot(workspaceId);
  }

  const byAgent = [];
  for (const [agentId, b] of ws.byAgent) {
    byAgent.push({
      agentId,
      tasks: b.tasks,
      success: b.success,
      failures: b.failures,
      errorRate: b.tasks > 0 ? +(b.failures / b.tasks).toFixed(4) : 0,
      avgDurationMs: b.tasks > 0 ? Math.round(b.totalDurationMs / b.tasks) : null,
      totalDurationMs: b.totalDurationMs,
    });
  }

  const byTaskType = [];
  for (const [taskType, b] of ws.byTaskType) {
    byTaskType.push({
      taskType,
      count: b.count,
      avgDurationMs: b.count > 0 ? Math.round(b.totalDurationMs / b.count) : null,
      totalDurationMs: b.totalDurationMs,
    });
  }

  // Sort hourly buckets chronologically (oldest → newest)
  const hourlyBuckets = [...ws.hourlyBuckets].sort((a, b) =>
    new Date(a.hour) - new Date(b.hour)
  );

  // Count in-flight tasks for this workspace
  let inFlightCount = 0;
  for (const f of inFlight.values()) {
    if (f.workspaceId === workspaceId) inFlightCount++;
  }

  return {
    workspaceId,
    totalTasks: ws.totalTasks,
    successCount: ws.successCount,
    failureCount: ws.failureCount,
    errorRate: ws.totalTasks > 0 ? +(ws.failureCount / ws.totalTasks).toFixed(4) : 0,
    byAgent,
    byTaskType,
    hourlyBuckets,
    inFlightCount,
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Return metrics for a single agent within a workspace.
 *
 * @param {string} workspaceId
 * @param {string} agentId
 * @returns {object|null}
 */
function getAgentMetrics(workspaceId, agentId) {
  const ws = taskMetrics.get(workspaceId);
  if (!ws) return null;

  const b = ws.byAgent.get(agentId);
  if (!b) return null;

  return {
    agentId,
    workspaceId,
    tasks: b.tasks,
    success: b.success,
    failures: b.failures,
    errorRate: b.tasks > 0 ? +(b.failures / b.tasks).toFixed(4) : 0,
    avgDurationMs: b.tasks > 0 ? Math.round(b.totalDurationMs / b.tasks) : null,
    totalDurationMs: b.totalDurationMs,
    snapshotAt: new Date().toISOString(),
  };
}

/**
 * Reset metrics.
 *
 * @param {string|null} [workspaceId] — pass null/undefined to flush ALL workspaces
 */
function resetMetrics(workspaceId) {
  if (workspaceId) {
    taskMetrics.delete(workspaceId);
    // Also remove in-flight tasks for this workspace
    for (const [taskId, f] of inFlight) {
      if (f.workspaceId === workspaceId) inFlight.delete(taskId);
    }
    console.log(`[NEXUS-METRICS] Reset metrics for workspace=${workspaceId}`);
  } else {
    taskMetrics.clear();
    inFlight.clear();
    console.log('[NEXUS-METRICS] Global metrics reset.');
  }
}

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

function _emptySnapshot(workspaceId) {
  return {
    workspaceId,
    totalTasks: 0,
    successCount: 0,
    failureCount: 0,
    errorRate: 0,
    byAgent: [],
    byTaskType: [],
    hourlyBuckets: [],
    inFlightCount: 0,
    snapshotAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  recordTaskStart,
  recordTaskEnd,
  getMetrics,
  getAgentMetrics,
  resetMetrics,
};
