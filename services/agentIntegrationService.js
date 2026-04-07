'use strict';

const pool = require('../lib/vaultbrix');
const skillHandlers = require('../seeds/skill-handlers.json');
const { listSocialAccounts, toInternalPlatform } = require('./postForMeClient');
const { normalizeScopeStrings } = require('./socialAccountScope');
const { assertTableExists, runtimeSchemaMutationsAllowed } = require('../lib/schemaReadiness');

const SCHEMA = 'tenant_vutler';
const SOCIAL_PROVIDERS = new Set([
  'linkedin',
  'twitter',
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'threads',
  'bluesky',
  'pinterest',
]);

const ACCESS_PROVIDER_ALIASES = {
  email: 'email',
  google_calendar: 'google',
  google_drive: 'google',
};

const AGENT_PROVIDER_SKILL_PROVIDER_ALIASES = {
  google: ['google_calendar', 'google_drive'],
};

const PROVIDER_ALIASES = {
  'social-media': 'social_media',
  socialmedia: 'social_media',
  x: 'twitter',
  'google-calendar': 'google',
  google_calendar: 'google',
  'google-drive': 'google',
  google_drive: 'google',
  gmail: 'google',
};

function normalizeProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PROVIDER_ALIASES[normalized] || normalized;
}

function normalizeAgentIntegrationProviders(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(normalizeProvider).filter(Boolean)));
}

function normalizePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseAgentConfig(value) {
  if (!value) return {};
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function readAgentSocialProvisioning(agent = null) {
  const config = parseAgentConfig(agent?.config);
  const provisioning = normalizePlainObject(config.provisioning);
  const social = normalizePlainObject(provisioning.social);
  return {
    allowedPlatforms: normalizeAgentIntegrationProviders(social.allowed_platforms || social.platforms),
    accountIds: normalizeScopeStrings(social.account_ids || social.accounts),
    brandIds: normalizeScopeStrings(social.brand_ids),
  };
}

async function ensureAgentIntegrationTable(db = pool) {
  if (!runtimeSchemaMutationsAllowed()) {
    await assertTableExists(db, SCHEMA, 'workspace_integration_agents', {
      label: 'Agent integration access table',
    });
    return;
  }

  await db.query(
    `CREATE TABLE IF NOT EXISTS ${SCHEMA}.workspace_integration_agents (
      workspace_id UUID NOT NULL,
      provider TEXT NOT NULL,
      agent_id UUID NOT NULL,
      has_access BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(workspace_id, provider, agent_id)
    )`
  );
}

async function listAgentIntegrationProviders(workspaceId, agentId, db = pool) {
  if (!workspaceId || !agentId) return [];

  try {
    await ensureAgentIntegrationTable(db);
    const result = await db.query(
      `SELECT provider
       FROM ${SCHEMA}.workspace_integration_agents
       WHERE workspace_id = $1
         AND agent_id = $2::uuid
         AND has_access = TRUE
       ORDER BY provider ASC`,
      [workspaceId, agentId]
    );
    return normalizeAgentIntegrationProviders(result.rows.map((row) => row.provider));
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
  }
}

async function replaceAgentIntegrationProviders(workspaceId, agentId, providers, db = pool) {
  if (!workspaceId || !agentId) return [];

  const normalizedProviders = normalizeAgentIntegrationProviders(providers);
  await ensureAgentIntegrationTable(db);

  await db.query(
    `DELETE FROM ${SCHEMA}.workspace_integration_agents
     WHERE workspace_id = $1
       AND agent_id = $2::uuid`,
    [workspaceId, agentId]
  );

  for (const provider of normalizedProviders) {
    await db.query(
      `INSERT INTO ${SCHEMA}.workspace_integration_agents
        (workspace_id, provider, agent_id, has_access, created_at, updated_at)
       VALUES ($1, $2, $3::uuid, TRUE, NOW(), NOW())
       ON CONFLICT (workspace_id, provider, agent_id) DO UPDATE SET
         has_access = TRUE,
         updated_at = NOW()`,
      [workspaceId, provider, agentId]
    );
  }

  return normalizedProviders;
}

async function hasAgentIntegrationAccess(workspaceId, agentId, provider, db = pool) {
  if (!workspaceId || !provider) return false;
  if (!agentId) return true;

  const normalized = normalizeProvider(provider);
  const mapped = ACCESS_PROVIDER_ALIASES[normalized] || normalized;
  const providersToCheck = new Set([mapped]);

  if (mapped === 'social_media') {
    for (const socialProvider of SOCIAL_PROVIDERS) {
      providersToCheck.add(socialProvider);
    }
  }

  try {
    await ensureAgentIntegrationTable(db);
    const overrideRes = await db.query(
      `SELECT 1
       FROM ${SCHEMA}.workspace_integration_agents
       WHERE workspace_id = $1
         AND provider = ANY($2::text[])
       LIMIT 1`,
      [workspaceId, Array.from(providersToCheck)]
    );
    if (overrideRes.rows.length === 0) return true;

    const result = await db.query(
      `SELECT 1
       FROM ${SCHEMA}.workspace_integration_agents
       WHERE workspace_id = $1
         AND agent_id = $2::uuid
         AND has_access = TRUE
         AND provider = ANY($3::text[])
       LIMIT 1`,
      [workspaceId, agentId, Array.from(providersToCheck)]
    );
    return result.rows.length > 0;
  } catch (err) {
    if (err?.code === '42P01') return false;
    throw err;
  }
}

async function workspaceHasAgentAccessOverrides(workspaceId, providers, db = pool) {
  const normalizedProviders = normalizeAgentIntegrationProviders(providers);
  if (!workspaceId || normalizedProviders.length === 0) return false;

  try {
    await ensureAgentIntegrationTable(db);
    const result = await db.query(
      `SELECT 1
       FROM ${SCHEMA}.workspace_integration_agents
       WHERE workspace_id = $1
         AND provider = ANY($2::text[])
       LIMIT 1`,
      [workspaceId, normalizedProviders]
    );
    return result.rows.length > 0;
  } catch (err) {
    if (err?.code === '42P01') return false;
    throw err;
  }
}

async function listConnectedWorkspaceIntegrationProviders(workspaceId, db = pool) {
  const connected = new Set();
  if (!workspaceId) return connected;

  try {
    const integrationRows = await db.query(
      `SELECT provider
       FROM ${SCHEMA}.workspace_integrations
       WHERE workspace_id = $1
         AND connected = TRUE`,
      [workspaceId]
    );
    for (const row of integrationRows.rows) {
      connected.add(normalizeProvider(toInternalPlatform(row.provider)));
    }
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  const socialOverrides = await getSocialIntegrationOverrides(workspaceId, db).catch(() => ({
    blockedProviders: new Set(),
    blockedAggregate: false,
  }));

  for (const provider of socialOverrides.blockedProviders) {
    connected.delete(provider);
  }
  if (socialOverrides.blockedAggregate) {
    connected.delete('social_media');
  }

  for (const provider of await listConnectedSocialPlatforms(workspaceId, db, socialOverrides)) {
    connected.add(provider);
  }
  if (!socialOverrides.blockedAggregate && Array.from(connected).some((provider) => SOCIAL_PROVIDERS.has(provider))) {
    connected.add('social_media');
  }

  return connected;
}

async function getSocialIntegrationOverrides(workspaceId, db = pool) {
  if (!workspaceId) {
    return {
      blockedProviders: new Set(),
      blockedAggregate: false,
    };
  }

  const blockedProviders = new Set();
  let blockedAggregate = false;

  try {
    const result = await db.query(
      `SELECT provider, connected
       FROM ${SCHEMA}.workspace_integrations
       WHERE workspace_id = $1
         AND provider = ANY($2::text[])`,
      [workspaceId, ['social_media', ...Array.from(SOCIAL_PROVIDERS)]]
    );

    for (const row of result.rows) {
      const provider = normalizeProvider(toInternalPlatform(row.provider));
      if (row.connected === true) continue;
      if (provider === 'social_media') {
        blockedAggregate = true;
        continue;
      }
      if (SOCIAL_PROVIDERS.has(provider)) {
        blockedProviders.add(provider);
      }
    }
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  return {
    blockedProviders,
    blockedAggregate,
  };
}

async function listConnectedSocialPlatforms(workspaceId, db = pool, overrideState = null) {
  if (!workspaceId) return [];

  const socialOverrides = overrideState || await getSocialIntegrationOverrides(workspaceId, db).catch(() => ({
    blockedProviders: new Set(),
    blockedAggregate: false,
  }));
  const connectedPlatforms = new Set();
  try {
    const socialRows = await db.query(
      `SELECT DISTINCT platform
       FROM ${SCHEMA}.social_accounts
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    for (const platform of normalizeAgentIntegrationProviders(socialRows.rows.map((row) => row.platform))) {
      if (socialOverrides.blockedProviders.has(platform)) continue;
      connectedPlatforms.add(platform);
    }
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  try {
    const integrationRows = await db.query(
      `SELECT DISTINCT provider
       FROM ${SCHEMA}.workspace_integrations
       WHERE workspace_id = $1
         AND connected = TRUE
         AND provider = ANY($2::text[])`,
      [workspaceId, Array.from(SOCIAL_PROVIDERS)]
    );
    for (const provider of normalizeAgentIntegrationProviders(integrationRows.rows.map((row) => toInternalPlatform(row.provider)))) {
      if (socialOverrides.blockedProviders.has(provider)) continue;
      connectedPlatforms.add(provider);
    }
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  if (connectedPlatforms.size > 0) {
    return Array.from(connectedPlatforms);
  }

  try {
    const accounts = await listSocialAccounts({
      externalId: `ws_${workspaceId}`,
      status: 'connected',
    });
    for (const platform of normalizeAgentIntegrationProviders(
      accounts
        .map((account) => toInternalPlatform(account?.platform || account?.type))
        .filter((platform) => SOCIAL_PROVIDERS.has(normalizeProvider(platform)))
    )) {
      if (socialOverrides.blockedProviders.has(platform)) continue;
      connectedPlatforms.add(platform);
    }

    return Array.from(connectedPlatforms);
  } catch (_) {
    return Array.from(connectedPlatforms);
  }
}

function expandAgentProviderToSkillProviders(provider) {
  const normalized = normalizeProvider(provider);
  const expanded = new Set([normalized]);
  const aliases = AGENT_PROVIDER_SKILL_PROVIDER_ALIASES[normalized] || [];
  for (const alias of aliases) expanded.add(alias);
  return expanded;
}

function getSkillKeysForIntegrationProviders(providers) {
  const expandedProviders = new Set();
  for (const provider of normalizeAgentIntegrationProviders(providers)) {
    for (const candidate of expandAgentProviderToSkillProviders(provider)) {
      expandedProviders.add(candidate);
    }
  }

  const skillKeys = [];
  for (const [skillKey, config] of Object.entries(skillHandlers)) {
    if (config?.type !== 'integration') continue;
    const integrationProvider = normalizeProvider(config.integration_provider);
    if (!integrationProvider || !expandedProviders.has(integrationProvider)) continue;
    skillKeys.push(skillKey);
  }

  return Array.from(new Set(skillKeys));
}

async function resolveAgentRuntimeIntegrations({ workspaceId, agentId, agent = null, integrations = [], db = pool } = {}) {
  const explicitProviders = normalizeAgentIntegrationProviders(integrations);
  const storedProviders = await listAgentIntegrationProviders(workspaceId, agentId, db).catch(() => []);
  const enabledProviders = normalizeAgentIntegrationProviders([
    ...explicitProviders,
    ...storedProviders,
  ]);
  const socialProvisioning = readAgentSocialProvisioning(agent);

  const connectedProviders = await listConnectedWorkspaceIntegrationProviders(workspaceId, db).catch(() => new Set());
  const availableProviders = [];
  for (const provider of connectedProviders) {
    const hasExplicitAccess = enabledProviders.includes(provider);
    const hasOverrides = await workspaceHasAgentAccessOverrides(workspaceId, [provider], db).catch(() => false);
    if (hasExplicitAccess || !hasOverrides) {
      availableProviders.push(provider);
    }
  }
  const connectedSocialPlatforms = await listConnectedSocialPlatforms(workspaceId, db).catch(() => []);
  const socialPlatformSet = new Set(connectedSocialPlatforms);
  const runtimeAllowedSocialPlatforms = availableProviders.filter((provider) => socialPlatformSet.has(provider));
  const allowedSocialPlatforms = socialProvisioning.allowedPlatforms.length > 0
    ? runtimeAllowedSocialPlatforms.filter((provider) => socialProvisioning.allowedPlatforms.includes(provider))
    : runtimeAllowedSocialPlatforms;
  const hasSocialAccessOverrides = await workspaceHasAgentAccessOverrides(
    workspaceId,
    ['social_media', ...connectedSocialPlatforms],
    db
  ).catch(() => false);

  return {
    enabledProviders,
    availableProviders,
    connectedProviders: Array.from(connectedProviders),
    connectedSocialPlatforms,
    derivedSkillKeys: getSkillKeysForIntegrationProviders(availableProviders),
    hasSocialMediaAccess: availableProviders.includes('social_media') || allowedSocialPlatforms.length > 0,
    hasSocialAccessOverrides,
    allowedSocialPlatforms,
    allowedSocialAccountIds: socialProvisioning.accountIds,
    allowedSocialBrandIds: socialProvisioning.brandIds,
  };
}

module.exports = {
  SOCIAL_PROVIDERS,
  normalizeAgentIntegrationProviders,
  listAgentIntegrationProviders,
  replaceAgentIntegrationProviders,
  hasAgentIntegrationAccess,
  workspaceHasAgentAccessOverrides,
  listConnectedWorkspaceIntegrationProviders,
  listConnectedSocialPlatforms,
  getSkillKeysForIntegrationProviders,
  resolveAgentRuntimeIntegrations,
};
