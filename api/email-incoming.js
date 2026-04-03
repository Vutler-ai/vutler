'use strict';

const express = require('express');
const { sendPostalMail } = require('../services/postalMailer');
const { processInboundEmail } = require('../services/workspaceEmailService');

const router = express.Router();

router.post('/email/incoming', async (req, res) => {
  res.json({ success: true });

  try {
    const pg = req.app.locals.pg;
    await processInboundEmail({
      db: pg,
      payload: req.body || {},
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
});

module.exports = router;
