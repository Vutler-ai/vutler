'use strict';

const express = require('express');
const { sendPostalMail } = require('../services/postalMailer');
const { assertPostalWebhookRequest } = require('../services/postalWebhookSecurity');
const { processInboundEmail } = require('../services/workspaceEmailService');

const router = express.Router();

router.post('/email/incoming',
  express.raw({ type: '*/*', limit: '2mb' }),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');

    try {
      assertPostalWebhookRequest({
        rawBody,
        headers: req.headers || {},
        query: req.query || {},
      });
    } catch (err) {
      return res.status(err.statusCode || 401).json({ success: false, error: err.message });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch (_) {
      return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
    }

    res.json({ success: true });

    try {
      const pg = req.app.locals.pg;
      await processInboundEmail({
        db: pg,
        payload,
        sendViaPostal: async ({ from, to, subject, body, htmlBody }) => sendPostalMail({
          from,
          to,
          subject,
          plain_body: body || '',
          html_body: htmlBody || null,
        }),
        logger: console,
      });
    } catch (err) {
      console.error('[EMAIL/INCOMING] Processing error:', err.message);
    }
  }
);

module.exports = router;
