'use strict';

const {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  getFreeBusy,
} = require('../../google/googleApi');
const pool = require('../../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

class CalendarAdapter {
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
        return { success: false, error: `Unknown calendar action: "${action}"` };
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
        events: events.map((e) => ({
          id: e.id,
          summary: e.summary,
          description: e.description,
          start: e.start?.dateTime || e.start?.date,
          end: e.end?.dateTime || e.end?.date,
          location: e.location,
          attendees: (e.attendees || []).map((a) => a.email),
          status: e.status,
          htmlLink: e.htmlLink,
        })),
        count: events.length,
      },
    };
  }

  async _create(workspaceId, params) {
    const event = params.event || params;
    const created = await createCalendarEvent(workspaceId, {
      summary: event.summary || event.title,
      start: event.start,
      end: event.end,
      description: event.description,
      location: event.location,
      attendees: event.attendees,
    });

    // Mirror to local calendar_events table
    try {
      await pool.query(
        `INSERT INTO ${SCHEMA}.calendar_events
          (workspace_id, title, description, start_time, end_time, location, source, source_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'google', $7, $8::jsonb)
         ON CONFLICT DO NOTHING`,
        [
          workspaceId,
          created.summary,
          created.description || '',
          created.start?.dateTime || created.start?.date,
          created.end?.dateTime || created.end?.date,
          created.location || '',
          created.id,
          JSON.stringify({ googleEventId: created.id, htmlLink: created.htmlLink }),
        ]
      );
    } catch (err) {
      console.warn('[CalendarAdapter] Local mirror insert failed:', err.message);
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
    const { eventId, ...fields } = params.event || params;
    if (!eventId) return { success: false, error: 'eventId is required for update' };

    const updated = await updateCalendarEvent(workspaceId, { eventId, ...fields });

    // Update local mirror
    try {
      await pool.query(
        `UPDATE ${SCHEMA}.calendar_events SET title = COALESCE($1, title), start_time = COALESCE($2, start_time),
         end_time = COALESCE($3, end_time), updated_at = NOW()
         WHERE workspace_id = $4 AND source = 'google' AND source_id = $5`,
        [fields.summary, fields.start, fields.end, workspaceId, eventId]
      );
    } catch (err) {
      console.warn('[CalendarAdapter] Local mirror update failed:', err.message);
    }

    return { success: true, data: { id: updated.id, summary: updated.summary } };
  }

  async _delete(workspaceId, params) {
    const eventId = params.eventId || params.event?.eventId;
    if (!eventId) return { success: false, error: 'eventId is required for delete' };

    await deleteCalendarEvent(workspaceId, { eventId });

    // Remove local mirror
    try {
      await pool.query(
        `DELETE FROM ${SCHEMA}.calendar_events WHERE workspace_id = $1 AND source = 'google' AND source_id = $2`,
        [workspaceId, eventId]
      );
    } catch (err) {
      console.warn('[CalendarAdapter] Local mirror delete failed:', err.message);
    }

    return { success: true, data: { deleted: eventId } };
  }

  async _checkAvailability(workspaceId, params) {
    const result = await getFreeBusy(workspaceId, {
      timeMin: params.timeMin || new Date().toISOString(),
      timeMax: params.timeMax || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });

    const calendars = result.calendars || {};
    const busySlots = Object.values(calendars).flatMap((c) => c.busy || []);

    return {
      success: true,
      data: { busy: busySlots, timeMin: params.timeMin, timeMax: params.timeMax },
    };
  }
}

module.exports = { CalendarAdapter };
