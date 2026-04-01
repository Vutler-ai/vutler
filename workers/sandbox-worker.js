'use strict';

const os = require('os');
const {
  ensureSandboxSchema,
  claimPendingSandboxJobs,
  executeSandboxJob,
} = require('../services/sandbox');

const POLL_INTERVAL_MS = Math.max(parseInt(process.env.SANDBOX_WORKER_POLL_MS, 10) || 1_000, 250);
const BATCH_SIZE = Math.max(parseInt(process.env.SANDBOX_WORKER_BATCH_SIZE, 10) || 2, 1);
const WORKER_ID = `sandbox-worker:${os.hostname()}:${process.pid}`;

let running = false;
let stopRequested = false;

async function tick() {
  if (stopRequested) return;

  try {
    const jobs = await claimPendingSandboxJobs({
      workerId: WORKER_ID,
      limit: BATCH_SIZE,
    });

    if (jobs.length === 0) {
      setTimeout(() => {
        void tick();
      }, POLL_INTERVAL_MS);
      return;
    }

    for (const job of jobs) {
      if (stopRequested) break;
      await executeSandboxJob(job, { workerId: WORKER_ID });
    }
  } catch (err) {
    console.error('[SandboxWorker] Tick failed:', err.message);
    setTimeout(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return;
  }

  setImmediate(() => {
    void tick();
  });
}

async function start() {
  if (running) return;
  running = true;

  await ensureSandboxSchema();
  console.log(`[SandboxWorker] Started as ${WORKER_ID} — polling every ${POLL_INTERVAL_MS}ms`);
  void tick();
}

function stop(signal) {
  stopRequested = true;
  console.log(`[SandboxWorker] Stopping on ${signal}`);
  setTimeout(() => process.exit(0), 25).unref();
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

start().catch((err) => {
  console.error('[SandboxWorker] Fatal startup error:', err.message);
  process.exit(1);
});
