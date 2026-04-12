'use strict';

const pool = require('../lib/vaultbrix');
const { assertTableExists, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';

let ensureTablePromise = null;

function ensureTable(db = pool) {
  if (!db) return null;
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(db, SCHEMA, 'snipara_sync_status', {
          label: 'Snipara sync status table',
        });
        return;
      }

      await db.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.snipara_sync_status (
          workspace_id TEXT PRIMARY KEY,
          last_task_sync_at TIMESTAMPTZ,
          last_task_success_at TIMESTAMPTZ,
          last_task_failure_at TIMESTAMPTZ,
          last_task_result TEXT,
          last_task_synced INTEGER NOT NULL DEFAULT 0,
          last_task_errors INTEGER NOT NULL DEFAULT 0,
          last_task_error TEXT,
          task_consecutive_failures INTEGER NOT NULL DEFAULT 0,
          last_event_sync_at TIMESTAMPTZ,
          last_event_success_at TIMESTAMPTZ,
          last_event_failure_at TIMESTAMPTZ,
          last_event_result TEXT,
          last_event_count INTEGER NOT NULL DEFAULT 0,
          last_event_error TEXT,
          event_consecutive_failures INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((err) => {
      ensureTablePromise = null;
      throw err;
    });
  }

  return ensureTablePromise;
}

function normalizeErrorMessage(error) {
  if (!error) return null;
  if (typeof error === 'string' && error.trim()) return error.trim().slice(0, 500);
  if (typeof error.message === 'string' && error.message.trim()) return error.message.trim().slice(0, 500);
  return 'Unknown sync failure';
}

async function recordTaskSyncSuccess({ workspaceId, synced = 0, errors = 0, db = pool } = {}) {
  if (!workspaceId || !db) return;
  await ensureTable(db);
  const result = Number(errors) > 0 ? 'partial' : 'ok';
  await db.query(
    `INSERT INTO ${SCHEMA}.snipara_sync_status (
       workspace_id,
       last_task_sync_at,
       last_task_success_at,
       last_task_result,
       last_task_synced,
       last_task_errors,
       last_task_error,
       task_consecutive_failures,
       updated_at
     )
     VALUES ($1, NOW(), NOW(), $2, $3, $4, NULL, 0, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       last_task_sync_at = NOW(),
       last_task_success_at = NOW(),
       last_task_result = EXCLUDED.last_task_result,
       last_task_synced = EXCLUDED.last_task_synced,
       last_task_errors = EXCLUDED.last_task_errors,
       last_task_error = NULL,
       task_consecutive_failures = 0,
       updated_at = NOW()`,
    [workspaceId, result, Math.max(0, Number(synced) || 0), Math.max(0, Number(errors) || 0)]
  );
}

async function recordTaskSyncFailure({ workspaceId, error, db = pool } = {}) {
  if (!workspaceId || !db) return;
  await ensureTable(db);
  await db.query(
    `INSERT INTO ${SCHEMA}.snipara_sync_status (
       workspace_id,
       last_task_sync_at,
       last_task_failure_at,
       last_task_result,
       last_task_error,
       task_consecutive_failures,
       updated_at
     )
     VALUES ($1, NOW(), NOW(), 'failed', $2, 1, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       last_task_sync_at = NOW(),
       last_task_failure_at = NOW(),
       last_task_result = 'failed',
       last_task_error = EXCLUDED.last_task_error,
       task_consecutive_failures = COALESCE(${SCHEMA}.snipara_sync_status.task_consecutive_failures, 0) + 1,
       updated_at = NOW()`,
    [workspaceId, normalizeErrorMessage(error)]
  );
}

async function recordEventSyncSuccess({ workspaceId, eventCount = 0, db = pool } = {}) {
  if (!workspaceId || !db) return;
  await ensureTable(db);
  await db.query(
    `INSERT INTO ${SCHEMA}.snipara_sync_status (
       workspace_id,
       last_event_sync_at,
       last_event_success_at,
       last_event_result,
       last_event_count,
       last_event_error,
       event_consecutive_failures,
       updated_at
     )
     VALUES ($1, NOW(), NOW(), 'ok', $2, NULL, 0, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       last_event_sync_at = NOW(),
       last_event_success_at = NOW(),
       last_event_result = 'ok',
       last_event_count = EXCLUDED.last_event_count,
       last_event_error = NULL,
       event_consecutive_failures = 0,
       updated_at = NOW()`,
    [workspaceId, Math.max(0, Number(eventCount) || 0)]
  );
}

async function recordEventSyncFailure({ workspaceId, error, db = pool } = {}) {
  if (!workspaceId || !db) return;
  await ensureTable(db);
  await db.query(
    `INSERT INTO ${SCHEMA}.snipara_sync_status (
       workspace_id,
       last_event_sync_at,
       last_event_failure_at,
       last_event_result,
       last_event_error,
       event_consecutive_failures,
       updated_at
     )
     VALUES ($1, NOW(), NOW(), 'failed', $2, 1, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET
       last_event_sync_at = NOW(),
       last_event_failure_at = NOW(),
       last_event_result = 'failed',
       last_event_error = EXCLUDED.last_event_error,
       event_consecutive_failures = COALESCE(${SCHEMA}.snipara_sync_status.event_consecutive_failures, 0) + 1,
       updated_at = NOW()`,
    [workspaceId, normalizeErrorMessage(error)]
  );
}

async function getWorkspaceSyncStatus(workspaceId, db = pool) {
  if (!workspaceId || !db) return null;

  try {
    await ensureTable(db);
    const result = await db.query(
      `SELECT *
         FROM ${SCHEMA}.snipara_sync_status
        WHERE workspace_id = $1
        LIMIT 1`,
      [workspaceId]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

module.exports = {
  ensureTable,
  getWorkspaceSyncStatus,
  recordTaskSyncSuccess,
  recordTaskSyncFailure,
  recordEventSyncSuccess,
  recordEventSyncFailure,
};
