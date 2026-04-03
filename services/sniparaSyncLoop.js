'use strict';

const pool = require('../lib/vaultbrix');
const { getSwarmCoordinator } = require('./swarmCoordinator');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const SYNC_INTERVAL_MS = Number(process.env.SNIPARA_SYNC_INTERVAL_MS || 120000);
const EVENT_LIMIT = Number(process.env.SNIPARA_SYNC_EVENT_LIMIT || 100);
const MAX_TRACKED_EVENTS = 500;
const FAILURE_LOG_TTL_MS = Number(process.env.SNIPARA_SYNC_FAILURE_LOG_TTL_MS || 15 * 60_000);

class SniparaSyncLoop {
  constructor(options = {}) {
    this.intervalMs = options.intervalMs || SYNC_INTERVAL_MS;
    this.eventLimit = options.eventLimit || EVENT_LIMIT;
    this._timer = null;
    this._running = false;
    this._seenEvents = new Map();
    this._failureLogCache = new Map();
  }

  start() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[SniparaSyncLoop] tick error:', err.message);
      });
    }, this.intervalMs);
    console.log(`[SniparaSyncLoop] Started (interval: ${this.intervalMs}ms)`);
    this.tick().catch((err) => {
      console.error('[SniparaSyncLoop] initial tick error:', err.message);
    });
  }

  stop() {
    if (!this._timer) return;
    clearInterval(this._timer);
    this._timer = null;
    console.log('[SniparaSyncLoop] Stopped');
  }

  async tick() {
    if (this._running) return;
    this._running = true;
    try {
      const workspaceIds = await this.getWorkspaceIds();
      for (const workspaceId of workspaceIds) {
        await this.syncWorkspace(workspaceId);
      }
    } finally {
      this._running = false;
    }
  }

  async getWorkspaceIds() {
    const ids = new Set();

    if (process.env.SNIPARA_SWARM_ID) {
      ids.add(DEFAULT_WORKSPACE);
    }

    try {
      const result = await pool.query(
        `SELECT DISTINCT workspace_id
         FROM ${SCHEMA}.workspace_settings
         WHERE key = 'snipara_swarm_id'`
      );
      for (const row of result.rows) {
        if (row.workspace_id) ids.add(row.workspace_id);
      }
    } catch (err) {
      console.warn('[SniparaSyncLoop] workspace discovery failed:', err.message);
    }

    return [...ids];
  }

  async syncWorkspace(workspaceId) {
    const coordinator = getSwarmCoordinator();

    try {
      const enabled = await coordinator.hasSniparaConfig(workspaceId);
      if (!enabled) return;
    } catch (err) {
      console.warn(`[SniparaSyncLoop] config check failed for ${workspaceId}:`, err.message);
      return;
    }

    try {
      const result = await coordinator.syncFromSnipara(workspaceId);
      this.clearFailureLog(workspaceId, 'task');
      console.log('[SniparaSyncLoop] synced tasks', {
        workspaceId,
        synced: result?.synced || 0,
        errors: result?.errors || 0,
      });
    } catch (err) {
      this.logFailureOnce('task', workspaceId, err);
    }

    try {
      const data = await coordinator.listEvents(this.eventLimit, workspaceId);
      this.clearFailureLog(workspaceId, 'event');
      const events = Array.isArray(data?.events) ? data.events : [];
      for (const event of events.slice().reverse()) {
        await this.projectEvent(workspaceId, event, coordinator);
      }
    } catch (err) {
      this.logFailureOnce('event', workspaceId, err);
    }
  }

  async projectEvent(workspaceId, event, coordinator) {
    const eventId = event?.event_id;
    const eventType = String(event?.event_type || '');
    const payload = event?.payload || {};
    if (!eventId || !/^(task|htask)\./.test(eventType)) return;

    let seen = this._seenEvents.get(workspaceId);
    if (!seen) {
      seen = new Set();
      this._seenEvents.set(workspaceId, seen);
    }
    if (seen.has(eventId)) return;

    const projectedPayload = {
      ...payload,
      ...(payload?.task_id ? {} : (payload?.id ? {} : {})),
      timestamp: event?.timestamp || payload?.timestamp || null,
    };

    const remoteTaskId = projectedPayload.task_id || projectedPayload.id || projectedPayload.task?.id || null;
    if (!remoteTaskId) {
      seen.add(eventId);
      this.trimSeenSet(seen);
      return;
    }

    await coordinator.projectWebhookEvent(eventType, projectedPayload, workspaceId).catch((err) => {
      console.warn(`[SniparaSyncLoop] event projection failed for ${eventId}:`, err.message);
    });

    seen.add(eventId);
    this.trimSeenSet(seen);
  }

  trimSeenSet(seen) {
    if (seen.size <= MAX_TRACKED_EVENTS) return;
    const iter = seen.values();
    while (seen.size > Math.floor(MAX_TRACKED_EVENTS / 2)) {
      seen.delete(iter.next().value);
    }
  }

  getFailureLogKey(kind, workspaceId, err) {
    return `${kind}:${workspaceId}:${err?.code || ''}:${err?.statusCode || ''}:${err?.message || 'unknown'}`;
  }

  clearFailureLog(workspaceId, kind) {
    for (const key of this._failureLogCache.keys()) {
      if (key.startsWith(`${kind}:${workspaceId}:`)) this._failureLogCache.delete(key);
    }
  }

  logFailureOnce(kind, workspaceId, err) {
    const key = this.getFailureLogKey(kind, workspaceId, err);
    const now = Date.now();
    const existing = this._failureLogCache.get(key);
    if (existing && existing > now) return;

    this._failureLogCache.set(key, now + FAILURE_LOG_TTL_MS);
    const action = err?.code === 'circuit_open' ? 'skipped' : 'failed';
    console.warn(`[SniparaSyncLoop] ${kind} reconcile ${action} for ${workspaceId}:`, err.message);
  }
}

let singleton = null;
function getSniparaSyncLoop(options) {
  if (!singleton) singleton = new SniparaSyncLoop(options);
  return singleton;
}

module.exports = { SniparaSyncLoop, getSniparaSyncLoop };
