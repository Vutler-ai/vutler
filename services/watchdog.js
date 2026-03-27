'use strict';

/**
 * Agent Watchdog — Detects stalled tasks and takes corrective action.
 *
 * Runs on an interval, checks for tasks stuck in 'in_progress',
 * nudges agents via chat, and re-dispatches if unresponsive.
 */

const { pool } = require('../lib/postgres');

const SCHEMA = 'tenant_vutler';

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

    // Post to team coordination
    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const channelId = await coordinator.getTeamChannelId();
    await coordinator.postSystemMessage(
      channelId,
      'Watchdog',
      `❌ Task ${task_id} failed (agent: ${agent_id}). Investigating...`,
    );
  }

  /**
   * Handle htask.blocked or task.blocked event from Snipara webhook.
   */
  async handleBlocked(data) {
    const { task_id, owner, blocker_type, blocker_reason } = data;
    console.log(`[Watchdog] Task blocked: ${task_id} (${blocker_type}: ${blocker_reason})`);

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const channelId = await coordinator.getTeamChannelId();
    await coordinator.postSystemMessage(
      channelId,
      'Watchdog',
      `🚧 Task blocked: "${blocker_reason}" (type: ${blocker_type}, owner: ${owner || 'unassigned'}). Needs attention.`,
    );
  }

  /**
   * Send a nudge message to the assigned agent's chat channel.
   */
  async _nudgeAgent(task, nudgeNumber) {
    console.log(`[Watchdog] Nudging agent ${task.assigned_agent} for task ${task.id} (nudge #${nudgeNumber})`);

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();

    try {
      await coordinator.postTaskMessageToAgentChannel(
        task.assigned_agent,
        `⏰ Reminder: "${task.title}" has been in progress for a while. Status update? (nudge ${nudgeNumber}/${this.maxNudges})`,
        task.priority || 'medium',
      );
    } catch (err) {
      console.warn(`[Watchdog] Failed to nudge agent ${task.assigned_agent}:`, err.message);
    }

    // Touch updated_at to reset the stall timer slightly
    await pool.query(
      `UPDATE ${SCHEMA}.tasks SET updated_at = NOW() WHERE id = $1`,
      [task.id]
    );
  }

  /**
   * Re-dispatch a stalled task to a different agent.
   */
  async _redispatch(task) {
    console.log(`[Watchdog] Re-dispatching task ${task.id} (was assigned to ${task.assigned_agent})`);

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
      });

      // Notify team
      const channelId = await coordinator.getTeamChannelId();
      await coordinator.postSystemMessage(
        channelId,
        'Watchdog',
        `🔄 Task "${task.title}" re-dispatched from @${task.assigned_agent} to @${agentId} (unresponsive).`,
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
