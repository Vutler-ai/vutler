'use strict';

const {
  listGmailMessages,
  getGmailMessage,
  listGmailLabels,
} = require('../../google/googleApi');
const pool = require('../../../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

class GmailAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = params.action || 'list_messages';

    switch (action) {
      case 'list_messages':
        return this._listMessages(workspaceId, params);
      case 'read_message':
        return this._readMessage(workspaceId, params);
      case 'search':
        return this._search(workspaceId, params);
      case 'send_message':
        return this._sendMessage(workspaceId, context, params);
      case 'list_labels':
        return this._listLabels(workspaceId);
      default:
        return { success: false, error: `Unknown gmail action: "${action}"` };
    }
  }

  async _listMessages(workspaceId, params) {
    const result = await listGmailMessages(workspaceId, {
      query: params.query,
      maxResults: params.maxResults || 20,
      labelIds: params.labelIds,
      pageToken: params.pageToken,
    });

    return { success: true, data: result };
  }

  async _readMessage(workspaceId, params) {
    const messageId = params.messageId || params.id;
    if (!messageId) return { success: false, error: 'messageId is required' };

    const msg = await getGmailMessage(workspaceId, { messageId });
    return { success: true, data: msg };
  }

  async _search(workspaceId, params) {
    const query = params.searchQuery || params.query || params.q;
    if (!query) return { success: false, error: 'query is required for search' };

    const result = await listGmailMessages(workspaceId, {
      query,
      maxResults: params.maxResults || 20,
    });

    return { success: true, data: result };
  }

  /**
   * Does NOT send directly. Creates a draft in the local emails table
   * pending human approval. The approval handler detects metadata.via='gmail'
   * and routes through the Gmail API.
   */
  async _sendMessage(workspaceId, context, params) {
    const to = params.to || params.recipient_email;
    const subject = params.subject || '(no subject)';
    const body = params.body || params.content || '';

    if (!to) return { success: false, error: 'recipient (to) is required' };

    const agentId = context.agentId || null;

    try {
      const result = await pool.query(
        `INSERT INTO ${SCHEMA}.emails
          (workspace_id, from_addr, to_addr, subject, body, folder, is_read, agent_id, metadata, created_at)
         VALUES ($1, 'gmail', $2, $3, $4, 'drafts', FALSE, $5, $6::jsonb, NOW())
         RETURNING id::text AS id`,
        [
          workspaceId,
          to,
          subject,
          body,
          agentId,
          JSON.stringify({
            via: 'gmail',
            gmail_to: to,
            gmail_subject: subject,
            gmail_body: body,
            gmail_cc: params.cc || null,
            gmail_bcc: params.bcc || null,
          }),
        ]
      );

      return {
        success: true,
        data: {
          status: 'pending_approval',
          draftId: result.rows[0]?.id,
          draftUrl: `/email?folder=drafts&uid=${encodeURIComponent(String(result.rows[0]?.id || ''))}`,
          placement: {
            root: '/email',
            folder: 'drafts',
            defaulted: true,
            reason: 'draft_created',
          },
          message: `Email draft created for "${to}" — awaiting human approval before sending via Gmail.`,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to create email draft: ${err.message}` };
    }
  }

  async _listLabels(workspaceId) {
    const labels = await listGmailLabels(workspaceId);
    return {
      success: true,
      data: { labels: labels.map((l) => ({ id: l.id, name: l.name, type: l.type })) },
    };
  }
}

module.exports = { GmailAdapter };
