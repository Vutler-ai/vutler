'use strict';

const pool = require('../lib/vaultbrix');
const skillHandlers = require('../seeds/skill-handlers.json');

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
  email: 'google',
  google_calendar: 'google',
  google_drive: 'google',
};

const AGENT_PROVIDER_SKILL_PROVIDER_ALIASES = {
  google: ['email', 'google_calendar', 'google_drive'],
};

function normalizeProvider(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAgentIntegrationProviders(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(normalizeProvider).filter(Boolean)));
}

async function ensureAgentIntegrationTable(db = pool) {
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
      connected.add(normalizeProvider(row.provider));
    }
  } catch (err) {
    if (err?.code !== '42P01') throw err;
  }

  for (const provider of await listConnectedSocialPlatforms(workspaceId, db)) {
    connected.add(provider);
    connected.add('social_media');
  }

  return connected;
}

async function listConnectedSocialPlatforms(workspaceId, db = pool) {
  if (!workspaceId) return [];

  try {
    const socialRows = await db.query(
      `SELECT DISTINCT platform
       FROM ${SCHEMA}.social_accounts
       WHERE workspace_id = $1`,
      [workspaceId]
    );
    return normalizeAgentIntegrationProviders(socialRows.rows.map((row) => row.platform));
  } catch (err) {
    if (err?.code === '42P01') return [];
    throw err;
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
    if (!skillKey.startsWith(`${integrationProvider}_`)) continue;
    skillKeys.push(skillKey);
  }

  return Array.from(new Set(skillKeys));
}

async function resolveAgentRuntimeIntegrations({ workspaceId, agentId, integrations = [], db = pool } = {}) {
  const explicitProviders = normalizeAgentIntegrationProviders(integrations);
  const storedProviders = await listAgentIntegrationProviders(workspaceId, agentId, db).catch(() => []);
  const enabledProviders = normalizeAgentIntegrationProviders([
    ...explicitProviders,
    ...storedProviders,
  ]);

  const connectedProviders = await listConnectedWorkspaceIntegrationProviders(workspaceId, db).catch(() => new Set());
  const availableProviders = enabledProviders.filter((provider) => connectedProviders.has(provider));
  const connectedSocialPlatforms = await listConnectedSocialPlatforms(workspaceId, db).catch(() => []);
  const socialPlatformSet = new Set(connectedSocialPlatforms);
  const allowedSocialPlatforms = availableProviders.filter((provider) => socialPlatformSet.has(provider));

  return {
    enabledProviders,
    availableProviders,
    connectedProviders: Array.from(connectedProviders),
    connectedSocialPlatforms,
    derivedSkillKeys: getSkillKeysForIntegrationProviders(availableProviders),
    hasSocialMediaAccess: availableProviders.includes('social_media') || allowedSocialPlatforms.length > 0,
    allowedSocialPlatforms,
  };
}

module.exports = {
  SOCIAL_PROVIDERS,
  normalizeAgentIntegrationProviders,
  listAgentIntegrationProviders,
  replaceAgentIntegrationProviders,
  hasAgentIntegrationAccess,
  getSkillKeysForIntegrationProviders,
  resolveAgentRuntimeIntegrations,
};
