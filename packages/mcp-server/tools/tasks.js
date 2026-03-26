'use strict';

/**
 * Vutler Tasks tools
 *
 * Tools:
 *   vutler_create_task — Create a new task
 *   vutler_list_tasks  — List / filter tasks
 *   vutler_update_task — Update an existing task
 */

const api = require('../lib/api-client');

const taskTools = [
  // ── Create ────────────────────────────────────────────────────────────────
  {
    name: 'vutler_create_task',
    description:
      'Create a new task in the Vutler workspace. ' +
      'Returns the created task object including its ID, which is needed for updates.',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: {
          type: 'string',
          description: 'Short title summarising the task.',
        },
        description: {
          type: 'string',
          description: 'Detailed description or acceptance criteria.',
        },
        assignee: {
          type: 'string',
          description: 'User ID or username to assign the task to.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority level (default: medium).',
        },
        due_date: {
          type: 'string',
          description: 'Due date in ISO 8601 format (e.g. "2025-07-15" or "2025-07-15T17:00:00Z").',
        },
      },
      additionalProperties: false,
    },
    async handler({ title, description, assignee, priority, due_date }) {
      const payload = { title };
      if (description !== undefined) payload.description = description;
      if (assignee    !== undefined) payload.assignee    = assignee;
      if (priority    !== undefined) payload.priority    = priority;
      if (due_date    !== undefined) payload.due_date    = due_date;
      return api.post('/api/v1/tasks-v2', payload);
    },
  },

  // ── List ──────────────────────────────────────────────────────────────────
  {
    name: 'vutler_list_tasks',
    description:
      'List tasks in the Vutler workspace. ' +
      'Optionally filter by status or assignee. ' +
      'Returns task IDs, titles, statuses, priorities, assignees, and due dates.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by task status. Common values: "todo", "in_progress", "done", "blocked".',
        },
        assignee: {
          type: 'string',
          description: 'Filter by assignee user ID or username.',
        },
      },
      additionalProperties: false,
    },
    async handler({ status, assignee }) {
      return api.get('/api/v1/tasks-v2', { status, assignee });
    },
  },

  // ── Update ────────────────────────────────────────────────────────────────
  {
    name: 'vutler_update_task',
    description:
      'Update an existing Vutler task. Supply only the fields you want to change. ' +
      'Common uses: marking a task done, reassigning it, or editing the title.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: {
          type: 'string',
          description: 'ID of the task to update (returned by vutler_create_task or vutler_list_tasks).',
        },
        status: {
          type: 'string',
          description: 'New status (e.g. "in_progress", "done", "blocked").',
        },
        title: {
          type: 'string',
          description: 'Updated task title.',
        },
        description: {
          type: 'string',
          description: 'Updated task description.',
        },
      },
      additionalProperties: false,
    },
    async handler({ id, status, title, description }) {
      const payload = {};
      if (status      !== undefined) payload.status      = status;
      if (title       !== undefined) payload.title       = title;
      if (description !== undefined) payload.description = description;
      return api.patch(`/api/v1/tasks-v2/${encodeURIComponent(id)}`, payload);
    },
  },
];

module.exports = taskTools;
