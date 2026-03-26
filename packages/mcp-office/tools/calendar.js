'use strict';

/**
 * Vutler Calendar tools
 * Exposes event scheduling and management to AI agents.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const calendarTools = [
  {
    name: 'vutler_calendar_list',
    description:
      'List calendar events in Vutler. Optionally filter by date range. ' +
      'Dates should be ISO 8601 strings (e.g. "2025-06-01" or "2025-06-01T09:00:00Z").',
    inputSchema: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description: 'Start of date range (ISO 8601). Defaults to today.',
        },
        end: {
          type: 'string',
          description: 'End of date range (ISO 8601). Defaults to 30 days from now.',
        },
      },
      additionalProperties: false,
    },
    async handler({ start, end }) {
      const result = await api.get('/api/v1/calendar', { start, end });
      return result;
    },
  },

  {
    name: 'vutler_calendar_create',
    description:
      'Create a new calendar event in Vutler. ' +
      'Returns the created event including its ID for future updates.',
    inputSchema: {
      type: 'object',
      required: ['title', 'start'],
      properties: {
        title: {
          type: 'string',
          description: 'Title of the event.',
        },
        start: {
          type: 'string',
          description: 'Start date/time of the event (ISO 8601).',
        },
        end: {
          type: 'string',
          description: 'End date/time of the event (ISO 8601). Required for non-all-day events.',
        },
        all_day: {
          type: 'boolean',
          description: 'Whether this is an all-day event (default: false).',
        },
        description: {
          type: 'string',
          description: 'Optional description or agenda for the event.',
        },
      },
      additionalProperties: false,
    },
    async handler({ title, start, end, all_day, description }) {
      const payload = { title, start };
      if (end         !== undefined) payload.end         = end;
      if (all_day     !== undefined) payload.all_day     = all_day;
      if (description !== undefined) payload.description = description;
      const result = await api.post('/api/v1/calendar/events', payload);
      return result;
    },
  },

  {
    name: 'vutler_calendar_update',
    description:
      'Update an existing Vutler calendar event. Supply only the fields you want to change. ' +
      'Use the event ID returned by vutler_calendar_list or vutler_calendar_create.',
    inputSchema: {
      type: 'object',
      required: ['event_id'],
      properties: {
        event_id: {
          type: 'string',
          description: 'ID of the event to update.',
        },
        title: {
          type: 'string',
          description: 'New title for the event.',
        },
        start: {
          type: 'string',
          description: 'New start date/time (ISO 8601).',
        },
        end: {
          type: 'string',
          description: 'New end date/time (ISO 8601).',
        },
      },
      additionalProperties: false,
    },
    async handler({ event_id, title, start, end }) {
      const payload = {};
      if (title !== undefined) payload.title = title;
      if (start !== undefined) payload.start = start;
      if (end   !== undefined) payload.end   = end;
      const result = await api.put(`/api/v1/calendar/events/${event_id}`, payload);
      return result;
    },
  },

  {
    name: 'vutler_calendar_delete',
    description:
      'Delete a calendar event from Vutler. This action is irreversible. ' +
      'Confirm the event ID with vutler_calendar_list before deleting.',
    inputSchema: {
      type: 'object',
      required: ['event_id'],
      properties: {
        event_id: {
          type: 'string',
          description: 'ID of the event to delete.',
        },
      },
      additionalProperties: false,
    },
    async handler({ event_id }) {
      const result = await api.delete(`/api/v1/calendar/events/${event_id}`);
      return result;
    },
  },
];

module.exports = calendarTools;
