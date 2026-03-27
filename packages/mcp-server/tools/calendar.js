'use strict';

/**
 * Vutler Calendar tools
 *
 * Tools:
 *   vutler_list_events — List calendar events (manual, agent, goal, billing)
 */

const api = require('../lib/api-client');

const calendarTools = [
  {
    name: 'vutler_list_events',
    description:
      'List calendar events in the Vutler workspace. ' +
      'Returns manual events, agent-created events, and system-generated virtual events (goals due dates, billing renewals). ' +
      'Each event includes a source field (manual, agent, goal, billing) and readOnly flag. ' +
      'Optionally filter by start/end date or source type.',
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
        source: {
          type: 'string',
          description:
            'Filter by event source: "manual", "agent", "goal", "billing", or "all" (default). ' +
            'Use this to only see specific event types.',
        },
      },
      additionalProperties: false,
    },
    async handler({ start, end, source }) {
      const params = {};
      if (start  !== undefined) params.start  = start;
      if (end    !== undefined) params.end    = end;
      if (source !== undefined) params.source = source;
      return api.get('/api/v1/calendar/events', params);
    },
  },
];

module.exports = calendarTools;
