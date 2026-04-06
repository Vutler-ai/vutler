'use strict';

const {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getFreeBusy,
} = require('../../google/googleApi');
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

class GoogleCalendarAdapter {
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
      case 'check_availability':
        return this._checkAvailability(workspaceId, params);
      default:
        return { success: false, error: `Unknown google calendar action: "${action}"` };
    }
  }

  async _list(workspaceId, params) {
    const events = await listCalendarEvents(workspaceId, {
      timeMin: params.timeMin || new Date().toISOString(),
      timeMax: params.timeMax,
      maxResults: params.maxResults || 25,
    });

    return {
      success: true,
      data: {
        events: events.map((event) => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          location: event.location,
          attendees: (event.attendees || []).map((attendee) => attendee.email),
          status: event.status,
          htmlLink: event.htmlLink,
        })),
        count: events.length,
      },
    };
  }

  async _create(workspaceId, params) {
    const columns = await getCalendarColumns();
    const event = params.event || params;
    const created = await createCalendarEvent(workspaceId, {
      summary: event.summary || event.title,
      start: event.start,
      end: event.end,
      description: event.description,
      location: event.location,
      attendees: event.attendees,
    });

    try {
      const insertColumns = ['workspace_id', 'title', 'description', 'start_time', 'end_time', 'location'];
      const insertValues = [
        workspaceId,
        created.summary,
        created.description || '',
        created.start?.dateTime || created.start?.date,
        created.end?.dateTime || created.end?.date,
        created.location || '',
      ];
      if (hasColumn(columns, 'source')) {
        insertColumns.push('source');
        insertValues.push('google');
      }
      if (hasColumn(columns, 'source_id')) {
        insertColumns.push('source_id');
        insertValues.push(created.id);
      }
      if (hasColumn(columns, 'metadata')) {
        insertColumns.push('metadata');
        insertValues.push(JSON.stringify({ googleEventId: created.id, htmlLink: created.htmlLink }));
      }
      await pool.query(
        `INSERT INTO ${SCHEMA}.calendar_events
          (${insertColumns.join(', ')})
         VALUES (${insertValues.map((_, index) => `$${index + 1}`).join(', ')})
         ON CONFLICT DO NOTHING`,
        insertValues
      );
    } catch (err) {
      console.warn('[GoogleCalendarAdapter] Local mirror insert failed:', err.message);
    }

    return {
      success: true,
      data: {
        id: created.id,
        summary: created.summary,
        start: created.start?.dateTime || created.start?.date,
        end: created.end?.dateTime || created.end?.date,
        htmlLink: created.htmlLink,
      },
    };
  }

  async _update(workspaceId, params) {
    const columns = await getCalendarColumns();
    const { eventId, ...fields } = params.event || params;
    if (!eventId) return { success: false, error: 'eventId is required for update' };

    const updated = await updateCalendarEvent(workspaceId, { eventId, ...fields });

    try {
      const whereClauses = ['workspace_id = $4'];
      if (hasColumn(columns, 'source')) whereClauses.push(`source = 'google'`);
      if (hasColumn(columns, 'source_id')) {
        whereClauses.push('source_id = $5');
      } else if (hasColumn(columns, 'metadata')) {
        whereClauses.push(`metadata->>'googleEventId' = $5`);
      } else {
        whereClauses.push('1 = 0');
      }
      await pool.query(
        `UPDATE ${SCHEMA}.calendar_events
            SET title = COALESCE($1, title),
                start_time = COALESCE($2, start_time),
                end_time = COALESCE($3, end_time),
                updated_at = NOW()
          WHERE ${whereClauses.join(' AND ')}`,
        [fields.summary, fields.start, fields.end, workspaceId, eventId]
      );
    } catch (err) {
      console.warn('[GoogleCalendarAdapter] Local mirror update failed:', err.message);
    }

    return { success: true, data: { id: updated.id, summary: updated.summary } };
  }

  async _delete(workspaceId, params) {
    const columns = await getCalendarColumns();
    const eventId = params.eventId || params.event?.eventId;
    if (!eventId) return { success: false, error: 'eventId is required for delete' };

    await deleteCalendarEvent(workspaceId, { eventId });

    try {
      const whereClauses = ['workspace_id = $1'];
      if (hasColumn(columns, 'source')) whereClauses.push(`source = 'google'`);
      if (hasColumn(columns, 'source_id')) {
        whereClauses.push('source_id = $2');
      } else if (hasColumn(columns, 'metadata')) {
        whereClauses.push(`metadata->>'googleEventId' = $2`);
      } else {
        whereClauses.push('1 = 0');
      }
      await pool.query(
        `DELETE FROM ${SCHEMA}.calendar_events
          WHERE ${whereClauses.join(' AND ')}`,
        [workspaceId, eventId]
      );
    } catch (err) {
      console.warn('[GoogleCalendarAdapter] Local mirror delete failed:', err.message);
    }

    return { success: true, data: { deleted: eventId } };
  }

  async _checkAvailability(workspaceId, params) {
    const timeMin = params.timeMin || new Date().toISOString();
    const timeMax = params.timeMax || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const result = await getFreeBusy(workspaceId, { timeMin, timeMax });

    const calendars = result.calendars || {};
    const busySlots = Object.values(calendars).flatMap((calendar) => calendar.busy || []);

    return {
      success: true,
      data: { busy: busySlots, timeMin, timeMax },
    };
  }
}

module.exports = { GoogleCalendarAdapter };
