/**
 * Push Notification Service
 * Sends web push notifications to subscribed users via the Web Push protocol.
 */

const webpush = require('web-push');
const { getPool } = require('./pg');
const { assertTableExists, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

// Configure VAPID keys from env
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@vutler.ai',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const pool = (() => {
  try {
    return getPool();
  } catch (err) {
    console.warn('[pushService] PostgreSQL pool unavailable:', err.message);
    return null;
  }
})();

const PUSH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS tenant_vutler.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    endpoint TEXT NOT NULL,
    keys_p256dh TEXT NOT NULL,
    keys_auth TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, endpoint)
  )
`;

const PUSH_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id
    ON tenant_vutler.push_subscriptions(user_id)
`;

let ensurePushTablePromise = null;

function requirePool() {
  if (!pool) throw new Error('PostgreSQL pool unavailable for push subscriptions');
  return pool;
}

async function ensurePushTable(db = requirePool()) {
  if (!ensurePushTablePromise) {
    ensurePushTablePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(db, 'tenant_vutler', 'push_subscriptions', {
          label: 'Push subscriptions table',
        });
        return;
      }

      await db.query(PUSH_TABLE_SQL);
      await db.query(PUSH_INDEX_SQL);
    })().catch((err) => {
      ensurePushTablePromise = null;
      throw err;
    });
  }

  return ensurePushTablePromise;
}

/**
 * Save a push subscription for a user
 */
async function saveSubscription(userId, subscription) {
  const db = requirePool();
  await ensurePushTable(db);
  const { endpoint, keys } = subscription;
  await db.query(
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
  const db = requirePool();
  await ensurePushTable(db);
  await db.query(
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
  const db = requirePool();
  await ensurePushTable(db);
  const { rows } = await db.query(
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
  __private: {
    ensurePushTable,
  },
};
