'use strict';

class InMemoryLockStore {
  constructor(options = {}) {
    this._locks = new Map();
    this._now = options.now || (() => Date.now());
  }

  _current(taskId) {
    return this._locks.get(taskId) || null;
  }

  _isExpired(record, now) {
    return !!record && record.expiresAt <= now;
  }

  claim(taskId, workerId, ttlMs) {
    const now = this._now();
    const current = this._current(taskId);

    if (current && !this._isExpired(current, now) && !current.completedAt) {
      return { ok: false, reason: 'LOCK_HELD', lock: { ...current } };
    }

    if (current && current.completedAt) {
      return { ok: false, reason: 'ALREADY_COMPLETED', lock: { ...current } };
    }

    const next = {
      taskId,
      workerId,
      claimedAt: now,
      expiresAt: now + ttlMs,
      renewedAt: now,
      completedAt: null,
      proof: null,
    };

    this._locks.set(taskId, next);
    return { ok: true, claimed: true, lock: { ...next } };
  }

  renew(taskId, workerId, ttlMs) {
    const now = this._now();
    const current = this._current(taskId);

    if (!current) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    if (current.workerId !== workerId) {
      return { ok: false, reason: 'NOT_OWNER', lock: { ...current } };
    }

    if (current.completedAt) {
      return { ok: false, reason: 'ALREADY_COMPLETED', lock: { ...current } };
    }

    current.renewedAt = now;
    current.expiresAt = now + ttlMs;

    this._locks.set(taskId, current);
    return { ok: true, renewed: true, lock: { ...current } };
  }

  complete(taskId, workerId, proof) {
    const now = this._now();
    const current = this._current(taskId);

    if (!current) {
      return { ok: false, reason: 'NOT_FOUND' };
    }

    if (current.completedAt) {
      return { ok: true, idempotent: true, lock: { ...current } };
    }

    if (current.workerId !== workerId) {
      return { ok: false, reason: 'NOT_OWNER', lock: { ...current } };
    }

    if (this._isExpired(current, now)) {
      return { ok: false, reason: 'EXPIRED', lock: { ...current } };
    }

    current.completedAt = now;
    current.proof = proof || null;

    this._locks.set(taskId, current);
    return { ok: true, completed: true, lock: { ...current } };
  }

  get(taskId) {
    const current = this._current(taskId);
    return current ? { ...current } : null;
  }

  getAll() {
    return Array.from(this._locks.values()).map((lock) => ({ ...lock }));
  }

  load(records = []) {
    this._locks.clear();
    for (const record of records) {
      this._locks.set(record.taskId, { ...record });
    }
  }
}

module.exports = {
  InMemoryLockStore,
};
