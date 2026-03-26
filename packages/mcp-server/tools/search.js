'use strict';

/**
 * Vutler cross-workspace search tool
 *
 * Tools:
 *   vutler_search — Search across email, chat, tasks, drive, and calendar simultaneously
 */

const api = require('../lib/api-client');

const searchTools = [
  {
    name: 'vutler_search',
    description:
      'Search across all Vutler Office workspaces simultaneously — email, chat, tasks, drive, and calendar. ' +
      'Returns ranked results from each source so you can find anything without knowing where it lives. ' +
      'Optionally restrict the search to specific modules.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Full-text search query (e.g. "Q3 budget report", "meeting with Alice").',
        },
        modules: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['email', 'chat', 'tasks', 'drive', 'calendar'],
          },
          description:
            'Restrict search to specific modules. ' +
            'Omit or pass an empty array to search all modules.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Maximum number of results to return per module (default: 20).',
        },
      },
      additionalProperties: false,
    },
    async handler({ query, modules, limit }) {
      const params = { query };
      if (modules && modules.length > 0) params.modules = modules.join(',');
      if (limit !== undefined) params.limit = limit;
      return api.get('/api/v1/search', params);
    },
  },
];

module.exports = searchTools;
