'use strict';

/**
 * Vutler Email tools
 * Exposes inbox management and email sending to AI agents.
 */

const api = require('../lib/api-client');

/** @type {import('../index').ToolDefinition[]} */
const emailTools = [
  {
    name: 'vutler_email_list',
    description:
      'List emails in a Vutler mailbox folder (inbox, sent, drafts, etc.). ' +
      'Returns subject, sender, date, and read status for each email.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Mailbox folder to read (e.g. "inbox", "sent", "drafts"). Defaults to "inbox".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Maximum number of emails to return (default: 50).',
        },
      },
      additionalProperties: false,
    },
    async handler({ folder, limit }) {
      const result = await api.get('/api/v1/email', { folder, limit });
      return result;
    },
  },

  {
    name: 'vutler_email_send',
    description:
      'Send an email from the authenticated Vutler account. ' +
      'Supports optional CC and BCC recipients.',
    inputSchema: {
      type: 'object',
      required: ['to', 'subject', 'body'],
      properties: {
        to: {
          type: 'string',
          description: 'Primary recipient email address (or comma-separated list).',
        },
        subject: {
          type: 'string',
          description: 'Email subject line.',
        },
        body: {
          type: 'string',
          description: 'Email body content (plain text or HTML).',
        },
        cc: {
          type: 'string',
          description: 'CC recipients (comma-separated email addresses).',
        },
        bcc: {
          type: 'string',
          description: 'BCC recipients (comma-separated email addresses).',
        },
      },
      additionalProperties: false,
    },
    async handler({ to, subject, body, cc, bcc }) {
      const payload = { to, subject, body };
      if (cc)  payload.cc  = cc;
      if (bcc) payload.bcc = bcc;
      const result = await api.post('/api/v1/email/send', payload);
      return result;
    },
  },

  {
    name: 'vutler_email_mark_read',
    description:
      'Mark an email as read in Vutler. ' +
      'Use the email ID returned by vutler_email_list.',
    inputSchema: {
      type: 'object',
      required: ['email_id'],
      properties: {
        email_id: {
          type: 'string',
          description: 'ID of the email to mark as read.',
        },
      },
      additionalProperties: false,
    },
    async handler({ email_id }) {
      const result = await api.patch(`/api/v1/email/inbox/${email_id}/read`);
      return result;
    },
  },
];

module.exports = emailTools;
