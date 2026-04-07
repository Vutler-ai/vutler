'use strict';

const path = require('path');
const { pool } = require('../lib/postgres');
const { signalRunFromTask } = require('./orchestration/runSignals');

const ROUTING_RULES = [
  { patterns: ['bug', 'fix', 'error', 'crash', 'broken', '500', 'fail'], agent: 'bug-hunter', priority: 'P1' },
  { patterns: ['deploy', 'release', 'ship', 'production'], agent: 'release-devops', priority: 'P1' },
  { patterns: ['test', 'qa', 'verify', 'check', 'validate'], agent: 'qa-automation', priority: 'P2' },
  { patterns: ['security', 'vuln', 'rls', 'auth', 'ssl'], agent: 'bug-hunter', priority: 'P1' },
  { patterns: ['schema', 'migration', 'table', 'index', 'database'], agent: 'db-migration', priority: 'P2' },
  { patterns: ['implement', 'feature', 'build', 'create', 'add', 'story'], agent: 'dev-story-executor', priority: 'P2' },
  { patterns: ['design', 'architect', 'plan', 'spec'], agent: 'system-architect', priority: 'P2' },
  { patterns: ['client', 'contact', 'sales', 'demo'], agent: 'andrea', priority: 'P2' },
  { patterns: ['beta', 'ux', 'user', 'onboard'], agent: 'beta-tester', priority: 'P2' },
];

const SCHEMA = 'tenant_vutler';

function classifyAndAssign(task) {
  const text = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
  let bestMatch = null;
  let bestScore = 0;

  for (const rule of ROUTING_RULES) {
    const score = rule.patterns.reduce((s, p) => s + (text.includes(p) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  if (bestMatch) {
    return { agent: bestMatch.agent, priority: bestMatch.priority };
  }
  return { agent: 'dev-story-executor', priority: task.priority || 'P2' };
}

/**
 * Match the most relevant skill for a task using keyword scoring (no LLM).
 *
 * @param {string} taskTitle
 * @param {string} taskDescription
 * @param {string[]} agentSkills - Array of skill keys the agent has
 * @returns {string|null} Best matching skill key, or null if no match above threshold
 */
function matchSkillToTask(taskTitle, taskDescription, agentSkills) {
  if (!Array.isArray(agentSkills) || agentSkills.length === 0) return null;

  let manifest = {};
  try {
    const manifestPath = path.join(__dirname, '../seeds/skill-handlers.json');
    manifest = require(manifestPath);
  } catch (err) {
    console.warn('[TaskRouter] matchSkillToTask: could not load skill-handlers.json:', err.message);
    return null;
  }

  const text = ((taskTitle || '') + ' ' + (taskDescription || '')).toLowerCase();
  const words = text.match(/\w+/g) || [];
  const wordSet = new Set(words);

  const MATCH_THRESHOLD = 1;
  let bestSkill = null;
  let bestScore = MATCH_THRESHOLD - 1;

  for (const skillKey of agentSkills) {
    if (typeof skillKey !== 'string') continue;

    // Tokenise the skill key itself (e.g. "lead_scoring" → ["lead", "scoring"])
    const keyTokens = skillKey.toLowerCase().split(/[_\-\s]+/);

    // Collect additional tokens from the manifest entry description / params
    const manifestEntry = manifest[skillKey] || {};
    const descTokens = [];
    if (manifestEntry.description) {
      const d = manifestEntry.description.toLowerCase().match(/\w+/g) || [];
      descTokens.push(...d);
    }
    // Also tokenise param names for extra keyword surface
    if (manifestEntry.params_schema?.properties) {
      for (const paramKey of Object.keys(manifestEntry.params_schema.properties)) {
        descTokens.push(...paramKey.toLowerCase().split(/[_\-\s]+/));
        const paramDesc = manifestEntry.params_schema.properties[paramKey]?.description || '';
        if (paramDesc) descTokens.push(...(paramDesc.toLowerCase().match(/\w+/g) || []));
      }
    }

    const allTokens = [...keyTokens, ...descTokens];
    const score = allTokens.reduce((s, t) => s + (wordSet.has(t) ? 1 : 0), 0);

    if (score > bestScore) {
      bestScore = score;
      bestSkill = skillKey;
    }
  }

  return bestSkill;
}

async function createTask({ title, description, source, source_ref, priority, due_date, created_by, workspace_id, assigned_agent, metadata }) {
  try {
    if (!assigned_agent) {
      const classification = classifyAndAssign({ title, description, priority });
      assigned_agent = classification.agent;
      if (!priority) priority = classification.priority;
    }
    if (!priority) priority = 'P2';

    // Skill matching: resolve the best skill for this task based on the assigned agent's skills.
    // We look up the agent's skills from DB so we don't rely on the caller passing them in.
    let enrichedMetadata = { ...(metadata || {}) };
    if (assigned_agent && !enrichedMetadata.skill_key) {
      try {
        const agentRow = await pool.query(
          `SELECT config FROM ${SCHEMA}.agents WHERE username = $1 LIMIT 1`,
          [assigned_agent]
        );
        const agentConfig = agentRow.rows[0]?.config || {};
        const agentSkills = agentConfig.skills || [];
        const matchedSkill = matchSkillToTask(title, description, agentSkills);
        if (matchedSkill) {
          enrichedMetadata.skill_key = matchedSkill;
          console.log(`[TaskRouter] Matched skill "${matchedSkill}" for agent "${assigned_agent}"`);
        }
      } catch (skillErr) {
        console.warn('[TaskRouter] Skill matching failed (non-fatal):', skillErr.message);
      }
    }

    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();
    const task = await coordinator.createTask({
      title,
      description: description || null,
      priority: priority || 'P2',
      for_agent_id: assigned_agent,
      metadata: {
        ...(enrichedMetadata || {}),
        source: source || null,
        source_ref: source_ref || null,
        due_date: due_date || null,
        created_by: created_by || null,
      },
    }, workspace_id || '00000000-0000-0000-0000-000000000001');

    console.log('[TaskRouter] Created task:', task.id, '→', assigned_agent);
    return task;
  } catch (err) {
    console.error('[TaskRouter] createTask error:', err.message);
    throw err;
  }
}

async function getTask(taskId, workspaceId) {
  try {
    // SECURITY: always scope by workspace_id (audit 2026-03-28)
    if (workspaceId) {
      const result = await pool.query(`SELECT * FROM ${SCHEMA}.tasks WHERE id = $1 AND workspace_id = $2`, [taskId, workspaceId]);
      return result.rows[0] || null;
    }
    const result = await pool.query(`SELECT * FROM ${SCHEMA}.tasks WHERE id = $1`, [taskId]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('[TaskRouter] getTask error:', err.message);
    throw err;
  }
}

async function listTasks({ status, assigned_agent, workspace_id } = {}) {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (assigned_agent) { conditions.push(`assigned_agent = $${idx++}`); params.push(assigned_agent); }
    if (workspace_id) { conditions.push(`workspace_id = $${idx++}`); params.push(workspace_id); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks ${where} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] listTasks error:', err.message);
    throw err;
  }
}

async function updateTask(taskId, updates, workspaceId) {
  try {
    const allowed = ['title', 'description', 'status', 'priority', 'assigned_agent', 'due_date', 'reminder_at', 'escalation_at', 'metadata'];
    const sets = [];
    const params = [];
    let idx = 1;

    for (const key of allowed) {
      if (updates[key] !== undefined) {
        sets.push(`${key} = $${idx++}`);
        params.push(key === 'metadata' ? JSON.stringify(updates[key]) : updates[key]);
      }
    }

    if (updates.status === 'done' || updates.status === 'completed') {
      sets.push(`resolved_at = $${idx++}`);
      params.push(new Date());
    }

    sets.push(`updated_at = $${idx++}`);
    params.push(new Date());
    params.push(taskId);

    // SECURITY: scope update by workspace_id when available (audit 2026-03-28)
    let whereClause = `WHERE id = $${idx}`;
    if (workspaceId) {
      params.push(workspaceId);
      idx++;
      whereClause += ` AND workspace_id = $${idx}`;
    }

    const result = await pool.query(
      `UPDATE ${SCHEMA}.tasks SET ${sets.join(', ')} ${whereClause} RETURNING *`,
      params
    );

    const task = result.rows[0];
    const shouldSyncRemote = updates.sync_remote !== false;

    // Legacy path: newer tasks-v2 / webhook flows already sync through SwarmCoordinator.
    if (shouldSyncRemote && task && (updates.status === 'in_progress' || updates.status === 'claimed') && (task.snipara_task_id || task.swarm_task_id)) {
      const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
      await getSwarmCoordinator().claimTask(
        task.snipara_task_id || task.swarm_task_id,
        task.assigned_agent,
        task.workspace_id || workspaceId
      );
    }

    if (shouldSyncRemote && task && (updates.status === 'done' || updates.status === 'completed') && (task.snipara_task_id || task.swarm_task_id)) {
      const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
      await getSwarmCoordinator().completeTask(
        task.snipara_task_id || task.swarm_task_id,
        task.assigned_agent,
        updates.output,
        task.workspace_id || workspaceId
      );
      console.log('[TaskRouter] Completed task in Snipara swarm:', task.snipara_task_id || task.swarm_task_id);
    }

    const remoteCompletionHandled = shouldSyncRemote
      && task
      && (updates.status === 'done' || updates.status === 'completed')
      && (task.snipara_task_id || task.swarm_task_id);

    if (!remoteCompletionHandled) {
      await signalRunFromTask(task, {
        reason: 'task_router_update',
        eventType: updates.status === 'done' || updates.status === 'completed'
          ? 'delegate.task_completed'
          : updates.status === 'failed'
            ? 'delegate.task_failed'
            : 'delegate.task_status_changed',
      }).catch(() => {});
    }

    return task || null;
  } catch (err) {
    console.error('[TaskRouter] updateTask error:', err.message);
    throw err;
  }
}

async function getDueTasks(workspaceId) {
  try {
    const params = [];
    const conditions = [`due_date < NOW() + INTERVAL '2 hours'`, `status NOT IN ('done', 'cancelled')`];
    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`workspace_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE ${conditions.join(' AND ')} ORDER BY due_date ASC`,
      params
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] getDueTasks error:', err.message);
    throw err;
  }
}

async function getOverdueTasks(workspaceId) {
  try {
    const params = [];
    const conditions = [`due_date < NOW()`, `status NOT IN ('done', 'cancelled')`];
    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`workspace_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE ${conditions.join(' AND ')} ORDER BY due_date ASC`,
      params
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] getOverdueTasks error:', err.message);
    throw err;
  }
}

async function checkReminders(workspaceId) {
  try {
    const params = [];
    const conditions = [`reminder_at <= NOW()`, `status IN ('open', 'in_progress')`];
    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`workspace_id = $${params.length}`);
    }
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE ${conditions.join(' AND ')} ORDER BY reminder_at ASC`,
      params
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] checkReminders error:', err.message);
    throw err;
  }
}

/**
 * Delete a task by ID, scoped to workspace.
 */
async function deleteTask(taskId, workspaceId) {
  try {
    const conditions = ['id = $1'];
    const params = [taskId];
    if (workspaceId) {
      params.push(workspaceId);
      conditions.push(`workspace_id = $${params.length}`);
    }
    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.tasks WHERE ${conditions.join(' AND ')} RETURNING id`,
      params
    );
    if (!result.rows.length) throw new Error('Task not found');
    return result.rows[0];
  } catch (err) {
    console.error('[TaskRouter] deleteTask error:', err.message);
    throw err;
  }
}

module.exports = {
  ROUTING_RULES,
  classifyAndAssign,
  createTask,
  getTask,
  listTasks,
  updateTask,
  deleteTask,
  getDueTasks,
  getOverdueTasks,
  checkReminders,
};
