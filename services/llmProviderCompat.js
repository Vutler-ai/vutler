'use strict';

const { CryptoService } = require('./crypto');

const SCHEMA = 'tenant_vutler';
const cryptoSvc = new CryptoService();
const syncPromises = new Map();
let schemaColumnStatePromise = null;

function prettifyProvider(provider) {
  return String(provider || 'Provider')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeLegacyBaseUrl(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) return normalized;
  return `https://${normalized}`;
}

async function getLlmProviderColumnState(db) {
  if (!schemaColumnStatePromise) {
    schemaColumnStatePromise = db.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'llm_providers'`,
      [SCHEMA]
    ).then((result) => {
      const columns = new Set(result.rows.map((row) => row.column_name));
      return {
        hasApiKey: columns.has('api_key'),
        hasBaseUrl: columns.has('base_url'),
        hasIsEnabled: columns.has('is_enabled'),
        hasIsDefault: columns.has('is_default'),
        hasConfig: columns.has('config'),
      };
    }).catch((error) => {
      schemaColumnStatePromise = null;
      throw error;
    });
  }

  return schemaColumnStatePromise;
}

function mapLegacyProviderRow(row) {
  if (!row) return null;

  let apiKey = null;
  try {
    apiKey = row.api_key_encrypted ? cryptoSvc.decrypt(row.api_key_encrypted) : null;
  } catch (_) {
    apiKey = null;
  }

  if (!apiKey && row.provider === 'codex') apiKey = 'oauth:chatgpt';
  if (!apiKey && row.provider === 'vutler-trial') apiKey = process.env.VUTLER_TRIAL_OPENAI_KEY || null;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    provider: row.provider,
    api_key: apiKey,
    base_url: normalizeLegacyBaseUrl(row.base_url),
    is_enabled: row.is_active !== false,
    is_default: false,
    config: {
      display_name: row.name || prettifyProvider(row.provider),
      source: 'workspace_llm_providers_legacy',
    },
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

async function loadLegacyWorkspaceProviders(db, workspaceId) {
  const result = await db.query(
    `SELECT id, workspace_id, name, provider, api_key_encrypted, base_url, is_active, created_at, updated_at
       FROM ${SCHEMA}.workspace_llm_providers
      WHERE workspace_id = $1
      ORDER BY created_at ASC`,
    [workspaceId]
  );

  return result.rows
    .map(mapLegacyProviderRow)
    .filter(Boolean);
}

async function upsertModernProviderFromLegacy(db, workspaceId, providerRow) {
  const existing = await db.query(
    `SELECT id, api_key, base_url, config
       FROM ${SCHEMA}.llm_providers
      WHERE id = $1
         OR (workspace_id = $2 AND provider = $3 AND COALESCE(base_url, '') = COALESCE($4, ''))
      ORDER BY created_at DESC
      LIMIT 1`,
    [providerRow.id, workspaceId, providerRow.provider, providerRow.base_url]
  );

  if (!existing.rows.length) {
    await db.query(
      `INSERT INTO ${SCHEMA}.llm_providers
        (id, workspace_id, provider, api_key, base_url, is_enabled, is_default, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, COALESCE($9, NOW()), COALESCE($10, NOW()))
       ON CONFLICT (id) DO NOTHING`,
      [
        providerRow.id,
        workspaceId,
        providerRow.provider,
        providerRow.api_key || '',
        providerRow.base_url,
        providerRow.is_enabled,
        providerRow.is_default,
        JSON.stringify(providerRow.config || {}),
        providerRow.created_at,
        providerRow.updated_at,
      ]
    );
    return;
  }

  const current = existing.rows[0];
  const currentConfig = current.config && typeof current.config === 'object' ? current.config : {};
  const nextConfig = {
    ...providerRow.config,
    ...currentConfig,
  };

  await db.query(
    `UPDATE ${SCHEMA}.llm_providers
        SET api_key = COALESCE(NULLIF(api_key, ''), $1),
            base_url = COALESCE(base_url, $2),
            is_enabled = COALESCE(is_enabled, $3),
            config = COALESCE(config, '{}'::jsonb) || $4::jsonb,
            updated_at = NOW()
      WHERE id = $5`,
    [
      providerRow.api_key || '',
      providerRow.base_url,
      providerRow.is_enabled,
      JSON.stringify(nextConfig),
      current.id,
    ]
  );
}

async function syncLegacyWorkspaceProviders(db, workspaceId) {
  const cacheKey = `${workspaceId}`;
  if (!syncPromises.has(cacheKey)) {
    syncPromises.set(cacheKey, (async () => {
      const columnState = await getLlmProviderColumnState(db);
      if (!columnState.hasApiKey || !columnState.hasBaseUrl || !columnState.hasIsEnabled || !columnState.hasIsDefault) {
        return false;
      }

      let legacyProviders = [];
      try {
        legacyProviders = await loadLegacyWorkspaceProviders(db, workspaceId);
      } catch (_) {
        return false;
      }

      for (const providerRow of legacyProviders) {
        await upsertModernProviderFromLegacy(db, workspaceId, providerRow);
      }

      return true;
    })().finally(() => {
      syncPromises.delete(cacheKey);
    }));
  }

  return syncPromises.get(cacheKey);
}

async function resolveLegacyWorkspaceProvider(db, workspaceId, providerName, options = {}) {
  let result;
  if (options.id) {
    result = await db.query(
      `SELECT id, workspace_id, name, provider, api_key_encrypted, base_url, is_active, created_at, updated_at
         FROM ${SCHEMA}.workspace_llm_providers
        WHERE workspace_id = $1
          AND id = $2
        LIMIT 1`,
      [workspaceId, options.id]
    );
    if (result.rows[0]) return mapLegacyProviderRow(result.rows[0]);
  }

  if (!providerName) return null;

  result = await db.query(
    `SELECT id, workspace_id, name, provider, api_key_encrypted, base_url, is_active, created_at, updated_at
       FROM ${SCHEMA}.workspace_llm_providers
      WHERE workspace_id = $1
        AND provider = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [workspaceId, providerName]
  );
  return result.rows[0] ? mapLegacyProviderRow(result.rows[0]) : null;
}

module.exports = {
  getLlmProviderColumnState,
  normalizeLegacyBaseUrl,
  prettifyProvider,
  resolveLegacyWorkspaceProvider,
  syncLegacyWorkspaceProviders,
};
