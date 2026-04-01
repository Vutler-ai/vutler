'use strict';

const express = require('express');
const pool = require('../../lib/vaultbrix');
const {
  getEventSubscriptionByCallback,
  markSubscriptionDelivered,
} = require('../../services/nexusEnterpriseEventSubscriptions');

const router = express.Router();
const SCHEMA = 'tenant_vutler';

router.get('/:token', async (req, res) => {
  try {
    const callbackPath = `/api/v1/webhooks/enterprise/${req.params.token}`;
    const subscription = await getEventSubscriptionByCallback(callbackPath);
    if (!subscription) {
      return res.status(404).send('unknown webhook target');
    }

    const validationToken = req.query.validationToken;
    if (typeof validationToken === 'string' && validationToken.length > 0) {
      res.set('Content-Type', 'text/plain');
      return res.status(200).send(validationToken);
    }

    return res.json({ success: true, subscriptionId: subscription.id, provider: subscription.provider });
  } catch (error) {
    return res.status(500).send(error.message || 'webhook validation failed');
  }
});

async function logWorkspaceEvent(workspaceId, provider, action, payload) {
  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_integration_logs
      (workspace_id, provider, action, status, payload)
     VALUES ($1, $2, $3, 'success', $4::jsonb)`,
    [workspaceId, provider, action, JSON.stringify(payload || {})]
  );
}

router.post('/:token', express.json({ limit: '512kb' }), async (req, res) => {
  try {
    const callbackPath = `/api/v1/webhooks/enterprise/${req.params.token}`;
    const subscription = await getEventSubscriptionByCallback(callbackPath);
    if (!subscription) {
      return res.status(404).json({ success: false, error: 'Unknown webhook target' });
    }

    const providedSecret = req.query.secret
      || req.headers['x-vutler-webhook-secret']
      || req.headers['x-webhook-secret'];

    if (providedSecret !== subscription.verificationSecret) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const payload = req.body || {};
    const eventType = payload.eventType || payload.event_type || payload.changeType || payload.type || 'event_received';
    await logWorkspaceEvent(subscription.workspaceId, subscription.provider, eventType, {
      subscriptionId: subscription.id,
      callbackPath,
      roomName: subscription.roomName,
      sourceResource: subscription.sourceResource,
      payload,
    });
    await markSubscriptionDelivered(subscription.id);

    return res.json({ success: true, subscriptionId: subscription.id, eventType });
  } catch (error) {
    console.error('[ENTERPRISE WEBHOOK] Processing error:', error.message);
    return res.json({ success: false, error: error.message });
  }
});

module.exports = router;
