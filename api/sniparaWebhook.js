'use strict';

/**
 * Snipara Webhook Receiver
 *
 * Receives task/htask lifecycle events from Snipara and routes them
 * to the verification engine, watchdog, and scoring loop.
 *
 * Expected headers:
 *   X-Snipara-Event:     event type (e.g. "task.completed")
 *   X-Snipara-Delivery:  event ID (idempotency key)
 *   X-Snipara-Signature: HMAC-SHA256 signature ("sha256=...")
 */

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { recordWorkspaceSniparaWebhookEvent } = require('../services/sniparaWebhookEventLogService');

const WEBHOOK_SECRET = process.env.SNIPARA_WEBHOOK_SECRET || '';

// Track processed deliveries to ensure idempotency (in-memory, bounded)
const _processed = new Set();
const MAX_PROCESSED = 10000;

// ---------- HMAC VERIFICATION ----------

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return false;
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}

// ---------- EVENT ROUTING ----------

async function routeWebhookEvent(eventType, payload) {
  // Lazy-load services to avoid circular deps at startup
  const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
  const { getVerificationEngine } = require('../services/verificationEngine');
  const { getWatchdog } = require('../services/watchdog');
  const { getScoringLoop } = require('../services/scoringLoop');
  const workspaceId = payload?.data?.workspace_id || payload?.workspace_id;
  const coordinator = getSwarmCoordinator();

  if (/^(task|htask)\./.test(String(eventType || ''))) {
    await coordinator.projectWebhookEvent(eventType, payload.data || {}, workspaceId).catch((err) => {
      console.warn(`[SniparaWebhook] Projection warning for ${eventType}:`, err.message);
    });
  }

  switch (eventType) {
    case 'task.completed':
      await getVerificationEngine().verify(payload.data);
      break;

    case 'task.failed':
      await getWatchdog().handleTaskFailed(payload.data);
      break;

    case 'task.timeout':
      await getWatchdog().handleTimeout(payload.data);
      break;

    case 'task.blocked':
    case 'htask.blocked':
      await getWatchdog().handleBlocked(payload.data);
      break;

    case 'task.unblocked':
    case 'htask.unblocked':
      await getWatchdog().handleUnblocked(payload.data);
      break;

    case 'htask.completed':
      await getScoringLoop().recordHtaskCompletion(payload.data);
      break;

    case 'htask.closure_ready':
      await getWatchdog().handleClosureReady(payload.data);
      console.log('[SniparaWebhook] htask.closure_ready received:', payload.data?.task_id);
      break;

    case 'htask.closed':
      await getWatchdog().handleClosureReady(payload.data);
      console.log('[SniparaWebhook] htask.closed received:', payload.data?.task_id);
      break;

    case 'task.created':
    case 'task.claimed':
      // Informational — log and move on
      console.log(`[SniparaWebhook] ${eventType}:`, payload.data?.task_id);
      break;

    case 'test.ping':
      console.log('[SniparaWebhook] test.ping received');
      break;

    default:
      console.log(`[SniparaWebhook] Unhandled event type: ${eventType}`);
  }
}

// ---------- WEBHOOK ENDPOINT ----------

// Use raw body parser for HMAC verification
router.post('/',
  express.raw({ type: 'application/json', limit: '1mb' }),
  async (req, res) => {
    const signature = req.headers['x-snipara-signature'];
    const eventType = req.headers['x-snipara-event'];
    const deliveryId = req.headers['x-snipara-delivery'];
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    const rawText = rawBody.toString();

    let payload;
    try {
      payload = JSON.parse(rawText);
    } catch (err) {
      console.error('[SniparaWebhook] Invalid JSON body:', err.message);
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const type = eventType || payload.event_type || payload.event || 'unknown';
    const workspaceId = payload?.workspace_id || payload?.data?.workspace_id || null;

    if (!WEBHOOK_SECRET) {
      console.warn('[SniparaWebhook] Rejected request: SNIPARA_WEBHOOK_SECRET is not configured');
      await recordWorkspaceSniparaWebhookEvent({
        db: pool,
        workspaceId,
        eventType: type,
        deliveryId,
        status: 'misconfigured',
        payload,
        error: 'SNIPARA_WEBHOOK_SECRET is not configured',
      }).catch(() => null);
      return res.status(503).json({ error: 'Webhook not configured' });
    }

    // Verify HMAC signature
    if (!verifySignature(rawBody, signature)) {
      console.warn('[SniparaWebhook] Invalid signature, rejecting');
      await recordWorkspaceSniparaWebhookEvent({
        db: pool,
        workspaceId,
        eventType: type,
        deliveryId,
        status: 'invalid_signature',
        payload,
        error: 'Invalid signature',
      }).catch(() => null);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Idempotency check
    if (deliveryId && _processed.has(deliveryId)) {
      await recordWorkspaceSniparaWebhookEvent({
        db: pool,
        workspaceId,
        eventType: type,
        deliveryId,
        status: 'duplicate',
        payload,
      }).catch(() => null);
      return res.status(200).json({ received: true, duplicate: true });
    }

    // ACK immediately — process asynchronously
    res.status(200).json({ received: true });

    // Track delivery
    if (deliveryId) {
      _processed.add(deliveryId);
      if (_processed.size > MAX_PROCESSED) {
        // Evict oldest entries (Set preserves insertion order)
        const iter = _processed.values();
        for (let i = 0; i < MAX_PROCESSED / 2; i++) {
          _processed.delete(iter.next().value);
        }
      }
    }

    console.log(`[SniparaWebhook] Received ${type} (delivery: ${deliveryId || 'none'})`);

    // Route to handler (fire-and-forget)
    try {
      await routeWebhookEvent(type, payload);
      await recordWorkspaceSniparaWebhookEvent({
        db: pool,
        workspaceId,
        eventType: type,
        deliveryId,
        status: 'processed',
        payload,
      }).catch(() => null);
    } catch (err) {
      console.error(`[SniparaWebhook] Handler error for ${type}:`, err.message);
      await recordWorkspaceSniparaWebhookEvent({
        db: pool,
        workspaceId,
        eventType: type,
        deliveryId,
        status: 'handler_error',
        payload,
        error: err.message,
      }).catch(() => null);
    }
  }
);

// Health check
router.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'snipara-webhook-receiver' });
});

module.exports = router;
