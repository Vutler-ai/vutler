/**
 * Settings API — Workspace settings, LLM providers, API keys
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

let pool;
try { pool = require('../lib/vaultbrix'); } catch(e) {
  try { pool = require('../lib/postgres').pool; } catch(e2) { console.error('[SETTINGS] No DB pool found'); }
}

const WS_ID = '00000000-0000-0000-0000-000000000001';
const SCHEMA = 'tenant_vutler';

async function ensureTables() {
  try {
    const check1 = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='workspace_settings'`
    );
    if (check1.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_settings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID DEFAULT '${WS_ID}',
          name TEXT DEFAULT 'My Workspace',
          description TEXT DEFAULT '',
          timezone TEXT DEFAULT 'Europe/Zurich',
          language TEXT DEFAULT 'fr',
          logo_url TEXT,
          default_provider TEXT DEFAULT '',
          llm_providers JSONB DEFAULT '{}',
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
    } else {
      // Migrate: add columns if missing
      pool.query(`ALTER TABLE ${SCHEMA}.workspace_settings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT ''`).catch(() => {});
      pool.query(`ALTER TABLE ${SCHEMA}.workspace_settings ADD COLUMN IF NOT EXISTS default_provider TEXT DEFAULT ''`).catch(() => {});
    }
    const check2 = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='tenant_vutler' AND table_name='workspace_api_keys'`
    );
    if (check2.rows.length === 0) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          workspace_id UUID DEFAULT '${WS_ID}',
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'developer',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_used_at TIMESTAMPTZ,
          revoked_at TIMESTAMPTZ
        )
      `);
    } else {
      // Migrate: add role and last_used_at if missing
      pool.query(`ALTER TABLE ${SCHEMA}.workspace_api_keys ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'developer'`).catch(() => {});
      pool.query(`ALTER TABLE ${SCHEMA}.workspace_api_keys ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`).catch(() => {});
    }
  } catch (err) {
    console.warn('[SETTINGS] ensureTables warning (tables may already exist):', err.message);
  }
}
ensureTables().catch(err => console.warn('[SETTINGS] ensureTables warning:', err.message));

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
    // Mask LLM keys
    const providers = row.llm_providers || {};
    const masked = {};
    for (const [k, v] of Object.entries(providers)) {
      masked[k] = { ...v, api_key: v.api_key ? maskKey(v.api_key) : '' };
    }
    // Return both flat fields (for backward compat) and workspace_* aliases
    // that the frontend WorkspaceTab reads via getStr()
    const settings = {
      workspace_id: row.workspace_id || wsId,
      // flat
      name: row.name || 'My Workspace',
      timezone: row.timezone || 'Europe/Zurich',
      language: row.language || 'fr',
      logo_url: row.logo_url || null,
      llm_providers: masked,
      updated_at: row.updated_at || null,
      // aliases expected by frontend
      workspace_name: row.name || 'My Workspace',
      workspace_description: row.description || '',
      default_provider: row.default_provider || '',
    };
    res.json({ success: true, settings });
  } catch (err) {
    console.error('[SETTINGS] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/settings
router.put('/', async (req, res) => {
  try {
    const wsId = req.workspaceId || WS_ID;
    // Support both flat { name, timezone } and nested { settings: { workspace_name: { value } } }
    const body = req.body || {};
    const s = body.settings || {};
    const extract = (key) => {
      const v = s[key];
      if (!v) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && 'value' in v) return v.value;
      return undefined;
    };
    const name = body.name || extract('workspace_name');
    const description = body.description || extract('workspace_description');
    const timezone = body.timezone || extract('timezone');
    const language = body.language || extract('language');
    const logo_url = body.logo_url || extract('logo_url');
    const default_provider = body.default_provider || extract('default_provider');
    await pool.query(
      `UPDATE ${SCHEMA}.workspace_settings
       SET name=COALESCE($1,name),
           description=COALESCE($2,description),
           timezone=COALESCE($3,timezone),
           language=COALESCE($4,language),
           logo_url=COALESCE($5,logo_url),
           default_provider=COALESCE($6,default_provider),
           updated_at=NOW()
       WHERE workspace_id=$7`,
      [name || null, description || null, timezone || null, language || null, logo_url || null, default_provider || null, wsId]
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
    // Try with last_used_at and role columns (may not exist on older schemas)
    let r;
    try {
      r = await pool.query(
        `SELECT id, name, key_prefix, role, created_at, last_used_at, revoked_at
         FROM ${SCHEMA}.workspace_api_keys
         WHERE workspace_id=$1
         ORDER BY created_at DESC`,
        [wsId]
      );
    } catch (_) {
      r = await pool.query(
        `SELECT id, name, key_prefix, created_at, revoked_at
         FROM ${SCHEMA}.workspace_api_keys
         WHERE workspace_id=$1
         ORDER BY created_at DESC`,
        [wsId]
      );
    }
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
    const { name, role } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const validRoles = ['admin', 'developer', 'viewer'];
    const keyRole = validRoles.includes(role) ? role : 'developer';
    const raw = 'vt_' + crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.substring(0, 14) + '...';
    // Try inserting with role column; fall back if column doesn't exist
    let insertedId;
    try {
      const ins = await pool.query(
        `INSERT INTO ${SCHEMA}.workspace_api_keys (workspace_id, name, key_hash, key_prefix, role)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [wsId, name, hash, prefix, keyRole]
      );
      insertedId = ins.rows[0]?.id;
    } catch (_) {
      const ins = await pool.query(
        `INSERT INTO ${SCHEMA}.workspace_api_keys (workspace_id, name, key_hash, key_prefix)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [wsId, name, hash, prefix]
      );
      insertedId = ins.rows[0]?.id;
    }
    res.json({
      success: true,
      key: { id: insertedId, name, key_prefix: prefix, role: keyRole },
      secret: raw,
      message: "Store this key now — it won't be shown again.",
    });
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
