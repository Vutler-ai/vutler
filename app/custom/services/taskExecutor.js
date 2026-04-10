/**
 * Task Executor — atomically claims pending tasks and executes them via LLM.
 */
'use strict';

const os = require('os');
const pool = require('../../../lib/vaultbrix');
const { chat: llmChat } = require('../../../services/llmRouter');
const { getSwarmCoordinator } = require('../../../services/swarmCoordinator');
const { insertChatMessage } = require('../../../services/chatMessages');
const { createMemoryRuntimeService } = require('../../../services/memory/runtime');
const { resolveAgentRecord } = require('../../../services/sniparaMemoryService');
const { signalRunFromTask } = require('../../../services/orchestration/runSignals');
const {
  buildOverlaySuggestionMessages,
  filterExecutionOverlay,
  isOverlayEmpty,
} = require('../../../services/executionOverlayService');
const {
  ensureRunForTask,
  isMissingOrchestrationSchemaError,
} = require('../../../services/orchestration/runStore');

const SCHEMA = 'tenant_vutler';
const POLL_INTERVAL = 10_000;
const STALE_THRESHOLD_MIN = 1440;
const BATCH_SIZE = 5;
const AGENT_CACHE_TTL = 60_000;
const WORKER_ID = `${os.hostname()}:${process.pid}`;
const memoryRuntime = createMemoryRuntimeService();

let running = false;
let wsConnections = null;
let consecutiveErrors = 0;
const agentCache = new Map();

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || '00000000-0000-0000-0000-000000000001';
}

async function hydrateAgent(agent, workspaceId) {
  if (!agent) return agent;
  const ws = normalizeWorkspaceId(workspaceId || agent.workspace_id);
  const agentRef = agent.id || agent.username || agent.agent_id;
  if (!agentRef) return { ...agent, workspace_id: ws };

  try {
    return await resolveAgentRecord(pool, ws, agentRef, { ...agent, workspace_id: ws });
  } catch (_) {
    return { ...agent, workspace_id: ws };
  }
}

function appendPlacementInstruction(prompt, instruction) {
  const basePrompt = String(prompt || '');
  const extraInstruction = String(instruction || '').trim();
  if (!extraInstruction || basePrompt.includes(extraInstruction)) return basePrompt;
  return `${basePrompt}\n\n${extraInstruction}`;
}

async function loadAgents(workspaceId) {
  const ws = normalizeWorkspaceId(workspaceId);
  const cached = agentCache.get(ws);
  const now = Date.now();
  if (cached && (now - cached.time) < AGENT_CACHE_TTL) return cached.rows;

  const result = await pool.query(
    `SELECT id, name, username, model, provider, system_prompt, temperature, max_tokens, role, workspace_id, capabilities
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

function resolveTaskWorkflowMode(task) {
  const metadata = parseMetadata(task?.metadata);
  const mode = String(
    metadata.workflow_mode
    || metadata.workflowMode
    || task?.workflow_mode
    || ''
  ).trim().toUpperCase();

  if (mode === 'FULL') return 'FULL';
  if (mode === 'LITE') return 'LITE';
  return null;
}

function shouldUseAutonomousRun(task) {
  const metadata = parseMetadata(task?.metadata);
  if (resolveTaskWorkflowMode(task) === 'FULL') return true;
  return metadata.execution_mode === 'autonomous'
    || metadata.execution_backend === 'orchestration_run'
    || metadata.autonomous === true
    || metadata.orchestration_required === true;
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
  const metadata = parseMetadata(task?.metadata);
  const requester = metadata.origin_chat_user_name || metadata.origin_chat_user_id || null;
  return [
    `## Task: ${task.title}`,
    task.description || '',
    requester ? `Original requester: ${requester}` : '',
    '',
    'Respond with the completed output. Be concise and actionable.'
  ].filter(Boolean).join('\n');
}

async function claimPendingTasks(limit = BATCH_SIZE) {
  const result = await pool.query(
    `WITH candidate AS (
       SELECT id
       FROM ${SCHEMA}.tasks
       WHERE status = 'pending'
         AND (due_date IS NULL OR due_date <= NOW())
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
  const mergedMetadata = {
    ...(parseMetadata(task.metadata) || {}),
    error: message,
    ...(task.snipara_task_id ? { snipara_sync_status: 'not_completed' } : {}),
    ...extraMetadata
  };
  await updateTask(task.id, 'failed', null, {
    ...mergedMetadata
  });

  await signalRunFromTask({
    ...task,
    status: 'failed',
    metadata: mergedMetadata,
  }, {
    reason: 'task_executor_failed',
    eventType: 'delegate.task_failed',
  }).catch(() => {});

  await postTaskChatResult(
    task,
    `La tache \"${task.title}\" a echoue: ${message}`,
    'jarvis',
    'Jarvis'
  ).catch((chatErr) => {
    console.error('[TaskExecutor] Failed to post failure in chat:', chatErr.message);
  });
}

async function buildExecutionPrompt(agent, task, workspaceId) {
  const baseSystemPrompt = agent.system_prompt || `You are ${agent.name}, a helpful assistant.`;
  const metadata = parseMetadata(task?.metadata);
  const humanContext = metadata.origin_chat_user_id || metadata.origin_chat_user_name
    ? {
        id: metadata.origin_chat_user_id || null,
        name: metadata.origin_chat_user_name || null,
      }
    : { id: null, name: null };
  const memoryBundle = await memoryRuntime.preparePromptContext({
    db: pool,
    workspaceId,
    agent,
    humanContext,
    query: `${task.title} ${task.description || ''}`.trim(),
    runtime: 'task',
    includeSummaries: true,
    }).catch(() => ({ prompt: '', stats: null }));

  return {
    humanContext,
    mode: memoryBundle.mode || null,
    prompt: appendPlacementInstruction(
      memoryBundle.prompt
      ? `${baseSystemPrompt}\n\n${memoryBundle.prompt}`
      : baseSystemPrompt,
      agent.workspaceToolPolicy?.placementInstruction
    ),
    memoryStats: memoryBundle.stats || null,
  };
}

function buildInitialRunPlan(task, executionAgent) {
  const metadata = parseMetadata(task?.metadata);
  return {
    goal: task?.title || 'Autonomous task execution',
    strategy: 'pending_planner',
    requested_workflow_mode: resolveTaskWorkflowMode(task) || 'FULL',
    created_by: 'task_executor',
    root_task: {
      id: task?.id || null,
      title: task?.title || '',
      description: task?.description || '',
      assigned_agent: task?.assigned_agent || task?.assignee || executionAgent?.username || null,
    },
    workflow_reasons: Array.isArray(metadata.workflow_reasons) ? metadata.workflow_reasons : [],
  };
}

function buildInitialRunContext(task, executionAgent, workspaceId) {
  const metadata = parseMetadata(task?.metadata);
  return {
    workspace_id: workspaceId,
    source: metadata.origin || 'task',
    origin_human: {
      id: metadata.origin_chat_user_id || null,
      name: metadata.origin_chat_user_name || null,
    },
    root_task: {
      id: task?.id || null,
      title: task?.title || '',
      description: task?.description || '',
      priority: task?.priority || null,
      snipara_task_id: task?.snipara_task_id || null,
      swarm_task_id: task?.swarm_task_id || null,
    },
    requested_agent: {
      id: executionAgent?.id || null,
      username: executionAgent?.username || null,
      role: executionAgent?.role || null,
    },
  };
}

async function resolveTaskExecutionOverlay(task, executionAgent, workspaceId) {
  const metadata = parseMetadata(task?.metadata);
  const desiredOverlay = metadata.execution_overlay && typeof metadata.execution_overlay === 'object'
    ? metadata.execution_overlay
    : null;
  if (!desiredOverlay || isOverlayEmpty(desiredOverlay)) return null;

  const filtered = await filterExecutionOverlay({
    workspaceId,
    agent: executionAgent,
    overlay: desiredOverlay,
    db: pool,
  }).catch(() => ({
    skillKeys: [],
    integrationProviders: [],
    toolCapabilities: [],
    blocked: {
      providers: [],
      skills: [],
      toolCapabilities: [],
    },
  }));

  if (isOverlayEmpty(filtered)
    && !(Array.isArray(filtered.blocked?.providers) && filtered.blocked.providers.length > 0)
    && !(Array.isArray(filtered.blocked?.skills) && filtered.blocked.skills.length > 0)
    && !(Array.isArray(filtered.blocked?.toolCapabilities) && filtered.blocked.toolCapabilities.length > 0)) {
    return null;
  }

  return filtered;
}

async function queueAutonomousRunForTask(task, executionAgent, workspaceId) {
  const metadata = parseMetadata(task.metadata);
  const runSeed = await ensureRunForTask({
    db: pool,
    workspaceId,
    task,
    requestedAgent: {
      id: executionAgent.id,
      username: executionAgent.username,
    },
    displayAgent: {
      id: executionAgent.id,
      username: executionAgent.username,
    },
    orchestratedBy: 'jarvis',
    summary: `Autonomous FULL-mode run for task "${task.title || task.id}".`,
    plan: buildInitialRunPlan(task, executionAgent),
    context: buildInitialRunContext(task, executionAgent, workspaceId),
  });

  await updateTask(task.id, 'in_progress', null, {
    ...metadata,
    execution_backend: 'orchestration_run',
    execution_mode: 'autonomous',
    workflow_mode: resolveTaskWorkflowMode(task) || 'FULL',
    orchestration_run_id: runSeed.run?.id || null,
    orchestration_step_id: runSeed.step?.id || null,
    orchestration_status: runSeed.run?.status || 'queued',
    orchestrated_by: runSeed.run?.orchestrated_by || 'jarvis',
    requested_agent_id: runSeed.run?.requested_agent_id || executionAgent.id || null,
    display_agent_id: runSeed.run?.display_agent_id || executionAgent.id || null,
  });

  return runSeed;
}

async function executeTask(task) {
  const workspaceId = normalizeWorkspaceId(task.workspace_id);
  const agents = await loadAgents(workspaceId);
  const agent = findAgent(task.assignee || task.assigned_agent, agents);

  if (!agent) {
    await failTask(task, new Error(`Agent not found for assignee ${task.assignee || task.assigned_agent || 'unknown'}`));
    return;
  }

  const hydratedAgent = await hydrateAgent(agent, workspaceId);
  const swarmCoordinator = getSwarmCoordinator();
  const executionAgent = typeof swarmCoordinator.resolveAgentExecutionContext === 'function'
    ? await swarmCoordinator.resolveAgentExecutionContext(hydratedAgent, workspaceId)
    : hydratedAgent;
  const agentRef = executionAgent.username || String(executionAgent.id);
  const startedAt = Date.now();

  try {
    if (task.snipara_task_id) {
      await swarmCoordinator.claimTask(task.snipara_task_id, agentRef, workspaceId);
    }

    if (shouldUseAutonomousRun(task)) {
      try {
        const runSeed = await queueAutonomousRunForTask(task, executionAgent, workspaceId);
        console.log(
          `[TaskExecutor] Queued autonomous run ${runSeed.run?.id || 'unknown'} for "${task.title}" (${runSeed.created ? 'created' : 'reused'})`
        );
        return;
      } catch (err) {
        if (!isMissingOrchestrationSchemaError(err)) throw err;
        console.warn('[TaskExecutor] orchestration run schema missing, falling back to direct LLM execution:', err.message);
      }
    }

    const executionPrompt = await buildExecutionPrompt(executionAgent, task, workspaceId);
    const filteredExecutionOverlay = await resolveTaskExecutionOverlay(task, executionAgent, workspaceId);
    const executionOverlay = filteredExecutionOverlay && !isOverlayEmpty(filteredExecutionOverlay)
      ? {
          skillKeys: filteredExecutionOverlay.skillKeys || [],
          integrationProviders: filteredExecutionOverlay.integrationProviders || [],
          toolCapabilities: filteredExecutionOverlay.toolCapabilities || [],
        }
      : null;
    const llmAgent = {
      ...executionAgent,
      ...(executionOverlay ? { execution_overlay: executionOverlay } : {}),
    };
    const response = await llmChat(
      {
        id: llmAgent.id,
        username: llmAgent.username,
        role: llmAgent.role,
        model: llmAgent.model,
        provider: llmAgent.provider,
        system_prompt: executionPrompt.prompt,
        temperature: parseFloat(llmAgent.temperature) || 0.7,
        max_tokens: llmAgent.max_tokens || 4096,
        workspace_id: workspaceId,
        capabilities: llmAgent.capabilities || [],
        ...(executionOverlay ? { execution_overlay: executionOverlay } : {}),
      },
      [{ role: 'user', content: buildTaskPrompt(task) }],
      pool,
      {
        wsConnections,
        humanContext: executionPrompt.humanContext || null,
        originTaskId: task.id,
      }
    );

    const latencyMs = Date.now() - startedAt;
    if (executionPrompt.memoryStats) {
      console.info('[TaskExecutor] memory bundle', {
        taskId: task.id,
        agent: agentRef,
        workspaceId,
        mode: executionPrompt.mode?.mode || null,
        mode_source: executionPrompt.mode?.source || null,
        runtime: executionPrompt.memoryStats.runtime,
        selected: executionPrompt.memoryStats.selected,
        tokens: executionPrompt.memoryStats.tokens || 0,
      });
    }
    const successMeta = {
      result: response.content,
      model: response.model || executionAgent.model,
      provider: response.provider || executionAgent.provider,
      latency_ms: latencyMs,
      usage: response.usage || null,
      executed_by: executionAgent.name,
      execution_mode: wsConnections ? 'llm_with_nexus' : 'llm_direct',
      ...(executionOverlay ? {
        orchestration_overlay_skills: executionOverlay.skillKeys || [],
        orchestration_overlay_providers: executionOverlay.integrationProviders || [],
        orchestration_overlay_tool_capabilities: executionOverlay.toolCapabilities || [],
      } : {}),
      ...(filteredExecutionOverlay ? {
        orchestration_blocked_overlay_providers: filteredExecutionOverlay.blocked?.providers || [],
        orchestration_blocked_overlay_skills: filteredExecutionOverlay.blocked?.skills || [],
        orchestration_blocked_overlay_tool_capabilities: filteredExecutionOverlay.blocked?.toolCapabilities || [],
        orchestration_autonomy_suggestions: buildOverlaySuggestionMessages(filteredExecutionOverlay),
        orchestration_autonomy_insights: filteredExecutionOverlay.insights?.recurring_blockers || [],
        orchestration_autonomy_recommendation_summary: filteredExecutionOverlay.insights?.recommendation_summary || null,
        orchestration_autonomy_recurring_blocker: filteredExecutionOverlay.insights?.primary_blocker?.label || null,
        orchestration_autonomy_escalation_recommended: filteredExecutionOverlay.insights?.escalation_recommended === true,
      } : {}),
    };

    if (task.snipara_task_id) {
      try {
        await swarmCoordinator.completeTask(task.snipara_task_id, agentRef, response.content, workspaceId);
      } catch (syncErr) {
        await failTask(task, syncErr, { ...successMeta, result: response.content });
        return;
      }
    }

    await memoryRuntime.recordTaskEpisode({
      db: pool,
      workspaceId,
      agent: executionAgent,
      task,
      response: response.content,
    }).catch((err) => {
      console.warn('[TaskExecutor] memory task persistence failed:', err.message);
    });

    const completedMetadata = {
      ...(parseMetadata(task.metadata) || {}),
      ...successMeta,
    };
    await updateTask(task.id, 'completed', response.content, completedMetadata);
    if (!task.snipara_task_id) {
      await signalRunFromTask({
        ...task,
        status: 'completed',
        metadata: completedMetadata,
      }, {
        reason: 'task_executor_completed',
        eventType: 'delegate.task_completed',
      }).catch(() => {});
    }
    await postTaskChatResult(task, response.content, String(executionAgent.id), executionAgent.name).catch((chatErr) => {
      console.error('[TaskExecutor] Failed to post completion in chat:', chatErr.message);
    });

    console.log(`[TaskExecutor] Completed "${task.title}" by ${executionAgent.name} (${latencyMs}ms)`);
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    console.error(`[TaskExecutor] Failed "${task.title}":`, err.message);
    await failTask(task, err, {
      latency_ms: latencyMs,
      executed_by: executionAgent.name,
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
    buildExecutionPrompt,
    failTask,
    postTaskChatResult,
    queueAutonomousRunForTask,
    resolveTaskWorkflowMode,
    shouldUseAutonomousRun,
  }
};
