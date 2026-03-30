/**
 * Task Executor — atomically claims pending tasks and executes them via LLM.
 */
'use strict';

const os = require('os');
const pool = require('../../../lib/vaultbrix');
const { chat: llmChat } = require('../../../services/llmRouter');
const { getSwarmCoordinator } = require('../../../services/swarmCoordinator');
const { insertChatMessage } = require('../../../services/chatMessages');

const SCHEMA = 'tenant_vutler';
const POLL_INTERVAL = 10_000;
const STALE_THRESHOLD_MIN = 1440;
const BATCH_SIZE = 5;
const AGENT_CACHE_TTL = 60_000;
const WORKER_ID = `${os.hostname()}:${process.pid}`;

let running = false;
let wsConnections = null;
let consecutiveErrors = 0;
const agentCache = new Map();

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || '00000000-0000-0000-0000-000000000001';
}

async function loadAgents(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const cached = agentCache.get(ws);
  const now = Date.now();
  if (cached && (now - cached.time) < AGENT_CACHE_TTL) return cached.rows;

  const result = await pool.query(
    `SELECT id, name, username, model, provider, system_prompt, temperature, max_tokens, role, workspace_id
     FROM ${SCHEMA}.agents
     WHERE workspace_id = $1`,
    [ws]
  );

  agentCache.set(ws, { rows: result.rows, time: now });
  return result.rows;
}

function findAgent(assignee, agents) {
  if (!assignee) return null;
  const lower = String(assignee).toLowerCase();
  return agents.find((agent) =>
    String(agent.id) === String(assignee)
    || String(agent.username || '').toLowerCase() === lower
    || String(agent.name || '').toLowerCase() === lower
  ) || null;
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return value;
}

async function postTaskChatResult(task, content, senderId, senderName) {
  const metadata = parseMetadata(task.metadata);
  if (metadata.origin !== 'chat' || !metadata.origin_chat_channel_id) return;

  await insertChatMessage(pool, null, SCHEMA, {
    channel_id: metadata.origin_chat_channel_id,
    sender_id: senderId,
    sender_name: senderName,
    content,
    message_type: 'text',
    workspace_id: normalizeWorkspaceId(task.workspace_id),
    processed_at: new Date(),
    processing_state: 'processed',
    reply_to_message_id: metadata.origin_chat_message_id || null
  });
}

async function updateTask(taskId, status, output, metadata = {}) {
  const mergedMeta = { ...(metadata || {}) };
  if (output !== undefined && output !== null) {
    mergedMeta.result = typeof output === 'string' ? output : JSON.stringify(output);
  }

  const sets = ['status = $2', 'updated_at = NOW()'];
  const values = [taskId, status];

  if (Object.keys(mergedMeta).length > 0) {
    sets.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb`);
    values.push(JSON.stringify(mergedMeta));
  }

  if (status === 'completed' || status === 'failed') {
    sets.push('resolved_at = NOW()');
    sets.push('locked_at = NULL');
    sets.push('locked_by = NULL');
  }

  await pool.query(`UPDATE ${SCHEMA}.tasks SET ${sets.join(', ')} WHERE id = $1`, values);
}

function buildTaskPrompt(task) {
  return [
    `## Task: ${task.title}`,
    task.description || '',
    '',
    'Respond with the completed output. Be concise and actionable.'
  ].join('\n');
}

async function claimPendingTasks(limit = BATCH_SIZE) {
  const result = await pool.query(
    `WITH candidate AS (
       SELECT id
       FROM ${SCHEMA}.tasks
       WHERE status = 'pending'
         AND created_at > NOW() - INTERVAL '${STALE_THRESHOLD_MIN} minutes'
       ORDER BY
         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE ${SCHEMA}.tasks t
     SET status = 'in_progress',
         updated_at = NOW(),
         locked_at = NOW(),
         locked_by = $2,
         execution_attempts = COALESCE(execution_attempts, 0) + 1
     FROM candidate
     WHERE t.id = candidate.id
     RETURNING t.*`,
    [limit, WORKER_ID]
  );
  return result.rows;
}

async function failTask(task, err, extraMetadata = {}) {
  const message = String(err?.message || err || 'Unknown error');
  await updateTask(task.id, 'failed', null, {
    error: message,
    ...(task.snipara_task_id ? { snipara_sync_status: 'not_completed' } : {}),
    ...extraMetadata
  });

  await postTaskChatResult(
    task,
    `La tache \"${task.title}\" a echoue: ${message}`,
    'jarvis',
    'Jarvis'
  ).catch((chatErr) => {
    console.error('[TaskExecutor] Failed to post failure in chat:', chatErr.message);
  });
}

async function executeTask(task) {
  const workspaceId = normalizeWorkspaceId(task.workspace_id);
  const agents = await loadAgents(workspaceId);
  const agent = findAgent(task.assignee || task.assigned_agent, agents);

  if (!agent) {
    await failTask(task, new Error(`Agent not found for assignee ${task.assignee || task.assigned_agent || 'unknown'}`));
    return;
  }

  const swarmCoordinator = getSwarmCoordinator();
  const agentRef = agent.username || String(agent.id);
  const startedAt = Date.now();

  try {
    if (task.snipara_task_id) {
      await swarmCoordinator.claimTask(task.snipara_task_id, agentRef, workspaceId);
    }

    const response = await llmChat(
      {
        model: agent.model,
        provider: agent.provider,
        system_prompt: agent.system_prompt || `You are ${agent.name}, a helpful assistant.`,
        temperature: parseFloat(agent.temperature) || 0.7,
        max_tokens: agent.max_tokens || 4096,
        workspace_id: workspaceId
      },
      [{ role: 'user', content: buildTaskPrompt(task) }],
      pool,
      { wsConnections }
    );

    const latencyMs = Date.now() - startedAt;
    const successMeta = {
      result: response.content,
      model: response.model || agent.model,
      provider: response.provider || agent.provider,
      latency_ms: latencyMs,
      usage: response.usage || null,
      executed_by: agent.name,
      execution_mode: wsConnections ? 'llm_with_nexus' : 'llm_direct'
    };

    if (task.snipara_task_id) {
      try {
        await swarmCoordinator.completeTask(task.snipara_task_id, agentRef, response.content, workspaceId);
      } catch (syncErr) {
        await failTask(task, syncErr, { ...successMeta, result: response.content });
        return;
      }
    }

    await updateTask(task.id, 'completed', response.content, successMeta);
    await postTaskChatResult(task, response.content, String(agent.id), agent.name).catch((chatErr) => {
      console.error('[TaskExecutor] Failed to post completion in chat:', chatErr.message);
    });

    console.log(`[TaskExecutor] Completed "${task.title}" by ${agent.name} (${latencyMs}ms)`);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    console.error(`[TaskExecutor] Failed "${task.title}":`, err.message);
    await failTask(task, err, {
      latency_ms: latencyMs,
      executed_by: agent.name,
      execution_mode: wsConnections ? 'llm_with_nexus' : 'llm_direct'
    });
  }
}

async function pollOnce() {
  try {
    const tasks = await claimPendingTasks();
    if (tasks.length > 0) {
      console.log(`[TaskExecutor] Claimed ${tasks.length} pending task(s) as ${WORKER_ID}`);
    }

    for (const task of tasks) {
      await executeTask(task);
    }

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors += 1;
    if (consecutiveErrors <= 10) {
      console.error('[TaskExecutor] Poll error:', err.message, err.stack?.split('\n')[1]?.trim());
    }
  }
}

function start() {
  if (running) return;
  running = true;
  console.log(`[TaskExecutor] Started — polling every ${POLL_INTERVAL}ms as ${WORKER_ID}`);

  const tick = async () => {
    if (!running) return;
    await pollOnce();
    setTimeout(tick, POLL_INTERVAL);
  };

  setTimeout(tick, 15_000);
}

function stop() {
  running = false;
  console.log('[TaskExecutor] Stopped');
}

function setWsConnections(connections) {
  wsConnections = connections;
  console.log('[TaskExecutor] WebSocket connections linked — Nexus tool bridge active');
}

module.exports = {
  start,
  stop,
  executeTask,
  setWsConnections,
  claimPendingTasks,
  updateTask,
  _test: {
    buildTaskPrompt,
    failTask,
    postTaskChatResult
  }
};
