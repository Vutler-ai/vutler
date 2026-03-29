/**
 * Push Notifications API
 * POST /api/v1/push/subscribe   - Register a push subscription
 * DELETE /api/v1/push/unsubscribe - Remove a push subscription
 */

const express = require('express');
const router = express.Router();
const { saveSubscription, removeSubscription } = require('../services/pushService');

// Subscribe to push notifications
router.post('/subscribe', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ success: false, error: 'Invalid subscription data' });
    }

    await saveSubscription(userId, { endpoint, keys });
    res.json({ success: true });
  } catch (err) {
    console.error('[push] subscribe error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save subscription' });
  }
});

// Unsubscribe from push notifications
router.delete('/unsubscribe', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Endpoint required' });
    }

    await removeSubscription(userId, endpoint);
    res.json({ success: true });
  } catch (err) {
    console.error('[push] unsubscribe error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to remove subscription' });
  }
});

module.exports = router;
