'use strict';

/**
 * Agent Watchdog — Detects stalled tasks and takes corrective action.
 *
 * Runs on an interval, checks for tasks stuck in 'in_progress',
 * nudges agents via chat, and re-dispatches if unresponsive.
 */

const { pool } = require('../lib/postgres');
const {
  appendRunEventForTask,
  signalRunFromTask,
  wakeRunFromTask,
} = require('./orchestration/runSignals');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

const CHECK_INTERVAL = Number(process.env.WATCHDOG_INTERVAL_MS) || 60_000;
const STALL_THRESHOLD = Number(process.env.WATCHDOG_STALL_THRESHOLD_MS) || 600_000; // 10 min
const VISIBLE_ROOT_FOLLOW_UP_MS = Number(process.env.WATCHDOG_VISIBLE_ROOT_FOLLOW_UP_MS) || 900_000; // 15 min
const MAX_NUDGES = 3;

function resolveTaskWorkspaceId(task) {
  const value = typeof task?.workspace_id === 'string' ? task.workspace_id.trim() : task?.workspace_id;
  if (value) return value;
  throw new Error('workspace_id is required for watchdog task operations');
}

function normalizeTimeoutReason(reason) {
  const normalized = String(reason || '').trim().toLowerCase();
  return normalized || 'execution_timeout';
}

function determineTimeoutHandling(reason) {
  switch (normalizeTimeoutReason(reason)) {
    case 'never_claimed':
    case 'unclaimed':
      return 'alert';
    case 'htask_stalled':
      return 'escalate';
    case 'execution_timeout':
    default:
      return 'redispatch';
  }
}

function formatTimeoutAge(stalledForSeconds) {
  if (!Number.isFinite(Number(stalledForSeconds)) || Number(stalledForSeconds) <= 0) {
    return 'an unknown duration';
  }
  return `${Math.round(Number(stalledForSeconds))}s`;
}

function buildTimeoutSystemMessage(task, data, handling) {
  const reason = normalizeTimeoutReason(data?.reason);
  const age = formatTimeoutAge(data?.stalled_for_seconds);
  const taskLabel = task?.title || task?.id || data?.task_id || 'unknown task';

  if (handling === 'escalate') {
    return `🚨 Task "${taskLabel}" stalled in Snipara (${reason}) for ${age}. Escalating to orchestration follow-up.`;
  }

  if (handling === 'alert') {
    const owner = data?.agent_id || data?.owner || task?.assigned_agent || 'unassigned';
    return `🚨 Task "${taskLabel}" timed out in Snipara (${reason}) after ${age}. Owner: ${owner}. Manual attention required.`;
  }

  return `⏱ Task "${taskLabel}" hit Snipara timeout (${reason}) after ${age}. Re-dispatching automatically.`;
}

class AgentWatchdog {
  constructor(options = {}) {
    this.checkIntervalMs = options.checkIntervalMs || CHECK_INTERVAL;
    this.stallThresholdMs = options.stallThresholdMs || STALL_THRESHOLD;
    this.visibleRootFollowUpMs = options.visibleRootFollowUpMs || VISIBLE_ROOT_FOLLOW_UP_MS;
    this.maxNudges = options.maxNudges || MAX_NUDGES;
    this._timer = null;
    this._nudgeCounts = new Map(); // taskId -> count
  }

  start() {
    if (this._timer) return;
    console.log(`[Watchdog] Started (interval: ${this.checkIntervalMs}ms, stall threshold: ${this.stallThresholdMs}ms)`);
    this._timer = setInterval(() => this.tick().catch(err => {
      console.error('[Watchdog] tick error:', err.message);
    }), this.checkIntervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      console.log('[Watchdog] Stopped');
    }
  }

  /**
   * Main check loop — find and handle stalled tasks.
   */
  async tick() {
    const cutoff = new Date(Date.now() - this.stallThresholdMs).toISOString();
    const handledTaskIds = new Set();

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks
       WHERE status = 'in_progress'
         AND updated_at < $1
       ORDER BY updated_at ASC
       LIMIT 20`,
      [cutoff]
    );

    if (!result.rows.length) return;

    console.log(`[Watchdog] Found ${result.rows.length} stalled task(s)`);

    for (const task of result.rows) {
      // FULL mode tasks get more time before being considered stalled
      const meta = this._parseMetadata(task);
      if (meta.workflow_mode === 'FULL') {
        const fullThreshold = this.stallThresholdMs * 3; // 30 min for FULL vs 10 min for LITE
        const elapsed = Date.now() - new Date(task.updated_at).getTime();
        if (elapsed < fullThreshold) continue;
      }

      const nudgeCount = this._nudgeCounts.get(task.id) || 0;

      if (nudgeCount < this.maxNudges) {
        await this._nudgeAgent(task, nudgeCount + 1);
        this._nudgeCounts.set(task.id, nudgeCount + 1);
      } else {
        await this._redispatch(task);
        this._nudgeCounts.delete(task.id);
      }
      handledTaskIds.add(task.id);
    }

    await this._followUpVisibleRoots(handledTaskIds);
  }

  _parseMetadata(task) {
    if (!task?.metadata) return {};
    if (typeof task.metadata === 'string') {
      try {
        return JSON.parse(task.metadata || '{}');
      } catch (_) {
        return {};
      }
    }
    return task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  }

  _isOrchestrationChildTask(task) {
    const meta = this._parseMetadata(task);
    return Boolean(meta.orchestration_parent_run_id);
  }

  _isOrchestrationRootTask(task) {
    const meta = this._parseMetadata(task);
    return Boolean(meta.orchestration_run_id && meta.execution_backend === 'orchestration_run');
  }

  _isVisibleRootTask(task) {
    const meta = this._parseMetadata(task);
    return meta.visible_in_kanban === true
      || (!task?.parent_id && String(meta.snipara_hierarchy_level || '').toUpperCase() === 'N0')
      || (!task?.parent_id && !meta.snipara_hierarchy_level);
  }

  _shouldFollowUpVisibleRoot(task, nowMs = Date.now()) {
    if (!this._isVisibleRootTask(task)) return false;
    const meta = this._parseMetadata(task);
    const lastFollowUp = meta.watchdog_last_root_follow_up_at || null;
    if (!lastFollowUp) return true;

    const timestamp = new Date(lastFollowUp).getTime();
    if (!Number.isFinite(timestamp)) return true;
    return (nowMs - timestamp) >= this.visibleRootFollowUpMs;
  }

  async _followUpVisibleRoots(handledTaskIds = new Set()) {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks
       WHERE status IN ('pending', 'in_progress', 'blocked')
         AND (parent_id IS NULL OR COALESCE(metadata->>'visible_in_kanban', 'false') = 'true')
       ORDER BY updated_at ASC
       LIMIT 20`
    );

    const nowMs = Date.now();
    for (const task of result.rows) {
      if (handledTaskIds.has(task.id)) continue;
      if (!this._shouldFollowUpVisibleRoot(task, nowMs)) continue;
      await this._followUpVisibleRoot(task);
    }
  }

  async _followUpVisibleRoot(task) {
    const meta = this._parseMetadata(task);
    const nextMetadata = {
      ...meta,
      watchdog_last_root_follow_up_at: new Date().toISOString(),
      watchdog_root_follow_up_interval_ms: this.visibleRootFollowUpMs,
    };

    await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [task.id, JSON.stringify(nextMetadata)]
    );

    const nextTask = {
      ...task,
      metadata: nextMetadata,
    };

    await appendRunEventForTask(nextTask, {
      eventType: 'watchdog.visible_root_followup',
      actor: 'watchdog',
      payload: {
        follow_up_interval_ms: this.visibleRootFollowUpMs,
      },
    }).catch(() => {});

    if (this._isOrchestrationRootTask(nextTask)) {
      await wakeRunFromTask(nextTask, {
        reason: 'watchdog_visible_root_followup',
        eventType: 'run.watchdog_visible_root_followup',
        actor: 'watchdog',
        extraPayload: {
          follow_up_interval_ms: this.visibleRootFollowUpMs,
          task_kind: 'visible_root',
        },
      }).catch(() => {});
      return;
    }

    if (nextTask.assigned_agent) {
      const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
      const coordinator = getSwarmCoordinator();
      const workspaceId = resolveTaskWorkspaceId(nextTask);

      try {
        await coordinator.postTaskMessageToAgentChannel(
          workspaceId,
          nextTask.assigned_agent,
          nextTask.title,
          nextTask.priority || 'medium',
          `📋 Follow-up: "${nextTask.title}" is still open. Please update the task or continue execution.`,
        );
      } catch (err) {
        console.warn(`[Watchdog] Follow-up failed for task ${nextTask.id}:`, err.message);
      }
    }
  }

  /**
   * Handle task.timeout event from Snipara webhook.
   */
  async handleTimeout(data) {
    const { task_id } = data;
    console.log(`[Watchdog] Task timeout received for ${task_id}`);

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = result.rows[0];
    if (!task) return;
    const reason = normalizeTimeoutReason(data?.reason);
    const handling = determineTimeoutHandling(reason);
    const meta = this._parseMetadata(task);
    const nextMetadata = {
      ...meta,
      snipara_last_event: 'task.timeout',
      snipara_timeout_reason: reason,
      snipara_timeout_stalled_for_seconds: Number.isFinite(Number(data?.stalled_for_seconds))
        ? Number(data.stalled_for_seconds)
        : null,
      watchdog_last_timeout_at: new Date().toISOString(),
      watchdog_timeout_handling: handling,
    };

    const updateQuery = handling === 'redispatch'
      ? `UPDATE ${SCHEMA}.tasks
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`
      : `UPDATE ${SCHEMA}.tasks
         SET status = 'blocked',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`;
    await pool.query(updateQuery, [task.id, JSON.stringify(nextMetadata)]);

    const timedOutTask = {
      ...task,
      status: handling === 'redispatch' ? task.status : 'blocked',
      metadata: nextMetadata,
    };
    const workspaceId = resolveTaskWorkspaceId(timedOutTask);
    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const channelId = await coordinator.getTeamChannelId(workspaceId);
    await coordinator.postSystemMessage(
      workspaceId,
      channelId,
      'Watchdog',
      buildTimeoutSystemMessage(timedOutTask, data, handling),
      'watchdog',
    );

    if (handling === 'redispatch') {
      await this._redispatch(timedOutTask);
      return;
    }

    const eventType = handling === 'escalate'
      ? 'watchdog.task_timeout_escalated'
      : 'watchdog.task_timeout_alert';
    const delegateEventType = handling === 'escalate'
      ? 'delegate.task_timeout_escalated'
      : 'delegate.task_timeout_alert';
    const wakeReason = handling === 'escalate'
      ? 'watchdog_timeout_escalation'
      : 'watchdog_timeout_alert';

    await appendRunEventForTask(timedOutTask, {
      eventType,
      actor: 'watchdog',
      payload: {
        timeout_reason: reason,
        stalled_for_seconds: nextMetadata.snipara_timeout_stalled_for_seconds,
        timeout_handling: handling,
        agent_id: data?.agent_id || null,
      },
    }).catch(() => {});

    await wakeRunFromTask(timedOutTask, {
      reason: wakeReason,
      eventType: delegateEventType,
      actor: 'watchdog',
      extraPayload: {
        timeout_reason: reason,
        stalled_for_seconds: nextMetadata.snipara_timeout_stalled_for_seconds,
        timeout_handling: handling,
        agent_id: data?.agent_id || null,
      },
    }).catch(() => {});
  }

  /**
   * Handle task.failed event from Snipara webhook.
   */
  async handleTaskFailed(data) {
    const { task_id, agent_id } = data;
    console.log(`[Watchdog] Task failed: ${task_id} by agent ${agent_id}`);

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = result.rows[0] || null;
    if (!task) return;
    const workspaceId = resolveTaskWorkspaceId(task);

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const channelId = await coordinator.getTeamChannelId(workspaceId);
    await coordinator.postSystemMessage(
      workspaceId,
      channelId,
      'Watchdog',
      `❌ Task ${task_id} failed (agent: ${agent_id}). Investigating...`,
      'watchdog',
    );
  }

  /**
   * Handle htask.blocked or task.blocked event from Snipara webhook.
   */
  async handleBlocked(data) {
    const { task_id, owner, blocker_type, blocker_reason } = data;
    console.log(`[Watchdog] Task blocked: ${task_id} (${blocker_type}: ${blocker_reason})`);

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = result.rows[0] || null;
    if (!task) return;
    const workspaceId = resolveTaskWorkspaceId(task);

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const channelId = await coordinator.getTeamChannelId(workspaceId);
    await coordinator.postSystemMessage(
      workspaceId,
      channelId,
      'Watchdog',
      `🚧 Task blocked: "${blocker_reason}" (type: ${blocker_type}, owner: ${owner || 'unassigned'}). Needs attention.`,
      'watchdog',
    );

    if (!task) return;

    const meta = this._parseMetadata(task);
    const nextMetadata = {
      ...meta,
      snipara_blocker_type: blocker_type || meta.snipara_blocker_type || null,
      snipara_blocker_reason: blocker_reason || meta.snipara_blocker_reason || null,
      snipara_last_event: meta.snipara_last_event || 'task.blocked',
      watchdog_last_blocked_at: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = 'blocked',
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [task.id, JSON.stringify(nextMetadata)]
    );

    const blockedTask = {
      ...task,
      status: 'blocked',
      metadata: nextMetadata,
    };

    await appendRunEventForTask(blockedTask, {
      eventType: 'watchdog.task_blocked',
      actor: 'watchdog',
      payload: {
        blocker_type,
        blocker_reason,
        owner: owner || null,
      },
    }).catch(() => {});

    await wakeRunFromTask(blockedTask, {
      reason: 'watchdog_blocked_event',
      eventType: 'delegate.task_blocked',
      actor: 'watchdog',
      extraPayload: {
        blocker_type,
        blocker_reason,
        owner: owner || null,
      },
    }).catch(() => {});
  }

  async handleUnblocked(data) {
    const { task_id, resolution } = data;
    console.log(`[Watchdog] Task unblocked: ${task_id}`);

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = result.rows[0] || null;
    if (!task) return;

    const meta = this._parseMetadata(task);
    const nextMetadata = {
      ...meta,
      snipara_last_event: meta.snipara_last_event || 'task.unblocked',
      snipara_resolution: resolution || meta.snipara_resolution || null,
      snipara_blocker_type: null,
      snipara_blocker_reason: null,
      watchdog_last_unblocked_at: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = 'in_progress',
           metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [task.id, JSON.stringify(nextMetadata)]
    );

    const resumedTask = {
      ...task,
      status: 'in_progress',
      metadata: nextMetadata,
    };

    await appendRunEventForTask(resumedTask, {
      eventType: 'watchdog.task_unblocked',
      actor: 'watchdog',
      payload: {
        resolution: resolution || null,
      },
    }).catch(() => {});

    await wakeRunFromTask(resumedTask, {
      reason: 'watchdog_unblocked_event',
      eventType: 'delegate.task_unblocked',
      actor: 'watchdog',
      extraPayload: {
        resolution: resolution || null,
      },
    }).catch(() => {});
  }

  async handleClosureReady(data) {
    const { task_id, closed_with_waiver, auto_closed_parent } = data;
    console.log(`[Watchdog] Task closure ready: ${task_id}`);

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = result.rows[0] || null;
    if (!task) return;

    const meta = this._parseMetadata(task);
    const nextMetadata = {
      ...meta,
      snipara_last_event: meta.snipara_last_event || 'htask.closure_ready',
      snipara_closed_with_waiver: closed_with_waiver !== undefined
        ? Boolean(closed_with_waiver)
        : meta.snipara_closed_with_waiver || false,
      snipara_auto_closed_parent: auto_closed_parent || meta.snipara_auto_closed_parent || null,
      watchdog_last_closure_ready_at: new Date().toISOString(),
    };

    await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [task.id, JSON.stringify(nextMetadata)]
    );

    const closureTask = {
      ...task,
      metadata: nextMetadata,
    };

    await appendRunEventForTask(closureTask, {
      eventType: 'watchdog.task_closure_ready',
      actor: 'watchdog',
      payload: {
        closed_with_waiver: closed_with_waiver !== undefined ? Boolean(closed_with_waiver) : null,
        auto_closed_parent: auto_closed_parent || null,
      },
    }).catch(() => {});

    await wakeRunFromTask(closureTask, {
      reason: 'watchdog_closure_ready_event',
      eventType: 'delegate.task_closure_ready',
      actor: 'watchdog',
      extraPayload: {
        closed_with_waiver: closed_with_waiver !== undefined ? Boolean(closed_with_waiver) : null,
        auto_closed_parent: auto_closed_parent || null,
      },
    }).catch(() => {});
  }

  /**
   * Send a nudge message to the assigned agent's chat channel.
   */
  async _nudgeAgent(task, nudgeNumber) {
    console.log(`[Watchdog] Nudging agent ${task.assigned_agent} for task ${task.id} (nudge #${nudgeNumber})`);

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const workspaceId = resolveTaskWorkspaceId(task);

    try {
      await coordinator.postTaskMessageToAgentChannel(
        workspaceId,
        task.assigned_agent,
        task.title,
        task.priority || 'medium',
        `⏰ Reminder: "${task.title}" has been in progress for a while. Status update? (nudge ${nudgeNumber}/${this.maxNudges})`,
      );
    } catch (err) {
      console.warn(`[Watchdog] Failed to nudge agent ${task.assigned_agent}:`, err.message);
    }

    // Touch updated_at to reset the stall timer slightly
    await pool.query(
      `UPDATE ${SCHEMA}.tasks SET updated_at = NOW() WHERE id = $1`,
      [task.id]
    );

    await appendRunEventForTask(task, {
      eventType: 'watchdog.nudged',
      actor: 'watchdog',
      payload: {
        nudge_number: nudgeNumber,
        max_nudges: this.maxNudges,
      },
    }).catch(() => {});
  }

  /**
   * Re-dispatch a stalled task to a different agent.
   */
  async _redispatch(task) {
    console.log(`[Watchdog] Re-dispatching task ${task.id} (was assigned to ${task.assigned_agent})`);

    if (this._isOrchestrationChildTask(task)) {
      const meta = this._parseMetadata(task);
      const nextMetadata = {
        ...meta,
        watchdog_status: 'failed_for_redispatch',
        watchdog_failed_at: new Date().toISOString(),
        watchdog_failed_reason: 'stalled_child_task',
      };

      await pool.query(
        `UPDATE ${SCHEMA}.tasks
         SET status = 'failed',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [task.id, JSON.stringify(nextMetadata)]
      );

      await signalRunFromTask({
        ...task,
        status: 'failed',
        metadata: nextMetadata,
      }, {
        reason: 'watchdog_redispatch',
        eventType: 'delegate.task_watchdog_failed',
        force: true,
      }).catch(() => {});

      return;
    }

    if (this._isOrchestrationRootTask(task)) {
      const meta = this._parseMetadata(task);
      await pool.query(
        `UPDATE ${SCHEMA}.tasks
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE id = $1`,
        [task.id, JSON.stringify({
          ...meta,
          watchdog_status: 'woken',
          watchdog_woken_at: new Date().toISOString(),
        })]
      );

      await wakeRunFromTask(task, {
        reason: 'watchdog_root_stall',
        eventType: 'run.watchdog_woken',
        actor: 'watchdog',
        extraPayload: {
          task_kind: 'root_task',
        },
      }).catch(() => {});

      return;
    }

    // Mark the stalled task
    await pool.query(
      `UPDATE ${SCHEMA}.tasks SET status = 'stalled', updated_at = NOW() WHERE id = $1`,
      [task.id]
    );

    // Create a new task with the same content, excluding the original agent
    const { getSmartDispatcher } = require('./smartDispatcher');
    const dispatcher = getSmartDispatcher();
    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();

    try {
      const { agentId } = await dispatcher.dispatch(
        { title: task.title, description: task.description },
        { excludeAgents: [task.assigned_agent] },
      );

      await coordinator.createTask({
        title: task.title,
        description: `[Re-dispatched from stalled task — original agent: ${task.assigned_agent}]\n\n${task.description || ''}`,
        priority: task.priority || 'high',
        for_agent_id: agentId,
      }, resolveTaskWorkspaceId(task));

      // Notify team
      const workspaceId = resolveTaskWorkspaceId(task);
      const channelId = await coordinator.getTeamChannelId(workspaceId);
      await coordinator.postSystemMessage(
        workspaceId,
        channelId,
        'Watchdog',
        `🔄 Task "${task.title}" re-dispatched from @${task.assigned_agent} to @${agentId} (unresponsive).`,
        'watchdog',
      );
    } catch (err) {
      console.error(`[Watchdog] Re-dispatch failed for task ${task.id}:`, err.message);
    }
  }
}

let singleton = null;
function getWatchdog(options) {
  if (!singleton) singleton = new AgentWatchdog(options);
  return singleton;
}

module.exports = { AgentWatchdog, getWatchdog };
