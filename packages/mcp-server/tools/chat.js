'use strict';

/**
 * Vutler Chat tools
 *
 * Tools:
 *   vutler_send_chat     — Post a message to a channel
 *   vutler_read_chat     — Retrieve recent messages from a channel
 *   vutler_list_channels — List all accessible chat channels
 */

const api = require('../lib/api-client');

const chatTools = [
  // ── Send message ──────────────────────────────────────────────────────────
  {
    name: 'vutler_send_chat',
    description:
      'Post a message to a Vutler chat channel. ' +
      'Use vutler_list_channels first to get the channel ID. ' +
      'Optionally specify as_agent to send under an agent identity.',
    inputSchema: {
      type: 'object',
      required: ['channel', 'message'],
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID (from vutler_list_channels) to post the message to.',
        },
        message: {
          type: 'string',
          description: 'Text content of the message.',
        },
        as_agent: {
          type: 'string',
          description:
            'Optional agent identifier. When set the message is attributed to that agent.',
        },
      },
      additionalProperties: false,
    },
    async handler({ channel, message, as_agent }) {
      const payload = { message };
      if (as_agent !== undefined) payload.as_agent = as_agent;
      return api.post(`/api/v1/chat/channels/${encodeURIComponent(channel)}/messages`, payload);
    },
  },

  // ── Read messages ─────────────────────────────────────────────────────────
  {
    name: 'vutler_read_chat',
    description:
      'Retrieve recent messages from a Vutler chat channel. ' +
      'Returns messages in chronological order with sender, timestamp, and content.',
    inputSchema: {
      type: 'object',
      required: ['channel'],
      properties: {
        channel: {
          type: 'string',
          description: 'Channel ID to read messages from.',
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
    async handler({ channel, limit }) {
      return api.get(
        `/api/v1/chat/channels/${encodeURIComponent(channel)}/messages`,
        { limit }
      );
    },
  },

  // ── List channels ─────────────────────────────────────────────────────────
  {
    name: 'vutler_list_channels',
    description:
      'List all Vutler chat channels the current workspace has access to. ' +
      'Returns channel IDs, names, and types (public/private/direct). ' +
      'Use the channel ID with vutler_send_chat and vutler_read_chat.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      return api.get('/api/v1/chat/channels');
    },
  },
];

module.exports = chatTools;
