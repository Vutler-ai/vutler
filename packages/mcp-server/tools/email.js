'use strict';

/**
 * Vutler Email tools
 *
 * Tools:
 *   vutler_send_email        — Send an email immediately
 *   vutler_read_emails       — List emails in a mailbox folder
 *   vutler_draft_email       — Save a draft for human approval before sending
 *   vutler_list_agents_emails — List agent email addresses registered in Vutler
 */

const api = require('../lib/api-client');

const emailTools = [
  // ── Send ──────────────────────────────────────────────────────────────────
  {
    name: 'vutler_send_email',
    description:
      'Send an email immediately from the Vutler workspace. ' +
      'Optionally specify a from_agent to send on behalf of an AI agent identity.',
    inputSchema: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address or comma-separated list of addresses.',
        },
        subject: {
          type: 'string',
          description: 'Email subject line.',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text or HTML).',
        },
        from_agent: {
          type: 'string',
          description:
            'Optional agent identifier to send on behalf of (e.g. "sales-agent"). ' +
            'If omitted the workspace default sender is used.',
        },
      },
      additionalProperties: false,
    },
    async handler({ to, subject, body, from_agent }) {
      const payload = { to, subject, body };
      if (from_agent !== undefined) payload.from_agent = from_agent;
      return api.post('/api/v1/email/send', payload);
    },
  },

  // ── Read / List ───────────────────────────────────────────────────────────
  {
    name: 'vutler_read_emails',
    description:
      'List emails in a Vutler mailbox folder. ' +
      'Returns subject, sender, date, read status, and a short preview for each message. ' +
      'Use vutler_send_email to reply.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description:
            'Mailbox folder to read. Common values: "inbox" (default), "sent", "drafts", "spam", "trash".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of emails to return (default: 50).',
        },
        query: {
          type: 'string',
          description:
            'Optional search query to filter emails by subject, sender, or body text.',
        },
      },
      additionalProperties: false,
    },
    async handler({ folder, limit, query }) {
      return api.get('/api/v1/email', { folder: folder || 'inbox', limit, query });
    },
  },

  // ── Draft (approval flow) ─────────────────────────────────────────────────
  {
    name: 'vutler_draft_email',
    description:
      'Save an email as a draft for human review and approval before it is sent. ' +
      'Use this instead of vutler_send_email when the content is sensitive or requires sign-off. ' +
      'Returns the draft ID which the user can find in their Drafts folder.',
    inputSchema: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address or comma-separated list.',
        },
        subject: {
          type: 'string',
          description: 'Email subject line.',
        },
        body: {
          type: 'string',
          description: 'Email body (plain text or HTML).',
        },
      },
      additionalProperties: false,
    },
    async handler({ to, subject, body }) {
      return api.post('/api/v1/email/draft', { to, subject, body });
    },
  },

  // ── List agent email addresses ────────────────────────────────────────────
  {
    name: 'vutler_list_agents_emails',
    description:
      'Return all AI agent identities registered in the Vutler workspace, ' +
      'including their email addresses. Use this to pick the right from_agent ' +
      'value when sending emails or to look up how to address a specific agent.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    async handler() {
      return api.get('/api/v1/agents');
    },
  },
];

module.exports = emailTools;
