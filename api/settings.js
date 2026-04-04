/**
 * Settings API — Workspace settings, LLM providers, API keys
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { decryptProviderSecret, encryptProviderSecret } = require('../services/providerSecrets');
const { clearSniparaConfigCache } = require('../services/sniparaResolver');
const {
  assertColumnsExist,
  runtimeSchemaMutationsAllowed,
} = require('../lib/schemaReadiness');
const { ensureApiKeysTable } = require('../services/apiKeys');

let pool;
try { pool = require('../lib/vaultbrix'); } catch(e) {
  try { pool = require('../lib/postgres').pool; } catch(e2) { console.error('[SETTINGS] No DB pool found'); }
}

const SCHEMA = 'tenant_vutler';
const DEFAULT_NOTIFICATION_SETTINGS = {
  agent_error: true,
  deployment_offline: true,
  daily_digest: false,
  security_alert: true,
};

async function ensureTables() {
  try {
    await ensureApiKeysTable();
  } catch (err) {
    console.warn('[SETTINGS] ensureTables warning (tables may already exist):', err.message);
  }
}
ensureTables().catch(err => console.warn('[SETTINGS] ensureTables warning:', err.message));

/**
 * Detect the workspace_settings table layout.
 * Returns 'kv' if columns are (key, value), 'flat' if columns are (name, timezone, ...).
 */
async function detectSettingsLayout() {
  try {
    const r = await pool.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema='tenant_vutler' AND table_name='workspace_settings'`
    );
    const cols = r.rows.map(x => x.column_name);
    if (cols.includes('key') && cols.includes('value')) return 'kv';
    if (cols.includes('name')) return 'flat';
    return 'kv'; // default assumption
  } catch (_) {
    return 'flat';
  }
}

/**
 * Read settings from key/value layout.
 * Rows: { key: 'name', value: {...} }
 */
async function readSettingsKV(wsId) {
  const r = await pool.query(
    `SELECT key, value FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1`, [wsId]
  );
  const map = {};
  for (const row of r.rows) {
    map[row.key] = row.value;
  }
  // Support both JSON values and plain string values
  const get = (k, def = '') => {
    const v = map[k];
    if (v === undefined || v === null) return def;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return v;
  };
  return {
    name: get('name', get('workspace_name', 'My Workspace')),
    description: get('description', get('workspace_description', '')),
    timezone: get('timezone', 'Europe/Zurich'),
    language: get('language', 'fr'),
    logo_url: get('logo_url', null) || null,
    default_provider: get('default_provider', ''),
    drive_root: get('drive_root', '/projects/Vutler'),
    llm_providers: (typeof map['llm_providers'] === 'object' && map['llm_providers'] !== null && !('value' in map['llm_providers'])) ? map['llm_providers'] : {},
    snipara_api_key: get('snipara_api_key', null) || null,
    snipara_api_url: get('snipara_api_url', null) || null,
    snipara_project_id: get('snipara_project_id', null) || null,
    snipara_project_slug: get('snipara_project_slug', null) || null,
    snipara_client_id: get('snipara_client_id', null) || null,
    snipara_swarm_id: get('snipara_swarm_id', null) || null,
    notification_email: get('notification_email', null) || null,
    notification_settings: normalizeNotificationSettings(map['notification_settings']),
    updated_at: get('updated_at', null) || null,
  };
}

async function writeSettingKV(wsId, key, value) {
  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (workspace_id, key, value)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (workspace_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [wsId, key, JSON.stringify(value)]
  ).catch(async () => {
    // If no unique constraint on (workspace_id, key), try upsert via delete+insert
    await pool.query(`DELETE FROM ${SCHEMA}.workspace_settings WHERE workspace_id=$1 AND key=$2`, [wsId, key]);
    await pool.query(`INSERT INTO ${SCHEMA}.workspace_settings (workspace_id, key, value) VALUES ($1,$2,$3::jsonb)`, [wsId, key, JSON.stringify(value)]);
  });
}

async function findProviderByRef(wsId, providerRef) {
  const ref = typeof providerRef === 'string' ? providerRef.trim() : '';
  if (!ref) return null;

  try {
    let result = await pool.query(
      `SELECT id, provider, is_enabled
         FROM ${SCHEMA}.llm_providers
        WHERE workspace_id = $1 AND id = $2
        LIMIT 1`,
      [wsId, ref]
    );
    if (result.rows[0]) return result.rows[0];

    result = await pool.query(
      `SELECT id, provider, is_enabled
         FROM ${SCHEMA}.llm_providers
        WHERE workspace_id = $1 AND provider = $2
        ORDER BY is_enabled DESC, is_default DESC, created_at DESC
        LIMIT 1`,
      [wsId, ref]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.warn('[SETTINGS] findProviderByRef warning:', err.message);
    return null;
  }
}

async function resolveWorkspaceDefaultProvider(wsId, storedRef) {
  const explicit = await findProviderByRef(wsId, storedRef);
  if (explicit) return explicit;

  try {
    const result = await pool.query(
      `SELECT id, provider, is_enabled
         FROM ${SCHEMA}.llm_providers
        WHERE workspace_id = $1 AND is_default = TRUE
        ORDER BY is_enabled DESC, created_at DESC
        LIMIT 1`,
      [wsId]
    );
    return result.rows[0] || null;
  } catch (err) {
    console.warn('[SETTINGS] resolveWorkspaceDefaultProvider warning:', err.message);
    return null;
  }
}

async function syncDefaultProvider(wsId, providerRef) {
  try {
    await pool.query(
      `UPDATE ${SCHEMA}.llm_providers
          SET is_default = FALSE,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [wsId]
    );
  } catch (err) {
    console.warn('[SETTINGS] syncDefaultProvider reset warning:', err.message);
  }

  const target = await findProviderByRef(wsId, providerRef);
  if (!target) return null;

  try {
    await pool.query(
      `UPDATE ${SCHEMA}.llm_providers
          SET is_default = TRUE,
              updated_at = NOW()
        WHERE workspace_id = $1 AND id = $2`,
      [wsId, target.id]
    );
    return target;
  } catch (err) {
    console.warn('[SETTINGS] syncDefaultProvider assign warning:', err.message);
    return null;
  }
}

function maskKey(key) {
  if (!key || key.length < 8) return '••••••••';
  return key.substring(0, 6) + '••••••••' + key.substring(key.length - 4);
}

function normalizeNotificationSettings(value) {
  const input = (value && typeof value === 'object' && !Array.isArray(value))
    ? value
    : {};

  return {
    agent_error: input.agent_error !== undefined ? Boolean(input.agent_error) : DEFAULT_NOTIFICATION_SETTINGS.agent_error,
    deployment_offline: input.deployment_offline !== undefined ? Boolean(input.deployment_offline) : DEFAULT_NOTIFICATION_SETTINGS.deployment_offline,
    daily_digest: input.daily_digest !== undefined ? Boolean(input.daily_digest) : DEFAULT_NOTIFICATION_SETTINGS.daily_digest,
    security_alert: input.security_alert !== undefined ? Boolean(input.security_alert) : DEFAULT_NOTIFICATION_SETTINGS.security_alert,
  };
}

async function ensureFlatNotificationColumns() {
  if (!runtimeSchemaMutationsAllowed()) {
    await assertColumnsExist(
      pool,
      SCHEMA,
      'workspace_settings',
      ['notification_email', 'notification_settings'],
      { label: 'Workspace settings notification columns' }
    );
    return;
  }

  await pool.query(`
    ALTER TABLE ${SCHEMA}.workspace_settings
      ADD COLUMN IF NOT EXISTS notification_email TEXT,
      ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT '{}'::jsonb
  `).catch(() => {});
}

async function readWorkspaceNotifications(wsId, fallbackEmail) {
  const layout = await detectSettingsLayout();

  if (layout === 'kv') {
    const row = await readSettingsKV(wsId);
    return {
      email: row.notification_email || fallbackEmail || '',
      settings: normalizeNotificationSettings(row.notification_settings),
    };
  }

  await ensureFlatNotificationColumns();
  const result = await pool.query(
    `SELECT notification_email, notification_settings
       FROM ${SCHEMA}.workspace_settings
      WHERE workspace_id = $1
      LIMIT 1`,
    [wsId]
  );
  const row = result.rows[0] || {};
  return {
    email: row.notification_email || fallbackEmail || '',
    settings: normalizeNotificationSettings(row.notification_settings),
  };
}

async function writeWorkspaceNotifications(wsId, email, settings) {
  const layout = await detectSettingsLayout();
  const normalizedSettings = normalizeNotificationSettings(settings);
  const normalizedEmail = typeof email === 'string' ? email.trim() : '';

  if (layout === 'kv') {
    await writeSettingKV(wsId, 'notification_email', normalizedEmail);
    await writeSettingKV(wsId, 'notification_settings', normalizedSettings);
    return;
  }

  await ensureFlatNotificationColumns();
  const updated = await pool.query(
    `UPDATE ${SCHEMA}.workspace_settings
        SET notification_email = $1,
            notification_settings = $2::jsonb,
            updated_at = NOW()
      WHERE workspace_id = $3`,
    [normalizedEmail, JSON.stringify(normalizedSettings), wsId]
  ).catch(() => ({ rowCount: 0 }));

  if (updated.rowCount > 0) return;

  await pool.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (workspace_id, notification_email, notification_settings)
     VALUES ($1, $2, $3::jsonb)`,
    [wsId, normalizedEmail, JSON.stringify(normalizedSettings)]
  );
}

// GET /api/v1/settings
router.get('/', async (req, res) => {
  try {
    const wsId = req.workspaceId; // SECURITY: workspace from JWT only (audit 2026-03-29)
    const layout = await detectSettingsLayout();
    let row = {};

    if (layout === 'kv') {
      row = await readSettingsKV(wsId);
    } else {
      // flat layout
      let r = await pool.query(`SELECT * FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 LIMIT 1`, [wsId]);
      if (r.rows.length === 0) {
        try {
          await pool.query(`INSERT INTO ${SCHEMA}.workspace_settings (workspace_id) VALUES ($1)`, [wsId]);
        } catch (_) {}
        r = await pool.query(`SELECT * FROM ${SCHEMA}.workspace_settings WHERE workspace_id = $1 LIMIT 1`, [wsId]);
      }
      const r0 = r.rows[0] || {};
      row = {
        name: r0.name || 'My Workspace',
        description: r0.description || '',
        timezone: r0.timezone || 'Europe/Zurich',
        language: r0.language || 'fr',
        logo_url: r0.logo_url || null,
        default_provider: r0.default_provider || '',
        drive_root: r0.drive_root || '/projects/Vutler',
        llm_providers: r0.llm_providers || {},
        updated_at: r0.updated_at || null,
      };
    }

    // Mask LLM keys
    const providers = (typeof row.llm_providers === 'object' && row.llm_providers !== null) ? row.llm_providers : {};
    const masked = {};
    for (const [k, v] of Object.entries(providers)) {
      if (v && typeof v === 'object') {
        masked[k] = { ...v, api_key: v.api_key ? maskKey(v.api_key) : '' };
      }
    }

    const defaultProvider = await resolveWorkspaceDefaultProvider(wsId, row.default_provider || null);

    const settings = {
      workspace_id: wsId,
      name: row.name || 'My Workspace',
      timezone: row.timezone || 'Europe/Zurich',
      language: row.language || 'fr',
      logo_url: row.logo_url || null,
      drive_root: row.drive_root || '/projects/Vutler',
      llm_providers: masked,
      snipara_api_key: row.snipara_api_key ? maskKey(row.snipara_api_key) : null,
      snipara_api_url: row.snipara_api_url || null,
      snipara_project_id: row.snipara_project_id || null,
      snipara_project_slug: row.snipara_project_slug || null,
      snipara_client_id: row.snipara_client_id || null,
      snipara_swarm_id: row.snipara_swarm_id || null,
      updated_at: row.updated_at || null,
      workspace_name: row.name || 'My Workspace',
      workspace_description: row.description || '',
      default_provider: defaultProvider?.id || row.default_provider || '',
      default_provider_type: defaultProvider?.provider || null,
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
    const wsId = req.workspaceId;
    // Support both flat { name, timezone } and nested { settings: { workspace_name: { value } } }
    const body = req.body || {};
    const s = body.settings || {};
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
    const extract = (key) => {
      const v = s[key];
      if (v === undefined) return undefined;
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && 'value' in v) return v.value;
      return undefined;
    };
    const name = hasOwn(body, 'name') ? body.name : extract('workspace_name');
    const description = hasOwn(body, 'description') ? body.description : extract('workspace_description');
    const timezone = hasOwn(body, 'timezone') ? body.timezone : extract('timezone');
    const language = hasOwn(body, 'language') ? body.language : extract('language');
    const logo_url = hasOwn(body, 'logo_url') ? body.logo_url : extract('logo_url');
    const default_provider = hasOwn(body, 'default_provider') ? body.default_provider : extract('default_provider');
    const drive_root = hasOwn(body, 'drive_root') ? body.drive_root : extract('drive_root');
    const snipara_api_key = hasOwn(body, 'snipara_api_key') ? body.snipara_api_key : extract('snipara_api_key');
    const snipara_api_url = hasOwn(body, 'snipara_api_url') ? body.snipara_api_url : extract('snipara_api_url');
    const snipara_project_id = hasOwn(body, 'snipara_project_id') ? body.snipara_project_id : extract('snipara_project_id');
    const snipara_project_slug = hasOwn(body, 'snipara_project_slug') ? body.snipara_project_slug : extract('snipara_project_slug');
    const snipara_client_id = hasOwn(body, 'snipara_client_id') ? body.snipara_client_id : extract('snipara_client_id');
    const snipara_swarm_id = hasOwn(body, 'snipara_swarm_id') ? body.snipara_swarm_id : extract('snipara_swarm_id');

    const layout = await detectSettingsLayout();
    const syncedDefaultProvider = default_provider !== undefined
      ? await syncDefaultProvider(wsId, default_provider)
      : null;
    const normalizedDefaultProvider = default_provider !== undefined
      ? (syncedDefaultProvider?.id || (typeof default_provider === 'string' ? default_provider.trim() : default_provider))
      : undefined;

    if (layout === 'kv') {
      const updates = {
        name,
        description,
        timezone,
        language,
        logo_url,
        default_provider: normalizedDefaultProvider,
        drive_root,
        snipara_api_key,
        snipara_api_url,
        snipara_project_id,
        snipara_project_slug,
        snipara_client_id,
        snipara_swarm_id
      };
      for (const [k, v] of Object.entries(updates)) {
        if (v !== undefined && v !== null) {
          await writeSettingKV(wsId, k, v).catch(() => {});
        }
      }
    } else {
      await pool.query(
        `UPDATE ${SCHEMA}.workspace_settings
         SET name=COALESCE($1,name),
             description=COALESCE($2,description),
             timezone=COALESCE($3,timezone),
             language=COALESCE($4,language),
             logo_url=COALESCE($5,logo_url),
             default_provider=COALESCE($6,default_provider),
             drive_root=COALESCE($7,drive_root),
             updated_at=NOW()
         WHERE workspace_id=$8`,
        [
          name !== undefined ? name : null,
          description !== undefined ? description : null,
          timezone !== undefined ? timezone : null,
          language !== undefined ? language : null,
          logo_url !== undefined ? logo_url : null,
          normalizedDefaultProvider !== undefined ? normalizedDefaultProvider : null,
          drive_root !== undefined ? drive_root : null,
          wsId
        ]
      );
    }
    clearSniparaConfigCache(wsId);
    res.json({ success: true, message: 'Settings saved' });
  } catch (err) {
    console.error('[SETTINGS] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/settings/notifications
router.get('/notifications', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const notifications = await readWorkspaceNotifications(req.workspaceId, req.user?.email || '');
    res.json({ success: true, ...notifications });
  } catch (err) {
    console.error('[SETTINGS] GET notifications error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/settings/notifications
router.put('/notifications', async (req, res) => {
  try {
    if (!req.workspaceId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    await writeWorkspaceNotifications(
      req.workspaceId,
      req.body?.email || req.user?.email || '',
      req.body?.settings
    );
    res.json({ success: true, message: 'Notification settings saved' });
  } catch (err) {
    console.error('[SETTINGS] PUT notifications error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/settings/llm-providers
router.get('/llm-providers', async (req, res) => {
  try {
    const wsId = req.workspaceId;
    const r = await pool.query(`SELECT llm_providers FROM ${SCHEMA}.workspace_settings WHERE workspace_id=$1 LIMIT 1`, [wsId]);
    const providers = r.rows[0]?.llm_providers || {};
    const masked = {};
    for (const [k, v] of Object.entries(providers)) {
      const decryptedApiKey = v.api_key ? decryptProviderSecret(v.api_key) : '';
      masked[k] = { ...v, api_key: decryptedApiKey ? maskKey(decryptedApiKey) : '' };
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
    const wsId = req.workspaceId;
    const { providers } = req.body; // { openai: { api_key: '...', enabled: true }, anthropic: { ... } }
    // Merge: if a key looks masked, keep existing
    const r = await pool.query(`SELECT llm_providers FROM ${SCHEMA}.workspace_settings WHERE workspace_id=$1 LIMIT 1`, [wsId]);
    const existing = r.rows[0]?.llm_providers || {};
    const merged = { ...existing };
    for (const [k, v] of Object.entries(providers || {})) {
      if (v.api_key && v.api_key.includes('••')) {
        merged[k] = { ...merged[k], ...v, api_key: existing[k]?.api_key || '' };
      } else {
        merged[k] = {
          ...merged[k],
          ...v,
          api_key: v.api_key ? encryptProviderSecret(v.api_key) : (v.api_key === '' ? '' : merged[k]?.api_key || ''),
        };
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
    await ensureApiKeysTable();
    const wsId = req.workspaceId;
    const r = await pool.query(
      `SELECT id, name, key_prefix, role, created_at, last_used_at, revoked_at
       FROM ${SCHEMA}.workspace_api_keys
       WHERE workspace_id=$1
       ORDER BY created_at DESC`,
      [wsId]
    );
    res.json({ success: true, keys: r.rows });
  } catch (err) {
    console.error('[SETTINGS] GET api-keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/settings/api-keys
router.post('/api-keys', async (req, res) => {
  try {
    await ensureApiKeysTable();
    const wsId = req.workspaceId;
    const { name, role } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Name required' });
    const validRoles = ['admin', 'developer', 'viewer'];
    const keyRole = validRoles.includes(role) ? role : 'developer';
    const raw = 'vt_' + crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const prefix = raw.substring(0, 14) + '...';
    const ins = await pool.query(
      `INSERT INTO ${SCHEMA}.workspace_api_keys (workspace_id, name, key_hash, key_prefix, role)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [wsId, name, hash, prefix, keyRole]
    );
    const insertedId = ins.rows[0]?.id;
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
    await ensureApiKeysTable();
    const wsId = req.workspaceId;
    await pool.query(`UPDATE ${SCHEMA}.workspace_api_keys SET revoked_at=NOW() WHERE id=$1 AND workspace_id=$2`, [req.params.id, wsId]);
    res.json({ success: true, message: 'Key revoked' });
  } catch (err) {
    console.error('[SETTINGS] DELETE api-keys error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
