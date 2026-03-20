'use strict';

const { InMemoryLockStore } = require('./lock-store');
const { InMemoryCheckpointStore } = require('./checkpoint-store');

class AtomicOrchestrator {
  constructor(options = {}) {
    this.lockStore = options.lockStore || new InMemoryLockStore({ now: options.now });
    this.checkpointStore = options.checkpointStore || new InMemoryCheckpointStore();
    this.now = options.now || (() => Date.now());

    this.lockTtlMs = options.lockTtlMs || 30_000;
    this.maxBudgetPerTick =
      Number.isFinite(options.maxBudgetPerTick) && options.maxBudgetPerTick >= 0
        ? options.maxBudgetPerTick
        : Infinity;
    this.escalationThreshold = options.escalationThreshold || 2;

    this.metrics = {
      ticks: 0,
      claimed: 0,
      closed: 0,
      blockedBudget: 0,
      blockedTimeout: 0,
      skippedPolicy: 0,
      escalations: 0,
      zeroClosureStreak: 0,
    };
    this.completedTasks = new Set();
  }

  async init() {
    const snapshot = await this.checkpointStore.load();
    if (!snapshot) {
      return;
    }

    this.lockStore.load(snapshot.locks || []);
    this.metrics = { ...this.metrics, ...(snapshot.metrics || {}) };
    this.completedTasks = new Set(snapshot.completedTasks || []);
  }

  async _checkpoint() {
    await this.checkpointStore.save({
      version: 1,
      timestamp: this.now(),
      locks: this.lockStore.getAll(),
      metrics: this.metrics,
      completedTasks: Array.from(this.completedTasks),
    });
  }

  async claim(taskId, workerId) {
    const result = this.lockStore.claim(taskId, workerId, this.lockTtlMs);
    if (result.ok) {
      this.metrics.claimed += 1;
      await this._checkpoint();
    }
    return result;
  }

  async renew(taskId, workerId) {
    const result = this.lockStore.renew(taskId, workerId, this.lockTtlMs);
    if (result.ok) {
      await this._checkpoint();
    }
    return result;
  }

  async complete(taskId, workerId, proof) {
    const result = this.lockStore.complete(taskId, workerId, proof);
    if (result.ok && (result.completed || result.idempotent)) {
      this.completedTasks.add(taskId);
      if (result.completed) {
        this.metrics.closed += 1;
      }
      await this._checkpoint();
    }
    return result;
  }

  _isLiveKit(task) {
    const scope = String(task.scope || '').toLowerCase();
    const tags = Array.isArray(task.tags) ? task.tags.map((t) => String(t).toLowerCase()) : [];
    return scope.includes('livekit') || tags.includes('livekit');
  }

  _isTimedOut(task) {
    if (!Number.isFinite(task.timeoutAt)) {
      return false;
    }
    return this.now() > task.timeoutAt;
  }

  async tick(tasks = [], options = {}) {
    const workerId = options.workerId || 'worker-1';
    const execute = options.execute || (async () => ({ closed: true, proof: { ok: true } }));

    const result = {
      tick: this.metrics.ticks + 1,
      attempted: 0,
      closedCount: 0,
      blockedBudget: 0,
      blockedTimeout: 0,
      skippedPolicy: 0,
      escalate: false,
      escalationReason: null,
    };

    this.metrics.ticks += 1;
    let spent = 0;

    for (const task of tasks) {
      if (!task || !task.id) {
        continue;
      }
      if (this.completedTasks.has(task.id)) {
        continue;
      }
      if (this._isLiveKit(task)) {
        this.metrics.skippedPolicy += 1;
        result.skippedPolicy += 1;
        continue;
      }
      if (this._isTimedOut(task)) {
        this.metrics.blockedTimeout += 1;
        result.blockedTimeout += 1;
        continue;
      }

      const cost = Number.isFinite(task.cost) ? task.cost : 1;
      if (spent + cost > this.maxBudgetPerTick) {
        this.metrics.blockedBudget += 1;
        result.blockedBudget += 1;
        continue;
      }

      const claimResult = await this.claim(task.id, workerId);
      if (!claimResult.ok) {
        continue;
      }

      spent += cost;
      result.attempted += 1;

      const execution = await execute(task, {
        workerId,
        claim: claimResult.lock,
      });

      if (execution && execution.closed) {
        const completeResult = await this.complete(task.id, workerId, execution.proof || null);
        if (completeResult.ok) {
          result.closedCount += 1;
        }
      }
    }

    if (result.closedCount === 0) {
      this.metrics.zeroClosureStreak += 1;
    } else {
      this.metrics.zeroClosureStreak = 0;
    }

    if (this.metrics.zeroClosureStreak >= this.escalationThreshold) {
      result.escalate = true;
      result.escalationReason = `No closures for ${this.metrics.zeroClosureStreak} consecutive ticks`;
      this.metrics.escalations += 1;
    }

    await this._checkpoint();
    return result;
  }
}

module.exports = {
  AtomicOrchestrator,
};
