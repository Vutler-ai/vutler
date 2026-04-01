#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try {
  const dotenv = require('dotenv');
  const cwd = process.cwd();
  for (const name of ['.env', '.env.local']) {
    const file = path.join(cwd, name);
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
} catch (_) {}

const DEFAULT_BASE_URL = process.env.VUTLER_BASE_URL || 'http://localhost:3001';
const DEFAULT_WAIT_MS = Number(process.env.VUTLER_SYNC_WAIT_MS || 5_000);
const DEFAULT_REMOTE_WAIT_MS = Number(process.env.VUTLER_REMOTE_SYNC_WAIT_MS || 130_000);
const DEFAULT_POLL_MS = Number(process.env.VUTLER_SYNC_POLL_MS || 5_000);
const DEFAULT_WORKSPACE_ID = process.env.VUTLER_TEST_WORKSPACE_ID || '00000000-0000-0000-0000-000000000001';

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTasksPayload(data) {
  if (!data) return [];
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.tasks)) return data.tasks;
  if (Array.isArray(data)) return data;
  return [];
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (_) {
    json = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(`HTTP ${response.status} ${response.statusText}`);
    err.response = { status: response.status, body: json };
    throw err;
  }

  return json;
}

async function callVutler(path, { method = 'GET', auth, body } = {}) {
  const baseUrl = getArg('base-url', DEFAULT_BASE_URL).replace(/\/$/, '');
  const headers = {
    'Content-Type': 'application/json',
  };
  if (auth?.type === 'api_key') {
    headers['X-API-Key'] = auth.secret;
  } else if (auth?.type === 'jwt') {
    headers.Authorization = `Bearer ${auth.secret}`;
  }
  return fetchJson(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function listVutlerTasks(auth) {
  const result = await callVutler('/api/v1/tasks-v2?limit=100', { auth });
  return normalizeTasksPayload(result);
}

async function listVutlerSubtasks(auth, taskId) {
  const result = await callVutler(`/api/v1/tasks-v2/${encodeURIComponent(taskId)}/subtasks`, { auth });
  return normalizeTasksPayload(result);
}

async function listVutlerSwarmTasks(auth) {
  const result = await callVutler('/api/v1/swarm/tasks', { auth });
  return normalizeTasksPayload(result?.data || result);
}

async function listVutlerSwarmEvents(auth, limit = 100) {
  const result = await callVutler(`/api/v1/swarm/events?limit=${limit}`, { auth });
  if (Array.isArray(result?.data?.events)) return result.data.events;
  if (Array.isArray(result?.data)) return result.data;
  if (Array.isArray(result?.events)) return result.events;
  return [];
}

async function callSnipara(toolName, args, { apiUrl, apiKey }) {
  return fetchJson(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args,
      },
    }),
  });
}

async function pollUntil(label, fn, { timeoutMs, intervalMs }) {
  const start = Date.now();
  let lastError = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await sleep(intervalMs);
  }

  if (lastError) throw lastError;
  throw new Error(`${label} timed out after ${timeoutMs}ms`);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  return process.env[name] || null;
}

function createJwt(secret, workspaceId = DEFAULT_WORKSPACE_ID) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    userId: 'snipara-sync-test',
    email: 'snipara-sync-test@vutler.internal',
    role: 'admin',
    workspaceId,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function readDockerEnv(containerName = 'vutler-api') {
  try {
    const output = execSync(
      `docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' ${containerName}`,
      { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }
    );
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .reduce((acc, line) => {
        const idx = line.indexOf('=');
        if (idx === -1) return acc;
        acc[line.slice(0, idx)] = line.slice(idx + 1);
        return acc;
      }, {});
  } catch (_) {
    return {};
  }
}

function summarizeTask(task) {
  return {
    id: task?.id || null,
    title: task?.title || null,
    status: task?.status || null,
    snipara_task_id: task?.snipara_task_id || task?.swarm_task_id || null,
    parent_id: task?.parent_id || null,
    metadata: task?.metadata || null,
  };
}

async function main() {
  const sniparaApiUrl = requireEnv('SNIPARA_PROJECT_MCP_URL');
  const sniparaApiKey = process.env.SNIPARA_PROJECT_KEY || process.env.SNIPARA_API_KEY;
  const swarmId = requireEnv('SNIPARA_SWARM_ID');
  const workspaceId = getArg('workspace-id', DEFAULT_WORKSPACE_ID);
  const dockerEnv = readDockerEnv(getArg('docker-container', 'vutler-api'));
  const apiKey = optionalEnv('VUTLER_API_KEY') || dockerEnv.VUTLER_API_KEY || null;
  const jwtSecret = optionalEnv('JWT_SECRET') || dockerEnv.JWT_SECRET || null;

  if (!sniparaApiKey) {
    throw new Error('Missing required env var: SNIPARA_PROJECT_KEY or SNIPARA_API_KEY');
  }
  if (!apiKey && !jwtSecret) {
    throw new Error('Missing auth: set VUTLER_API_KEY or JWT_SECRET');
  }

  const auth = apiKey
    ? { type: 'api_key', secret: apiKey }
    : { type: 'jwt', secret: createJwt(jwtSecret, workspaceId) };

  const prefix = getArg('prefix', `SYNCTEST-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  const assignee = getArg('assignee', 'jarvis');
  const remoteWaitMs = Number(getArg('remote-wait-ms', String(DEFAULT_REMOTE_WAIT_MS)));
  const localWaitMs = Number(getArg('wait-ms', String(DEFAULT_WAIT_MS)));
  const pollMs = Number(getArg('poll-ms', String(DEFAULT_POLL_MS)));

  const summary = {
    baseUrl: getArg('base-url', DEFAULT_BASE_URL),
    swarmId,
    workspaceId,
    authMode: auth.type,
    prefix,
    steps: [],
  };

  console.log(`[sync-test] base_url=${summary.baseUrl}`);
  console.log(`[sync-test] swarm_id=${swarmId}`);
  console.log(`[sync-test] prefix=${prefix}`);

  const simpleTitle = `${prefix} simple task`;
  const remoteTitle = `${prefix} remote task`;
  const featureTitle = `${prefix} feature root`;
  const workstreamTitle = `${prefix} frontend workstream`;
  const leafTitle = `${prefix} tests leaf`;

  console.log('[1/6] Create simple task via Vutler backend');
  const createdSimple = await callVutler('/api/v1/tasks-v2', {
    method: 'POST',
    auth,
    body: {
      title: simpleTitle,
      description: 'Created by backend-only sync test',
      assignee,
      priority: 'high',
      workflow_mode: 'LITE',
    },
  });
  summary.steps.push({ step: 'create_simple_vutler', data: summarizeTask(createdSimple?.data) });

  console.log('[2/6] Verify simple task appears in Snipara');
  const sniparaSimple = await pollUntil(
    'simple task through Vutler swarm backend',
    async () => {
      const tasks = await listVutlerSwarmTasks(auth);
      return tasks.find((task) => task.title === simpleTitle) || null;
    },
    { timeoutMs: localWaitMs, intervalMs: pollMs }
  );
  summary.steps.push({ step: 'verify_simple_snipara', data: sniparaSimple });

  console.log('[3/6] Create remote task directly in Snipara and force Vutler sync');
  const createdRemote = await callSnipara(
    'rlm_task_create',
    {
      swarm_id: swarmId,
      title: remoteTitle,
      description: 'Created directly in Snipara during backend sync validation',
      priority: 80,
      agent_id: assignee,
      for_agent_id: assignee,
      metadata: { source: 'snipara-direct-sync-test' },
    },
    { apiUrl: sniparaApiUrl, apiKey: sniparaApiKey }
  );
  summary.steps.push({ step: 'create_remote_snipara', data: createdRemote?.result?.structuredContent || createdRemote?.result || createdRemote });

  await callVutler('/api/v1/tasks-v2/sync', {
    method: 'POST',
    auth,
    body: {},
  });

  console.log('[4/6] Verify remote task projects into Vutler backend');
  const projectedRemote = await pollUntil(
    'remote task in Vutler',
    async () => {
      const tasks = await listVutlerTasks(auth);
      return tasks.find((task) => task.title === remoteTitle) || null;
    },
    { timeoutMs: remoteWaitMs, intervalMs: pollMs }
  );
  summary.steps.push({ step: 'verify_remote_vutler', data: summarizeTask(projectedRemote) });

  console.log('[5/6] Create hierarchical root and child via Vutler backend');
  const root = await callVutler('/api/v1/tasks-v2', {
    method: 'POST',
    auth,
    body: {
      title: featureTitle,
      description: 'Feature root created by backend sync test',
      assignee,
      hierarchical: true,
      workflow_mode: 'FULL',
      level: 'N1_FEATURE',
    },
  });
  const rootTask = root?.data;
  const workstream = await callVutler(`/api/v1/tasks-v2/${encodeURIComponent(rootTask.id)}/subtasks`, {
    method: 'POST',
    auth,
    body: {
      title: workstreamTitle,
      description: 'Workstream child created by backend sync test',
      assignee,
      hierarchical: true,
      level: 'N2_WORKSTREAM',
      workstream_type: 'FRONTEND',
    },
  });
  const leaf = await callVutler(`/api/v1/tasks-v2/${encodeURIComponent(workstream?.data?.id || rootTask.id)}/subtasks`, {
    method: 'POST',
    auth,
    body: {
      title: leafTitle,
      description: 'Leaf child created by backend sync test',
      assignee,
      hierarchical: true,
      level: 'N3_TASK',
    },
  });
  summary.steps.push({
    step: 'create_htask_tree_vutler',
    data: {
      root: summarizeTask(rootTask),
      workstream: summarizeTask(workstream?.data),
      leaf: summarizeTask(leaf?.data),
    },
  });

  console.log('[6/6] Verify hierarchical tasks are visible via Vutler backend');
  const hierarchyCheck = await pollUntil(
    'htask tree verification',
    async () => {
      const localTasks = await listVutlerTasks(auth);
      const localRoot = localTasks.find((task) => task.title === featureTitle);
      if (!localRoot) return null;

      const rootSubtasks = await listVutlerSubtasks(auth, localRoot.id);
      const localWorkstream = rootSubtasks.find((task) => task.title === workstreamTitle);
      if (!localWorkstream) return null;

      const workstreamSubtasks = await listVutlerSubtasks(auth, localWorkstream.id);
      const localLeaf = workstreamSubtasks.find((task) => task.title === leafTitle);
      if (!localLeaf) return null;

      return {
        local: {
          root: summarizeTask(localRoot),
          workstream: summarizeTask(localWorkstream),
          leaf: summarizeTask(localLeaf),
        },
        hierarchy: {
          root_subtasks: rootSubtasks.map((task) => task.title),
          workstream_subtasks: workstreamSubtasks.map((task) => task.title),
        },
      };
    },
    { timeoutMs: remoteWaitMs, intervalMs: pollMs }
  );
  summary.steps.push({ step: 'verify_htask_tree', data: hierarchyCheck });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[sync-test] failed:', err.message);
  if (err.response) {
    console.error(JSON.stringify(err.response, null, 2));
  }
  process.exit(1);
});
