/**
 * Vutler Email API — Postal SMTP + PostgreSQL
 * Replaced stub with real implementation backed by tenant_vutler.emails table
 * and Postal HTTP API for sending.
 */
'use strict';

const express = require('express');
const axios = require('axios');
const router = express.Router();

// Postal configuration
const POSTAL_API_URL = process.env.POSTAL_API_URL || 'http://postal-smtp:8080';
const POSTAL_API_KEY = process.env.POSTAL_API_KEY || '';
const POSTAL_HOST = process.env.POSTAL_HOST || 'mail.starbox-group.com';
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN || 'starbox-group.com';
const SCHEMA = 'tenant_vutler';

/**
 * Send email via Postal HTTP API
 */
async function sendViaPostal({ from, to, subject, body, htmlBody }) {
  const payload = {
    to: Array.isArray(to) ? to : [to],
    from: from || `noreply@${EMAIL_DOMAIN}`,
    subject: subject,
    plain_body: body || '',
  };
  if (htmlBody) payload.html_body = htmlBody;

  const resp = await axios.post(
    `${POSTAL_API_URL}/api/v1/send/message`,
    payload,
    {
      headers: {
        'X-Server-API-Key': POSTAL_API_KEY,
        'Content-Type': 'application/json',
        'Host': POSTAL_HOST,
      },
      timeout: 10000,
    }
  );
  return resp.data;
}

/**
 * GET /api/v1/email — list emails, supports ?folder=inbox|sent|drafts
 */
router.get('/email', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const folder = req.query.folder || 'inbox';
    const agentId = req.query.agent_id || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    if (!pg) {
      return res.json({ success: true, emails: [], count: 0 });
    }

    let query, params;
    if (agentId) {
      query = `SELECT * FROM ${SCHEMA}.emails WHERE (folder = $1 OR ($1 = 'inbox' AND folder IS NULL)) AND agent_id = $2 ORDER BY created_at DESC LIMIT $3`;
      params = [folder, agentId, limit];
    } else {
      query = `SELECT * FROM ${SCHEMA}.emails WHERE folder = $1 OR ($1 = 'inbox' AND folder IS NULL) ORDER BY created_at DESC LIMIT $2`;
      params = [folder, limit];
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
      status: e.status || null,
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
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE folder = 'inbox' OR folder IS NULL ORDER BY created_at DESC LIMIT $1`,
      [limit]
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
    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE folder = 'sent' ORDER BY created_at DESC LIMIT 50`
    );
    const emails = r.rows.map(e => ({
      id: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, date: e.created_at,
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
    if (!pg) return res.json({ success: true, emails: [], count: 0 });

    const r = await pg.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE folder = 'drafts' OR status = 'pending_approval' ORDER BY created_at DESC LIMIT 100`
    );
    const emails = r.rows.map(e => ({
      id: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, htmlBody: e.html_body,
      status: e.status || 'pending_approval',
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
    let sender = from;
    if (!sender && agentId && pg) {
      try {
        const agentRow = await pg.query(
          `SELECT email FROM ${SCHEMA}.agents WHERE id = $1 LIMIT 1`,
          [agentId]
        );
        if (agentRow.rows[0]?.email) sender = agentRow.rows[0].email;
      } catch (_) {}
    }
    if (!sender) {
      sender = req.user?.email || req.userEmail || null;
    }
    sender = sender || `noreply@${EMAIL_DOMAIN}`;

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
          `INSERT INTO ${SCHEMA}.emails (from_addr, to_addr, subject, body, html_body, folder, status, is_read, agent_id, created_at)
           VALUES ($1, $2, $3, $4, $5, 'sent', 'sent', true, $6, NOW()) RETURNING id`,
          [sender, to, subject, body || '', htmlBody || null, agentId || null]
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
    res.status(500).json({ success: false, error: err.message });
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

    let sender = from;
    if (!sender && agentId) {
      try {
        const agentRow = await pg.query(
          `SELECT email FROM ${SCHEMA}.agents WHERE id = $1 LIMIT 1`,
          [agentId]
        );
        if (agentRow.rows[0]?.email) sender = agentRow.rows[0].email;
      } catch (_) {}
    }
    if (!sender) {
      sender = req.user?.email || req.userEmail || null;
    }
    sender = sender || `noreply@${EMAIL_DOMAIN}`;

    const r = await pg.query(
      `INSERT INTO ${SCHEMA}.emails (from_addr, to_addr, subject, body, html_body, folder, status, is_read, agent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'drafts', 'pending_approval', false, $6, NOW()) RETURNING id`,
      [sender, to, subject, body || '', htmlBody || null, agentId || null]
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
    res.status(500).json({ success: false, error: err.message });
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
      `SELECT * FROM ${SCHEMA}.emails WHERE id = $1 AND status = 'pending_approval' LIMIT 1`,
      [req.params.id]
    );

    if (!emailRow.rows[0]) {
      return res.status(404).json({ success: false, error: 'Draft not found or already processed' });
    }

    const email = emailRow.rows[0];

    // Send via Postal
    let postalResult;
    try {
      postalResult = await sendViaPostal({
        from: email.from_addr,
        to: email.to_addr,
        subject: email.subject,
        body: email.body,
        htmlBody: email.html_body,
      });
    } catch (postalErr) {
      return res.status(502).json({
        success: false,
        error: 'Failed to send via Postal',
        details: postalErr.response?.data || postalErr.message,
      });
    }

    // Update status to sent
    await pg.query(
      `UPDATE ${SCHEMA}.emails SET folder = 'sent', status = 'sent', is_read = true WHERE id = $1`,
      [req.params.id]
    );

    res.json({
      success: true,
      data: { id: req.params.id, status: 'sent', messageId: postalResult.data?.message_id },
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
      `UPDATE ${SCHEMA}.emails SET status = 'rejected', folder = 'trash' WHERE id = $1`,
      [req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[EMAIL] Draft delete error:', err.message);
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

    await pg.query(`UPDATE ${SCHEMA}.emails SET is_read = true WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/v1/email/:uid/read — mark as read (legacy)
 */
router.put('/email/:uid/read', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    if (!pg) return res.status(503).json({ success: false, error: 'Database not available' });

    await pg.query(`UPDATE ${SCHEMA}.emails SET is_read = true WHERE id = $1`, [req.params.uid]);
    res.json({ success: true, uid: req.params.uid, read: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/v1/email/incoming — Postal webhook for inbound emails
 *
 * Postal calls this endpoint when an email arrives at a Vutler-managed address.
 * We look up which agent owns the destination address via email_routes and store
 * the message in the emails table for the agent to process.
 *
 * Postal payload shape (simplified):
 * {
 *   id: number,
 *   rcpt_to: "agent@domain.com",
 *   mail_from: "sender@example.com",
 *   subject: "...",
 *   plain_body: "...",
 *   html_body: "...",
 *   message: { ... }
 * }
 */
router.post('/email/incoming', async (req, res) => {
  // Acknowledge Postal immediately to avoid retries
  res.json({ success: true });

  try {
    const pg = req.app.locals.pg;
    if (!pg) {
      console.warn('[EMAIL/INCOMING] No DB — dropping inbound email');
      return;
    }

    const payload = req.body || {};
    const recipient = (payload.rcpt_to || payload.to || '').toLowerCase().trim();
    const sender = payload.mail_from || payload.from || '';
    const subject = payload.subject || '(no subject)';
    const body = payload.plain_body || payload.body || '';
    const htmlBody = payload.html_body || null;

    if (!recipient) {
      console.warn('[EMAIL/INCOMING] Missing recipient — skipping');
      return;
    }

    console.log(`[EMAIL/INCOMING] Received from ${sender} → ${recipient}: ${subject}`);

    // Look up route for this address
    let agentId = null;
    let autoReply = false;
    let approvalRequired = true;

    try {
      const routeRow = await pg.query(
        `SELECT er.agent_id, er.auto_reply, er.approval_required
         FROM tenant_vutler.email_routes er
         WHERE LOWER(er.email_address) = $1 LIMIT 1`,
        [recipient]
      );
      if (routeRow.rows[0]) {
        agentId = routeRow.rows[0].agent_id;
        autoReply = routeRow.rows[0].auto_reply;
        approvalRequired = routeRow.rows[0].approval_required;
      }
    } catch (routeErr) {
      console.warn('[EMAIL/INCOMING] Route lookup failed:', routeErr.message);
    }

    // Store incoming email in inbox
    const insertResult = await pg.query(
      `INSERT INTO ${SCHEMA}.emails
         (from_addr, to_addr, subject, body, html_body, folder, status, is_read, agent_id, created_at)
       VALUES ($1, $2, $3, $4, $5, 'inbox', 'received', false, $6, NOW())
       RETURNING id`,
      [sender, recipient, subject, body, htmlBody, agentId || null]
    );
    const emailId = insertResult.rows[0]?.id;

    console.log(`[EMAIL/INCOMING] Stored email ${emailId} → agent ${agentId || 'unrouted'}`);

    // If auto-reply is enabled and an agent is assigned, create a pending draft
    if (agentId && autoReply) {
      const replyStatus = approvalRequired ? 'pending_approval' : 'pending_send';
      const replyFolder = approvalRequired ? 'drafts' : 'outbox';

      // Fetch agent email for From header
      let agentEmail = recipient; // default: reply from the address that received the mail
      try {
        const agentRow = await pg.query(
          `SELECT email FROM tenant_vutler.agents WHERE id = $1 LIMIT 1`,
          [agentId]
        );
        if (agentRow.rows[0]?.email) agentEmail = agentRow.rows[0].email;
      } catch (_) {}

      await pg.query(
        `INSERT INTO ${SCHEMA}.emails
           (from_addr, to_addr, subject, body, folder, status, is_read, agent_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, false, $7, NOW())`,
        [
          agentEmail,
          sender,
          `Re: ${subject}`,
          `Thank you for your email. ${approvalRequired ? 'Your reply is pending approval.' : 'We will be in touch shortly.'}`,
          replyFolder,
          replyStatus,
          agentId,
        ]
      );

      console.log(`[EMAIL/INCOMING] Auto-reply draft created for agent ${agentId} (approval_required=${approvalRequired})`);
    }
  } catch (err) {
    console.error('[EMAIL/INCOMING] Processing error:', err.message);
  }
});

module.exports = router;
