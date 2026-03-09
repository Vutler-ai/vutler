'use strict';

const https = require('https');

const CFG = {
  apiKey: process.env.SNIPARA_API_KEY || '',
  projectSlug: process.env.SNIPARA_PROJECT_SLUG || 'vutler',
  swarmId: process.env.SNIPARA_SWARM_ID || 'cmmdu24k500g01ihbw32d44x2',
  timeoutMs: Number(process.env.SNIPARA_REQUEST_TIMEOUT_MS || 10000),
};

function telemetry(event, payload = {}) {
  console.log(`[task-assignment] ${event}`, JSON.stringify({ ts: new Date().toISOString(), ...payload }));
}

function _toolCall(name, argumentsObj) {
  return new Promise((resolve, reject) => {
    if (!CFG.apiKey) return reject(new Error('SNIPARA_API_KEY missing'));

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: argumentsObj,
      },
    });

    const req = https.request({
      hostname: 'api.snipara.com',
      port: 443,
      path: `/mcp/${CFG.projectSlug}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CFG.apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try {
          const obj = raw ? JSON.parse(raw) : {};
          if (res.statusCode >= 400) return reject(new Error(`Snipara HTTP ${res.statusCode}: ${raw}`));
          if (obj.error) return reject(new Error(obj.error.message || JSON.stringify(obj.error)));
          const text = obj?.result?.content?.[0]?.text || '{}';
          const parsed = JSON.parse(text);
          if (parsed?.success === false) return reject(new Error(parsed.error || 'Snipara tool failed'));
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Snipara parse error: ${e.message}`));
        }
      });
    });

    req.setTimeout(CFG.timeoutMs, () => req.destroy(new Error('Snipara timeout')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function _assertWorker(worker) {
  if (!worker || !worker.agent_name || !worker.agent_internal_id) {
    throw new Error('worker.agent_name and worker.agent_internal_id are required');
  }
}

async function createTask({ title, description = '', priority = 10, assignee, metadata = {} }) {
  if (!title) throw new Error('title is required');
  _assertWorker({ agent_name: assignee?.agent_name, agent_internal_id: assignee?.agent_internal_id });

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

  const out = await _toolCall('rlm_task_create', payload);
  telemetry('created', { task_id: out.task_id, assignee: assignee.agent_internal_id });
  return out;
}

async function claimTaskForWorker({ worker, task_id }) {
  _assertWorker(worker);
  const out = await _toolCall('rlm_task_claim', {
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

  const out = await _toolCall('rlm_task_complete', {
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
