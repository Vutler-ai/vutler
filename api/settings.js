/**
 * Settings API — Workspace settings, LLM providers, API keys
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

let pool;
try { pool = require('../lib/vaultbrix'); } catch(e) {
  try { pool = require('../pg-updated'); } catch(e2) { console.error('[SETTINGS] No DB pool found'); }
}

const WS_ID = '00000000-0000-0000-0000-000000000001';
const SCHEMA = 'tenant_vutler';

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID DEFAULT '${WS_ID}',
      name TEXT DEFAULT 'My Workspace',
      timezone TEXT DEFAULT 'Europe/Zurich',
      language TEXT DEFAULT 'fr',
      logo_url TEXT,
      llm_providers JSONB DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id UUID DEFAULT '${WS_ID}',
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )
  `);
}
ensureTables().catch(err => console.error('[SETTINGS] ensureTables error:', err.message));

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.substring(0, 6) + '••••••••' + key.substring(key.length - 4);
}

// GET /api/v1/settings
router.get('/', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    let r = await pool.query(`SELECT * FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 LIMIT 1`, [wsId]);
    if (r.rows.length === 0) {
      try {
        await pool.query(`INSERT INTO ${SCHEMA}.workspace_settings (workspace_id) VALUES ($1)`, [wsId]);
      } catch (e) {
        if ((e.message || '').includes('column "key"')) {
          await pool.query(`INSERT INTO ${SCHEMA}.workspace_settings (workspace_id, key, value) VALUES ($1, 'default', '{}'::jsonb)`, [wsId]);
        } else {
          throw e;
        }
      }
      r = await pool.query(`SELECT * FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 LIMIT 1`, [wsId]);
    }
    const row = r.rows[0] || {};
    const s = {
      workspace_id: row.workspace_id || wsId,
      name: row.name || 'My Workspace',
      timezone: row.timezone || 'Europe/Zurich',
      language: row.language || 'fr',
      logo_url: row.logo_url || null,
      llm_providers: row.llm_providers || {},
      updated_at: row.updated_at || null,
    };
    // Mask LLM keys
    const providers = s.llm_providers || {};
    const masked = {};
    for (const [k, v] of Object.entries(providers)) {
      masked[k] = { ...v, api_key: v.api_key ? maskKey(v.api_key) : '' };
    }
    res.json({ success: true, settings: { ...s, llm_providers: masked } });
  } catch (err) {
    console.error('[SETTINGS] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/settings
router.put('/', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    const { name, timezone, language, logo_url } = req.body;
    await pool.query(
      `UPDATE ${SCHEMA}.workspace_settings SET name=COALESCE($1,name), timezone=COALESCE($2,timezone), language=COALESCE($3,language), logo_url=COALESCE($4,logo_url), updated_at=NOW() WHERE workspace_id=$5`,
      [name, timezone, language, logo_url, wsId]
    );
    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    console.error('[SETTINGS] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/settings/llm-providers
router.get('/llm-providers', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    const r = await pool.query(`SELECT llm_providers FROM ${SCHEMA}.workspace_settings WHERE workspace_id=$1 LIMIT 1`, [wsId]);
    const providers = r.rows[0]?.llm_providers || {};
    const masked = {};
    for (const [k, v] of Object.entries(providers)) {
      masked[k] = { ...v, api_key: v.api_key ? maskKey(v.api_key) : '' };
    }
    res.json({ success: true, providers: masked });
  } catch (err) {
    console.error('[SETTINGS] GET llm-providers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/settings/llm-providers
router.put('/llm-providers', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    const { providers } = req.body; // { openai: { api_key: '...', enabled: true }, anthropic: { ... } }
    // Merge: if a key looks masked, keep existing
    const r = await pool.query(`SELECT llm_providers FROM ${SCHEMA}.workspace_settings WHERE workspace_id=$1 LIMIT 1`, [wsId]);
    const existing = r.rows[0]?.llm_providers || {};
    const merged = { ...existing };
    for (const [k, v] of Object.entries(providers || {})) {
      if (v.api_key && v.api_key.includes('••')) {
        merged[k] = { ...merged[k], ...v, api_key: existing[k]?.api_key || '' };
      } else {
        merged[k] = { ...merged[k], ...v };
      }
    }
    await pool.query(`UPDATE ${SCHEMA}.workspace_settings SET llm_providers=$1, updated_at=NOW() WHERE workspace_id=$2`, [JSON.stringify(merged), wsId]);
    res.json({ success: true, message: 'LLM providers saved' });
  } catch (err) {
    console.error('[SETTINGS] PUT llm-providers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/settings/api-keys
router.get('/api-keys', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    const r = await pool.query(`SELECT id, name, key_prefix, created_at, revoked_at FROM ${SCHEMA}.workspace_api_keys WHERE workspace_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC`, [wsId]);
    res.json({ success: true, keys: r.rows });
  } catch (err) {
    console.error('[SETTINGS] GET api-keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/settings/api-keys
router.post('/api-keys', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const raw = 'vt_' + crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.substring(0, 6) + '••••' + raw.substring(raw.length - 4);
    await pool.query(`INSERT INTO ${SCHEMA}.workspace_api_keys (workspace_id, name, key_hash, key_prefix) VALUES ($1,$2,$3,$4)`, [wsId, name, hash, prefix]);
    res.json({ success: true, key: raw, message: 'Copy this key now — it won\'t be shown again.' });
  } catch (err) {
    console.error('[SETTINGS] POST api-keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/settings/api-keys/:id
router.delete('/api-keys/:id', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    await pool.query(`UPDATE ${SCHEMA}.workspace_api_keys SET revoked_at=NOW() WHERE id=$1 AND workspace_id=$2`, [req.params.id, wsId]);
    res.json({ success: true, message: 'Key revoked' });
  } catch (err) {
    console.error('[SETTINGS] DELETE api-keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
