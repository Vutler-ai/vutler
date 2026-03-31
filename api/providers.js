const express = require('express');
const pool = require('../lib/vaultbrix');
const { CryptoService } = require('../services/crypto');

const router = express.Router();
const cryptoSvc = new CryptoService();
const SCHEMA = 'tenant_vutler';

function getDb(req) {
  return req.app.locals.pg || pool;
}

function prettifyProvider(provider) {
  return String(provider || 'Provider')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function normalizeProviderResponse(row) {
  return {
    id: row.id,
    name: row.config?.display_name || prettifyProvider(row.provider),
    provider: row.provider,
    api_key_encrypted: row.api_key ? '********' : null,
    base_url: row.base_url || null,
    is_active: row.is_enabled !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function resolveProviderSecret(provider, apiKey) {
  if (apiKey !== undefined) return apiKey;
  if (provider === 'codex') return 'oauth:chatgpt';
  return undefined;
}

async function syncLegacyProviders(db, workspaceId) {
  try {
    const legacyRows = await db.query(
      `SELECT id, name, provider, api_key_encrypted, base_url, is_active, created_at, updated_at
         FROM ${SCHEMA}.workspace_llm_providers
        WHERE workspace_id = $1
        ORDER BY created_at ASC`,
      [workspaceId]
    );

    for (const row of legacyRows.rows) {
      const existing = await db.query(
        `SELECT 1
           FROM ${SCHEMA}.llm_providers
          WHERE id = $1 OR (workspace_id = $2 AND provider = $3 AND COALESCE(base_url, '') = COALESCE($4, ''))
          LIMIT 1`,
        [row.id, workspaceId, row.provider, row.base_url || null]
      );
      if (existing.rows.length > 0) continue;

      let apiKey = null;
      try {
        apiKey = row.api_key_encrypted ? cryptoSvc.decrypt(row.api_key_encrypted) : null;
      } catch (_) {
        apiKey = null;
      }

      if (!apiKey && row.provider === 'codex') apiKey = 'oauth:chatgpt';
      if (!apiKey && row.provider === 'vutler-trial') apiKey = process.env.VUTLER_TRIAL_OPENAI_KEY || null;
      if (!apiKey && row.provider !== 'ollama') continue;

      await db.query(
        `INSERT INTO ${SCHEMA}.llm_providers
          (id, workspace_id, provider, api_key, base_url, is_enabled, is_default, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7::jsonb, COALESCE($8, NOW()), COALESCE($9, NOW()))
         ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          workspaceId,
          row.provider,
          apiKey || '',
          row.base_url || null,
          row.is_active !== false,
          JSON.stringify({ display_name: row.name || prettifyProvider(row.provider), source: 'workspace_llm_providers_legacy' }),
          row.created_at || null,
          row.updated_at || null,
        ]
      );
    }
  } catch (_) {
    // Legacy table may not exist on all environments.
  }
}

router.get('/', async (req, res) => {
  try {
    const db = getDb(req);
    await syncLegacyProviders(db, req.workspaceId);
    const result = await db.query(
      `SELECT id, provider, api_key, base_url, is_enabled, config, created_at, updated_at
         FROM ${SCHEMA}.llm_providers
        WHERE workspace_id = $1
        ORDER BY created_at DESC`,
      [req.workspaceId]
    );
    const providers = result.rows.map(normalizeProviderResponse);
    res.json({ success: true, providers, count: providers.length });
  } catch (error) {
    console.error('[PROVIDERS] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch providers', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const db = getDb(req);
    await syncLegacyProviders(db, req.workspaceId);
    const result = await db.query(
      `SELECT id, provider, api_key, base_url, is_enabled, config, created_at, updated_at
         FROM ${SCHEMA}.llm_providers
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1`,
      [req.params.id, req.workspaceId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Provider not found' });
    }
    res.json({ success: true, provider: normalizeProviderResponse(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const db = getDb(req);
    const { name, provider, provider_type, type, api_key, base_url, api_url, is_active = true } = req.body || {};
    const providerVal = provider || provider_type || type || 'openai';
    const secret = resolveProviderSecret(providerVal, api_key);

    if (!name) return res.status(400).json({ success: false, message: 'Name is required' });
    if ((providerVal !== 'ollama' && providerVal !== 'codex') && !secret) {
      return res.status(400).json({ success: false, message: 'API key is required' });
    }

    const result = await db.query(
      `INSERT INTO ${SCHEMA}.llm_providers
        (workspace_id, provider, api_key, base_url, is_enabled, is_default, config, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, $6::jsonb, NOW(), NOW())
       RETURNING id, provider, api_key, base_url, is_enabled, config, created_at, updated_at`,
      [
        req.workspaceId,
        providerVal,
        secret || '',
        base_url || api_url || null,
        is_active,
        JSON.stringify({ display_name: name }),
      ]
    );
    res.status(201).json({ success: true, message: 'Provider created', provider: normalizeProviderResponse(result.rows[0]) });
  } catch (error) {
    console.error('[PROVIDERS] Error creating:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const current = await db.query(
      `SELECT id, provider, api_key, base_url, is_enabled, is_default, config, created_at, updated_at
         FROM ${SCHEMA}.llm_providers
        WHERE id = $1 AND workspace_id = $2
        LIMIT 1`,
      [req.params.id, req.workspaceId]
    );

    if (!current.rows.length) return res.status(404).json({ success: false, message: 'Not found' });

    const row = current.rows[0];
    const nextProvider = req.body.provider !== undefined ? req.body.provider : row.provider;
    const secret = resolveProviderSecret(nextProvider, req.body.api_key);
    const nextConfig = {
      ...(row.config || {}),
      ...(req.body.name !== undefined ? { display_name: req.body.name } : {}),
    };

    const result = await db.query(
      `UPDATE ${SCHEMA}.llm_providers
          SET provider = $1,
              api_key = COALESCE($2, api_key),
              base_url = $3,
              is_enabled = $4,
              config = $5::jsonb,
              updated_at = NOW()
        WHERE id = $6 AND workspace_id = $7
        RETURNING id, provider, api_key, base_url, is_enabled, config, created_at, updated_at`,
      [
        nextProvider,
        secret,
        req.body.base_url !== undefined ? req.body.base_url : row.base_url,
        req.body.is_active !== undefined ? req.body.is_active : row.is_enabled,
        JSON.stringify(nextConfig),
        req.params.id,
        req.workspaceId,
      ]
    );

    res.json({ success: true, provider: normalizeProviderResponse(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const result = await db.query(
      `DELETE FROM ${SCHEMA}.llm_providers
        WHERE id = $1 AND workspace_id = $2
        RETURNING id`,
      [req.params.id, req.workspaceId]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
