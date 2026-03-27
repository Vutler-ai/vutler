'use strict';

/**
 * Vutler Calendar tools
 * Exposes event scheduling and management to AI agents.
 * Events created by agents are tagged with source='agent' by default.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const calendarTools = [
  {
    name: 'vutler_calendar_list',
    description:
      'List calendar events in Vutler. Returns manual, agent-created, and system-generated events (goals, billing). ' +
      'Each event includes a source field (manual, agent, goal, billing) and readOnly flag. ' +
      'Optionally filter by date range or source type.',
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
        source: {
          type: 'string',
          description: 'Filter by event source: "manual", "agent", "goal", "billing", or "all" (default).',
        },
      },
      additionalProperties: false,
    },
    async handler({ start, end, source }) {
      const params = {};
      if (start  !== undefined) params.start  = start;
      if (end    !== undefined) params.end    = end;
      if (source !== undefined) params.source = source;
      return api.get('/api/v1/calendar', params);
    },
  },

  {
    name: 'vutler_calendar_create',
    description:
      'Create a new calendar event in Vutler. ' +
      'Events created by agents are automatically tagged with source="agent". ' +
      'Use source_id to link the event to a related entity (task, goal, etc.). ' +
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
        color: {
          type: 'string',
          description: 'Hex color for the event (e.g. "#3b82f6"). Optional.',
        },
        source: {
          type: 'string',
          description: 'Source of the event. Defaults to "agent". Use "agent:<your_name>" for tracking which agent created it.',
        },
        source_id: {
          type: 'string',
          description: 'ID of a linked entity (e.g., a task ID, goal ID). Optional.',
        },
        metadata: {
          type: 'object',
          description: 'Arbitrary metadata (e.g., { agentName: "scheduler", taskId: "..." }). Optional.',
        },
      },
      additionalProperties: false,
    },
    async handler({ title, start, end, all_day, description, color, source, source_id, metadata }) {
      const payload = { title, start, source: source || 'agent' };
      if (end         !== undefined) payload.end         = end;
      if (all_day     !== undefined) payload.all_day     = all_day;
      if (description !== undefined) payload.description = description;
      if (color       !== undefined) payload.color       = color;
      if (source_id   !== undefined) payload.source_id   = source_id;
      if (metadata    !== undefined) payload.metadata    = metadata;
      return api.post('/api/v1/calendar/events', payload);
    },
  },

  {
    name: 'vutler_calendar_update',
    description:
      'Update an existing Vutler calendar event. Supply only the fields you want to change. ' +
      'Use the event ID returned by vutler_calendar_list or vutler_calendar_create. ' +
      'Note: virtual events (IDs starting with "virtual-") are read-only and cannot be updated.',
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
      return api.put(`/api/v1/calendar/events/${event_id}`, payload);
    },
  },

  {
    name: 'vutler_calendar_delete',
    description:
      'Delete a calendar event from Vutler. This action is irreversible. ' +
      'Confirm the event ID with vutler_calendar_list before deleting. ' +
      'Note: virtual events (IDs starting with "virtual-") cannot be deleted.',
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
      return api.delete(`/api/v1/calendar/events/${event_id}`);
    },
  },
];

module.exports = calendarTools;
