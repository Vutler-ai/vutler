'use strict';

const crypto = require('crypto');
const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

let ensurePromise = null;

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function getAppBaseUrl() {
  return process.env.APP_BASE_URL
    || process.env.VUTLER_SERVER
    || 'https://app.vutler.ai';
}

function normalizeStatus(value) {
  return ['active', 'paused', 'disabled'].includes(value) ? value : 'active';
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    profileKey: row.profile_key,
    agentId: row.agent_id,
    subscriptionType: row.subscription_type,
    sourceResource: row.source_resource,
    roomName: row.room_name,
    events: row.events || [],
    status: row.status,
    deliveryMode: row.delivery_mode,
    callbackPath: row.callback_path,
    callbackUrl: `${getAppBaseUrl()}${row.callback_path}`,
    verificationSecret: row.verification_secret,
    config: row.config || {},
    externalSubscriptionId: row.external_subscription_id || null,
    lastEventAt: row.last_event_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureEventSubscriptionTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${SCHEMA}.nexus_enterprise_event_subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID NOT NULL,
        provider TEXT NOT NULL,
        profile_key TEXT NULL,
        agent_id TEXT NULL,
        subscription_type TEXT NOT NULL,
        source_resource TEXT NULL,
        room_name TEXT NULL,
        events JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'active',
        delivery_mode TEXT NOT NULL DEFAULT 'manual',
        callback_path TEXT NOT NULL,
        verification_secret TEXT NOT NULL,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        external_subscription_id TEXT NULL,
        last_event_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_nexus_ent_event_subscriptions_workspace
      ON ${SCHEMA}.nexus_enterprise_event_subscriptions (workspace_id, provider, status, created_at DESC)
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_nexus_ent_event_subscriptions_callback
      ON ${SCHEMA}.nexus_enterprise_event_subscriptions (callback_path)
    `);
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}

async function createEventSubscription(input = {}) {
  await ensureEventSubscriptionTables();

  const callbackPath = `/api/v1/webhooks/enterprise/${randomToken(12)}`;
  const verificationSecret = randomToken(24);
  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.nexus_enterprise_event_subscriptions (
       workspace_id,
       provider,
       profile_key,
       agent_id,
       subscription_type,
       source_resource,
       room_name,
       events,
       status,
       delivery_mode,
       callback_path,
       verification_secret,
       config
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb)
     RETURNING *`,
    [
      input.workspaceId,
      input.provider,
      input.profileKey || null,
      input.agentId || null,
      input.subscriptionType || 'room_event',
      input.sourceResource || null,
      input.roomName || null,
      JSON.stringify(Array.isArray(input.events) ? input.events : []),
      normalizeStatus(input.status),
      input.deliveryMode || 'manual',
      callbackPath,
      verificationSecret,
      JSON.stringify(input.config || {}),
    ]
  );

  return mapSubscription(result.rows[0]);
}

async function listEventSubscriptions(workspaceId, filters = {}) {
  await ensureEventSubscriptionTables();
  const params = [workspaceId];
  const clauses = ['workspace_id = $1'];

  if (filters.provider) {
    params.push(filters.provider);
    clauses.push(`provider = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.nexus_enterprise_event_subscriptions
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 100`,
    params
  );

  return result.rows.map(mapSubscription);
}

async function getEventSubscriptionByCallback(callbackPath) {
  await ensureEventSubscriptionTables();
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.nexus_enterprise_event_subscriptions
      WHERE callback_path = $1
      LIMIT 1`,
    [callbackPath]
  );
  return mapSubscription(result.rows[0]);
}

async function markSubscriptionDelivered(subscriptionId, payload = {}) {
  await ensureEventSubscriptionTables();
  await pool.query(
    `UPDATE ${SCHEMA}.nexus_enterprise_event_subscriptions
        SET last_event_at = NOW(),
            updated_at = NOW(),
            external_subscription_id = COALESCE($2, external_subscription_id),
            config = config || $3::jsonb
      WHERE id = $1::uuid`,
    [
      subscriptionId,
      payload.externalSubscriptionId || null,
      JSON.stringify(payload.configPatch || {}),
    ]
  );
}

module.exports = {
  ensureEventSubscriptionTables,
  createEventSubscription,
  listEventSubscriptions,
  getEventSubscriptionByCallback,
  markSubscriptionDelivered,
};
