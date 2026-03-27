'use strict';

/**
 * Sandbox Executor — auto bug-fix & code-test pipeline
 * 
 * Flow:
 * 1. Receives a task (bug/incident/review)
 * 2. Routes to correct agent via nexusRouting
 * 3. Creates sandbox session
 * 4. Calls agent LLM with task context + code
 * 5. Returns analysis/fix/test results
 * 6. Marks task complete with results
 */

const { routeTask, getAgentByUsername } = require('./nexusRouting');
const { chat } = require('./llmRouter');
const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// In-memory execution log
const executions = [];

/**
 * Execute a sandbox run for a task
 * @param {object} params
 * @param {string} params.taskType — bug, incident, review, deploy, migration
 * @param {string} params.title — task title
 * @param {string} params.description — full description (code snippet, error, context)
 * @param {string} params.code — optional code to analyze/fix
 * @param {string} params.errorLog — optional error output
 * @param {object} params.metadata — extra context
 * @returns {{ executionId, agent, status, result }}
 */
async function execute({ taskType, title, description, code, errorLog, metadata = {} }) {
  const startTime = Date.now();
  const executionId = `exec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[SANDBOX] Starting execution ${executionId} — type=${taskType}, title="${title}"`);

  // 1. Route to agent
  const routing = await routeTask(taskType);
  if (!routing.agent) {
    throw new Error(`No agent found for task type: ${taskType}`);
  }

  const agent = routing.agent;
  console.log(`[SANDBOX] Routed to ${agent.username} (${agent.model})`);

  // 2. Get full agent config from DB
  const agentRow = await pool.query(
    `SELECT * FROM ${SCHEMA}.agents WHERE id = $1 LIMIT 1`,
    [agent.id]
  );
  const agentConfig = agentRow.rows[0] || agent;

  // 3. Build prompt based on task type
  let systemPrompt = buildSystemPrompt(taskType, agentConfig);
  const userMessage = buildUserMessage({ taskType, title, description, code, errorLog, metadata });

  // 3b. Apply workflow mode — enrich context for FULL tasks
  const { getWorkflowModeSelector } = require('./workflowMode');
  const workflow = getWorkflowModeSelector().score({ title, description, taskType });
  console.log(`[SANDBOX] Workflow mode: ${workflow.mode} (score: ${workflow.score})`);

  if (workflow.mode === 'FULL') {
    try {
      const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
      const coordinator = getSwarmCoordinator();
      const fullContext = await getWorkflowModeSelector().gatherFullContext(
        agent.username || agent.id, { title, description }, coordinator
      );
      systemPrompt = fullContext.enrichedPrompt + '\n\n' + systemPrompt;
    } catch (err) {
      console.warn('[SANDBOX] FULL context gathering failed, proceeding with LITE:', err.message);
      systemPrompt = getWorkflowModeSelector().getLitePrompt() + '\n\n' + systemPrompt;
    }
  } else {
    systemPrompt = getWorkflowModeSelector().getLitePrompt() + '\n\n' + systemPrompt;
  }

  const messages = [{ role: 'user', content: userMessage }];

  // 4. Call LLM
  let llmResult;
  try {
    llmResult = await chat(
      {
        model: agentConfig.model,
        provider: agentConfig.provider,
        system_prompt: systemPrompt,
        temperature: workflow.mode === 'FULL' ? 0.4 : 0.3,
        max_tokens: workflow.mode === 'FULL' ? 16384 : 8192,
      },
      messages
    );
  } catch (err) {
    console.error(`[SANDBOX] LLM call failed for ${executionId}:`, err.message);
    const execution = {
      id: executionId,
      taskType,
      title,
      agent: { id: agent.id, username: agent.username, model: agent.model },
      status: 'error',
      error: err.message,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
    };
    executions.unshift(execution);
    return execution;
  }

  // 5. Parse result
  const result = parseLLMResult(llmResult.content, taskType);

  const execution = {
    id: executionId,
    taskType,
    title,
    agent: {
      id: agent.id,
      username: agent.username,
      model: agent.model,
      provider: llmResult.provider,
    },
    status: result.verdict || 'completed',
    result,
    llm: {
      tokens: llmResult.usage,
      latency_ms: llmResult.latency_ms,
      model: llmResult.model,
    },
    startedAt: new Date(startTime).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startTime,
  };

  executions.unshift(execution);

  // 6. Log to DB
  try {
    await pool.query(
      `INSERT INTO ${SCHEMA}.agent_executions (
        id, workspace_id, agent_id, execution_type, title, status, 
        result, tokens_used, duration_ms, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW())`,
      [
        executionId,
        DEFAULT_WORKSPACE,
        agent.id,
        taskType,
        title,
        execution.status,
        JSON.stringify(result),
        (llmResult.usage?.input_tokens || 0) + (llmResult.usage?.output_tokens || 0),
        execution.durationMs,
      ]
    );
  } catch (dbErr) {
    console.warn(`[SANDBOX] DB log failed (non-fatal):`, dbErr.message);
  }

  console.log(`[SANDBOX] Execution ${executionId} completed — status=${execution.status}, ${execution.durationMs}ms`);
  return execution;
}

function buildSystemPrompt(taskType, agent) {
  const base = agent.system_prompt || '';
  
  const typePrompts = {
    bug: `${base}\n\nYou are analyzing a bug report. Provide:\n1. ROOT CAUSE analysis\n2. PROPOSED FIX (exact code diff)\n3. TEST to validate the fix\n4. RISK assessment (low/medium/high)\n\nFormat your response as JSON with keys: rootCause, proposedFix, test, risk, verdict (fix_ready|needs_info|wontfix)`,
    
    incident: `${base}\n\nYou are responding to a production incident. Provide:\n1. IMPACT assessment\n2. IMMEDIATE mitigation steps\n3. ROOT CAUSE hypothesis\n4. FIX (exact code or config change)\n5. REGRESSION prevention\n\nFormat your response as JSON with keys: impact, mitigation, rootCause, fix, prevention, verdict (fix_ready|escalate|monitoring)`,
    
    review: `${base}\n\nYou are doing a code review. Provide:\n1. ISSUES found (bugs, security, performance)\n2. SUGGESTIONS for improvement\n3. APPROVAL decision\n\nFormat your response as JSON with keys: issues (array), suggestions (array), approved (boolean), verdict (approved|changes_requested|blocked)`,
    
    deploy: `${base}\n\nYou are validating a deployment. Provide:\n1. PRE-DEPLOY checks\n2. DEPLOY steps\n3. POST-DEPLOY smoke test plan\n4. ROLLBACK plan\n\nFormat your response as JSON with keys: preChecks, deploySteps, smokeTests, rollbackPlan, verdict (ready|blocked)`,
    
    migration: `${base}\n\nYou are reviewing a database migration. Provide:\n1. MIGRATION steps (up)\n2. ROLLBACK steps (down)\n3. DATA IMPACT assessment\n4. RISK level\n\nFormat your response as JSON with keys: upSteps, downSteps, dataImpact, risk, verdict (ready|needs_review|blocked)`,
  };

  return typePrompts[taskType] || `${base}\n\nAnalyze the task and provide a structured JSON response with keys: analysis, recommendation, verdict.`;
}

function buildUserMessage({ taskType, title, description, code, errorLog, metadata }) {
  let msg = `## Task: ${title}\n\n`;
  if (description) msg += `### Description\n${description}\n\n`;
  if (code) msg += `### Code\n\`\`\`\n${code}\n\`\`\`\n\n`;
  if (errorLog) msg += `### Error Log\n\`\`\`\n${errorLog}\n\`\`\`\n\n`;
  if (metadata && Object.keys(metadata).length > 0) {
    msg += `### Context\n${JSON.stringify(metadata, null, 2)}\n\n`;
  }
  msg += `\nProvide your analysis as JSON.`;
  return msg;
}

function parseLLMResult(content, taskType) {
  try {
    // Try to extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    // Fall through to raw
  }
  return { raw: content, verdict: 'completed' };
}

function getExecutions(limit = 50) {
  return executions.slice(0, limit);
}

function getExecution(id) {
  return executions.find(e => e.id === id) || null;
}

module.exports = { execute, getExecutions, getExecution };
