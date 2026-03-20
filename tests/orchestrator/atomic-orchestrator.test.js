'use strict';

const path = require('path');
const fs = require('fs');

const { AtomicOrchestrator } = require('../../runtime/orchestrator/atomic-orchestrator');
const { InMemoryLockStore } = require('../../runtime/orchestrator/lock-store');
const {
  InMemoryCheckpointStore,
  FileCheckpointStore,
} = require('../../runtime/orchestrator/checkpoint-store');

describe('AtomicOrchestrator anti-double-run MVP', () => {
  test('double claim prevention', async () => {
    let now = 1_000;
    const orchestrator = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: new InMemoryCheckpointStore(),
      lockTtlMs: 500,
      now: () => now,
    });

    await orchestrator.init();

    const first = await orchestrator.claim('task-1', 'worker-a');
    const second = await orchestrator.claim('task-1', 'worker-b');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('LOCK_HELD');
  });

  test('expiry reclaim works', async () => {
    let now = 1_000;
    const orchestrator = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: new InMemoryCheckpointStore(),
      lockTtlMs: 100,
      now: () => now,
    });

    await orchestrator.init();

    const first = await orchestrator.claim('task-2', 'worker-a');
    now += 150;
    const reclaimed = await orchestrator.claim('task-2', 'worker-b');

    expect(first.ok).toBe(true);
    expect(reclaimed.ok).toBe(true);
    expect(reclaimed.lock.workerId).toBe('worker-b');
  });

  test('stale worker cannot renew or complete after reclaim', async () => {
    let now = 1_000;
    const orchestrator = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: new InMemoryCheckpointStore(),
      lockTtlMs: 100,
      now: () => now,
    });

    await orchestrator.init();
    await orchestrator.claim('task-3', 'worker-a');

    now += 150;
    await orchestrator.claim('task-3', 'worker-b');

    const staleRenew = await orchestrator.renew('task-3', 'worker-a');
    const staleComplete = await orchestrator.complete('task-3', 'worker-a', { done: true });

    expect(staleRenew.ok).toBe(false);
    expect(staleRenew.reason).toBe('NOT_OWNER');
    expect(staleComplete.ok).toBe(false);
    expect(staleComplete.reason).toBe('NOT_OWNER');
  });

  test('restart resumes from checkpoint without duplicate execution', async () => {
    const filePath = path.join(__dirname, '..', '..', 'tmp', 'orchestrator-checkpoint.test.json');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}

    let now = 10_000;

    const checkpointStoreA = new FileCheckpointStore(filePath);
    const orchestratorA = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: checkpointStoreA,
      lockTtlMs: 1_000,
      now: () => now,
    });

    await orchestratorA.init();

    const executions = [];
    await orchestratorA.tick(
      [{ id: 'task-r1', cost: 1 }],
      {
        workerId: 'worker-a',
        execute: async (task) => {
          executions.push(task.id);
          return { closed: true, proof: { run: 1 } };
        },
      },
    );

    const checkpointStoreB = new FileCheckpointStore(filePath);
    const orchestratorB = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: checkpointStoreB,
      lockTtlMs: 1_000,
      now: () => now,
    });

    await orchestratorB.init();

    await orchestratorB.tick(
      [{ id: 'task-r1', cost: 1 }],
      {
        workerId: 'worker-b',
        execute: async (task) => {
          executions.push(`${task.id}-second`);
          return { closed: true, proof: { run: 2 } };
        },
      },
    );

    expect(executions).toEqual(['task-r1']);

    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
  });

  test('budget gate blocks execution when exceeded', async () => {
    let now = 1_000;
    const orchestrator = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: new InMemoryCheckpointStore(),
      lockTtlMs: 1_000,
      maxBudgetPerTick: 2,
      now: () => now,
    });

    await orchestrator.init();

    const seen = [];
    const out = await orchestrator.tick(
      [
        { id: 'b1', cost: 1 },
        { id: 'b2', cost: 1 },
        { id: 'b3', cost: 1 },
      ],
      {
        workerId: 'worker-a',
        execute: async (task) => {
          seen.push(task.id);
          return { closed: true, proof: { ok: true } };
        },
      },
    );

    expect(seen).toEqual(['b1', 'b2']);
    expect(out.blockedBudget).toBe(1);
  });

  test('escalation triggers exactly after configured threshold', async () => {
    let now = 1_000;
    const orchestrator = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: new InMemoryCheckpointStore(),
      escalationThreshold: 2,
      now: () => now,
    });

    await orchestrator.init();

    const t1 = await orchestrator.tick([{ id: 'e1' }], {
      workerId: 'worker-a',
      execute: async () => ({ closed: false }),
    });

    const t2 = await orchestrator.tick([{ id: 'e2' }], {
      workerId: 'worker-a',
      execute: async () => ({ closed: false }),
    });

    expect(t1.escalate).toBe(false);
    expect(t2.escalate).toBe(true);
    expect(t2.escalationReason).toContain('2 consecutive ticks');
  });

  test('LiveKit tasks are excluded by policy filter', async () => {
    let now = 1_000;
    const orchestrator = new AtomicOrchestrator({
      lockStore: new InMemoryLockStore({ now: () => now }),
      checkpointStore: new InMemoryCheckpointStore(),
      now: () => now,
    });

    await orchestrator.init();

    const seen = [];
    const out = await orchestrator.tick(
      [
        { id: 'l1', scope: 'LiveKit' },
        { id: 'l2', tags: ['livekit'] },
        { id: 'ok1', tags: ['normal'] },
      ],
      {
        workerId: 'worker-a',
        execute: async (task) => {
          seen.push(task.id);
          return { closed: true };
        },
      },
    );

    expect(seen).toEqual(['ok1']);
    expect(out.skippedPolicy).toBe(2);
  });
});
