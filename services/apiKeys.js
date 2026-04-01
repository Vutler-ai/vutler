'use strict';

const crypto = require('crypto');
const pool = require('../lib/vaultbrix');
const {
  assertColumnsExist,
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
const KEY_PREFIX = 'vutler_';
const REQUIRED_API_KEY_COLUMNS = [
  'workspace_id',
  'created_by_user_id',
  'name',
  'key_prefix',
  'key_hash',
  'created_at',
  'updated_at',
  'last_used_at',
  'revoked_at',
  'role',
];
let apiKeysTableEnsurePromise = null;

function generateApiKeySecret() {
  return `${KEY_PREFIX}${crypto.randomBytes(24).toString('hex')}`;
}

function hashApiKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function buildPrefix(secret) {
  return String(secret).slice(0, 14);
}

async function ensureApiKeysTable() {
  if (!apiKeysTableEnsurePromise) {
    apiKeysTableEnsurePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pool, SCHEMA, 'workspace_api_keys', {
          label: 'Workspace API keys table',
        });
        await assertColumnsExist(pool, SCHEMA, 'workspace_api_keys', REQUIRED_API_KEY_COLUMNS, {
          label: 'Workspace API keys table',
        });
        return;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          created_by_user_id UUID NULL,
          name TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          key_hash TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL DEFAULT 'developer',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ NULL,
          revoked_at TIMESTAMPTZ NULL
        )
      `);
      await pool.query(`ALTER TABLE ${SCHEMA}.workspace_api_keys ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'developer'`);
      await pool.query(`ALTER TABLE ${SCHEMA}.workspace_api_keys ADD COLUMN IF NOT EXISTS created_by_user_id UUID NULL`);
      await pool.query(`ALTER TABLE ${SCHEMA}.workspace_api_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
      await pool.query(`ALTER TABLE ${SCHEMA}.workspace_api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_workspace ON ${SCHEMA}.workspace_api_keys (workspace_id, created_at DESC)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_workspace_api_keys_active ON ${SCHEMA}.workspace_api_keys (workspace_id) WHERE revoked_at IS NULL`);
    })().catch((err) => {
      apiKeysTableEnsurePromise = null;
      throw err;
    });
  }

  return apiKeysTableEnsurePromise;
}

async function createApiKey({ workspaceId, userId, name }) {
  await ensureApiKeysTable();

  const secret = generateApiKeySecret();
  const keyHash = hashApiKey(secret);
  const keyPrefix = buildPrefix(secret);

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_api_keys (
      workspace_id,
      created_by_user_id,
      name,
      key_prefix,
      key_hash
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING id, workspace_id, created_by_user_id, name, key_prefix, created_at`,
    [workspaceId, userId || null, name || 'Nexus API key', keyPrefix, keyHash]
  );

  return {
    ...result.rows[0],
    secret,
  };
}

async function listApiKeys({ workspaceId }) {
  await ensureApiKeysTable();

  const result = await pool.query(
    `SELECT id, workspace_id, created_by_user_id, name, key_prefix, created_at, revoked_at, last_used_at
     FROM ${SCHEMA}.workspace_api_keys
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );

  return result.rows;
}

async function revokeApiKey({ workspaceId, id }) {
  await ensureApiKeysTable();

  const result = await pool.query(
    `UPDATE ${SCHEMA}.workspace_api_keys
     SET revoked_at = NOW(), updated_at = NOW()
     WHERE id::text = $1 AND workspace_id = $2 AND revoked_at IS NULL
     RETURNING id, revoked_at`,
    [id, workspaceId]
  );
  return result.rows[0] || null;
}

async function resolveApiKey(secret) {
  await ensureApiKeysTable();

  if (!secret || typeof secret !== 'string') return null;
  const keyHash = hashApiKey(secret);

  const result = await pool.query(
    `SELECT id, workspace_id, created_by_user_id, name, key_prefix
     FROM ${SCHEMA}.workspace_api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL
     LIMIT 1`,
    [keyHash]
  );

  const row = result.rows[0];
  if (!row) return null;

  await pool.query(
    `UPDATE ${SCHEMA}.workspace_api_keys
     SET last_used_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [row.id]
  );

  return row;
}

module.exports = {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  resolveApiKey,
  hashApiKey,
  ensureApiKeysTable,
};
