'use strict';

const pool = require('../lib/vaultbrix');
const { getExistingColumns } = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
const SOCIAL_TASK_EVENT_SOURCE = 'agent_social_schedule';
const SCHEDULE_EVENT_SOURCE = 'scheduled_task';
const DEFAULT_EVENT_DURATION_MINUTES = 30;

let calendarColumns = null;

async function loadCalendarColumns(forceRefresh = false) {
  if (!forceRefresh && calendarColumns) return calendarColumns;
  calendarColumns = await getExistingColumns(pool, SCHEMA, 'calendar_events');
  return calendarColumns;
}

function hasColumn(columns, columnName) {
  return Boolean(columns && columns.has(columnName));
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) || {};
    } catch (_) {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function normalizeTimestamp(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function addMinutes(timestamp, minutes = DEFAULT_EVENT_DURATION_MINUTES) {
  const start = normalizeTimestamp(timestamp);
  if (!start) return null;
  return new Date(new Date(start).getTime() + (minutes * 60 * 1000)).toISOString();
}

function truncateText(value, maxLength = 72) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

async function findExistingCalendarEvent({ workspaceId, source, sourceId, title, start }) {
  const columns = await loadCalendarColumns();
  const conditions = ['workspace_id = $1'];
  const values = [workspaceId];

  if (hasColumn(columns, 'source') && source) {
    values.push(source);
    conditions.push(`source = $${values.length}`);
  }

  if (hasColumn(columns, 'source_id') && sourceId) {
    values.push(String(sourceId));
    conditions.push(`source_id = $${values.length}`);
  } else {
    if (title) {
      values.push(title);
      conditions.push(`title = $${values.length}`);
    }
    if (start) {
      values.push(start);
      conditions.push(`start_time = $${values.length}`);
    }
  }

  const orderBy = [
    hasColumn(columns, 'updated_at') ? 'updated_at DESC NULLS LAST' : null,
    hasColumn(columns, 'created_at') ? 'created_at DESC NULLS LAST' : null,
    'id DESC',
  ].filter(Boolean).join(', ');

  const result = await pool.query(
    `SELECT id
       FROM ${SCHEMA}.calendar_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${orderBy}
      LIMIT 1`,
    values
  );

  return result.rows[0]?.id || null;
}

async function upsertCalendarEvent({
  workspaceId,
  source,
  sourceId,
  title,
  description,
  start,
  end,
  allDay = false,
  location = '',
  color = '#3b82f6',
  metadata = {},
}) {
  if (!workspaceId || !title || !start) return null;

  const columns = await loadCalendarColumns();
  const existingEventId = await findExistingCalendarEvent({
    workspaceId,
    source,
    sourceId,
    title,
    start,
  });

  if (existingEventId) {
    const values = [
      workspaceId,
      existingEventId,
      title,
      description || '',
      start,
      end || start,
      Boolean(allDay),
      location || '',
      color || '#3b82f6',
    ];
    const setClauses = [
      'title = $3',
      'description = $4',
      'start_time = $5',
      'end_time = $6',
      'all_day = $7',
      'location = $8',
      'color = $9',
      'updated_at = NOW()',
    ];

    if (hasColumn(columns, 'source')) {
      values.push(source || 'manual');
      setClauses.push(`source = $${values.length}`);
    }
    if (hasColumn(columns, 'source_id')) {
      values.push(sourceId ? String(sourceId) : null);
      setClauses.push(`source_id = $${values.length}`);
    }
    if (hasColumn(columns, 'metadata')) {
      values.push(JSON.stringify(metadata || {}));
      setClauses.push(`metadata = $${values.length}::jsonb`);
    }

    const result = await pool.query(
      `UPDATE ${SCHEMA}.calendar_events
          SET ${setClauses.join(', ')}
        WHERE workspace_id = $1
          AND id = $2
      RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  const insertColumns = ['workspace_id', 'title', 'description', 'start_time', 'end_time', 'all_day', 'location', 'color'];
  const insertValues = [
    workspaceId,
    title,
    description || '',
    start,
    end || start,
    Boolean(allDay),
    location || '',
    color || '#3b82f6',
  ];

  if (hasColumn(columns, 'source')) {
    insertColumns.push('source');
    insertValues.push(source || 'manual');
  }
  if (hasColumn(columns, 'source_id')) {
    insertColumns.push('source_id');
    insertValues.push(sourceId ? String(sourceId) : null);
  }
  if (hasColumn(columns, 'metadata')) {
    insertColumns.push('metadata');
    insertValues.push(JSON.stringify(metadata || {}));
  }

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.calendar_events
      (${insertColumns.join(', ')})
     VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(', ')})
     RETURNING *`,
    insertValues
  );

  return result.rows[0] || null;
}

async function deleteCalendarEvent({ workspaceId, source, sourceId, title, start }) {
  if (!workspaceId) return false;
  const columns = await loadCalendarColumns();
  const conditions = ['workspace_id = $1'];
  const values = [workspaceId];

  if (hasColumn(columns, 'source') && source) {
    values.push(source);
    conditions.push(`source = $${values.length}`);
  }

  if (hasColumn(columns, 'source_id') && sourceId) {
    values.push(String(sourceId));
    conditions.push(`source_id = $${values.length}`);
  } else {
    if (title) {
      values.push(title);
      conditions.push(`title = $${values.length}`);
    }
    if (start) {
      values.push(start);
      conditions.push(`start_time = $${values.length}`);
    }
  }

  if (conditions.length === 1) return false;

  const result = await pool.query(
    `DELETE FROM ${SCHEMA}.calendar_events
      WHERE ${conditions.join(' AND ')}
      RETURNING id`,
    values
  );
  return result.rows.length > 0;
}

function buildSocialTaskEvent(task = {}) {
  const metadata = parseJsonObject(task.metadata);
  const socialRequest = parseJsonObject(metadata.social_publication_request);
  const scheduledAt = normalizeTimestamp(
    task.due_date
      || task.dueDate
      || socialRequest.scheduled_at
      || socialRequest.scheduledAt
      || metadata.due_date
  );

  if (!scheduledAt) {
    return null;
  }

  const origin = String(metadata.origin || '').trim().toLowerCase();
  const looksLikeSocialTask = origin === 'social_executor'
    || Boolean(socialRequest.caption)
    || String(task.title || '').toLowerCase().startsWith('social publish:');

  if (!looksLikeSocialTask) {
    return null;
  }

  const status = String(task.status || '').trim().toLowerCase();
  if (status === 'cancelled' || status === 'canceled') {
    return null;
  }

  const caption = String(socialRequest.caption || task.description || task.title || '').trim();
  const platforms = Array.isArray(socialRequest.platforms)
    ? socialRequest.platforms.map((platform) => String(platform || '').trim()).filter(Boolean)
    : [];
  const title = `Social post: ${truncateText(caption || task.title || 'Scheduled publication', 60)}`;
  const description = [
    'Scheduled social publication.',
    platforms.length > 0 ? `Platforms: ${platforms.join(', ')}` : null,
    `Task status: ${task.status || 'pending'}`,
    '',
    caption || task.description || '',
  ].filter(Boolean).join('\n');

  return {
    workspaceId: task.workspace_id || metadata.workspace_id || socialRequest.workspace_id || null,
    source: SOCIAL_TASK_EVENT_SOURCE,
    sourceId: task.id || null,
    title,
    description,
    start: scheduledAt,
    end: addMinutes(scheduledAt),
    color: '#0a66c2',
    metadata: {
      entityType: 'social_publication',
      task_id: task.id || null,
      task_status: task.status || 'pending',
      assigned_agent: task.assigned_agent || task.assignee || null,
      platforms,
      caption,
      schedule_id: metadata.schedule_id || null,
    },
  };
}

function buildScheduleEvent(schedule = {}) {
  const nextRunAt = normalizeTimestamp(schedule.next_run_at);
  if (!schedule.workspace_id || !schedule.id || !schedule.is_active || !nextRunAt) {
    return null;
  }

  const template = parseJsonObject(schedule.task_template);
  const title = template.title
    ? `Scheduled run: ${truncateText(template.title, 60)}`
    : `Scheduled run: ${truncateText(schedule.description || 'Recurring task', 60)}`;
  const description = [
    schedule.description || 'Recurring scheduled task.',
    schedule.cron_expression ? `Cron: ${schedule.cron_expression}` : null,
    template.description ? '' : null,
    template.description || null,
  ].filter(Boolean).join('\n');

  return {
    workspaceId: schedule.workspace_id,
    source: SCHEDULE_EVENT_SOURCE,
    sourceId: schedule.id,
    title,
    description,
    start: nextRunAt,
    end: addMinutes(nextRunAt),
    color: '#f97316',
    metadata: {
      entityType: 'scheduled_task',
      schedule_id: schedule.id,
      cron_expression: schedule.cron_expression || null,
      agent_id: schedule.agent_id || null,
      is_active: Boolean(schedule.is_active),
      task_title: template.title || null,
      task_priority: template.priority || null,
    },
  };
}

async function syncTaskCalendarEvent(task = {}) {
  const workspaceId = task.workspace_id || parseJsonObject(task.metadata).workspace_id || null;
  if (!workspaceId || !task.id) return null;

  const event = buildSocialTaskEvent(task);
  if (!event) {
    await deleteCalendarEvent({
      workspaceId,
      source: SOCIAL_TASK_EVENT_SOURCE,
      sourceId: task.id,
      title: task.title || null,
      start: normalizeTimestamp(task.due_date || task.dueDate),
    });
    return null;
  }

  return upsertCalendarEvent(event);
}

async function syncScheduleCalendarEvent(schedule = {}) {
  const workspaceId = schedule.workspace_id || null;
  if (!workspaceId || !schedule.id) return null;

  const event = buildScheduleEvent(schedule);
  if (!event) {
    await deleteCalendarEvent({
      workspaceId,
      source: SCHEDULE_EVENT_SOURCE,
      sourceId: schedule.id,
      title: schedule.description || null,
      start: normalizeTimestamp(schedule.next_run_at),
    });
    return null;
  }

  return upsertCalendarEvent(event);
}

module.exports = {
  SOCIAL_TASK_EVENT_SOURCE,
  SCHEDULE_EVENT_SOURCE,
  buildScheduleEvent,
  buildSocialTaskEvent,
  deleteCalendarEvent,
  syncScheduleCalendarEvent,
  syncTaskCalendarEvent,
};
