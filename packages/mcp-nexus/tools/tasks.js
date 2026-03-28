'use strict';

/**
 * Nexus Bridge — Task delegation tools
 *
 * Tools:
 *   nexus_delegate_task — Create and assign a task to a Vutler agent
 *   nexus_get_task      — Get the status and result of a delegated task
 *   nexus_wait_task     — Poll until a task completes (or timeout)
 */

const api = require('../lib/api-client');

/** Sleep helper for polling */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const taskTools = [
  // ── Delegate Task ───────────────────────────────────────────────────────────
  {
    name: 'nexus_delegate_task',
    description:
      'Delegate a task to a Vutler agent. The task is created in the Vutler workspace ' +
      'and assigned to the specified agent (or auto-routed if no assignee). ' +
      'Use the "context" field to include relevant code snippets, file paths, or ' +
      'instructions that the agent needs to complete the task. ' +
      'Returns the task ID — use nexus_get_task or nexus_wait_task to check the result.',
    inputSchema: {
      type: 'object',
      required: ['title', 'description'],
      properties: {
        title: {
          type: 'string',
          description: 'Short title summarising the task (e.g. "Write unit tests for UserService").',
        },
        description: {
          type: 'string',
          description:
            'Detailed description of what the agent should do. ' +
            'Include acceptance criteria, constraints, and expected output format.',
        },
        assignee: {
          type: 'string',
          description:
            'Username of the agent to assign (from nexus_list_agents or nexus_resolve_routing). ' +
            'If omitted, the system auto-routes based on task content.',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'urgent'],
          description: 'Task priority level (default: medium).',
        },
        context: {
          type: 'string',
          description:
            'Code snippets, file contents, error logs, or other context the agent needs. ' +
            'This is appended to the description under a "## Context from Claude Code" section.',
        },
      },
      additionalProperties: false,
    },
    async handler({ title, description, assignee, priority, context }) {
      let fullDescription = description;
      if (context) {
        fullDescription += `\n\n## Context from Claude Code\n\n${context}`;
      }

      const payload = { title, description: fullDescription };
      if (assignee !== undefined) payload.assignee = assignee;
      if (priority !== undefined) payload.priority = priority;

      const result = await api.post('/api/v1/tasks-v2', payload);

      // Extract task ID from the response (could be in different fields)
      const taskId =
        result.data?.task?.id ||
        result.data?.task?.task_id ||
        result.data?.task?.snipara_task_id ||
        result.id;

      return {
        success: true,
        task_id: taskId,
        assigned_agent: result.data?.assigned_agent_id,
        message: `Task "${title}" delegated successfully.`,
        raw: result,
      };
    },
  },

  // ── Get Task ────────────────────────────────────────────────────────────────
  {
    name: 'nexus_get_task',
    description:
      'Get the current status and result of a delegated task. ' +
      'Returns the task status (pending, in_progress, completed, failed, cancelled) ' +
      'and the output if the task is completed.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID returned by nexus_delegate_task.',
        },
      },
      additionalProperties: false,
    },
    async handler({ task_id }) {
      return api.get(`/api/v1/tasks-v2/${encodeURIComponent(task_id)}`);
    },
  },

  // ── Wait Task ───────────────────────────────────────────────────────────────
  {
    name: 'nexus_wait_task',
    description:
      'Wait for a delegated task to complete by polling its status. ' +
      'Polls every 5 seconds until the task reaches a terminal state ' +
      '(completed, done, failed, cancelled) or the timeout is reached. ' +
      'Returns the final task status and output.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: {
          type: 'string',
          description: 'The task ID returned by nexus_delegate_task.',
        },
        timeout: {
          type: 'number',
          description:
            'Maximum time to wait in seconds (default: 120, max: 300). ' +
            'Returns a timeout response if the task has not completed within this time.',
        },
      },
      additionalProperties: false,
    },
    async handler({ task_id, timeout = 120 }) {
      const maxMs = Math.min(timeout, 300) * 1000;
      const pollInterval = 5000;
      const start = Date.now();
      const terminalStatuses = ['completed', 'done', 'failed', 'cancelled'];

      while (Date.now() - start < maxMs) {
        const result = await api.get(
          `/api/v1/tasks-v2/${encodeURIComponent(task_id)}`
        );

        const status = result.data?.status || result.status;
        if (terminalStatuses.includes(status)) {
          return {
            ...result,
            wait_duration_seconds: Math.round((Date.now() - start) / 1000),
          };
        }

        await sleep(pollInterval);
      }

      return {
        success: false,
        status: 'timeout',
        task_id,
        wait_duration_seconds: Math.round((Date.now() - start) / 1000),
        message: `Task did not complete within ${timeout} seconds. Use nexus_get_task to check later.`,
      };
    },
  },
];

module.exports = taskTools;
