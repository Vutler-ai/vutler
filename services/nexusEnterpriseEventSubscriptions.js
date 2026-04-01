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

function normalizeProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'graph' || normalized === 'graphapi' || normalized === 'microsoft365') return 'microsoft_graph';
  if (normalized === 'zoom_webhook') return 'zoom';
  if (normalized === 'google_workspace') return 'google';
  return normalized || 'generic_http';
}

function normalizeProvisioningMode(value, provider) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['manual', 'assisted', 'automatic'].includes(normalized)) return normalized;
  if (provider === 'microsoft_graph') return 'assisted';
  if (provider === 'zoom' || provider === 'google') return 'manual';
  return 'manual';
}

function initialProvisioningStatus(mode) {
  if (mode === 'automatic') return 'pending';
  if (mode === 'assisted') return 'assisted_required';
  return 'manual_required';
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
    provisioningMode: row.provisioning_mode || 'manual',
    provisioningStatus: row.provisioning_status || 'manual_required',
    provisioningError: row.provisioning_error || null,
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
        provisioning_mode TEXT NOT NULL DEFAULT 'manual',
        provisioning_status TEXT NOT NULL DEFAULT 'manual_required',
        provisioning_error TEXT NULL,
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
      ALTER TABLE ${SCHEMA}.nexus_enterprise_event_subscriptions
      ADD COLUMN IF NOT EXISTS provisioning_mode TEXT NOT NULL DEFAULT 'manual'
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE ${SCHEMA}.nexus_enterprise_event_subscriptions
      ADD COLUMN IF NOT EXISTS provisioning_status TEXT NOT NULL DEFAULT 'manual_required'
    `).catch(() => {});
    await pool.query(`
      ALTER TABLE ${SCHEMA}.nexus_enterprise_event_subscriptions
      ADD COLUMN IF NOT EXISTS provisioning_error TEXT NULL
    `).catch(() => {});
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
  const provider = normalizeProvider(input.provider);
  const provisioningMode = normalizeProvisioningMode(input.provisioningMode, provider);
  const provisioningStatus = initialProvisioningStatus(provisioningMode);
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
       provisioning_mode,
       provisioning_status,
        callback_path,
        verification_secret,
        config
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15::jsonb)
     RETURNING *`,
    [
      input.workspaceId,
      provider,
      input.profileKey || null,
      input.agentId || null,
      input.subscriptionType || 'room_event',
      input.sourceResource || null,
      input.roomName || null,
      JSON.stringify(Array.isArray(input.events) ? input.events : []),
      normalizeStatus(input.status),
      input.deliveryMode || 'manual',
      provisioningMode,
      provisioningStatus,
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

async function listAllEventSubscriptions(filters = {}) {
  await ensureEventSubscriptionTables();
  const params = [];
  const clauses = ['1=1'];

  if (filters.workspaceId) {
    params.push(filters.workspaceId);
    clauses.push(`workspace_id = $${params.length}`);
  }

  if (filters.provider) {
    params.push(normalizeProvider(filters.provider));
    clauses.push(`provider = $${params.length}`);
  }

  if (filters.status) {
    params.push(filters.status);
    clauses.push(`status = $${params.length}`);
  }

  if (filters.provisioningStatus) {
    params.push(filters.provisioningStatus);
    clauses.push(`provisioning_status = $${params.length}`);
  }

  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.nexus_enterprise_event_subscriptions
      WHERE ${clauses.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 250`,
    params
  );

  return result.rows.map(mapSubscription);
}

async function getEventSubscriptionById(subscriptionId, workspaceId = null) {
  await ensureEventSubscriptionTables();
  const params = [subscriptionId];
  let where = 'id = $1::uuid';
  if (workspaceId) {
    params.push(workspaceId);
    where += ` AND workspace_id = $2`;
  }

  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.nexus_enterprise_event_subscriptions
      WHERE ${where}
      LIMIT 1`,
    params
  );

  return mapSubscription(result.rows[0]);
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

async function updateEventSubscriptionProvisioning(subscriptionId, input = {}) {
  await ensureEventSubscriptionTables();
  const result = await pool.query(
    `UPDATE ${SCHEMA}.nexus_enterprise_event_subscriptions
        SET provisioning_mode = COALESCE($2, provisioning_mode),
            provisioning_status = COALESCE($3, provisioning_status),
            provisioning_error = $4,
            external_subscription_id = COALESCE($5, external_subscription_id),
            config = config || $6::jsonb,
            updated_at = NOW()
      WHERE id = $1::uuid
      RETURNING *`,
    [
      subscriptionId,
      input.provisioningMode || null,
      input.provisioningStatus || null,
      input.provisioningError || null,
      input.externalSubscriptionId || null,
      JSON.stringify(input.configPatch || {}),
    ]
  );
  return mapSubscription(result.rows[0]);
}

async function updateEventSubscription(subscriptionId, input = {}, workspaceId = null) {
  await ensureEventSubscriptionTables();

  const setClauses = [];
  const params = [subscriptionId];

  if (input.status !== undefined) {
    params.push(normalizeStatus(input.status));
    setClauses.push(`status = $${params.length}`);
  }
  if (input.provisioningMode !== undefined) {
    params.push(normalizeProvisioningMode(input.provisioningMode, input.provider));
    setClauses.push(`provisioning_mode = $${params.length}`);
  }
  if (input.provisioningStatus !== undefined) {
    params.push(input.provisioningStatus);
    setClauses.push(`provisioning_status = $${params.length}`);
  }
  if (input.provisioningError !== undefined) {
    params.push(input.provisioningError || null);
    setClauses.push(`provisioning_error = $${params.length}`);
  }
  if (input.sourceResource !== undefined) {
    params.push(input.sourceResource || null);
    setClauses.push(`source_resource = $${params.length}`);
  }
  if (input.roomName !== undefined) {
    params.push(input.roomName || null);
    setClauses.push(`room_name = $${params.length}`);
  }
  if (input.events !== undefined) {
    params.push(JSON.stringify(Array.isArray(input.events) ? input.events : []));
    setClauses.push(`events = $${params.length}::jsonb`);
  }
  if (input.configPatch !== undefined) {
    params.push(JSON.stringify(input.configPatch || {}));
    setClauses.push(`config = config || $${params.length}::jsonb`);
  }

  if (setClauses.length === 0) {
    return getEventSubscriptionById(subscriptionId, workspaceId);
  }

  setClauses.push('updated_at = NOW()');

  let whereClause = 'id = $1::uuid';
  if (workspaceId) {
    params.push(workspaceId);
    whereClause += ` AND workspace_id = $${params.length}`;
  }

  const result = await pool.query(
    `UPDATE ${SCHEMA}.nexus_enterprise_event_subscriptions
        SET ${setClauses.join(', ')}
      WHERE ${whereClause}
      RETURNING *`,
    params
  );

  return mapSubscription(result.rows[0]);
}

module.exports = {
  ensureEventSubscriptionTables,
  createEventSubscription,
  getEventSubscriptionById,
  listEventSubscriptions,
  listAllEventSubscriptions,
  getEventSubscriptionByCallback,
  markSubscriptionDelivered,
  updateEventSubscription,
  updateEventSubscriptionProvisioning,
};
