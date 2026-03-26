'use strict';

/**
 * Vutler Calendar tools
 *
 * Tools:
 *   vutler_list_events — List calendar events in a date range
 */

const api = require('../lib/api-client');

const calendarTools = [
  {
    name: 'vutler_list_events',
    description:
      'List calendar events in the Vutler workspace. ' +
      'Optionally filter by start and end date/time. ' +
      'Returns event IDs, titles, start/end times, attendees, and locations.',
    inputSchema: {
      type: 'object',
      properties: {
        start: {
          type: 'string',
          description:
            'Start of the date range (ISO 8601, e.g. "2025-06-01" or "2025-06-01T09:00:00Z"). ' +
            'Defaults to today.',
        },
        end: {
          type: 'string',
          description:
            'End of the date range (ISO 8601). Defaults to 30 days from now.',
        },
      },
      additionalProperties: false,
    },
    async handler({ start, end }) {
      return api.get('/api/v1/calendar/events', { start, end });
    },
  },
];

module.exports = calendarTools;
