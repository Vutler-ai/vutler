'use strict';

const { pool } = require('../lib/postgres');
const sniparaService = require('./sniparaService');

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
 * Get workspace Snipara API key
 */
async function getWorkspaceSniparaKey(workspaceId) {
  try {
    const result = await pool.query(
      `SELECT snipara_api_key FROM ${SCHEMA}.workspaces WHERE id = $1`,
      [workspaceId]
    );
    return result.rows[0]?.snipara_api_key || null;
  } catch (err) {
    console.error('[TaskRouter] getWorkspaceSniparaKey error:', err.message);
    return null;
  }
}

async function createTask({ title, description, source, source_ref, priority, due_date, created_by, workspace_id, assigned_agent, metadata }) {
  try {
    if (!assigned_agent) {
      const classification = classifyAndAssign({ title, description, priority });
      assigned_agent = classification.agent;
      if (!priority) priority = classification.priority;
    }
    if (!priority) priority = 'P2';

    let reminder_at = null;
    let escalation_at = null;
    if (due_date) {
      const d = new Date(due_date);
      reminder_at = new Date(d.getTime() - 60 * 60 * 1000);
      escalation_at = new Date(d.getTime() + 30 * 60 * 1000);
    }

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.tasks (title, description, source, source_ref, priority, assigned_agent, created_by, due_date, reminder_at, escalation_at, workspace_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [title, description || null, source || null, source_ref || null, priority, assigned_agent, created_by || null, due_date || null, reminder_at, escalation_at, workspace_id || '00000000-0000-0000-0000-000000000001', JSON.stringify(metadata || {})]
    );

    const task = result.rows[0];
    console.log('[TaskRouter] Created task:', task.id, '→', assigned_agent);

    // 🔵 SNIPARA SYNC: Create task in swarm (non-blocking)
    if (workspace_id) {
      const sniparaKey = await getWorkspaceSniparaKey(workspace_id);
      if (sniparaKey) {
        const swarmTaskId = await sniparaService.createTask(task, sniparaKey);
        if (swarmTaskId) {
          // Update task with swarm_task_id
          await pool.query(
            `UPDATE ${SCHEMA}.tasks SET swarm_task_id = $1 WHERE id = $2`,
            [swarmTaskId, task.id]
          );
          task.swarm_task_id = swarmTaskId;
          console.log('[TaskRouter] Synced to Snipara swarm:', swarmTaskId);
        }
      }
    }

    return task;
  } catch (err) {
    console.error('[TaskRouter] createTask error:', err.message);
    throw err;
  }
}

async function getTask(taskId) {
  try {
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

async function updateTask(taskId, updates) {
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

    const result = await pool.query(
      `UPDATE ${SCHEMA}.tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    const task = result.rows[0];

    // 🔵 SNIPARA SYNC: Complete task in swarm when status is 'completed' or 'done'
    if (task && (updates.status === 'done' || updates.status === 'completed') && task.swarm_task_id) {
      const sniparaKey = await getWorkspaceSniparaKey(task.workspace_id);
      if (sniparaKey) {
        await sniparaService.completeTask(task.swarm_task_id, sniparaKey);
        console.log('[TaskRouter] Completed task in Snipara swarm:', task.swarm_task_id);
      }
    }

    return task || null;
  } catch (err) {
    console.error('[TaskRouter] updateTask error:', err.message);
    throw err;
  }
}

async function getDueTasks() {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE due_date < NOW() + INTERVAL '2 hours' AND status NOT IN ('done', 'cancelled') ORDER BY due_date ASC`
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] getDueTasks error:', err.message);
    throw err;
  }
}

async function getOverdueTasks() {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE due_date < NOW() AND status NOT IN ('done', 'cancelled') ORDER BY due_date ASC`
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] getOverdueTasks error:', err.message);
    throw err;
  }
}

async function checkReminders() {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE reminder_at <= NOW() AND status IN ('open', 'in_progress') ORDER BY reminder_at ASC`
    );
    return result.rows;
  } catch (err) {
    console.error('[TaskRouter] checkReminders error:', err.message);
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
  getDueTasks,
  getOverdueTasks,
  checkReminders,
};
