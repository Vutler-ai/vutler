'use strict';

const pool = require('../../lib/vaultbrix');
const {
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';

let ensurePromise = null;

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    app_key: row.app_key,
    session_key: row.session_key,
    runtime_mode: row.runtime_mode,
    status: row.status,
    storage_state: row.storage_state || null,
    metadata: row.metadata || {},
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensureSessionTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pool, SCHEMA, 'browser_operator_sessions', {
          label: 'Browser operator sessions table',
        });
        return;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.browser_operator_sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          app_key TEXT NOT NULL,
          session_key TEXT NOT NULL,
          runtime_mode TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          storage_state JSONB NULL,
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          last_used_at TIMESTAMPTZ NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_sessions_workspace_key
          ON ${SCHEMA}.browser_operator_sessions (workspace_id, app_key, session_key);
      `);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

async function getSession(workspaceId, appKey, sessionKey) {
  await ensureSessionTable();
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.browser_operator_sessions
      WHERE workspace_id = $1 AND app_key = $2 AND session_key = $3
      LIMIT 1`,
    [workspaceId, appKey, sessionKey]
  );
  return mapSession(result.rows[0]);
}

async function saveSessionState(workspaceId, appKey, sessionKey, runtimeMode, storageState, metadata = {}) {
  await ensureSessionTable();
  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.browser_operator_sessions
       (workspace_id, app_key, session_key, runtime_mode, status, storage_state, metadata, last_used_at)
     VALUES ($1, $2, $3, $4, 'active', $5::jsonb, $6::jsonb, NOW())
     ON CONFLICT (workspace_id, app_key, session_key)
     DO UPDATE SET
       runtime_mode = EXCLUDED.runtime_mode,
       storage_state = EXCLUDED.storage_state,
       metadata = EXCLUDED.metadata,
       status = 'active',
       last_used_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [workspaceId, appKey, sessionKey, runtimeMode, JSON.stringify(storageState || null), JSON.stringify(metadata || {})]
  );
  return mapSession(result.rows[0]);
}

async function touchSession(workspaceId, appKey, sessionKey) {
  await ensureSessionTable();
  await pool.query(
    `UPDATE ${SCHEMA}.browser_operator_sessions
        SET last_used_at = NOW(),
            updated_at = NOW()
      WHERE workspace_id = $1 AND app_key = $2 AND session_key = $3`,
    [workspaceId, appKey, sessionKey]
  );
}

module.exports = {
  ensureSessionTable,
  getSession,
  saveSessionState,
  touchSession,
};
