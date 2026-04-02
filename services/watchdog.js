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
const MAX_NUDGES = 3;

class AgentWatchdog {
  constructor(options = {}) {
    this.checkIntervalMs = options.checkIntervalMs || CHECK_INTERVAL;
    this.stallThresholdMs = options.stallThresholdMs || STALL_THRESHOLD;
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
    }
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

    await this._redispatch(task);
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
    const workspaceId = task?.workspace_id || DEFAULT_WORKSPACE;

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
    const workspaceId = task?.workspace_id || DEFAULT_WORKSPACE;

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
  }

  /**
   * Send a nudge message to the assigned agent's chat channel.
   */
  async _nudgeAgent(task, nudgeNumber) {
    console.log(`[Watchdog] Nudging agent ${task.assigned_agent} for task ${task.id} (nudge #${nudgeNumber})`);

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const workspaceId = task.workspace_id || DEFAULT_WORKSPACE;

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
      }, task.workspace_id || DEFAULT_WORKSPACE);

      // Notify team
      const workspaceId = task.workspace_id || DEFAULT_WORKSPACE;
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
