'use strict';

/**
 * Vutler Chat tools
 * Exposes messaging channels and message history to AI agents.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const chatTools = [
  {
    name: 'vutler_chat_send',
    description:
      'Send a message to a Vutler chat channel. Use this to post updates, ' +
      'notifications, or responses on behalf of a user or agent.',
    inputSchema: {
      type: 'object',
      required: ['channel_id', 'message'],
      properties: {
        channel_id: {
          type: 'string',
          description: 'ID of the channel to send the message to.',
        },
        message: {
          type: 'string',
          description: 'Text content of the message to send.',
        },
      },
      additionalProperties: false,
    },
    async handler({ channel_id, message }) {
      const result = await api.post('/api/v1/chat/send', { channel_id, message });
      return result;
    },
  },

  {
    name: 'vutler_chat_channels',
    description:
      'List all available Vutler chat channels the current user has access to. ' +
      'Returns channel IDs and names so you can pick the right destination for messages.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      const result = await api.get('/api/v1/chat/channels');
      return result;
    },
  },

  {
    name: 'vutler_chat_messages',
    description:
      'Retrieve recent messages from a Vutler chat channel. ' +
      'Useful for reading conversation history or checking the last thing said in a channel.',
    inputSchema: {
      type: 'object',
      required: ['channel_id'],
      properties: {
        channel_id: {
          type: 'string',
          description: 'ID of the channel to fetch messages from.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of messages to return (default: 50).',
        },
      },
      additionalProperties: false,
    },
    async handler({ channel_id, limit }) {
      const result = await api.get('/api/v1/chat/messages', { channel_id, limit });
      return result;
    },
  },
];

module.exports = chatTools;
