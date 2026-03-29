/**
 * Task Executor — picks up pending tasks from PG and executes them via LLM.
 *
 * The chatRuntime creates tasks via swarmCoordinator.analyzeAndRoute(), but
 * nothing was executing them. This worker polls for pending tasks every 10s,
 * loads the assigned agent's config + soul, calls the LLM, and persists the
 * result.
 */
'use strict';

const pool = require('../../../lib/vaultbrix');
const { chat: llmChat } = require('../../../services/llmRouter');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const POLL_INTERVAL = 10_000;  // 10s between polls
const STALE_THRESHOLD_MIN = 1440; // skip tasks older than 24h
const BATCH_SIZE = 5;

let running = false;
let consecutiveErrors = 0;

// ── Agent cache ──────────────────────────────────────────────────────────────
let agentCache = null;
let agentCacheTime = 0;
const CACHE_TTL = 60_000;

async function loadAgents() {
  const now = Date.now();
  if (agentCache && (now - agentCacheTime) < CACHE_TTL) return agentCache;
  const res = await pool.query(
    `SELECT id, name, username, model, provider, system_prompt, temperature, max_tokens, role
     FROM ${SCHEMA}.agents WHERE workspace_id = $1`,
    [DEFAULT_WORKSPACE]
  );
  agentCache = res.rows;
  agentCacheTime = now;
  return agentCache;
}

function findAgent(assignee, agents) {
  if (!assignee) return null;
  const lower = String(assignee).toLowerCase();
  return agents.find(a =>
    a.username === lower ||
    a.name.toLowerCase() === lower ||
    a.id === assignee
  );
}

// ── Core execution ───────────────────────────────────────────────────────────

async function executeTask(task) {
  const agents = await loadAgents();
  const agent = findAgent(task.assignee || task.assigned_agent, agents);

  if (!agent) {
    console.warn(`[TaskExecutor] No agent found for assignee "${task.assignee}" — marking failed`);
    await updateTask(task.id, 'failed', null, { error: 'Agent not found' });
    return;
  }

  // Mark in_progress
  await updateTask(task.id, 'in_progress');

  const systemPrompt = agent.system_prompt || `You are ${agent.name}, a helpful assistant.`;
  const userMessage = `## Task: ${task.title}\n\n${task.description || ''}\n\nRespond with the completed output. Be concise and actionable.`;

  const start = Date.now();
  try {
    const response = await llmChat(
      {
        model: agent.model,
        provider: agent.provider,
        system_prompt: systemPrompt,
        temperature: parseFloat(agent.temperature) || 0.7,
        max_tokens: agent.max_tokens || 4096,
      },
      [{ role: 'user', content: userMessage }]
    );

    const latencyMs = Date.now() - start;
    const metadata = {
      result: response.content,
      model: response.model || agent.model,
      provider: response.provider || agent.provider,
      latency_ms: latencyMs,
      usage: response.usage || null,
      executed_by: agent.name,
      execution_mode: 'llm_direct',
    };

    await updateTask(task.id, 'completed', response.content, metadata);
    console.log(`[TaskExecutor] ✅ "${task.title}" by ${agent.name} (${latencyMs}ms, ${agent.provider}/${agent.model})`);

  } catch (err) {
    const latencyMs = Date.now() - start;
    console.error(`[TaskExecutor] ❌ "${task.title}" failed: ${err.message}`);
    await updateTask(task.id, 'failed', null, {
      error: err.message,
      latency_ms: latencyMs,
      executed_by: agent.name,
      execution_mode: 'llm_direct',
    });
  }
}

async function updateTask(taskId, status, output, metadata) {
  const sets = ['status = $2', 'updated_at = NOW()'];
  const vals = [taskId, status];
  let idx = 3;

  if (output !== undefined && output !== null) {
    sets.push(`output = $${idx}`);
    vals.push(typeof output === 'string' ? output : JSON.stringify(output));
    idx++;
  }

  if (metadata) {
    sets.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${idx}::jsonb`);
    vals.push(JSON.stringify(metadata));
    idx++;
  }

  if (status === 'completed' || status === 'failed') {
    sets.push('resolved_at = NOW()');
  }

  await pool.query(
    `UPDATE ${SCHEMA}.tasks SET ${sets.join(', ')} WHERE id = $1`,
    vals
  );
}

// ── Poll loop ────────────────────────────────────────────────────────────────

async function pollOnce() {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks
       WHERE status = 'pending'
         AND workspace_id = $1
         AND created_at > NOW() - INTERVAL '${STALE_THRESHOLD_MIN} minutes'
       ORDER BY
         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at ASC
       LIMIT $2`,
      [DEFAULT_WORKSPACE, BATCH_SIZE]
    );

    if (result.rows.length > 0) {
      console.log(`[TaskExecutor] Found ${result.rows.length} pending task(s)`);
    }

    for (const task of result.rows) {
      await executeTask(task);
    }

    consecutiveErrors = 0;
  } catch (err) {
    consecutiveErrors++;
    if (consecutiveErrors <= 3) {
      console.error('[TaskExecutor] Poll error:', err.message);
    }
  }
}

function start() {
  if (running) return;
  running = true;
  console.log('[TaskExecutor] Started — polling every 10s for pending tasks');

  const tick = async () => {
    if (!running) return;
    await pollOnce();
    setTimeout(tick, POLL_INTERVAL);
  };

  // Start after a 15s delay (let other services boot first)
  setTimeout(tick, 15_000);
}

function stop() {
  running = false;
  console.log('[TaskExecutor] Stopped');
}

module.exports = { start, stop, executeTask };
