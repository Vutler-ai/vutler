/**
 * Calendar API — Vaultbrix PostgreSQL
 * Supports manual events, agent-created events, and virtual events
 * (goals due dates, billing renewals) merged at query time.
 */
'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { getExistingColumns, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');
const SCHEMA = 'tenant_vutler';

/* ── Schema migration (safe to re-run) ──────────────────────────────────────── */
let _schemaReady = false;
let _calendarColumns = null;

async function loadCalendarColumns(forceRefresh = false) {
  if (!forceRefresh && _calendarColumns) return _calendarColumns;
  const columns = await getExistingColumns(pool, SCHEMA, 'calendar_events');
  _calendarColumns = columns;
  return columns;
}

async function ensureSchema() {
  if (_schemaReady && _calendarColumns) return _calendarColumns;
  if (runtimeSchemaMutationsAllowed()) {
    try {
      await pool.query(`
        ALTER TABLE ${SCHEMA}.calendar_events
          ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
          ADD COLUMN IF NOT EXISTS source_id TEXT,
          ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'
      `);
    } catch (_) { /* columns may already exist or table missing — handled per route */ }
  }
  await loadCalendarColumns(true).catch(() => {
    _calendarColumns = null;
  });
  _schemaReady = true;
  return _calendarColumns;
}

function hasColumn(columns, columnName) {
  return Boolean(columns && columns.has(columnName));
}

function buildStoredEventSelect(columns) {
  const sourceExpr = hasColumn(columns, 'source') ? 'source' : `'manual' AS source`;
  const sourceIdExpr = hasColumn(columns, 'source_id') ? 'source_id' : 'NULL::text AS source_id';
  const metadataExpr = hasColumn(columns, 'metadata') ? 'metadata' : `'{}'::jsonb AS metadata`;
  return [
    'id',
    'title',
    'description',
    'start_time',
    'end_time',
    'all_day',
    'location',
    'color',
    sourceExpr,
    sourceIdExpr,
    metadataExpr,
    'created_at',
    'updated_at',
  ].join(', ');
}

function parseCron(expr) {
  if (!expr || typeof expr !== 'string') return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

function fieldMatches(fieldStr, value) {
  if (fieldStr === '*') return true;

  for (const part of fieldStr.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepNum = parseInt(step, 10);
      if (Number.isNaN(stepNum)) continue;
      if (range === '*') {
        if (value % stepNum === 0) return true;
      } else if (range.includes('-')) {
        const [start, end] = range.split('-').map(Number);
        if (value >= start && value <= end && (value - start) % stepNum === 0) return true;
      }
      continue;
    }

    if (part.includes('-')) {
      const [start, end] = part.split('-').map(Number);
      if (value >= start && value <= end) return true;
      continue;
    }

    if (parseInt(part, 10) === value) return true;
  }

  return false;
}

function cronMatchesDate(cronExpr, date) {
  const parsed = parseCron(cronExpr);
  if (!parsed) return false;
  return (
    fieldMatches(parsed.minute, date.getMinutes())
    && fieldMatches(parsed.hour, date.getHours())
    && fieldMatches(parsed.dayOfMonth, date.getDate())
    && fieldMatches(parsed.month, date.getMonth() + 1)
    && fieldMatches(parsed.dayOfWeek, date.getDay())
  );
}

function getNextRun(cronExpr, fromDate = new Date()) {
  if (!parseCron(cronExpr)) return null;

  const cursor = new Date(fromDate.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  const limit = new Date(cursor.getTime() + 366 * 24 * 60 * 60 * 1000);
  while (cursor <= limit) {
    if (cronMatchesDate(cronExpr, cursor)) return new Date(cursor);
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}

function parseTaskTemplate(rawTemplate) {
  if (!rawTemplate) return {};
  if (typeof rawTemplate === 'string') {
    try {
      return JSON.parse(rawTemplate) || {};
    } catch (_) {
      return {};
    }
  }
  return typeof rawTemplate === 'object' ? rawTemplate : {};
}

function addMinutes(value, minutes = 30) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Date(date.getTime() + minutes * 60 * 1000).toISOString();
}

function buildOccurrenceKey(event) {
  return [
    event.source || 'manual',
    event.sourceId || '',
    event.start || '',
    event.title || '',
  ].join('|');
}

function dedupeEvents(events = []) {
  const byKey = new Map();
  for (const event of events) {
    const key = buildOccurrenceKey(event);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, event);
      continue;
    }

    const currentScore = (event.readOnly ? 1 : 0) + (event.id?.startsWith('scheduled-') ? 2 : 0);
    const existingScore = (existing.readOnly ? 1 : 0) + (existing.id?.startsWith('scheduled-') ? 2 : 0);
    if (currentScore >= existingScore) {
      byKey.set(key, event);
    }
  }
  return Array.from(byKey.values());
}

/* ── Virtual-event builders ─────────────────────────────────────────────────── */

async function fetchGoalEvents(start, end) {
  try {
    const conditions = ['due_date IS NOT NULL', "status = 'active'"];
    const params = [];
    if (start) { params.push(start); conditions.push(`due_date >= $${params.length}`); }
    if (end)   { params.push(end);   conditions.push(`due_date <= $${params.length}`); }
    const r = await pool.query(
      `SELECT id, title, due_date, status, description FROM ${SCHEMA}.goals WHERE ${conditions.join(' AND ')}`,
      params
    );
    return r.rows.map(g => ({
      id: `virtual-goal-${g.id}`,
      title: `🎯 ${g.title}`,
      description: g.description || `Goal "${g.title}" is due`,
      start: g.due_date,
      end: g.due_date,
      allDay: true,
      color: '#f59e0b',
      source: 'goal',
      sourceId: String(g.id),
      readOnly: true,
      metadata: { entityType: 'goal', status: g.status },
    }));
  } catch (_) { return []; }
}

async function fetchBillingEvents(start, end) {
  try {
    const conditions = ["status = 'active'"];
    const params = [];
    if (start) { params.push(start); conditions.push(`current_period_end >= $${params.length}`); }
    if (end)   { params.push(end);   conditions.push(`current_period_end <= $${params.length}`); }
    const r = await pool.query(
      `SELECT workspace_id, current_period_end, plan_id FROM ${SCHEMA}.workspace_subscriptions WHERE ${conditions.join(' AND ')}`,
      params
    );
    return r.rows.map(b => ({
      id: `virtual-billing-${b.workspace_id}`,
      title: '💳 Subscription renewal',
      description: `${b.plan_id || 'Current'} plan renews`,
      start: b.current_period_end,
      end: b.current_period_end,
      allDay: true,
      color: '#8b5cf6',
      source: 'billing',
      sourceId: String(b.workspace_id),
      readOnly: true,
      metadata: { entityType: 'billing', planId: b.plan_id },
    }));
  } catch (_) { return []; }
}

async function fetchScheduledTaskEvents(workspaceId, start, end) {
  try {
    const startBound = start ? new Date(start) : new Date();
    const endBound = end
      ? new Date(end)
      : new Date(startBound.getTime() + 31 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(startBound.getTime()) || Number.isNaN(endBound.getTime()) || endBound < startBound) {
      return [];
    }

    const result = await pool.query(
      `SELECT id, workspace_id, agent_id, cron_expression, description, task_template, is_active, next_run_at
         FROM ${SCHEMA}.scheduled_tasks
        WHERE workspace_id = $1
          AND is_active = TRUE
          AND next_run_at IS NOT NULL
        ORDER BY next_run_at ASC
        LIMIT 100`,
      [workspaceId]
    );

    const events = [];
    for (const schedule of result.rows) {
      const cron = String(schedule.cron_expression || '').trim();
      if (!parseCron(cron)) continue;

      let occurrence = schedule.next_run_at ? new Date(schedule.next_run_at) : null;
      if (!occurrence || Number.isNaN(occurrence.getTime())) continue;

      while (occurrence && occurrence < startBound) {
        occurrence = getNextRun(cron, occurrence);
      }

      const template = parseTaskTemplate(schedule.task_template);
      let count = 0;
      while (occurrence && occurrence <= endBound && count < 90) {
        const startIso = occurrence.toISOString();
        events.push({
          id: `scheduled-${schedule.id}-${startIso}`,
          title: template.title || schedule.description || 'Scheduled run',
          description: [
            schedule.description || 'Recurring scheduled task.',
            `Cron: ${cron}`,
            template.description || null,
          ].filter(Boolean).join('\n'),
          start: startIso,
          end: addMinutes(startIso),
          allDay: false,
          color: '#f97316',
          source: 'scheduled_task',
          sourceId: String(schedule.id),
          readOnly: true,
          metadata: {
            entityType: 'scheduled_task_occurrence',
            scheduleId: schedule.id,
            agentId: schedule.agent_id || null,
            cronExpression: cron,
          },
        });
        occurrence = getNextRun(cron, occurrence);
        count += 1;
      }
    }

    return events;
  } catch (_) {
    return [];
  }
}

/* ── Routes ─────────────────────────────────────────────────────────────────── */

// GET /api/v1/calendar — merged stored + virtual events
router.get('/', async (req, res) => {
  try {
    const columns = await ensureSchema();
    const { start, end, source } = req.query;
    const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';

    // Decide which sources to include
    const wantStored = !source || source === 'all' || source === 'manual' || source === 'agent' || source === 'scheduled_task' || source === 'materialized_task' || (source && source.startsWith('agent'));
    const wantGoals  = !source || source === 'all' || source === 'goal';
    const wantBilling = !source || source === 'all' || source === 'billing';
    const wantGoogle = !source || source === 'all' || source === 'google';
    const wantScheduledTasks = !source || source === 'all' || source === 'scheduled_task';

    const promises = [];

    // 1. Stored events
    if (wantStored) {
      const storedPromise = (async () => {
        let query = `SELECT ${buildStoredEventSelect(columns)} FROM ${SCHEMA}.calendar_events`;
        const params = [workspaceId];
        const conditions = ['workspace_id = $1'];
        if (start) { params.push(start); conditions.push(`start_time >= $${params.length}`); }
        if (end)   { params.push(end);   conditions.push(`end_time <= $${params.length}`); }
        if (source && source !== 'all') {
          if (source === 'agent') {
            conditions.push(`source LIKE 'agent%'`);
          } else {
            params.push(source); conditions.push(`source = $${params.length}`);
          }
        }
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY start_time ASC LIMIT 200';
        const r = await pool.query(query, params);
        return r.rows.map(e => ({
          id: e.id, title: e.title, description: e.description,
          start: e.start_time, end: e.end_time, allDay: e.all_day || false,
          location: e.location, color: e.color,
          source: e.source || 'manual',
          sourceId: e.source_id || null,
          readOnly: false,
          metadata: e.metadata || {},
          createdAt: e.created_at, updatedAt: e.updated_at,
        }));
      })();
      promises.push(storedPromise);
    }

    // 2. Virtual goal events
    if (wantGoals) promises.push(fetchGoalEvents(start, end));

    // 3. Virtual billing events
    if (wantBilling) promises.push(fetchBillingEvents(start, end));

    // 4. Google Calendar events (if connected)
    if (wantGoogle) {
      const googlePromise = (async () => {
        try {
          const { isGoogleConnected } = require('../services/google/tokenManager');
          const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
          const connected = await isGoogleConnected(workspaceId);
          if (!connected) return [];

          const { listCalendarEvents } = require('../services/google/googleApi');
          const gEvents = await listCalendarEvents(workspaceId, {
            timeMin: start || new Date().toISOString(),
            timeMax: end,
            maxResults: 100,
          });
          return gEvents.map((e) => ({
            id: `google-${e.id}`,
            title: e.summary || '(no title)',
            description: e.description || '',
            start: e.start?.dateTime || e.start?.date,
            end: e.end?.dateTime || e.end?.date,
            allDay: !e.start?.dateTime,
            location: e.location || '',
            color: '#4285f4', // Google blue
            source: 'google',
            sourceId: e.id,
            readOnly: true,
            metadata: { htmlLink: e.htmlLink, attendees: (e.attendees || []).map((a) => a.email) },
          }));
        } catch (err) {
          console.warn('[CALENDAR] Google Calendar fetch failed (non-blocking):', err.message);
          return [];
        }
      })();
      promises.push(googlePromise);
    }

    if (wantScheduledTasks) {
      promises.push(fetchScheduledTaskEvents(workspaceId, start, end));
    }

    const results = await Promise.all(promises);
    const events = dedupeEvents(results.flat())
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      .slice(0, 200);

    res.json({ success: true, events });
  } catch (err) {
    console.error('[CALENDAR] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/calendar/events (alias)
router.get('/events', async (req, res) => {
  req.url = '/'; return router.handle(req, res);
});

// POST /api/v1/calendar/events
router.post('/events', async (req, res) => {
  try {
    const columns = await ensureSchema();
    const { title, start, end, allDay, description, location, color, source, source_id, metadata } = req.body;
    if (!title || !start) return res.status(400).json({ success: false, error: 'title and start required' });

    const insertColumns = ['workspace_id', 'title', 'description', 'start_time', 'end_time', 'all_day', 'location', 'color'];
    const insertValues = [
      req.workspaceId || '00000000-0000-0000-0000-000000000001',
      title,
      description || '',
      start,
      end || start,
      allDay || false,
      location || '',
      color || '#3b82f6',
    ];
    if (hasColumn(columns, 'source')) {
      insertColumns.push('source');
      insertValues.push(source || 'manual');
    }
    if (hasColumn(columns, 'source_id')) {
      insertColumns.push('source_id');
      insertValues.push(source_id || null);
    }
    if (hasColumn(columns, 'metadata')) {
      insertColumns.push('metadata');
      insertValues.push(JSON.stringify(metadata || {}));
    }

    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.calendar_events (${insertColumns.join(', ')})
       VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(',')}) RETURNING *`,
      insertValues
    );
    const e = r.rows[0];
    res.json({ success: true, event: {
      id: e.id, title: e.title, start: e.start_time, end: e.end_time,
      allDay: e.all_day, description: e.description, location: e.location, color: e.color,
      source: e.source || 'manual', sourceId: e.source_id || null, readOnly: false, metadata: e.metadata || {},
    }});
  } catch (err) {
    console.error('[CALENDAR] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/calendar/events/:id
router.put('/events/:id', async (req, res) => {
  try {
    if (req.params.id.startsWith('virtual-')) {
      return res.status(403).json({ success: false, error: 'Virtual events are read-only. Edit the source entity directly.' });
    }
    await ensureSchema();
    const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const { title, start, end, allDay, description, location, color } = req.body;
    const r = await pool.query(
      `UPDATE ${SCHEMA}.calendar_events SET title=COALESCE($2,title), description=COALESCE($3,description),
       start_time=COALESCE($4,start_time), end_time=COALESCE($5,end_time), all_day=COALESCE($6,all_day),
       location=COALESCE($7,location), color=COALESCE($8,color), updated_at=NOW()
       WHERE id=$1 AND workspace_id = $9 RETURNING *`,
      [req.params.id, title, description, start, end, allDay, location, color, workspaceId]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, event: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    if (req.params.id.startsWith('virtual-')) {
      return res.status(403).json({ success: false, error: 'Virtual events cannot be deleted. Edit the source entity directly.' });
    }
    const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    await pool.query(`DELETE FROM ${SCHEMA}.calendar_events WHERE id=$1 AND workspace_id = $2`, [req.params.id, workspaceId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
