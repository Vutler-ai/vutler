'use strict';

const pool = require('../../../lib/vaultbrix');
const { resolveAgentEmailProvisioning } = require('../../agentProvisioningService');
const { sendPostalMail } = require('../../postalMailer');
const { resolveSenderAddress } = require('../../workspaceEmailService');

const SCHEMA = 'tenant_vutler';
const DIRECT_SEND_PATTERNS = [
  /\bsend\b/i,
  /\breply\b/i,
  /\bforward\b/i,
  /\benvoie(?:r)?\b/i,
  /\brépond(?:s|re)?\b/i,
  /\brepond(?:s|re)?\b/i,
  /\btransf(?:e|è)re(?:r)?\b/i,
  /\bmail(?:e|er)?\b/i,
];
const DRAFT_ONLY_PATTERNS = [
  /\bdraft\b/i,
  /\bbrouillon\b/i,
  /\bprépare\b/i,
  /\bprepare\b/i,
  /\brédige\b/i,
  /\bredige\b/i,
];

function normalizeEmailAction(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if (['send', 'send_now', 'send_message', 'send-email'].includes(normalized)) return 'send_message';
  if (['draft', 'draft_message', 'queue_for_approval', 'draft-email'].includes(normalized)) return 'draft_message';
  return null;
}

function inferEmailAction(params = {}, latestUserMessage = '') {
  const explicitAction = normalizeEmailAction(
    params.action
    || params.delivery_mode
    || params.deliveryMode
    || params.mode
  );
  if (explicitAction) return explicitAction;

  if (
    params.send_immediately === true
    || params.sendImmediately === true
    || params.bypass_approval === true
    || params.bypassApproval === true
    || params.auto_send === true
    || params.autoSend === true
  ) {
    return 'send_message';
  }

  const text = String(latestUserMessage || '').trim();
  if (!text) return 'draft_message';
  if (DRAFT_ONLY_PATTERNS.some((pattern) => pattern.test(text))) return 'draft_message';
  if (DIRECT_SEND_PATTERNS.some((pattern) => pattern.test(text))) return 'send_message';
  return 'draft_message';
}

function resolveBody(params = {}) {
  return params.body || params.content || params.message || '';
}

function extractPostalFailure(response) {
  if (!response || typeof response !== 'object') return 'Postal did not return a valid response.';
  if (response.skipped) return response.reason || 'Postal delivery was skipped.';
  if (response.success === false) return response.error || response.reason || 'Postal delivery failed.';
  return null;
}

function extractPostalMessageId(response) {
  return response?.data?.message_id || response?.message_id || null;
}

function isMissingMetadataColumnError(err) {
  return /column ["']metadata["'] of relation ["']emails["'] does not exist/i.test(String(err?.message || ''));
}

async function insertEmailRecord(pg, {
  workspaceId,
  from,
  to,
  subject,
  body,
  htmlBody = null,
  folder,
  agentId,
  metadata = null,
}) {
  const valuesWithMetadata = [
    workspaceId,
    from,
    to,
    subject,
    body || '',
    htmlBody,
    agentId,
    metadata ? JSON.stringify(metadata) : JSON.stringify({}),
  ];

  try {
    if (folder === 'sent') {
      return await pg.query(
        `INSERT INTO ${SCHEMA}.emails
          (workspace_id, from_addr, to_addr, subject, body, html_body, folder, is_read, agent_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'sent', TRUE, $7, $8::jsonb, NOW())
         RETURNING id::text AS id`,
        valuesWithMetadata
      );
    }

    return await pg.query(
      `INSERT INTO ${SCHEMA}.emails
        (workspace_id, from_addr, to_addr, subject, body, folder, is_read, agent_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, 'drafts', FALSE, $6, $7::jsonb, NOW())
       RETURNING id::text AS id`,
      [
        workspaceId,
        from,
        to,
        subject,
        body || '',
        agentId,
        metadata ? JSON.stringify(metadata) : JSON.stringify({}),
      ]
    );
  } catch (err) {
    if (!isMissingMetadataColumnError(err)) throw err;

    if (folder === 'sent') {
      return pg.query(
        `INSERT INTO ${SCHEMA}.emails
          (workspace_id, from_addr, to_addr, subject, body, html_body, folder, is_read, agent_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'sent', TRUE, $7, NOW())
         RETURNING id::text AS id`,
        [
          workspaceId,
          from,
          to,
          subject,
          body || '',
          htmlBody,
          agentId,
        ]
      );
    }

    return pg.query(
      `INSERT INTO ${SCHEMA}.emails
        (workspace_id, from_addr, to_addr, subject, body, folder, is_read, agent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'drafts', FALSE, $6, NOW())
       RETURNING id::text AS id`,
      [
        workspaceId,
        from,
        to,
        subject,
        body || '',
        agentId,
      ]
    );
  }
}

class EmailAdapter {
  async execute(context) {
    const { workspaceId, params = {} } = context;
    const action = inferEmailAction(params, context.latestUserMessage);

    switch (action) {
      case 'send_message':
        return this._sendMessage(workspaceId, context, params);
      case 'draft_message':
        return this._createDraft(workspaceId, context, params);
      default:
        return { success: false, error: `Unknown email action: "${action}"` };
    }
  }

  async _sendMessage(workspaceId, context, params) {
    const to = params.to || params.recipient_email;
    const subject = params.subject || '(no subject)';
    const body = resolveBody(params);
    const htmlBody = params.htmlBody || params.html_body || null;

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
      const sender = await resolveSenderAddress({
        db: pool,
        workspaceId,
        explicitFrom: null,
        agentRef: agentId,
        fallbackUserEmail: provisioning.email,
      });

      const postalResult = await sendPostalMail({
        to,
        from: sender,
        subject,
        plain_body: body || '',
        html_body: htmlBody || undefined,
      });
      const postalFailure = extractPostalFailure(postalResult);
      if (postalFailure) {
        return { success: false, error: `Failed to send email: ${postalFailure}` };
      }

      const messageId = extractPostalMessageId(postalResult);
      const result = await insertEmailRecord(pool, {
        workspaceId,
        from: sender,
        to,
        subject,
        body,
        htmlBody,
        folder: 'sent',
        agentId,
        metadata: {
          via: 'postal',
          send_origin: 'agent_email',
          sender_email: provisioning.email,
          sender_source: provisioning.source,
          implicit_user_approval: true,
          latest_user_message: context.latestUserMessage || null,
          message_id: messageId,
        },
      });

      return {
        success: true,
        data: {
          id: result.rows[0]?.id,
          uid: result.rows[0]?.id,
          folder: 'sent',
          status: 'sent',
          messageId,
          emailUrl: `/email?folder=sent&uid=${encodeURIComponent(String(result.rows[0]?.id || ''))}`,
          placement: {
            root: '/email',
            folder: 'sent',
            defaulted: true,
            reason: 'email_sent',
          },
          message: `Email sent to "${to}".`,
        },
      };
    } catch (err) {
      return { success: false, error: `Failed to send email: ${err.message}` };
    }
  }

  async _createDraft(workspaceId, context, params) {
    const to = params.to || params.recipient_email;
    const subject = params.subject || '(no subject)';
    const body = resolveBody(params);

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
      const result = await insertEmailRecord(pool, {
        workspaceId,
        from: provisioning.email,
        to,
        subject,
        body,
        folder: 'drafts',
        agentId,
        metadata: {
          via: 'postal',
          draft_origin: 'agent_email',
          sender_email: provisioning.email,
          sender_source: provisioning.source,
        },
      });

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
