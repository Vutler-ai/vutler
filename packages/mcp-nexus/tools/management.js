'use strict';

/**
 * Nexus Bridge — Task management tools
 *
 * Tools:
 *   nexus_list_tasks  — List recent tasks with filters
 *   nexus_cancel_task — Cancel a task in progress
 */

const api = require('../lib/api-client');

const managementTools = [
  // ── List Tasks ──────────────────────────────────────────────────────────────
  {
    name: 'nexus_list_tasks',
    description:
      'List recent tasks in the Vutler workspace. ' +
      'Filter by status or assignee to find specific delegated tasks. ' +
      'Useful to check what tasks are pending, in progress, or completed.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by task status: "pending", "in_progress", "completed", "done", "failed", "cancelled", "blocked".',
        },
        assignee: {
          type: 'string',
          description: 'Filter by agent username.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of tasks to return (default: 20).',
        },
      },
      additionalProperties: false,
    },
    async handler({ status, assignee, limit }) {
      return api.get('/api/v1/tasks-v2', { status, assignee, limit });
    },
  },

  // ── Cancel Task ─────────────────────────────────────────────────────────────
  {
    name: 'nexus_cancel_task',
    description:
      'Cancel a task that is pending or in progress. ' +
      'Use this to abort a delegated task that is no longer needed.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID to cancel.',
        },
      },
      additionalProperties: false,
    },
    async handler({ task_id }) {
      return api.patch(
        `/api/v1/tasks-v2/${encodeURIComponent(task_id)}`,
        { status: 'cancelled' }
      );
    },
  },
];

module.exports = managementTools;
