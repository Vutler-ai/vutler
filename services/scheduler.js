'use strict';

/**
 * Scheduler Service — recurring task engine for Vutler
 *
 * Uses a homemade cron engine (setInterval + cron parsing) since node-cron
 * is not in dependencies.  Schedules are persisted in PostgreSQL and reloaded
 * at boot so nothing is lost on server restart.
 */

const pool = require('../lib/vaultbrix');
const { chat: llmChat } = require('./llmRouter');
const { getSwarmCoordinator } = require('./swarmCoordinator');
const { assertColumnsExist, assertTableExists, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const SCHEDULED_TASK_COLUMNS = [
  'id',
  'workspace_id',
  'agent_id',
  'cron_expression',
  'description',
  'task_template',
  'is_active',
  'last_run_at',
  'next_run_at',
  'run_count',
  'created_by',
  'created_at',
  'updated_at',
];
const SCHEDULED_TASK_RUN_COLUMNS = [
  'id',
  'schedule_id',
  'workspace_id',
  'task_id',
  'status',
  'result',
  'started_at',
  'completed_at',
];

// ── In-memory cron registry ──────────────────────────────────────────────────
// Map<scheduleId, { timer: NodeJS.Timeout, schedule: Object }>
const _activeTimers = new Map();
let schedulerSchemaPromise = null;

// ── Cron parsing / next-run computation ─────────────────────────────────────

/**
 * Parse a cron expression into its 5 fields.
 * Supports standard 5-field cron: "min hour dom month dow"
 * Returns null on parse failure.
 */
function parseCron(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute:     parts[0],
    hour:       parts[1],
    dayOfMonth: parts[2],
    month:      parts[3],
    dayOfWeek:  parts[4],
  };
}

/**
 * Returns true if the given Date matches the cron field value.
 * Supports: *, exact numbers, comma lists, ranges (a-b), step /n.
 */
function fieldMatches(fieldStr, value) {
  if (fieldStr === '*') return true;

  for (const part of fieldStr.split(',')) {
    // Step */n or range/n
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step, 10);
      if (isNaN(stepNum)) continue;
      if (range === '*') {
        if (value % stepNum === 0) return true;
      } else if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        if (value >= start && value <= end && (value - start) % stepNum === 0) return true;
      }
      continue;
    }
    // Range a-b
    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (value >= start && value <= end) return true;
      continue;
    }
    // Exact number
    if (parseInt(part, 10) === value) return true;
  }
  return false;
}

/**
 * Return true if the provided Date matches the cron expression.
 */
function cronMatchesDate(cronExpr, date) {
  const c = parseCron(cronExpr);
  if (!c) return false;
  return (
    fieldMatches(c.minute,     date.getMinutes())   &&
    fieldMatches(c.hour,       date.getHours())      &&
    fieldMatches(c.dayOfMonth, date.getDate())       &&
    fieldMatches(c.month,      date.getMonth() + 1)  &&
    fieldMatches(c.dayOfWeek,  date.getDay())
  );
}

/**
 * Compute the next Date at which the cron expression fires.
 * Scans minute-by-minute up to 2 years ahead (worst case).
 */
function getNextRun(cronExpr, fromDate = new Date()) {
  const c = parseCron(cronExpr);
  if (!c) return null;

  // Advance by 1 minute from now (not current minute)
  const d = new Date(fromDate.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  const limit = new Date(d.getTime() + 366 * 2 * 24 * 60 * 60 * 1000); // 2 years
  while (d < limit) {
    if (cronMatchesDate(cronExpr, d)) return new Date(d);
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

/**
 * Milliseconds until the next cron fire; minimum 1 minute.
 */
function msUntilNextRun(cronExpr) {
  const next = getNextRun(cronExpr);
  if (!next) return null;
  return Math.max(next.getTime() - Date.now(), 60_000);
}

// ── DB helpers ───────────────────────────────────────────────────────────────

/**
 * Ensure the scheduler tables exist.
 */
async function ensureSchedulerTables() {
  if (!schedulerSchemaPromise) {
    schedulerSchemaPromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pool, SCHEMA, 'scheduled_tasks', {
          label: 'Scheduled tasks table',
        });
        await assertColumnsExist(pool, SCHEMA, 'scheduled_tasks', SCHEDULED_TASK_COLUMNS, {
          label: 'Scheduled tasks table',
        });
        await assertTableExists(pool, SCHEMA, 'scheduled_task_runs', {
          label: 'Scheduled task runs table',
        });
        await assertColumnsExist(pool, SCHEMA, 'scheduled_task_runs', SCHEDULED_TASK_RUN_COLUMNS, {
          label: 'Scheduled task runs table',
        });
        return;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_tasks (
          id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id     UUID        NOT NULL,
          agent_id         TEXT,
          cron_expression  TEXT        NOT NULL,
          description      TEXT        NOT NULL,
          task_template    JSONB       NOT NULL,
          is_active        BOOLEAN     DEFAULT TRUE,
          last_run_at      TIMESTAMPTZ,
          next_run_at      TIMESTAMPTZ,
          run_count        INTEGER     DEFAULT 0,
          created_by       TEXT,
          created_at       TIMESTAMPTZ DEFAULT NOW(),
          updated_at       TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.scheduled_task_runs (
          id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
          schedule_id  UUID        REFERENCES ${SCHEMA}.scheduled_tasks(id) ON DELETE CASCADE,
          workspace_id UUID        NOT NULL,
          task_id      UUID,
          status       TEXT        DEFAULT 'pending'
                                 CHECK (status IN ('pending','running','completed','failed')),
          result       JSONB,
          started_at   TIMESTAMPTZ DEFAULT NOW(),
          completed_at TIMESTAMPTZ
        );
      `);
    })().catch((err) => {
      schedulerSchemaPromise = null;
      throw err;
    });
  }

  return schedulerSchemaPromise;
}

// ── LLM schedule parser ──────────────────────────────────────────────────────

/**
 * parseScheduleFromText(text) → { cron, description, taskDescription }
 *
 * Asks the LLM to extract a schedule from free-form natural language.
 * Falls back gracefully if the LLM cannot parse.
 */
async function parseScheduleFromText(text, options = {}) {
  const systemPrompt = `You are a scheduling assistant. The user describes a recurring task in natural language.
Extract the schedule and return ONLY a valid JSON object (no markdown, no explanation) with these fields:
- "cron": a 5-field cron expression (minute hour dom month dow)
- "description": short human-readable summary of the schedule (e.g. "Every Monday at 9am")
- "taskDescription": what the task should do, extracted from the user's text

Common patterns:
- "every day at 9am" → "0 9 * * *"
- "every Monday at 9am" → "0 9 * * 1"
- "every weekday at 8am" → "0 8 * * 1-5"
- "every Friday" → "0 9 * * 5"  (default to 9am when no time given)
- "weekly on Monday" → "0 9 * * 1"
- "every month on the 1st at 8am" → "0 8 1 * *"
- "every hour" → "0 * * * *"
- "twice a day" → "0 9,18 * * *"
- "in 2 hours" → emit next absolute time converted to cron (use "once" metadata if needed)

Return exactly this shape:
{"cron":"0 9 * * 1","description":"Every Monday at 9am","taskDescription":"Check backups"}`;

  try {
    const result = await llmChat({
      provider: options.provider || 'openrouter',
      model:    options.model    || 'openrouter/auto',
      apiKey:   options.apiKey   || process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY,
      messages: [
        { role: 'user', content: text }
      ],
      systemPrompt,
      temperature: 0,
      max_tokens: 256,
    });

    const raw = typeof result === 'string' ? result : (result?.content || result?.text || JSON.stringify(result));
    // Strip any markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed.cron) throw new Error('LLM returned no cron field');
    if (!parseCron(parsed.cron)) throw new Error(`Invalid cron expression: ${parsed.cron}`);

    return {
      cron:            parsed.cron,
      description:     parsed.description     || 'Scheduled task',
      taskDescription: parsed.taskDescription || text,
    };
  } catch (err) {
    console.error('[Scheduler] parseScheduleFromText failed:', err.message);
    throw new Error(`Could not parse schedule from text: ${err.message}`);
  }
}

// ── Core schedule CRUD ───────────────────────────────────────────────────────

/**
 * createSchedule — persist a new schedule and start the cron timer.
 */
async function createSchedule({ workspaceId, agentId, cron, taskTemplate, description, createdBy }) {
  if (!workspaceId) throw new Error('workspaceId is required');
  if (!cron)        throw new Error('cron expression is required');
  if (!description) throw new Error('description is required');
  if (!taskTemplate) throw new Error('taskTemplate is required');

  if (!parseCron(cron)) throw new Error(`Invalid cron expression: ${cron}`);

  const nextRun = getNextRun(cron);

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.scheduled_tasks
       (workspace_id, agent_id, cron_expression, description, task_template, is_active, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, TRUE, $6, $7)
     RETURNING *`,
    [
      workspaceId,
      agentId   || null,
      cron,
      description,
      JSON.stringify(taskTemplate),
      nextRun,
      createdBy || null,
    ]
  );

  const schedule = result.rows[0];
  activateSchedule(schedule);
  return schedule;
}

/**
 * activateSchedule — start (or restart) the setInterval-based cron timer
 * for a given schedule row.
 */
function activateSchedule(schedule) {
  const id = schedule.id;

  // Clear any existing timer for this schedule
  if (_activeTimers.has(id)) {
    clearTimeout(_activeTimers.get(id).timer);
    _activeTimers.delete(id);
  }

  const cronExpr = schedule.cron_expression;
  if (!parseCron(cronExpr)) {
    console.warn(`[Scheduler] Invalid cron for schedule ${id}: ${cronExpr}`);
    return;
  }

  function scheduleNextTick() {
    const ms = msUntilNextRun(cronExpr);
    if (!ms) {
      console.warn(`[Scheduler] Cannot compute next run for schedule ${id}`);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        // Reload from DB to check is_active before firing
        const fresh = await pool.query(
          `SELECT * FROM ${SCHEMA}.scheduled_tasks WHERE id = $1`,
          [id]
        );
        if (!fresh.rows.length || !fresh.rows[0].is_active) return;

        await _executeScheduledTask(fresh.rows[0]);
      } catch (err) {
        console.error(`[Scheduler] Error executing schedule ${id}:`, err.message);
      } finally {
        // Re-arm for next fire (if still active)
        const stillActive = _activeTimers.get(id);
        if (stillActive) scheduleNextTick();
      }
    }, ms);

    _activeTimers.set(id, { timer, schedule });
  }

  scheduleNextTick();
  console.log(`[Scheduler] Activated schedule ${id} (${cronExpr}), next run: ${getNextRun(cronExpr)?.toISOString()}`);
}

/**
 * deactivateSchedule — stop the timer but keep the schedule in DB.
 */
async function deactivateSchedule(scheduleId) {
  if (_activeTimers.has(scheduleId)) {
    clearTimeout(_activeTimers.get(scheduleId).timer);
    _activeTimers.delete(scheduleId);
  }

  await pool.query(
    `UPDATE ${SCHEMA}.scheduled_tasks SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
    [scheduleId]
  );
  console.log(`[Scheduler] Deactivated schedule ${scheduleId}`);
}

/**
 * deleteSchedule — stop + remove from DB.
 */
async function deleteSchedule(workspaceId, scheduleId) {
  if (_activeTimers.has(scheduleId)) {
    clearTimeout(_activeTimers.get(scheduleId).timer);
    _activeTimers.delete(scheduleId);
  }

  await pool.query(
    `DELETE FROM ${SCHEMA}.scheduled_tasks WHERE id = $1 AND workspace_id = $2`,
    [scheduleId, workspaceId]
  );
  console.log(`[Scheduler] Deleted schedule ${scheduleId}`);
}

/**
 * listSchedules — all schedules for a workspace, most recent first.
 */
async function listSchedules(workspaceId) {
  const result = await pool.query(
    `SELECT * FROM ${SCHEMA}.scheduled_tasks WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );
  return result.rows;
}

/**
 * getSchedule — single schedule with its last 20 execution runs.
 */
async function getSchedule(workspaceId, scheduleId) {
  const schedResult = await pool.query(
    `SELECT * FROM ${SCHEMA}.scheduled_tasks WHERE id = $1 AND workspace_id = $2`,
    [scheduleId, workspaceId]
  );
  if (!schedResult.rows.length) return null;

  const schedule = schedResult.rows[0];

  const runsResult = await pool.query(
    `SELECT * FROM ${SCHEMA}.scheduled_task_runs
     WHERE schedule_id = $1
     ORDER BY started_at DESC
     LIMIT 20`,
    [scheduleId]
  );

  schedule.recent_runs = runsResult.rows;
  schedule.is_timer_active = _activeTimers.has(scheduleId);
  return schedule;
}

/**
 * updateSchedule — partial update (cron, description, task_template, is_active).
 * Re-activates or deactivates the timer as needed.
 */
async function updateSchedule(workspaceId, scheduleId, updates = {}) {
  const allowed = ['cron_expression', 'description', 'task_template', 'is_active', 'agent_id'];
  const fields = [];
  const values = [];
  let i = 1;

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'task_template') {
        fields.push(`task_template = $${i}::jsonb`);
        values.push(JSON.stringify(updates[key]));
      } else {
        fields.push(`${key} = $${i}`);
        values.push(updates[key]);
      }
      i++;
    }
  }

  if (!fields.length) throw new Error('No valid fields to update');

  // Recalculate next_run_at if cron changed
  const cronToUse = updates.cron_expression;
  if (cronToUse) {
    if (!parseCron(cronToUse)) throw new Error(`Invalid cron expression: ${cronToUse}`);
    fields.push(`next_run_at = $${i}`);
    values.push(getNextRun(cronToUse));
    i++;
  }

  fields.push(`updated_at = NOW()`);
  values.push(scheduleId, workspaceId);

  const result = await pool.query(
    `UPDATE ${SCHEMA}.scheduled_tasks
     SET ${fields.join(', ')}
     WHERE id = $${i} AND workspace_id = $${i + 1}
     RETURNING *`,
    values
  );

  if (!result.rows.length) return null;
  const updated = result.rows[0];

  // Sync timer state
  if (updated.is_active) {
    activateSchedule(updated);
  } else {
    if (_activeTimers.has(scheduleId)) {
      clearTimeout(_activeTimers.get(scheduleId).timer);
      _activeTimers.delete(scheduleId);
    }
  }

  return updated;
}

/**
 * loadActiveSchedules — called at boot to re-arm all active schedules.
 * Pass a workspaceId to restrict (useful for tests), or omit for all.
 */
async function loadActiveSchedules(workspaceId) {
  const params = [];
  let where = 'WHERE is_active = TRUE';
  if (workspaceId) {
    where += ' AND workspace_id = $1';
    params.push(workspaceId);
  }

  const result = await pool.query(
    `SELECT * FROM ${SCHEMA}.scheduled_tasks ${where}`,
    params
  );

  let count = 0;
  for (const schedule of result.rows) {
    try {
      activateSchedule(schedule);
      count++;
    } catch (err) {
      console.warn(`[Scheduler] Could not activate schedule ${schedule.id}:`, err.message);
    }
  }
  console.log(`[Scheduler] Loaded ${count} active schedule(s)`);
  return count;
}

// ── Task execution ───────────────────────────────────────────────────────────

/**
 * _executeScheduledTask — creates the task via SwarmCoordinator and records the run.
 */
async function _executeScheduledTask(schedule) {
  console.log(`[Scheduler] Executing schedule ${schedule.id}: "${schedule.description}"`);

  const template = typeof schedule.task_template === 'string'
    ? JSON.parse(schedule.task_template)
    : schedule.task_template;

  // Insert a run record
  const runResult = await pool.query(
    `INSERT INTO ${SCHEMA}.scheduled_task_runs (schedule_id, workspace_id, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    [schedule.id, schedule.workspace_id]
  );
  const runId = runResult.rows[0].id;

  let taskId = null;
  let status = 'completed';
  let resultPayload = {};

  try {
    const coordinator = getSwarmCoordinator();
    const task = await coordinator.createTask({
      title:        template.title       || schedule.description,
      description:  template.description || schedule.description,
      priority:     template.priority    || 'medium',
      skill_key:    template.skill_key   || undefined,
      metadata:     {
        ...(template.metadata || {}),
        scheduled:      true,
        schedule_id:    schedule.id,
        schedule_run_id: runId,
      },
      workspace_id: schedule.workspace_id,
      for_agent_id: schedule.agent_id || undefined,
    });

    taskId = task?.id || task?.pgTaskId || null;
    resultPayload = { task_id: taskId, created: true };
  } catch (err) {
    console.error(`[Scheduler] Task creation failed for schedule ${schedule.id}:`, err.message);
    status = 'failed';
    resultPayload = { error: err.message };
  }

  // Update run record
  await pool.query(
    `UPDATE ${SCHEMA}.scheduled_task_runs
     SET status = $1, task_id = $2, result = $3::jsonb, completed_at = NOW()
     WHERE id = $4`,
    [status, taskId, JSON.stringify(resultPayload), runId]
  );

  // Update schedule stats
  const nextRun = getNextRun(schedule.cron_expression);
  await pool.query(
    `UPDATE ${SCHEMA}.scheduled_tasks
     SET last_run_at = NOW(),
         next_run_at = $1,
         run_count   = run_count + 1,
         updated_at  = NOW()
     WHERE id = $2`,
    [nextRun, schedule.id]
  );

  return { runId, taskId, status };
}

// ── Boot integration ─────────────────────────────────────────────────────────

/**
 * initScheduler — call once at server startup.
 * Creates tables (idempotent) and re-arms all active schedules.
 */
async function initScheduler() {
  try {
    console.log('[Scheduler] Initializing...');
    await ensureSchedulerTables();
    await loadActiveSchedules();
    console.log('[Scheduler] Ready.');
  } catch (err) {
    console.error('[Scheduler] Init failed:', err.message);
    // Non-fatal — server can still run without scheduler
  }
}

// ── LLM Tool definition ──────────────────────────────────────────────────────
// Export for injection into llmRouter when ready.

const SCHEDULE_TOOL = {
  type: 'function',
  function: {
    name: 'vutler_create_schedule',
    description: 'Create a recurring scheduled task. Use when the user asks to do something regularly (every day, weekly, monthly, etc.)',
    parameters: {
      type: 'object',
      properties: {
        cron: {
          type: 'string',
          description: 'Cron expression (e.g. "0 9 * * 1" for every Monday at 9am)',
        },
        description: {
          type: 'string',
          description: 'Human-readable description of the schedule (e.g. "Every Monday at 9am")',
        },
        task_title: {
          type: 'string',
          description: 'Title of the task to create each time the schedule fires',
        },
        task_description: {
          type: 'string',
          description: 'Detailed description of what the task should do',
        },
        priority: {
          type: 'string',
          enum: ['P0', 'P1', 'P2', 'P3'],
          description: 'Task priority (P0=critical, P3=low)',
        },
      },
      required: ['cron', 'description', 'task_title', 'task_description'],
    },
  },
};

/**
 * handleScheduleTool — process a vutler_create_schedule tool call from the LLM.
 * Pass workspaceId and optional agentId from the chat context.
 */
async function handleScheduleTool(toolInput, { workspaceId, agentId, createdBy } = {}) {
  const { cron, description, task_title, task_description, priority } = toolInput;

  const schedule = await createSchedule({
    workspaceId: workspaceId || DEFAULT_WORKSPACE,
    agentId:     agentId     || null,
    cron,
    description,
    createdBy:   createdBy   || null,
    taskTemplate: {
      title:       task_title,
      description: task_description,
      priority:    priority || 'P2',
    },
  });

  return {
    success: true,
    schedule_id:  schedule.id,
    description:  schedule.description,
    cron:         schedule.cron_expression,
    next_run_at:  schedule.next_run_at,
    message: `Schedule created: "${description}" (${cron}). First run: ${schedule.next_run_at?.toISOString?.() || 'unknown'}.`,
  };
}

// ── Singleton pattern ────────────────────────────────────────────────────────

module.exports = {
  // Boot
  initScheduler,
  ensureSchedulerTables,

  // LLM parsing
  parseScheduleFromText,

  // CRUD
  createSchedule,
  updateSchedule,
  deleteSchedule,
  listSchedules,
  getSchedule,

  // Lifecycle
  activateSchedule,
  deactivateSchedule,
  loadActiveSchedules,

  // Execution
  _executeScheduledTask,

  // LLM tool
  SCHEDULE_TOOL,
  handleScheduleTool,

  // Utils (exported for testing)
  parseCron,
  getNextRun,
  cronMatchesDate,
};
