'use strict';

const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');

let pool;
try {
  pool = require('../lib/vaultbrix');
} catch (_) {
  pool = null;
}

const SCHEMA = 'tenant_vutler';
const DEFAULT_NOTIFICATION_SETTINGS = {
  agent_error: true,
  deployment_offline: true,
  daily_digest: false,
  security_alert: true,
  sandbox_alert: true,
};

let ensureNotificationsTablePromise = null;

function normalizeNotificationSettings(value) {
  const input = (value && typeof value === 'object' && !Array.isArray(value))
    ? value
    : {};

  return {
    agent_error: input.agent_error !== undefined
      ? Boolean(input.agent_error)
      : DEFAULT_NOTIFICATION_SETTINGS.agent_error,
    deployment_offline: input.deployment_offline !== undefined
      ? Boolean(input.deployment_offline)
      : DEFAULT_NOTIFICATION_SETTINGS.deployment_offline,
    daily_digest: input.daily_digest !== undefined
      ? Boolean(input.daily_digest)
      : DEFAULT_NOTIFICATION_SETTINGS.daily_digest,
    security_alert: input.security_alert !== undefined
      ? Boolean(input.security_alert)
      : DEFAULT_NOTIFICATION_SETTINGS.security_alert,
    sandbox_alert: input.sandbox_alert !== undefined
      ? Boolean(input.sandbox_alert)
      : DEFAULT_NOTIFICATION_SETTINGS.sandbox_alert,
  };
}

async function ensureNotificationsTable(db = pool) {
  if (!db) return null;
  if (!ensureNotificationsTablePromise) {
    ensureNotificationsTablePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(db, SCHEMA, 'notifications', {
          label: 'Notifications table',
        });
        return;
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT,
          workspace_id TEXT,
          type TEXT NOT NULL DEFAULT 'info',
          title TEXT,
          message TEXT,
          read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          read_at TIMESTAMPTZ
        )
      `);
    })().catch((err) => {
      ensureNotificationsTablePromise = null;
      throw err;
    });
  }

  return ensureNotificationsTablePromise;
}

async function detectSettingsLayout(db = pool) {
  if (!db) return 'flat';
  try {
    const result = await db.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2`,
      [SCHEMA, 'workspace_settings']
    );
    const columns = result.rows.map((row) => row.column_name);
    if (columns.includes('key') && columns.includes('value')) return 'kv';
    if (columns.includes('name')) return 'flat';
    return 'kv';
  } catch (_) {
    return 'flat';
  }
}

async function ensureFlatNotificationColumns(db = pool) {
  if (!db) return;
  if (!runtimeSchemaMutationsAllowed()) {
    await assertColumnsExist(
      db,
      SCHEMA,
      'workspace_settings',
      ['notification_settings'],
      { label: 'Workspace settings notification columns' }
    );
    return;
  }

  await db.query(`
    ALTER TABLE ${SCHEMA}.workspace_settings
      ADD COLUMN IF NOT EXISTS notification_email TEXT,
      ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}'::jsonb
  `).catch(() => {});
}

async function readWorkspaceNotificationSettings(workspaceId, db = pool) {
  if (!db || !workspaceId) {
    return normalizeNotificationSettings();
  }

  const layout = await detectSettingsLayout(db);

  if (layout === 'kv') {
    const result = await db.query(
      `SELECT key, value
         FROM ${SCHEMA}.workspace_settings
        WHERE workspace_id = $1`,
      [workspaceId]
    );
    const row = result.rows.find((entry) => entry.key === 'notification_settings');
    return normalizeNotificationSettings(row?.value);
  }

  await ensureFlatNotificationColumns(db);
  const result = await db.query(
    `SELECT notification_settings
       FROM ${SCHEMA}.workspace_settings
      WHERE workspace_id = $1
      LIMIT 1`,
    [workspaceId]
  );
  return normalizeNotificationSettings(result.rows[0]?.notification_settings);
}

async function createWorkspaceNotification({
  workspaceId,
  userId = null,
  type = 'info',
  title,
  message = null,
  cooldownMinutes = 0,
} = {}, db = pool) {
  if (!db || !workspaceId || !title) return null;

  await ensureNotificationsTable(db);

  const normalizedMessage = typeof message === 'string' && message.trim()
    ? message.trim()
    : null;
  const normalizedTitle = String(title).trim();

  if (cooldownMinutes > 0) {
    const recent = await db.query(
      `SELECT id
         FROM ${SCHEMA}.notifications
        WHERE workspace_id = $1
          AND COALESCE(user_id, '') = COALESCE($2, '')
          AND type = $3
          AND title = $4
          AND COALESCE(message, '') = COALESCE($5, '')
          AND created_at >= NOW() - ($6::int * INTERVAL '1 minute')
        LIMIT 1`,
      [
        workspaceId,
        userId,
        type,
        normalizedTitle,
        normalizedMessage,
        Math.max(1, Math.round(cooldownMinutes)),
      ]
    );

    if (recent.rows[0]) return null;
  }

  const result = await db.query(
    `INSERT INTO ${SCHEMA}.notifications (user_id, workspace_id, type, title, message)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, workspaceId, type, normalizedTitle, normalizedMessage]
  );

  return result.rows[0] || null;
}

module.exports = {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
  readWorkspaceNotificationSettings,
  createWorkspaceNotification,
  __private: {
    detectSettingsLayout,
    ensureFlatNotificationColumns,
    ensureNotificationsTable,
  },
};
