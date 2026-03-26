'use strict';

/**
 * Vutler Clients / CRM tools
 * Exposes client (contact) management to AI agents.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const clientTools = [
  {
    name: 'vutler_clients_list',
    description:
      'List all clients in the Vutler CRM. ' +
      'Returns client IDs, names, email addresses, and notes.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      const result = await api.get('/api/v1/clients');
      return result;
    },
  },

  {
    name: 'vutler_clients_create',
    description:
      'Add a new client to the Vutler CRM. ' +
      'Returns the created client including its ID for future updates.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: {
          type: 'string',
          description: 'Full name or company name of the client.',
        },
        email: {
          type: 'string',
          description: 'Primary email address for the client.',
        },
        notes: {
          type: 'string',
          description: 'Free-form notes about the client (e.g. preferences, history).',
        },
      },
      additionalProperties: false,
    },
    async handler({ name, email, notes }) {
      const payload = { name };
      if (email !== undefined) payload.email = email;
      if (notes !== undefined) payload.notes = notes;
      const result = await api.post('/api/v1/clients', payload);
      return result;
    },
  },

  {
    name: 'vutler_clients_update',
    description:
      'Update an existing client record in the Vutler CRM. ' +
      'Supply only the fields you want to change.',
    inputSchema: {
      type: 'object',
      required: ['client_id'],
      properties: {
        client_id: {
          type: 'string',
          description: 'ID of the client to update.',
        },
        name: {
          type: 'string',
          description: 'Updated name for the client.',
        },
        email: {
          type: 'string',
          description: 'Updated email address for the client.',
        },
        notes: {
          type: 'string',
          description: 'Updated notes for the client.',
        },
      },
      additionalProperties: false,
    },
    async handler({ client_id, name, email, notes }) {
      const payload = {};
      if (name  !== undefined) payload.name  = name;
      if (email !== undefined) payload.email = email;
      if (notes !== undefined) payload.notes = notes;
      const result = await api.put(`/api/v1/clients/${client_id}`, payload);
      return result;
    },
  },

  {
    name: 'vutler_clients_get',
    description:
      'Retrieve the full details of a single Vutler client by their ID. ' +
      'Includes contact information, notes, and any linked records.',
    inputSchema: {
      type: 'object',
      required: ['client_id'],
      properties: {
        client_id: {
          type: 'string',
          description: 'ID of the client to retrieve.',
        },
      },
      additionalProperties: false,
    },
    async handler({ client_id }) {
      const result = await api.get(`/api/v1/clients/${client_id}`);
      return result;
    },
  },
];

module.exports = clientTools;
