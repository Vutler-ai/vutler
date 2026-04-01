'use strict';

const pool = require('../../../lib/vaultbrix');
const { resolveAgentEmailProvisioning } = require('../../agentProvisioningService');

const SCHEMA = 'tenant_vutler';

class EmailAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = params.action || 'send_message';

    switch (action) {
      case 'send_message':
      case 'draft_message':
        return this._createDraft(workspaceId, context, params);
      default:
        return { success: false, error: `Unknown email action: "${action}"` };
    }
  }

  async _createDraft(workspaceId, context, params) {
    const to = params.to || params.recipient_email;
    const subject = params.subject || '(no subject)';
    const body = params.body || params.content || params.message || '';

    if (!to) return { success: false, error: 'recipient (to) is required' };

    const agentId = context.agentId || null;
    const provisioning = await resolveAgentEmailProvisioning({
      workspaceId,
      agentId,
      agent: context.agent || null,
      db: pool,
    });

    if (!provisioning.provisioned || !provisioning.email) {
      return { success: false, error: 'Email is not provisioned for this agent.' };
    }

    try {
      const result = await pool.query(
        `INSERT INTO ${SCHEMA}.emails
          (workspace_id, from_addr, to_addr, subject, body, folder, is_read, agent_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, 'drafts', FALSE, $6, $7::jsonb, NOW())
         RETURNING id::text AS id`,
        [
          workspaceId,
          provisioning.email,
          to,
          subject,
          body,
          agentId,
          JSON.stringify({
            via: 'postal',
            draft_origin: 'agent_email',
            sender_email: provisioning.email,
            sender_source: provisioning.source,
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
          message: `Email draft created for "${to}" — awaiting human approval before sending via Postal.`,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to create email draft: ${err.message}` };
    }
  }
}

module.exports = { EmailAdapter };
