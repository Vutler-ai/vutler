/**
 * Email API — Vaultbrix PostgreSQL + Postal SMTP
 */
'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { sendPostalMail } = require('../services/postalMailer');
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
    from: from || 'jarvis@vutler.ai',
    subject,
    plain_body: body || '',
    html_body: htmlBody || undefined,
  });

  if (result?.skipped) {
    const error = new Error(result.reason || 'Postal delivery was skipped.');
    error.response = { data: result };
    throw error;
  }

  if (result?.success === false) {
    const error = new Error(result.error || result.reason || 'Postal delivery failed.');
    error.response = { data: result };
    throw error;
  }

  return {
    data: result?.data || result,
    raw: result,
  };
}

// GET /api/v1/email — handles ?folder= query param (frontend compat)
router.get("/", async (req, res) => {
  try {
    const folder = req.query.folder || "inbox";
    const limit = Number(req.query.limit) || 50;
    const r = await pool.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE (folder = $1 OR ($1 = 'inbox' AND folder IS NULL)) AND workspace_id = $3
       ORDER BY created_at DESC LIMIT $2`,
      [folder, limit, req.workspaceId]
    );
    const emails = r.rows.map(e => ({
      id: e.id, uid: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, htmlBody: e.html_body,
      isRead: e.is_read || false, folder: e.folder || "inbox",
      agentId: e.agent_id, date: e.created_at
    }));
    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error("[EMAIL] List error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/email/inbox
router.get('/inbox', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const r = await pool.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE (folder = 'inbox' OR folder IS NULL) AND workspace_id = $2
       ORDER BY created_at DESC LIMIT $1`,
      [limit, req.workspaceId]
    );
    const emails = r.rows.map(e => ({
      id: e.id, uid: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, htmlBody: e.html_body,
      isRead: e.is_read || false, folder: e.folder || 'inbox',
      agentId: e.agent_id, date: e.created_at
    }));
    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] Inbox error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/email/sent
router.get('/sent', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT * FROM ${SCHEMA}.emails WHERE folder = 'sent' AND workspace_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.workspaceId]
    );
    const emails = r.rows.map(e => ({
      id: e.id, from: e.from_addr, to: e.to_addr,
      subject: e.subject, body: e.body, date: e.created_at
    }));
    res.json({ success: true, emails, count: emails.length });
  } catch (err) {
    console.error('[EMAIL] Sent error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/email/send — Send via Postal + store in DB
router.post('/send', async (req, res) => {
  try {
    const { to, subject, body, htmlBody, from } = req.body;
    if (!to || !subject) return res.status(400).json({ success: false, error: 'to and subject required' });

    const sender = from || 'jarvis@vutler.ai';

    // 1. Send via Postal
    let postalResult;
    try {
      postalResult = await sendViaPostal({ from: sender, to, subject, body, htmlBody });
      console.log('[EMAIL] Postal send success:', postalResult.data?.message_id);
    } catch (postalErr) {
      console.error('[EMAIL] Postal send failed:', postalErr.response?.data || postalErr.message);
      return res.status(502).json({
        success: false,
        error: 'Failed to send via Postal',
        details: postalErr.response?.data || postalErr.message
      });
    }

    // 2. Store in DB as sent
    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.emails (from_addr, to_addr, subject, body, html_body, folder, is_read, created_at, workspace_id)
       VALUES ($1, $2, $3, $4, $5, 'sent', true, NOW(), $6) RETURNING id`,
      [sender, to, subject, body || '', htmlBody || null, req.workspaceId]
    );

    res.json({
      success: true,
      data: {
        id: r.rows[0].id,
        messageId: postalResult.data?.message_id,
        postal: postalResult.data
      }
    });
  } catch (err) {
    console.error('[EMAIL] Send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/v1/email/inbox/:id/read
router.patch('/inbox/:id/read', async (req, res) => {
  try {
    await pool.query(`UPDATE ${SCHEMA}.emails SET is_read = true WHERE id = $1 AND workspace_id = $2`, [req.params.id, req.workspaceId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/email/:uid/read (legacy route)
router.put('/:uid/read', async (req, res) => {
  try {
    await pool.query(`UPDATE ${SCHEMA}.emails SET is_read = true WHERE id = $1 AND workspace_id = $2`, [req.params.uid, req.workspaceId]);
    res.json({ success: true, uid: req.params.uid, read: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
