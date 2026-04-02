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

const WEBHOOK_SECRET = process.env.SNIPARA_WEBHOOK_SECRET || '';

// Track processed deliveries to ensure idempotency (in-memory, bounded)
const _processed = new Set();
const MAX_PROCESSED = 10000;

// ---------- HMAC VERIFICATION ----------

function verifySignature(rawBody, signature) {
  if (!WEBHOOK_SECRET) return true; // Skip verification if no secret configured
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

    // Verify HMAC signature
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
    if (WEBHOOK_SECRET && !verifySignature(rawBody, signature)) {
      console.warn('[SniparaWebhook] Invalid signature, rejecting');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Idempotency check
    if (deliveryId && _processed.has(deliveryId)) {
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

    // Parse body
    let payload;
    try {
      payload = JSON.parse(rawBody.toString());
    } catch (err) {
      console.error('[SniparaWebhook] Invalid JSON body:', err.message);
      return;
    }

    const type = eventType || payload.event_type;
    console.log(`[SniparaWebhook] Received ${type} (delivery: ${deliveryId || 'none'})`);

    // Route to handler (fire-and-forget)
    try {
      await routeWebhookEvent(type, payload);
    } catch (err) {
      console.error(`[SniparaWebhook] Handler error for ${type}:`, err.message);
    }
  }
);

// Health check
router.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'snipara-webhook-receiver' });
});

module.exports = router;
