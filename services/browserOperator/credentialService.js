'use strict';

const pool = require('../../lib/vaultbrix');
const {
  assertTableExists,
  runtimeSchemaMutationsAllowed,
} = require('../../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';

let ensurePromise = null;

function mapCredential(row) {
  if (!row) return null;
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    app_key: row.app_key,
    credential_key: row.credential_key,
    credential_type: row.credential_type,
    status: row.status,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_tested_at: row.last_tested_at,
  };
}

async function ensureCredentialTable() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      if (!runtimeSchemaMutationsAllowed()) {
        await assertTableExists(pool, SCHEMA, 'browser_operator_credentials', {
          label: 'Browser operator credentials table',
        });
        return;
      }

      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.browser_operator_credentials (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID NOT NULL,
          app_key TEXT NOT NULL,
          credential_key TEXT NOT NULL,
          credential_type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_tested_at TIMESTAMPTZ NULL
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_browser_operator_credentials_workspace_key
          ON ${SCHEMA}.browser_operator_credentials (workspace_id, credential_key);

        CREATE INDEX IF NOT EXISTS idx_browser_operator_credentials_workspace
          ON ${SCHEMA}.browser_operator_credentials (workspace_id, created_at DESC);
      `);
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

async function listCredentials(workspaceId) {
  await ensureCredentialTable();
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.browser_operator_credentials
      WHERE workspace_id = $1
      ORDER BY created_at DESC`,
    [workspaceId]
  );
  return result.rows.map(mapCredential);
}

async function getCredentialByKeyOrId(workspaceId, keyOrId) {
  await ensureCredentialTable();
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.browser_operator_credentials
      WHERE workspace_id = $1
        AND (id = $2 OR credential_key = $2)
      ORDER BY created_at DESC
      LIMIT 1`,
    [workspaceId, keyOrId]
  );
  return mapCredential(result.rows[0]);
}

async function createCredential(workspaceId, payload = {}, userId = null) {
  await ensureCredentialTable();

  const appKey = String(payload.appKey || '').trim();
  const credentialKey = String(payload.credentialKey || '').trim();
  const credentialType = String(payload.credentialType || '').trim() || 'vault_ref';

  if (!appKey) throw new Error('appKey is required');
  if (!credentialKey) throw new Error('credentialKey is required');

  const metadata = {
    username: payload.username || null,
    login_hint: payload.loginHint || null,
    vault_secret_id: payload.vaultSecretId || null,
    credential_ref: payload.credentialRef || null,
    allowed_domains: Array.isArray(payload.allowedDomains) ? payload.allowedDomains : [],
    created_by_user_id: userId || null,
  };

  const result = await pool.query(
    `INSERT INTO ${SCHEMA}.browser_operator_credentials
       (workspace_id, app_key, credential_key, credential_type, status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (workspace_id, credential_key)
     DO UPDATE SET
       app_key = EXCLUDED.app_key,
       credential_type = EXCLUDED.credential_type,
       status = EXCLUDED.status,
       metadata = EXCLUDED.metadata,
       updated_at = NOW()
     RETURNING *`,
    [workspaceId, appKey, credentialKey, credentialType, payload.status || 'active', JSON.stringify(metadata)]
  );

  return mapCredential(result.rows[0]);
}

async function rotateCredential(workspaceId, credentialId, payload = {}, userId = null) {
  await ensureCredentialTable();

  const existing = await pool.query(
    `SELECT * FROM ${SCHEMA}.browser_operator_credentials WHERE id = $1 AND workspace_id = $2`,
    [credentialId, workspaceId]
  );
  if (!existing.rows.length) {
    const error = new Error('Credential not found');
    error.statusCode = 404;
    throw error;
  }

  const current = existing.rows[0];
  const metadata = {
    ...(current.metadata || {}),
    rotation_note: payload.rotationNote || null,
    rotated_at: new Date().toISOString(),
    rotated_by_user_id: userId || null,
    vault_secret_id: payload.vaultSecretId || current.metadata?.vault_secret_id || null,
    credential_ref: payload.credentialRef || current.metadata?.credential_ref || null,
  };

  const result = await pool.query(
    `UPDATE ${SCHEMA}.browser_operator_credentials
        SET status = $3,
            metadata = $4::jsonb,
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING *`,
    [credentialId, workspaceId, payload.status || current.status || 'active', JSON.stringify(metadata)]
  );

  return mapCredential(result.rows[0]);
}

async function testCredential(workspaceId, credentialId, payload = {}) {
  await ensureCredentialTable();

  const result = await pool.query(
    `UPDATE ${SCHEMA}.browser_operator_credentials
        SET last_tested_at = NOW(),
            updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING *`,
    [credentialId, workspaceId]
  );

  if (!result.rows.length) {
    const error = new Error('Credential not found');
    error.statusCode = 404;
    throw error;
  }

  const credential = result.rows[0];
  const allowedDomains = Array.isArray(credential.metadata?.allowed_domains)
    ? credential.metadata.allowed_domains.filter(Boolean)
    : [];
  let domainAllowed = true;

  if (payload.baseUrl && allowedDomains.length) {
    try {
      const hostname = new URL(payload.baseUrl).hostname;
      domainAllowed = allowedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch (_) {
      domainAllowed = false;
    }
  }

  return {
    credential: mapCredential(credential),
    result: {
      success: credential.status === 'active' && domainAllowed,
      mode: 'metadata_validation',
      checks: {
        active: credential.status === 'active',
        domainAllowed,
      },
    },
  };
}

module.exports = {
  ensureCredentialTable,
  getCredentialByKeyOrId,
  listCredentials,
  createCredential,
  rotateCredential,
  testCredential,
};
