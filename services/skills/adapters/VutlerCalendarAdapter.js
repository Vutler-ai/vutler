'use strict';

const pool = require('../../../lib/vaultbrix');
const { getExistingColumns } = require('../../../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
let calendarColumns = null;

async function getCalendarColumns() {
  if (calendarColumns) return calendarColumns;
  calendarColumns = await getExistingColumns(pool, SCHEMA, 'calendar_events');
  return calendarColumns;
}

function hasColumn(columns, columnName) {
  return Boolean(columns && columns.has(columnName));
}

function buildSelectList(columns) {
  return [
    'id',
    'title',
    'description',
    'start_time',
    'end_time',
    'all_day',
    'location',
    'color',
    hasColumn(columns, 'source') ? 'source' : `'manual' AS source`,
    hasColumn(columns, 'source_id') ? 'source_id' : 'NULL::text AS source_id',
    hasColumn(columns, 'metadata') ? 'metadata' : `'{}'::jsonb AS metadata`,
  ].join(', ');
}

class VutlerCalendarAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = params.action || 'list';

    switch (action) {
      case 'list':
        return this._list(workspaceId, params);
      case 'create':
        return this._create(workspaceId, params);
      case 'update':
        return this._update(workspaceId, params);
      case 'delete':
        return this._delete(workspaceId, params);
      default:
        return { success: false, error: `Unknown Vutler calendar action: "${action}"` };
    }
  }

  async _list(workspaceId, params) {
    const columns = await getCalendarColumns();
    const clauses = ['workspace_id = $1'];
    const values = [workspaceId];

    if (params.start || params.timeMin) {
      values.push(params.start || params.timeMin);
      clauses.push(`start_time >= $${values.length}`);
    }
    if (params.end || params.timeMax) {
      values.push(params.end || params.timeMax);
      clauses.push(`end_time <= $${values.length}`);
    }

    const result = await pool.query(
      `SELECT ${buildSelectList(columns)}
       FROM ${SCHEMA}.calendar_events
       WHERE ${clauses.join(' AND ')}
       ORDER BY start_time ASC
       LIMIT 100`,
      values
    );

    return {
      success: true,
      data: {
        events: result.rows.map((row) => ({
          id: row.id,
          summary: row.title,
          description: row.description || '',
          start: row.start_time,
          end: row.end_time,
          allDay: row.all_day || false,
          location: row.location || '',
          color: row.color || '#3b82f6',
          source: row.source || 'manual',
          sourceId: row.source_id || null,
          metadata: row.metadata || {},
        })),
        count: result.rows.length,
      },
    };
  }

  async _create(workspaceId, params) {
    const columns = await getCalendarColumns();
    const event = params.event || params;
    const title = event.summary || event.title;
    const start = event.start;
    const end = event.end || event.start;
    if (!title || !start) {
      return { success: false, error: 'title/summary and start are required' };
    }

    const insertColumns = ['workspace_id', 'title', 'description', 'start_time', 'end_time', 'all_day', 'location', 'color'];
    const insertValues = [
      workspaceId,
      title,
      event.description || '',
      start,
      end,
      Boolean(event.allDay),
      event.location || '',
      event.color || '#3b82f6',
    ];
    if (hasColumn(columns, 'source')) {
      insertColumns.push('source');
      insertValues.push(event.source || params.source || 'manual');
    }
    if (hasColumn(columns, 'source_id')) {
      insertColumns.push('source_id');
      insertValues.push(event.sourceId || params.source_id || null);
    }
    if (hasColumn(columns, 'metadata')) {
      insertColumns.push('metadata');
      insertValues.push(JSON.stringify(event.metadata || params.metadata || {}));
    }

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.calendar_events
        (${insertColumns.join(', ')})
       VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      insertValues
    );

    const created = result.rows[0];
    return {
      success: true,
      data: {
        id: created.id,
        summary: created.title,
        start: created.start_time,
        end: created.end_time,
        location: created.location,
        source: created.source,
      },
    };
  }

  async _update(workspaceId, params) {
    const event = params.event || params;
    const eventId = event.eventId || event.id || params.eventId || params.id;
    if (!eventId) return { success: false, error: 'eventId is required for update' };

    const result = await pool.query(
      `UPDATE ${SCHEMA}.calendar_events
          SET title = COALESCE($3, title),
              description = COALESCE($4, description),
              start_time = COALESCE($5, start_time),
              end_time = COALESCE($6, end_time),
              all_day = COALESCE($7, all_day),
              location = COALESCE($8, location),
              color = COALESCE($9, color),
              updated_at = NOW()
        WHERE workspace_id = $1
          AND id = $2
        RETURNING id, title, start_time, end_time, location`,
      [
        workspaceId,
        eventId,
        event.summary || event.title || null,
        event.description || null,
        event.start || null,
        event.end || null,
        event.allDay ?? null,
        event.location || null,
        event.color || null,
      ]
    );

    if (!result.rows[0]) return { success: false, error: 'Event not found' };
    const updated = result.rows[0];
    return {
      success: true,
      data: {
        id: updated.id,
        summary: updated.title,
        start: updated.start_time,
        end: updated.end_time,
        location: updated.location,
      },
    };
  }

  async _delete(workspaceId, params) {
    const eventId = params.eventId || params.id || params.event?.eventId || params.event?.id;
    if (!eventId) return { success: false, error: 'eventId is required for delete' };

    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.calendar_events
       WHERE workspace_id = $1
         AND id = $2
       RETURNING id`,
      [workspaceId, eventId]
    );

    if (!result.rows[0]) return { success: false, error: 'Event not found' };
    return { success: true, data: { deleted: eventId } };
  }
}

module.exports = { VutlerCalendarAdapter };
