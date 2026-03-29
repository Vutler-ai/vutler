'use strict';

const pool = require('../lib/vaultbrix');
const llmRouter = require('./llmRouter');

const SCHEMA = 'tenant_vutler';

/**
 * Execute a task directly via LLM when Snipara swarm is unavailable.
 * Runs async (fire-and-forget from caller).
 */
async function executeTaskViaLLM(task, agentUsername, workspaceId) {
  const taskId = task.id;
  try {
    // 1. Fetch agent details
    const agentResult = await pool.query(
      `SELECT id, name, username, model, provider, system_prompt, temperature, max_tokens, workspace_id
       FROM ${SCHEMA}.agents
       WHERE username = $1 LIMIT 1`,
      [agentUsername]
    );

    if (agentResult.rows.length === 0) {
      console.error(`[TaskExecutor] Agent "${agentUsername}" not found, skipping LLM execution`);
      await _updateTask(taskId, 'failed', { error: `Agent "${agentUsername}" not found` });
      return;
    }

    const agent = agentResult.rows[0];
    console.log(`[TaskExecutor] Executing task ${taskId} via LLM with agent ${agent.name} (${agent.model})`);

    // 2. Mark in_progress
    await _updateTask(taskId, 'in_progress', null);

    // 3. Build prompt
    const taskPrompt = [
      `# Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      `\nPriority: ${task.priority || 'medium'}`,
      `\nPlease complete this task thoroughly. Provide a structured, actionable response.`,
    ].join('');

    const messages = [{ role: 'user', content: taskPrompt }];

    // 4. Call LLM — try agent's native provider, fallback to Anthropic if it fails
    let llmResult;
    try {
      llmResult = await llmRouter.chat(
        {
          model: agent.model || 'claude-sonnet-4-20250514',
          provider: agent.provider || undefined,
          system_prompt: agent.system_prompt || `You are ${agent.name}, a helpful AI assistant.`,
          temperature: agent.temperature != null ? parseFloat(agent.temperature) : 0.7,
          max_tokens: agent.max_tokens || 4096,
          workspace_id: workspaceId,
        },
        messages,
        pool // pass db for OAuth token resolution (codex/chatgpt)
      );
    } catch (primaryErr) {
      console.log(`[TaskExecutor] Primary provider failed (${primaryErr.message}), falling back to Anthropic`);
      llmResult = await llmRouter.chat(
        {
          model: 'claude-sonnet-4-20250514',
          provider: 'anthropic',
          system_prompt: agent.system_prompt || `You are ${agent.name}, a helpful AI assistant.`,
          temperature: agent.temperature != null ? parseFloat(agent.temperature) : 0.7,
          max_tokens: agent.max_tokens || 4096,
          workspace_id: workspaceId,
        },
        messages,
        pool
      );
    }

    console.log(`[TaskExecutor] Task ${taskId} completed by ${agent.name} (${llmResult.latency_ms}ms, ${llmResult.provider}/${llmResult.model})`);

    // 5. Store result and mark completed
    await _updateTask(taskId, 'completed', {
      result: llmResult.content,
      executed_by: agent.name,
      execution_mode: 'llm_direct',
      model: llmResult.model,
      provider: llmResult.provider,
      latency_ms: llmResult.latency_ms,
      usage: llmResult.usage,
    });

  } catch (err) {
    console.error(`[TaskExecutor] Task ${taskId} failed:`, err.message);
    await _updateTask(taskId, 'failed', { error: err.message, execution_mode: 'llm_direct' });
  }
}

async function _updateTask(taskId, status, metadataPatch) {
  try {
    // SECURITY: parameterized status to prevent SQL injection (audit 2026-03-28)
    const ALLOWED_STATUSES = ['pending', 'in_progress', 'completed', 'done', 'failed', 'cancelled'];
    if (!ALLOWED_STATUSES.includes(status)) {
      console.error(`[TaskExecutor] Invalid status: ${status}`);
      return;
    }

    const params = [taskId, status];
    const updates = [`status = $2`, `updated_at = NOW()`];
    if (status === 'completed' || status === 'done') {
      updates.push(`resolved_at = NOW()`);
    }
    if (metadataPatch) {
      params.push(JSON.stringify(metadataPatch));
      updates.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${params.length}::jsonb`);
    }

    const query = `UPDATE ${SCHEMA}.tasks SET ${updates.join(', ')} WHERE id = $1 RETURNING id, status`;
    await pool.query(query, params);
  } catch (err) {
    console.error(`[TaskExecutor] Failed to update task ${taskId}:`, err.message);
  }
}

module.exports = { executeTaskViaLLM };
