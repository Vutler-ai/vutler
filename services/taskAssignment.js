'use strict';

const { createSniparaGateway } = require('./snipara/gateway');

const CFG = {
  swarmId: process.env.SNIPARA_SWARM_ID || 'cmmdu24k500g01ihbw32d44x2',
};

function telemetry(event, payload = {}) {
  console.log(`[task-assignment] ${event}`, JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

function _assertWorker(worker) {
  if (!worker || !worker.agent_name || !worker.agent_internal_id) {
    throw new Error('worker.agent_name and worker.agent_internal_id are required');
  }
}

async function createTask({ title, description = '', priority = 10, assignee, metadata = {} }) {
  if (!title) throw new Error('title is required');
  _assertWorker({ agent_name: assignee?.agent_name, agent_internal_id: assignee?.agent_internal_id });
  const gateway = createSniparaGateway();

  const payload = {
    swarm_id: CFG.swarmId,
    agent_id: assignee.agent_internal_id,
    title,
    description,
    priority,
    metadata: {
      ...metadata,
      assignment_lock: {
        agent_name: assignee.agent_name,
        agent_internal_id: assignee.agent_internal_id,
      },
    },
  };

  const out = await gateway.coordination.taskCreate(payload);
  telemetry('created', { task_id: out.task_id, assignee: assignee.agent_internal_id });
  return out;
}

async function claimTaskForWorker({ worker, task_id }) {
  _assertWorker(worker);
  const gateway = createSniparaGateway();
  const out = await gateway.coordination.taskClaim({
    swarm_id: CFG.swarmId,
    agent_id: worker.agent_internal_id,
    task_id: task_id || undefined,
    timeout_seconds: 2,
  });

  if (!out.task_id) return null;
  telemetry('claimed', { task_id: out.task_id, worker: worker.agent_internal_id });
  return out;
}

async function completeTask({ worker, task_id, result, success = true }) {
  _assertWorker(worker);
  if (!task_id) throw new Error('task_id is required');
  const gateway = createSniparaGateway();

  const out = await gateway.coordination.taskComplete({
    swarm_id: CFG.swarmId,
    agent_id: worker.agent_internal_id,
    task_id,
    success,
    result: result || {},
  });

  telemetry('completed', { task_id, worker: worker.agent_internal_id });
  return out;
}

module.exports = {
  CFG,
  createTask,
  claimTaskForWorker,
  completeTask,
};
