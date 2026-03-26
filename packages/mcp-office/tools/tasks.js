'use strict';

/**
 * Vutler Tasks tools
 * Exposes task management (create, read, update) to AI agents.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const taskTools = [
  {
    name: 'vutler_tasks_list',
    description:
      'List tasks in Vutler. Optionally filter by status (todo, in_progress, done, etc.). ' +
      'Returns task IDs, titles, assignees, priorities, and statuses.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by task status (e.g. "todo", "in_progress", "done", "blocked").',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 500,
          description: 'Maximum number of tasks to return (default: 100).',
        },
      },
      additionalProperties: false,
    },
    async handler({ status, limit }) {
      const result = await api.get('/api/v1/tasks-v2', { status, limit });
      return result;
    },
  },

  {
    name: 'vutler_tasks_create',
    description:
      'Create a new task in Vutler. ' +
      'Returns the created task including its ID for future updates.',
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
          description: 'Detailed description or acceptance criteria for the task.',
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
      },
      additionalProperties: false,
    },
    async handler({ title, description, assignee, priority }) {
      const payload = { title };
      if (description !== undefined) payload.description = description;
      if (assignee    !== undefined) payload.assignee    = assignee;
      if (priority    !== undefined) payload.priority    = priority;
      const result = await api.post('/api/v1/tasks-v2', payload);
      return result;
    },
  },

  {
    name: 'vutler_tasks_update',
    description:
      'Update an existing Vutler task. Supply only the fields you want to change. ' +
      'Common use: marking a task as done or reassigning it.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          description: 'ID of the task to update.',
        },
        status: {
          type: 'string',
          description: 'New status for the task (e.g. "in_progress", "done", "blocked").',
        },
        title: {
          type: 'string',
          description: 'Updated title for the task.',
        },
        description: {
          type: 'string',
          description: 'Updated description for the task.',
        },
      },
      additionalProperties: false,
    },
    async handler({ task_id, status, title, description }) {
      const payload = {};
      if (status      !== undefined) payload.status      = status;
      if (title       !== undefined) payload.title       = title;
      if (description !== undefined) payload.description = description;
      const result = await api.patch(`/api/v1/tasks-v2/${task_id}`, payload);
      return result;
    },
  },

  {
    name: 'vutler_tasks_get',
    description:
      'Get the full details of a single Vutler task by its ID. ' +
      'Includes title, description, status, assignee, comments, and history.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          description: 'ID of the task to retrieve.',
        },
      },
      additionalProperties: false,
    },
    async handler({ task_id }) {
      const result = await api.get(`/api/v1/tasks-v2/${task_id}`);
      return result;
    },
  },
];

module.exports = taskTools;
