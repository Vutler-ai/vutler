'use strict';

/**
 * Nexus Bridge — Agent tools
 *
 * Tools:
 *   nexus_list_agents     — List available Vutler agents
 *   nexus_resolve_routing — Determine which agent should handle a task type
 */

const api = require('../lib/api-client');

const agentTools = [
  // ── List Agents ─────────────────────────────────────────────────────────────
  {
    name: 'nexus_list_agents',
    description:
      'List available Vutler agents in the workspace. ' +
      'Returns each agent\'s ID, name, username, role, status (online/offline), ' +
      'capabilities, and model. Use this to discover which agents can handle your task ' +
      'before delegating with nexus_delegate_task.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['online', 'offline'],
          description: 'Filter agents by online/offline status.',
        },
        role: {
          type: 'string',
          description: 'Filter agents by role (e.g. "developer", "qa", "devops").',
        },
      },
      additionalProperties: false,
    },
    async handler({ status, role }) {
      const data = await api.get('/api/v1/agents', { status, role });
      // Return a simplified view focused on delegation-relevant info
      const agents = (data.agents || []).map((a) => ({
        id: a.id,
        name: a.name,
        username: a.username,
        role: a.role,
        status: a.status,
        type: a.type,
        model: a.model,
        provider: a.provider,
        capabilities: a.capabilities,
        description: a.description,
      }));
      return { agents, count: agents.length };
    },
  },

  // ── Resolve Routing ─────────────────────────────────────────────────────────
  {
    name: 'nexus_resolve_routing',
    description:
      'Determine which Vutler agent should handle a specific task type. ' +
      'Returns the recommended agent and fallback options. ' +
      'Use this before nexus_delegate_task to pick the right assignee. ' +
      'Supported task types: feature, enhancement, refactor, bug, incident, review, ' +
      'qa, test, frontend, release, deploy, ci, smoke-test, rollback, migration, ' +
      'schema, database, rls, index.',
    inputSchema: {
      type: 'object',
      required: ['task_type'],
      properties: {
        task_type: {
          type: 'string',
          description:
            'The type of task to route (e.g. "feature", "bug", "deploy", "migration").',
        },
      },
      additionalProperties: false,
    },
    async handler({ task_type }) {
      return api.post('/api/v1/nexus/routing/resolve', { taskType: task_type });
    },
  },
];

module.exports = agentTools;
