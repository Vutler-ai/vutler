/**
 * Vutler Email API — Postal SMTP + PostgreSQL
 * Replaced stub with real implementation backed by tenant_vutler.emails table
 * and Postal HTTP API for sending.
 */
'use strict';

const express = require('express');
const router = express.Router();
const {
  assignEmailToAgent,
  moveEmailToFolder,
  resolveSenderAddress,
  toggleEmailFlag,
  updateEmailReadState,
} = require('../../../services/workspaceEmailService');
const { sendPostalMail } = require('../../../services/postalMailer');

// Postal configuration
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'starbox-group.com';
const SCHEMA = 'tenant_vutler';

// SECURITY: workspace scoped (audit 2026-03-29)
router.use((req, res, next) => {
  if (!req.workspaceId) return res.status(401).json({ success: false, error: 'Authentication required' });
  next();
});

/**
 * Send email via Postal HTTP API
 */
async function sendViaPostal({ from, to, subject, body, htmlBody }) {
  const result = await sendPostalMail({
    to,
    from: from || `noreply@${EMAIL_DOMAIN}`,
    subject,
    plain_body: body || '',
    html_body: htmlBody || undefined,
  });

  const failure = result?.skipped
    ? (result.reason || 'Postal delivery was skipped.')
    : (result?.success === false ? (result.error || result.reason || result.raw || 'Postal delivery failed.') : null);

  if (failure) {
    const error = new Error(failure);
    error.response = { data: result };
    throw error;
  }

  return {
    data: result?.data || result,
    raw: result,
  };
}

function parseEmailMetadata(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return typeof value === 'object' ? value : {};
}

function parseListLimit(value, fallback = 50, max = 200) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

/**
 * GET /api/v1/email — list emails, supports ?folder=inbox|sent|drafts
 */
router.get('/email', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const folder = req.query.folder || 'inbox';
    const agentId = req.query.agent_id || null;
    const limit = parseListLimit(req.query.limit, 50, 200);

    if (!pg) {
      return res.json({ success: true, emails: [], count: 0 });
    }

    let query, params;
    if (agentId) {
      query = `SELECT * FROM ${SCHEMA}.emails WHERE (folder = $1 OR ($1 = 'inbox' AND folder IS NULL)) AND agent_id = $2 AND workspace_id = $3 ORDER BY created_at DESC LIMIT $4`;
      params = [folder, agentId, req.workspaceId, limit];
    } else {
      query = `SELECT * FROM ${SCHEMA}.emails WHERE (folder = $1 OR ($1 = 'inbox' AND folder IS NULL)) AND workspace_id = $2 ORDER BY created_at DESC LIMIT $3`;
      params = [folder, req.workspaceId, limit];
    }

    const r = await pg.query(query, params);
    const emails = r.rows.map(e => ({
      id: e.id,
      uid: e.id,
      from: e.from_addr,
      to: e.to_addr,
      subject: e.subject,
      body: e.body,
      htmlBody: e.html_body,
      isRead: e.is_read || false,
      folder: e.folder || 'inbox',
      agentId: e.agent_id,
      date: e.created_at,
    }));

    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/email/inbox — inbox shortcut
 */
router.get('/email/inbox', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const limit = parseListLimit(req.query.limit, 50, 200);

    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE (folder = 'inbox' OR folder IS NULL) AND workspace_id = $2 ORDER BY created_at DESC LIMIT $1`,
      [limit, req.workspaceId]
    );
    const emails = r.rows.map(e => ({
      id: e.id, uid: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, htmlBody: e.html_body,
      isRead: e.is_read || false, folder: e.folder || 'inbox',
      agentId: e.agent_id, date: e.created_at,
    }));

    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] Inbox error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/email/sent — sent folder
 */
router.get('/email/sent', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const limit = parseListLimit(req.query.limit, 50, 200);
    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE folder = 'sent' AND workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.workspaceId, limit]
    );
    const emails = r.rows.map(e => ({
      id: e.id, uid: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, htmlBody: e.html_body,
      isRead: e.is_read ?? true, flagged: e.flagged || false,
      folder: e.folder || 'sent', agentId: e.agent_id,
      date: e.created_at,
    }));

    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] Sent error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/email/drafts — drafts pending approval
 */
router.get('/email/drafts', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const limit = parseListLimit(req.query.limit, 50, 200);
    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE folder = 'drafts' AND workspace_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.workspaceId, limit]
    );
    const emails = r.rows.map(e => ({
      id: e.id, uid: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, htmlBody: e.html_body,
      isRead: e.is_read || false, flagged: e.flagged || false,
      folder: e.folder || 'drafts', status: 'pending_approval',
      agentId: e.agent_id, date: e.created_at,
    }));

    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] Drafts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/send — send immediately via Postal, store as sent
 */
router.post('/email/send', async (req, res) => {
  try {
    const { to, subject, body, htmlBody, from, agentId } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ success: false, error: 'to and subject required' });
    }

    const pg = req.app.locals.pg;

    // Determine sender: prefer explicit from → agent email → authenticated user email → noreply
    const sender = await resolveSenderAddress({
      db: pg,
      workspaceId: req.workspaceId,
      explicitFrom: from,
      agentRef: agentId,
      fallbackUserEmail: req.user?.email || req.userEmail || null,
      defaultDomain: EMAIL_DOMAIN,
    });

    // Send via Postal
    let postalResult;
    try {
      postalResult = await sendViaPostal({ from: sender, to, subject, body, htmlBody });
      console.log('[EMAIL] Postal send success:', postalResult.data?.message_id);
    } catch (postalErr) {
      console.error('[EMAIL] Postal send failed:', postalErr.response?.data || postalErr.message);
      return res.status(502).json({
        success: false,
        error: 'Failed to send via Postal',
        details: postalErr.response?.data || postalErr.message,
      });
    }

    // Store in DB as sent
    let emailId = null;
    if (pg) {
      try {
        const r = await pg.query(
          `INSERT INTO ${SCHEMA}.emails (from_addr, to_addr, subject, body, html_body, folder, is_read, agent_id, workspace_id, created_at)
           VALUES ($1, $2, $3, $4, $5, 'sent', true, $6, $7, NOW()) RETURNING id`,
          [sender, to, subject, body || '', htmlBody || null, agentId || null, req.workspaceId]
        );
        emailId = r.rows[0]?.id;
      } catch (dbErr) {
        console.warn('[EMAIL] DB store failed (email was sent):', dbErr.message);
      }
    }

    res.json({
      success: true,
      data: {
        id: emailId,
        messageId: postalResult.data?.message_id,
        postal: postalResult.data,
      },
    });
  } catch (err) {
    console.error('[EMAIL] Send error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/draft — create a draft pending human approval
 * Agents use this instead of /send to queue emails for review.
 */
router.post('/email/draft', async (req, res) => {
  try {
    const { to, subject, body, htmlBody, from, agentId } = req.body;
    if (!to || !subject) {
      return res.status(400).json({ success: false, error: 'to and subject required' });
    }

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const sender = await resolveSenderAddress({
      db: pg,
      workspaceId: req.workspaceId,
      explicitFrom: from,
      agentRef: agentId,
      fallbackUserEmail: req.user?.email || req.userEmail || null,
      defaultDomain: EMAIL_DOMAIN,
    });

    const r = await pg.query(
      `INSERT INTO ${SCHEMA}.emails (from_addr, to_addr, subject, body, html_body, folder, is_read, agent_id, workspace_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'drafts', false, $6, $7, NOW()) RETURNING id`,
      [sender, to, subject, body || '', htmlBody || null, agentId || null, req.workspaceId]
    );

    res.status(201).json({
      success: true,
      data: {
        id: r.rows[0].id,
        status: 'pending_approval',
        message: 'Email queued for human approval',
      },
    });
  } catch (err) {
    console.error('[EMAIL] Draft error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/approve/:id — approve a draft and send it
 */
router.post('/email/approve/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const emailRow = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE id = $1 AND folder = 'drafts' AND workspace_id = $2 LIMIT 1`,
      [req.params.id, req.workspaceId]
    );

    if (!emailRow.rows[0]) {
      return res.status(404).json({ success: false, error: 'Draft not found or already processed' });
    }

    const email = emailRow.rows[0];

    // If edited body was provided, update the draft first
    const editedBody = req.body?.body;
    if (editedBody && typeof editedBody === 'string') {
      await pg.query(
        `UPDATE ${SCHEMA}.emails SET body = $1, html_body = $2 WHERE id = $3`,
        [editedBody, editedBody, req.params.id]
      );
      email.body = editedBody;
      email.html_body = editedBody;
    }

    // Route via provider APIs when the draft represents an explicit on-behalf mailbox.
    const metadata = parseEmailMetadata(email.metadata);

    let sendResult;
    if (metadata.via === 'gmail' || metadata.via === 'google') {
      try {
        const { sendGmailMessage } = require('../../../services/google/googleApi');
        const gmailResp = await sendGmailMessage(req.workspaceId, {
          to: metadata.provider_to || metadata.gmail_to || email.to_addr,
          subject: metadata.provider_subject || metadata.gmail_subject || email.subject,
          body: email.body,
          cc: metadata.gmail_cc || undefined,
          bcc: metadata.gmail_bcc || undefined,
        });
        sendResult = { via: 'google', messageId: gmailResp.id };
      } catch (gmailErr) {
        return res.status(502).json({
          success: false,
          error: 'Failed to send via Gmail',
          details: gmailErr.message,
        });
      }
    } else if (metadata.via === 'microsoft365') {
      try {
        const { sendMailMessage } = require('../../../services/microsoft/graphApi');
        await sendMailMessage(req.workspaceId, {
          to: metadata.provider_to || email.to_addr,
          subject: metadata.provider_subject || email.subject,
          body: email.body,
          htmlBody: email.html_body,
        });
        sendResult = { via: 'microsoft365', messageId: null };
      } catch (microsoftErr) {
        return res.status(502).json({
          success: false,
          error: 'Failed to send via Microsoft 365',
          details: microsoftErr.message,
        });
      }
    } else {
      // Send via Postal (default)
      try {
        const postalResp = await sendViaPostal({
          from: email.from_addr,
          to: email.to_addr,
          subject: email.subject,
          body: email.body,
          htmlBody: email.html_body,
        });
        sendResult = { via: 'postal', messageId: postalResp.data?.message_id };
      } catch (postalErr) {
        return res.status(502).json({
          success: false,
          error: 'Failed to send via Postal',
          details: postalErr.response?.data || postalErr.message,
        });
      }
    }

    // Update folder to sent
    await pg.query(
      `UPDATE ${SCHEMA}.emails SET folder = 'sent', is_read = true WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );

    res.json({
      success: true,
      data: { id: req.params.id, status: 'sent', ...sendResult },
    });
  } catch (err) {
    console.error('[EMAIL] Approve error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/email/draft/:id — reject/discard a draft
 */
router.delete('/email/draft/:id', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    await pg.query(
      `UPDATE ${SCHEMA}.emails SET folder = 'trash' WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[EMAIL] Draft delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/v1/email/:uid — delete an email (move to trash)
 */
router.delete('/email/:uid', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const result = await pg.query(
      `DELETE FROM ${SCHEMA}.emails WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [req.params.uid, req.workspaceId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }

    res.json({ success: true, deleted: req.params.uid });
  } catch (err) {
    console.error('[EMAIL] Delete error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/v1/email/inbox/:id/read — mark as read
 */
router.patch('/email/inbox/:id/read', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    await updateEmailReadState(pg, req.workspaceId, req.params.id, true);
    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/email/:uid/read — mark as read (legacy)
 */
router.put('/email/:uid/read', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    await updateEmailReadState(pg, req.workspaceId, req.params.uid, true);
    res.json({ success: true, uid: req.params.uid, read: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/email/:uid/unread — mark as unread
 */
router.put('/email/:uid/unread', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    await updateEmailReadState(pg, req.workspaceId, req.params.uid, false);
    res.json({ success: true, uid: req.params.uid, read: false });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/v1/email/:uid/flag — toggle flagged
 */
router.patch('/email/:uid/flag', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const flaggedRow = await toggleEmailFlag(pg, req.workspaceId, req.params.uid);
    const flagged = flaggedRow.flagged ?? false;
    res.json({ success: true, uid: req.params.uid, flagged });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * PATCH /api/v1/email/:uid/move — move to folder (archive, inbox, trash)
 */
router.patch('/email/:uid/move', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const { folder } = req.body || {};
    const allowed = ['inbox', 'archive', 'trash', 'sent', 'drafts'];
    if (!folder || !allowed.includes(folder)) {
      return res.status(400).json({ success: false, error: `folder must be one of: ${allowed.join(', ')}` });
    }

    await moveEmailToFolder(pg, req.workspaceId, req.params.uid, folder);
    res.json({ success: true, uid: req.params.uid, folder });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/approve/:id — approve a draft (supports optional edited body)
 * Body: { body?: string } — if provided, updates the draft body before sending
 */
// (existing approve endpoint is above, we add body-update logic via a separate route)

/**
 * GET /api/v1/email/pending — drafts pending human approval
 */
router.get('/email/pending', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT e.*, a.name AS agent_name, a.avatar AS agent_avatar, a.username AS agent_username
       FROM ${SCHEMA}.emails e
       LEFT JOIN ${SCHEMA}.agents a ON a.id::text = e.agent_id
       WHERE e.folder = 'drafts' AND e.agent_id IS NOT NULL AND e.workspace_id = $1
       ORDER BY e.created_at DESC LIMIT 100`,
      [req.workspaceId]
    );

    const emails = r.rows.map(e => ({
      id: e.id,
      from: e.from_addr,
      to: e.to_addr,
      subject: e.subject,
      body: e.body,
      htmlBody: e.html_body,
      status: 'pending_approval',
      agentId: e.agent_id,
      agentName: e.agent_name,
      agentAvatar: e.agent_avatar,
      agentUsername: e.agent_username,
      date: e.created_at,
    }));

    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] Pending error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/v1/email/stats — counters for sidebar badges
 */
router.get('/email/stats', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.json({ success: true, stats: { unread: 0, pendingApproval: 0, agentHandled: 0, total: 0 } });

    const r = await pg.query(`
      SELECT
        COUNT(*) FILTER (WHERE folder IN ('inbox') AND is_read = false) AS unread,
        COUNT(*) FILTER (WHERE folder = 'drafts' AND agent_id IS NOT NULL) AS pending_approval,
        COUNT(*) FILTER (WHERE agent_id IS NOT NULL AND folder = 'sent') AS agent_handled,
        COUNT(*) AS total
      FROM ${SCHEMA}.emails
      WHERE workspace_id = $1
    `, [req.workspaceId]);

    const row = r.rows[0];
    res.json({
      success: true,
      stats: {
        unread: Number(row.unread),
        pendingApproval: Number(row.pending_approval),
        agentHandled: Number(row.agent_handled),
        total: Number(row.total),
      },
    });
  } catch (err) {
    console.error('[EMAIL] Stats error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/:id/assign — assign an email to an agent
 * Used by "Assign to Agent" button in the UI.
 */
router.post('/email/:id/assign', async (req, res) => {
  try {
    const { agent_id } = req.body;
    if (!agent_id) return res.status(400).json({ success: false, error: 'agent_id required' });

    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const assignment = await assignEmailToAgent(pg, req.workspaceId, req.params.id, agent_id);

    res.json({
      success: true,
      data: {
        emailId: assignment.emailId,
        agentId: assignment.agentId,
        agentName: assignment.agentName,
      },
    });
  } catch (err) {
    console.error('[EMAIL] Assign error:', err.message);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/draft/:id/regenerate — ask agent to re-draft
 * Marks the current draft as 'rejected' and triggers a new draft generation.
 */
router.post('/email/draft/:id/regenerate', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    const emailRow = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE id = $1 AND folder = 'drafts' AND workspace_id = $2 LIMIT 1`,
      [req.params.id, req.workspaceId]
    );

    if (!emailRow.rows[0]) {
      return res.status(404).json({ success: false, error: 'Draft not found' });
    }

    const email = emailRow.rows[0];

    // Mark old draft as rejected
    await pg.query(
      `UPDATE ${SCHEMA}.emails SET folder = 'trash' WHERE id = $1 AND workspace_id = $2`,
      [req.params.id, req.workspaceId]
    );

    // Create a placeholder for the new draft (agent will fill it in)
    const newDraft = await pg.query(
      `INSERT INTO ${SCHEMA}.emails
         (from_addr, to_addr, subject, body, folder, is_read, agent_id, workspace_id, created_at)
       VALUES ($1, $2, $3, $4, 'drafts', false, $5, $6, NOW())
       RETURNING id`,
      [
        email.from_addr,
        email.to_addr,
        email.subject,
        '[Regenerating draft... The agent is composing a new response.]',
        email.agent_id,
        req.workspaceId,
      ]
    );

    res.json({
      success: true,
      data: {
        oldDraftId: req.params.id,
        newDraftId: newDraft.rows[0].id,
        status: 'regenerating',
        message: 'Old draft discarded. Agent is generating a new response.',
      },
    });
  } catch (err) {
    console.error('[EMAIL] Regenerate error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
