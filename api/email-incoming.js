'use strict';

const express = require('express');
const { sendPostalMail } = require('../services/postalMailer');
const { assertPostalWebhookRequest } = require('../services/postalWebhookSecurity');
const {
  extractPostalDeliveryEvent,
  updateEmailDeliveryStatusByProviderMessageId,
} = require('../services/emailDeliveryService');
const { processInboundEmail } = require('../services/workspaceEmailService');

const router = express.Router();

function parseWebhookPayload(rawBody) {
  return JSON.parse(rawBody.toString('utf8'));
}

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
      payload = parseWebhookPayload(rawBody);
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

router.post('/email/delivery',
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
      payload = parseWebhookPayload(rawBody);
    } catch (_) {
      return res.status(400).json({ success: false, error: 'Invalid JSON payload' });
    }

    res.json({ success: true });

    try {
      const event = extractPostalDeliveryEvent(payload, req.headers || {});
      const pg = req.app.locals.pg;
      const result = await updateEmailDeliveryStatusByProviderMessageId(pg, event.providerMessageId, event, console);

      if (!result.updated) {
        console.warn('[EMAIL/DELIVERY] Event not reconciled:', {
          reason: result.reason,
          providerMessageId: event.providerMessageId,
          event: event.rawEvent,
        });
        return;
      }

      console.log('[EMAIL/DELIVERY] Email updated:', {
        emailId: result.emailId,
        providerMessageId: event.providerMessageId,
        deliveryStatus: result.deliveryStatus,
      });
    } catch (err) {
      console.error('[EMAIL/DELIVERY] Processing error:', err.message);
    }
  }
);

module.exports = router;
