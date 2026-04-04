'use strict';

const { decryptProviderSecret, encryptProviderSecret } = require('./providerSecrets');

const SCHEMA = 'tenant_vutler';
const MANAGED_PROVIDER_ALIAS = 'vutler-trial';

const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
};

function firstEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function defaultModelForProvider(provider, source) {
  if (provider === 'anthropic') return 'claude-haiku-4-5';
  if (provider === 'openrouter') return source === 'credits' ? 'openrouter/auto' : 'openrouter/auto';
  return 'gpt-5.4-mini';
}

function resolveProfileFromProvider(provider, source) {
  if (!provider) return null;

  const normalizedProvider = String(provider).trim().toLowerCase();
  const sourcePrefix = source === 'credits' ? 'MANAGED' : 'TRIAL';
  const explicitApiKey = firstEnv(
    `VUTLER_${sourcePrefix}_API_KEY`,
    `VUTLER_${sourcePrefix}_${normalizedProvider.toUpperCase()}_KEY`
  );

  const sharedApiKey = normalizedProvider === 'anthropic'
    ? firstEnv('VUTLER_TRIAL_ANTHROPIC_KEY', 'VUTLER_MANAGED_ANTHROPIC_KEY', 'ANTHROPIC_API_KEY')
    : normalizedProvider === 'openrouter'
      ? firstEnv('VUTLER_TRIAL_OPENROUTER_KEY', 'VUTLER_MANAGED_OPENROUTER_KEY', 'OPENROUTER_API_KEY')
      : firstEnv('VUTLER_TRIAL_OPENAI_KEY', 'VUTLER_MANAGED_OPENAI_KEY', 'OPENAI_API_KEY');

  const apiKey = explicitApiKey || sharedApiKey;
  if (!apiKey) return null;

  const envModel = firstEnv(`VUTLER_${sourcePrefix}_MODEL`);
  const envBaseUrl = firstEnv(`VUTLER_${sourcePrefix}_BASE_URL`);

  return {
    provider: normalizedProvider,
    model: envModel || defaultModelForProvider(normalizedProvider, source),
    apiKey,
    baseURL: envBaseUrl || PROVIDER_BASE_URLS[normalizedProvider] || PROVIDER_BASE_URLS.openai,
    source,
  };
}

function resolveManagedProfile(source = 'trial') {
  const normalizedSource = source === 'credits' ? 'credits' : 'trial';
  const envProvider = firstEnv(`VUTLER_${normalizedSource === 'credits' ? 'MANAGED' : 'TRIAL'}_PROVIDER`);
  if (envProvider) {
    return resolveProfileFromProvider(envProvider, normalizedSource);
  }

  if (normalizedSource === 'credits') {
    return (
      resolveProfileFromProvider('openrouter', normalizedSource) ||
      resolveProfileFromProvider('anthropic', normalizedSource) ||
      resolveProfileFromProvider('openai', normalizedSource)
    );
  }

  return (
    resolveProfileFromProvider('anthropic', normalizedSource) ||
    resolveProfileFromProvider('openai', normalizedSource) ||
    resolveProfileFromProvider('openrouter', normalizedSource)
  );
}

function parseConfig(config) {
  if (!config) return {};
  if (typeof config === 'string') {
    try {
      return JSON.parse(config);
    } catch (_) {
      return {};
    }
  }
  if (typeof config === 'object') return { ...config };
  return {};
}

function buildManagedProviderConfig(profile) {
  const label = profile.source === 'credits' ? 'Vutler Managed Credits' : 'Vutler Trial';
  return {
    managed: true,
    source: profile.source,
    display_name: label,
    upstream_provider: profile.provider,
    upstream_model: profile.model,
  };
}

async function loadManagedProviderRow(db, workspaceId) {
  if (!db || !workspaceId) return null;
  try {
    const result = await db.query(
      `SELECT id, provider, api_key, base_url, config, is_default
         FROM ${SCHEMA}.llm_providers
        WHERE workspace_id = $1 AND provider = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [workspaceId, MANAGED_PROVIDER_ALIAS]
    );
    const row = result.rows?.[0] || null;
    return row ? { ...row, api_key: decryptProviderSecret(row.api_key) } : null;
  } catch (_) {
    return null;
  }
}

function getManagedRuntimeConfig(row) {
  const config = parseConfig(row?.config);
  const source = config.source === 'credits' ? 'credits' : 'trial';
  const envProfile = resolveManagedProfile(source);
  return {
    source,
    upstreamProvider: config.upstream_provider || envProfile?.provider || 'openai',
    upstreamModel: config.upstream_model || envProfile?.model || 'gpt-5.4-mini',
    apiKey: row?.api_key || envProfile?.apiKey || null,
    baseURL: row?.base_url || envProfile?.baseURL || PROVIDER_BASE_URLS.openai,
  };
}

async function syncManagedDefaultProvider(db, workspaceId, providerId, force = false) {
  if (!db || !workspaceId || !providerId) return null;

  let shouldAssign = Boolean(force);
  if (!shouldAssign) {
    try {
      const currentDefault = await db.query(
        `SELECT id, provider
           FROM ${SCHEMA}.llm_providers
          WHERE workspace_id = $1 AND is_enabled = true AND is_default = true
          ORDER BY created_at DESC
          LIMIT 1`,
        [workspaceId]
      );
      const row = currentDefault.rows?.[0] || null;
      shouldAssign = !row || row.id === providerId || row.provider === MANAGED_PROVIDER_ALIAS;
    } catch (_) {
      shouldAssign = force;
    }
  }

  if (!shouldAssign) return null;

  await db.query(
    `UPDATE ${SCHEMA}.llm_providers
        SET is_default = FALSE,
            updated_at = NOW()
      WHERE workspace_id = $1`,
    [workspaceId]
  ).catch(() => {});

  await db.query(
    `UPDATE ${SCHEMA}.llm_providers
        SET is_default = TRUE,
            updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, providerId]
  ).catch(() => {});

  await db.query(
    `INSERT INTO ${SCHEMA}.workspace_settings (id, workspace_id, key, value, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, 'default_provider', to_jsonb($2::text), NOW(), NOW())
     ON CONFLICT (workspace_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [workspaceId, providerId]
  ).catch(async () => {
    await db.query(
      `UPDATE ${SCHEMA}.workspace_settings
          SET default_provider = $2,
              updated_at = NOW()
        WHERE workspace_id = $1`,
      [workspaceId, providerId]
    ).catch(() => {});
  });

  return providerId;
}

async function ensureManagedProvider(db, workspaceId, options = {}) {
  if (!db || !workspaceId) return null;

  const source = options.source === 'credits' ? 'credits' : 'trial';
  const profile = resolveManagedProfile(source);
  if (!profile?.apiKey) return null;

  const config = buildManagedProviderConfig(profile);
  const existing = await loadManagedProviderRow(db, workspaceId);

  if (existing?.id) {
    await db.query(
      `UPDATE ${SCHEMA}.llm_providers
          SET api_key = $3,
              base_url = $4,
              config = COALESCE(config, '{}'::jsonb) || $5::jsonb,
              is_enabled = TRUE,
              updated_at = NOW()
        WHERE workspace_id = $1 AND id = $2`,
      [workspaceId, existing.id, encryptProviderSecret(profile.apiKey), profile.baseURL, JSON.stringify(config)]
    );

    await syncManagedDefaultProvider(db, workspaceId, existing.id, Boolean(options.forceDefault));

    return {
      id: existing.id,
      provider: MANAGED_PROVIDER_ALIAS,
      model: profile.model,
      source,
      upstreamProvider: profile.provider,
    };
  }

  const inserted = await db.query(
    `INSERT INTO ${SCHEMA}.llm_providers
       (workspace_id, provider, api_key, base_url, is_enabled, is_default, config)
     VALUES ($1, $2, $3, $4, TRUE, FALSE, $5::jsonb)
     RETURNING id`,
    [workspaceId, MANAGED_PROVIDER_ALIAS, encryptProviderSecret(profile.apiKey), profile.baseURL, JSON.stringify(config)]
  );
  const providerId = inserted.rows?.[0]?.id || null;

  await syncManagedDefaultProvider(db, workspaceId, providerId, Boolean(options.forceDefault));

  return {
    id: providerId,
    provider: MANAGED_PROVIDER_ALIAS,
    model: profile.model,
    source,
    upstreamProvider: profile.provider,
  };
}

async function resolveProvisionedManagedRuntime(db, workspaceId) {
  const row = await loadManagedProviderRow(db, workspaceId);
  if (!row) return null;

  const runtime = getManagedRuntimeConfig(row);
  if (!runtime.apiKey) return null;

  return {
    provider: MANAGED_PROVIDER_ALIAS,
    model: runtime.upstreamModel,
    source: runtime.source,
    upstreamProvider: runtime.upstreamProvider,
  };
}

module.exports = {
  MANAGED_PROVIDER_ALIAS,
  resolveManagedProfile,
  ensureManagedProvider,
  loadManagedProviderRow,
  getManagedRuntimeConfig,
  resolveProvisionedManagedRuntime,
  syncManagedDefaultProvider,
};
