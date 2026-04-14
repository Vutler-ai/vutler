'use strict';

/**
 * Runbooks Service — parse & execute structured task lists (batch runbooks)
 *
 * A Runbook is a named sequence of steps. Each step maps to either:
 *   - A skill_key (dispatched via SkillRegistry, if available)
 *   - A free-text action description (delegated to LLM)
 *
 * Vault credentials are resolved just-in-time via services/vault.js getSecret().
 * Parallel steps (step.parallel = true) are grouped with the next step and
 * awaited together.
 *
 * Approval flow: when step.requireApproval is true the executor emits an
 * 'approval_needed' event and pauses until approveStep() is called externally
 * (e.g. from the REST API).
 *
 * @typedef {Object} RunbookStep
 * @property {number}  order         — 1-based execution order
 * @property {string}  action        — skill_key or free-text description
 * @property {object}  [params]      — action parameters
 * @property {string}  [target]      — vault secret label (e.g. "Prod DB")
 * @property {string}  [condition]   — "if previous.success" | "always" (default: always)
 * @property {boolean} [parallel]    — run together with next step
 * @property {boolean} [requireApproval] — pause until human approves
 *
 * @typedef {Object} Runbook
 * @property {string}        name
 * @property {string}        [description]
 * @property {RunbookStep[]} steps
 * @property {string}        [agentId]
 * @property {boolean}       [requireApproval]
 */

const EventEmitter = require('events');
const pool = require('../lib/vaultbrix');
const { chat: llmChat } = require('./llmRouter');

const SCHEMA = 'tenant_vutler';

// Active runbook executions keyed by runbookId
const _activeRunbooks = new Map();

// ── DDL ───────────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${SCHEMA}.runbooks (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID         NOT NULL,
  name          TEXT         NOT NULL,
  description   TEXT,
  agent_id      TEXT,
  status        TEXT         DEFAULT 'pending'
                             CHECK (status IN ('pending','running','completed','failed','cancelled')),
  definition    JSONB        NOT NULL,
  results       JSONB        DEFAULT '[]',
  current_step  INTEGER      DEFAULT 0,
  total_steps   INTEGER      NOT NULL,
  created_by    TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runbooks_workspace
  ON ${SCHEMA}.runbooks (workspace_id);

CREATE INDEX IF NOT EXISTS idx_runbooks_status
  ON ${SCHEMA}.runbooks (status);
`;

let _tableEnsured = false;

function resolveRequiredWorkspaceId(workspaceId) {
  const value = typeof workspaceId === 'string' ? workspaceId.trim() : workspaceId;
  if (value) return value;
  throw new Error('workspaceId is required for runbook operations');
}

async function ensureTable() {
  if (_tableEnsured) return;
  try {
    await pool.query(CREATE_TABLE_SQL);
    _tableEnsured = true;
  } catch (err) {
    console.warn('[Runbooks] Could not ensure table:', err.message);
  }
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Use LLM to extract a structured runbook from free text.
 * Accepts numbered lists, tables, YAML-ish prose, or any format.
 *
 * @param {string} text
 * @param {object} [llmConfig] — override model/provider
 * @returns {Promise<Runbook>}
 */
async function parseRunbookFromText(text, llmConfig = {}) {
  const prompt = `You are a structured-task extractor. Parse the following text and return ONLY valid JSON (no markdown fences) matching this schema:
{
  "name": "string — short runbook title",
  "description": "string — what this runbook does",
  "steps": [
    {
      "order": 1,
      "action": "string — skill_key or plain description of the action",
      "params": {},
      "target": "optional vault secret label",
      "condition": "always | if previous.success",
      "parallel": false,
      "requireApproval": false
    }
  ]
}

Rules:
- order starts at 1 and increments by 1
- action must be a concise verb phrase (e.g. "deploy_app", "send email to team")
- params should contain any relevant parameters extracted from the text
- condition defaults to "always" unless the text implies conditional execution
- parallel defaults to false
- requireApproval is true only if the text mentions review/approval/confirmation
- Extract ALL distinct steps — do not merge unrelated actions

Text to parse:
---
${text.slice(0, 4000)}
---`;

  const config = {
    model: llmConfig.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
    provider: llmConfig.provider || 'openai',
    temperature: 0.1,
    max_tokens: 1500,
    ...llmConfig,
  };

  let parsed = null;

  try {
    const result = await llmChat(config, [{ role: 'user', content: prompt }]);
    const raw = String(result?.content || '{}');
    // Strip markdown fences if the LLM returned them anyway
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    parsed = JSON.parse(jsonStr.match(/\{[\s\S]*\}/)?.[0] || jsonStr);
  } catch (err) {
    console.error('[Runbooks] parseRunbookFromText LLM error:', err.message);
    throw new Error(`Failed to parse runbook from text: ${err.message}`);
  }

  return parseRunbookFromJSON(parsed);
}

/**
 * Validate and normalize a runbook JSON object.
 *
 * @param {object} json
 * @returns {Runbook}
 */
function parseRunbookFromJSON(json) {
  if (!json || typeof json !== 'object') {
    throw new Error('Runbook must be an object');
  }

  const runbook = {
    name: String(json.name || 'Untitled Runbook').slice(0, 200),
    description: String(json.description || '').slice(0, 1000),
    steps: [],
    agentId: json.agentId || json.agent_id || null,
    requireApproval: Boolean(json.requireApproval || json.require_approval),
  };

  const rawSteps = Array.isArray(json.steps) ? json.steps : [];
  runbook.steps = rawSteps.map((s, i) => ({
    order: Number(s.order) || i + 1,
    action: String(s.action || '').trim(),
    params: (s.params && typeof s.params === 'object') ? s.params : {},
    target: s.target ? String(s.target) : null,
    condition: ['always', 'if previous.success'].includes(s.condition) ? s.condition : 'always',
    parallel: Boolean(s.parallel),
    requireApproval: Boolean(s.requireApproval || s.require_approval),
  }));

  // Sort by order
  runbook.steps.sort((a, b) => a.order - b.order);

  return runbook;
}

/**
 * Validate a runbook definition against known constraints.
 * Returns { valid: boolean, errors: string[] }.
 *
 * @param {Runbook} runbook
 * @param {string} [workspaceId]
 * @returns {Promise<{ valid: boolean, errors: string[] }>}
 */
async function validateRunbook(runbook, workspaceId) {
  const resolvedWorkspaceId = resolveRequiredWorkspaceId(workspaceId);
  const errors = [];

  if (!runbook.name || !runbook.name.trim()) {
    errors.push('Runbook must have a name');
  }

  if (!Array.isArray(runbook.steps) || runbook.steps.length === 0) {
    errors.push('Runbook must have at least one step');
  }

  for (const step of (runbook.steps || [])) {
    if (!step.action || !step.action.trim()) {
      errors.push(`Step ${step.order}: action is required`);
    }

    // Validate condition syntax
    if (step.condition && !['always', 'if previous.success'].includes(step.condition)) {
      errors.push(`Step ${step.order}: unknown condition "${step.condition}"`);
    }

    // Check vault secret exists if target is set
    if (step.target) {
      try {
        const row = await pool.query(
          `SELECT id FROM ${SCHEMA}.vault_secrets
           WHERE workspace_id = $1 AND label = $2 LIMIT 1`,
          [resolvedWorkspaceId, step.target]
        );
        if (row.rows.length === 0) {
          errors.push(`Step ${step.order}: vault secret "${step.target}" not found`);
        }
      } catch (_) {
        // vault_secrets table may not exist yet — non-blocking warning
        console.warn(`[Runbooks] Could not validate vault target "${step.target}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── Execution ─────────────────────────────────────────────────────────────────

/**
 * Execute a runbook and persist results to the DB.
 *
 * @param {Runbook}  runbook
 * @param {object}   context
 * @param {string}   [context.workspaceId]
 * @param {string}   [context.createdBy]
 * @param {object}   [context.llmConfig]   — LLM config override for free-text steps
 * @returns {Promise<{ runbookId: string, name: string, totalSteps: number, completed: number, failed: number, skipped: number, results: object[] }>}
 */
async function executeRunbook(runbook, context = {}) {
  const workspaceId = resolveRequiredWorkspaceId(context.workspaceId);
  await ensureTable();

  const createdBy = context.createdBy || null;

  // Persist initial record
  const ins = await pool.query(
    `INSERT INTO ${SCHEMA}.runbooks
       (workspace_id, name, description, agent_id, status, definition, results, current_step, total_steps, created_by, started_at)
     VALUES ($1, $2, $3, $4, 'running', $5, '[]', 0, $6, $7, NOW())
     RETURNING id`,
    [
      workspaceId,
      runbook.name,
      runbook.description || null,
      runbook.agentId || null,
      JSON.stringify(runbook),
      runbook.steps.length,
      createdBy,
    ]
  );

  const runbookId = ins.rows[0].id;

  // State for approval gating
  const emitter = new EventEmitter();
  const approvalPromises = new Map(); // stepOrder -> { resolve, reject }

  _activeRunbooks.set(runbookId, {
    runbook,
    workspaceId,
    emitter,
    cancelled: false,
    approvalPromises,
  });

  // Run asynchronously so the API can return the runbookId immediately
  _runSteps(runbookId, runbook, workspaceId, context, emitter, approvalPromises).catch((err) => {
    console.error(`[Runbooks] Unhandled execution error for ${runbookId}:`, err.message);
  });

  return { runbookId, name: runbook.name, totalSteps: runbook.steps.length };
}

async function _runSteps(runbookId, runbook, workspaceId, context, emitter, approvalPromises) {
  const results = [];
  let completed = 0;
  let failed = 0;
  let skipped = 0;
  let previousSuccess = true;

  const steps = [...runbook.steps];

  let i = 0;
  while (i < steps.length) {
    const active = _activeRunbooks.get(runbookId);
    if (!active || active.cancelled) {
      await _updateRunbook(runbookId, 'cancelled', results, i);
      _activeRunbooks.delete(runbookId);
      return;
    }

    const step = steps[i];

    // Condition check
    if (step.condition === 'if previous.success' && !previousSuccess) {
      results.push(_skipResult(step, 'Condition not met: previous step failed'));
      skipped++;
      i++;
      continue;
    }

    // Approval gate
    const needsApproval = step.requireApproval || runbook.requireApproval;
    if (needsApproval) {
      await _updateRunbook(runbookId, 'running', results, step.order - 1);
      emitter.emit('approval_needed', { runbookId, stepOrder: step.order, step });

      // Wait for external approval
      const approved = await new Promise((resolve) => {
        approvalPromises.set(step.order, { resolve });
        // Auto-timeout after 24h to avoid hanging forever
        setTimeout(() => resolve(false), 24 * 60 * 60 * 1000);
      });
      approvalPromises.delete(step.order);

      if (!approved) {
        results.push(_skipResult(step, 'Step not approved'));
        skipped++;
        i++;
        continue;
      }
    }

    // Collect parallel group starting at i
    const group = [step];
    while (steps[i + group.length]?.parallel && i + group.length < steps.length) {
      group.push(steps[i + group.length]);
    }

    // Execute the group
    const groupResults = await Promise.all(
      group.map((s) => _executeStep(s, context, workspaceId, previousSuccess))
    );

    for (const r of groupResults) {
      results.push(r);
      if (r.success) {
        completed++;
      } else {
        failed++;
      }
    }

    // previousSuccess is true only if ALL steps in the group succeeded
    previousSuccess = groupResults.every((r) => r.success);

    // Advance by group size
    i += group.length;

    // Persist progress after each group
    await _updateRunbook(runbookId, 'running', results, i);
  }

  const finalStatus = failed > 0 && completed === 0 ? 'failed' : 'completed';
  await _updateRunbook(runbookId, finalStatus, results, steps.length, true);
  _activeRunbooks.delete(runbookId);

  console.log(`[Runbooks] ${runbookId} finished — ${completed} ok, ${failed} failed, ${skipped} skipped`);
}

async function _executeStep(step, context, workspaceId, _previousSuccess) {
  const start = Date.now();
  let credential = null;

  // Resolve vault credential
  if (step.target) {
    try {
      const { getSecret } = require('./vault');
      credential = await getSecret(workspaceId, step.target);
    } catch (err) {
      console.warn(`[Runbooks] Vault resolution failed for "${step.target}":`, err.message);
    }
  }

  try {
    let output = null;

    // Try SkillRegistry first (if available in the project)
    let skillRegistry = null;
    try {
      skillRegistry = require('./skillRegistry');
    } catch (_) { /* not available */ }

    if (skillRegistry && typeof skillRegistry.execute === 'function') {
      try {
        output = await skillRegistry.execute(step.action, {
          ...step.params,
          credential,
          workspaceId,
        });
      } catch (skillErr) {
        // Skill not found — fall through to LLM
        if (!skillErr.message?.includes('not found') && !skillErr.message?.includes('unknown')) {
          throw skillErr;
        }
      }
    }

    // Fallback: delegate to LLM as a free-text action
    if (output === null) {
      const llmConfig = context.llmConfig || {};
      const credentialHint = credential
        ? `\nCredential available: ${JSON.stringify({ label: step.target, host: credential.host, username: credential.username })}`
        : '';

      const prompt = `Execute the following action and return a JSON result: {"success": true/false, "output": "..."}\n\nAction: ${step.action}\nParams: ${JSON.stringify(step.params)}${credentialHint}`;

      const llmResult = await llmChat(
        {
          model: llmConfig.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
          provider: llmConfig.provider || 'openai',
          temperature: 0.2,
          max_tokens: 600,
        },
        [{ role: 'user', content: prompt }]
      );

      const raw = String(llmResult?.content || '{}');
      try {
        const jsonStr = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
        output = JSON.parse(jsonStr.match(/\{[\s\S]*\}/)?.[0] || jsonStr);
      } catch (_) {
        output = { success: true, output: raw.slice(0, 500) };
      }
    }

    const success = output?.success !== false;
    return {
      order: step.order,
      action: step.action,
      success,
      output: output?.output ?? output,
      duration_ms: Date.now() - start,
      executed_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error(`[Runbooks] Step ${step.order} "${step.action}" failed:`, err.message);
    return {
      order: step.order,
      action: step.action,
      success: false,
      error: err.message,
      duration_ms: Date.now() - start,
      executed_at: new Date().toISOString(),
    };
  }
}

function _skipResult(step, reason) {
  return {
    order: step.order,
    action: step.action,
    success: false,
    skipped: true,
    reason,
    duration_ms: 0,
    executed_at: new Date().toISOString(),
  };
}

async function _updateRunbook(runbookId, status, results, currentStep, completed = false) {
  try {
    await pool.query(
      `UPDATE ${SCHEMA}.runbooks
       SET status = $2,
           results = $3,
           current_step = $4,
           completed_at = ${completed ? 'NOW()' : 'completed_at'}
       WHERE id = $1`,
      [runbookId, status, JSON.stringify(results), currentStep]
    );
  } catch (err) {
    console.error('[Runbooks] Failed to update runbook status:', err.message);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get the current status and results of a running/finished runbook.
 *
 * @param {string} runbookId
 * @returns {Promise<object|null>}
 */
async function getRunbookStatus(runbookId, workspaceId = null) {
  await ensureTable();
  const params = [runbookId];
  let where = 'id = $1';
  if (workspaceId) {
    params.push(resolveRequiredWorkspaceId(workspaceId));
    where += ' AND workspace_id = $2';
  }
  const row = await pool.query(
    `SELECT id, workspace_id, name, description, agent_id, status,
            definition, results, current_step, total_steps,
            created_by, started_at, completed_at, created_at
     FROM ${SCHEMA}.runbooks
     WHERE ${where}`,
    params
  );
  return row.rows[0] || null;
}

/**
 * List runbooks for a workspace (most recent first).
 *
 * @param {string} workspaceId
 * @param {object} [opts]
 * @param {number} [opts.limit=50]
 * @param {string} [opts.status]
 * @returns {Promise<object[]>}
 */
async function listRunbooks(workspaceId, opts = {}) {
  const resolvedWorkspaceId = resolveRequiredWorkspaceId(workspaceId);
  await ensureTable();
  const limit = Number(opts.limit) || 50;
  const params = [resolvedWorkspaceId, limit];
  let where = 'workspace_id = $1';

  if (opts.status) {
    params.splice(1, 0, opts.status);
    where += ' AND status = $2';
  }

  const q = await pool.query(
    `SELECT id, workspace_id, name, description, agent_id, status,
            current_step, total_steps, created_by, started_at, completed_at, created_at
     FROM ${SCHEMA}.runbooks
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return q.rows;
}

/**
 * Cancel a running runbook.
 * Sets a flag that the execution loop checks on each iteration.
 *
 * @param {string} runbookId
 * @returns {Promise<boolean>} true if the runbook was found and marked for cancellation
 */
async function cancelRunbook(runbookId, workspaceId = null) {
  await ensureTable();
  const active = _activeRunbooks.get(runbookId);
  const resolvedWorkspaceId = workspaceId ? resolveRequiredWorkspaceId(workspaceId) : null;
  const workspaceMatches = !resolvedWorkspaceId || active?.workspaceId === resolvedWorkspaceId;
  if (active && workspaceMatches) {
    active.cancelled = true;
  }
  // Also update DB in case the process was restarted
  const params = [runbookId];
  let where = `id = $1 AND status IN ('pending','running')`;
  if (resolvedWorkspaceId) {
    params.push(resolvedWorkspaceId);
    where += ' AND workspace_id = $2';
  }
  const upd = await pool.query(
    `UPDATE ${SCHEMA}.runbooks
     SET status = 'cancelled', completed_at = NOW()
     WHERE ${where}
     RETURNING id`,
    params
  );
  return (active !== undefined && workspaceMatches) || upd.rows.length > 0;
}

/**
 * Approve a step that is waiting for human approval.
 *
 * @param {string} runbookId
 * @param {number} stepOrder
 * @param {boolean} [approved=true]
 * @returns {boolean} whether the approval was delivered
 */
function approveStep(runbookId, stepOrder, approved = true, workspaceId = null) {
  const active = _activeRunbooks.get(runbookId);
  if (!active) return false;
  if (workspaceId && active.workspaceId !== resolveRequiredWorkspaceId(workspaceId)) return false;
  const pending = active.approvalPromises.get(stepOrder);
  if (!pending) return false;
  pending.resolve(approved);
  return true;
}

/**
 * Detect whether a chat message likely contains a runbook intent.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isRunbookIntent(text) {
  const lower = String(text || '').trim().toLowerCase();

  // Explicit markers
  if (/runbook\s*[:：]/.test(lower)) return true;
  if (/(?:ex[eé]cute|run|lance|joue|play)\s+(?:ces|this|the|le|les)\s+(?:[eé]tape|step|action|tâche|task)/i.test(text)) return true;
  if (/fais\s+(?:dans\s+l['']ordre|en\s+(?:s[eé]quence|ordre))/i.test(text)) return true;
  if (/(?:do\s+in\s+order|steps?\s+to\s+follow|follow\s+these\s+steps)/i.test(lower)) return true;

  // Numbered list with 2+ action items
  const numberedLines = (text.match(/^\s*\d+[.)]\s+\S+/gm) || []);
  if (numberedLines.length >= 2) {
    // Make sure the items look like actions, not just a regular list
    const actionWords = /\b(deploy|send|create|update|delete|run|execute|check|restart|migrate|backup|notify|upload|download|install|configure|enable|disable|start|stop|build|test|scan|fetch|post|push|pull|init|setup|grant|revoke|add|remove|trigger)\b/i;
    const actionHits = numberedLines.filter((l) => actionWords.test(l)).length;
    if (actionHits >= 2) return true;
  }

  return false;
}

module.exports = {
  parseRunbookFromText,
  parseRunbookFromJSON,
  validateRunbook,
  executeRunbook,
  getRunbookStatus,
  listRunbooks,
  cancelRunbook,
  approveStep,
  isRunbookIntent,
  ensureTable,
  resolveRequiredWorkspaceId,
};
