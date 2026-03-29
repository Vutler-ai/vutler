/**
 * Push Notification Service
 * Sends web push notifications to subscribed users via the Web Push protocol.
 */

const webpush = require('web-push');
const { pool } = require('./pg');

// Configure VAPID keys from env
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@vutler.ai',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

/**
 * Save a push subscription for a user
 */
async function saveSubscription(userId, subscription) {
  const { endpoint, keys } = subscription;
  await pool.query(
    `INSERT INTO tenant_vutler.push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, endpoint) DO UPDATE SET
       keys_p256dh = EXCLUDED.keys_p256dh,
       keys_auth = EXCLUDED.keys_auth`,
    [userId, endpoint, keys.p256dh, keys.auth]
  );
}

/**
 * Remove a push subscription
 */
async function removeSubscription(userId, endpoint) {
  await pool.query(
    `DELETE FROM tenant_vutler.push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint]
  );
}

/**
 * Send a push notification to a specific user
 * @param {string} userId
 * @param {object} payload - { title, body, url?, tag?, actions? }
 */
async function sendPushToUser(userId, payload) {
  const { rows } = await pool.query(
    `SELECT endpoint, keys_p256dh, keys_auth FROM tenant_vutler.push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  const results = await Promise.allSettled(
    rows.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth,
        },
      };

      try {
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload),
          { TTL: 60 * 60 } // 1 hour
        );
      } catch (err) {
        // 410 Gone = subscription expired, clean up
        if (err.statusCode === 410 || err.statusCode === 404) {
          await removeSubscription(userId, sub.endpoint);
        }
        throw err;
      }
    })
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { sent, failed };
}

/**
 * Send push notification to multiple users
 */
async function sendPushToUsers(userIds, payload) {
  const results = await Promise.allSettled(
    userIds.map((id) => sendPushToUser(id, payload))
  );
  return results;
}

module.exports = {
  saveSubscription,
  removeSubscription,
  sendPushToUser,
  sendPushToUsers,
};
