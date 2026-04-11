'use strict';

const pool = require('../lib/vaultbrix');
const { normalizeCapabilities } = require('./agentConfigPolicy');
const {
  normalizeAgentIntegrationProviders,
  listAgentIntegrationProviders,
  workspaceHasAgentAccessOverrides,
  listConnectedSocialPlatforms,
} = require('./agentIntegrationService');
const {
  normalizeAgentTypes,
  isSandboxEligibleAgentType,
  SANDBOX_ELIGIBLE_AGENT_TYPES,
} = require('./agentTypeProfiles');
const { normalizeMemoryMode } = require('./memory/modeResolver');

const ACCESS_POLICY_KEYS = Object.freeze([
  'email',
  'social',
  'drive',
  'calendar',
  'tasks',
  'memory',
  'sandbox',
]);

const SANDBOX_CAPABILITY_KEY = 'code_execution';

function normalizePlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeString(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

function normalizeStringArray(values = []) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(
    values
      .map((value) => normalizeString(value))
      .filter(Boolean)
  ));
}

function normalizeAgentConfig(config = {}) {
  if (config && typeof config === 'object' && !Array.isArray(config)) return config;
  if (typeof config === 'string') {
    try {
      const parsed = JSON.parse(config);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch (_) {
      return {};
    }
  }
  return {};
}

function getAgentConfigSections(agent = {}) {
  const config = normalizeAgentConfig(agent.config || {});
  return {
    config,
    accessPolicy: normalizePlainObject(config.access_policy),
    provisioning: normalizePlainObject(config.provisioning),
    memoryPolicy: normalizePlainObject(config.memory_policy),
    governance: normalizePlainObject(config.governance),
  };
}

function normalizeAccessEntry(input = {}, options = {}) {
  const normalized = normalizePlainObject(input);
  const entry = {};
  if (typeof normalized.allowed === 'boolean') entry.allowed = normalized.allowed;
  if (options.allowPlatforms) {
    const platforms = normalizeAgentIntegrationProviders(normalized.platforms);
    if (platforms.length > 0) entry.platforms = platforms;
  }
  return entry;
}

function normalizeAccessPolicy(input = {}, { agentTypes = [], capabilities = [] } = {}) {
  const normalized = normalizePlainObject(input);
  const policy = {};

  policy.email = normalizeAccessEntry(normalized.email);
  policy.social = normalizeAccessEntry(normalized.social, { allowPlatforms: true });
  policy.drive = normalizeAccessEntry(normalized.drive);
  policy.calendar = normalizeAccessEntry(normalized.calendar);
  policy.tasks = normalizeAccessEntry(normalized.tasks);
  policy.memory = normalizeAccessEntry(normalized.memory);
  policy.sandbox = normalizeAccessEntry(normalized.sandbox);

  const filtered = Object.fromEntries(
    Object.entries(policy).filter(([, value]) => Object.keys(value).length > 0)
  );

  const sandboxAllowed = filtered.sandbox?.allowed;
  if (sandboxAllowed === true && !isSandboxEligibleAgentType(agentTypes)) {
    filtered.sandbox = {
      ...filtered.sandbox,
      allowed: true,
      invalid: true,
    };
  }

  if (!filtered.sandbox && normalizeCapabilities(capabilities).includes(SANDBOX_CAPABILITY_KEY)) {
    filtered.sandbox = { allowed: true };
  }

  return filtered;
}

function normalizeProvisioning(input = {}) {
  const normalized = normalizePlainObject(input);
  const provisioning = {};

  const channels = normalizePlainObject(normalized.channels);
  if (Object.keys(channels).length > 0) {
    provisioning.channels = {};
    for (const key of ['chat', 'email', 'tasks']) {
      const value = normalizeBoolean(channels[key]);
      if (value !== null) provisioning.channels[key] = value;
    }
    if (Object.keys(provisioning.channels).length === 0) delete provisioning.channels;
  }

  const email = normalizePlainObject(normalized.email);
  if (Object.keys(email).length > 0) {
    provisioning.email = {};
    const address = normalizeString(email.address || email.email);
    if (address !== null) provisioning.email.address = address;
    const provisioned = normalizeBoolean(email.provisioned);
    if (provisioned !== null) provisioning.email.provisioned = provisioned;
    if (Object.keys(provisioning.email).length === 0) delete provisioning.email;
  }

  const social = normalizePlainObject(normalized.social);
  if (Object.keys(social).length > 0) {
    provisioning.social = {};
    const allowedPlatforms = normalizeAgentIntegrationProviders(social.allowed_platforms || social.platforms);
    const accountIds = normalizeStringArray(social.account_ids || social.accounts);
    const brandIds = normalizeStringArray(social.brand_ids);
    if (allowedPlatforms.length > 0) provisioning.social.allowed_platforms = allowedPlatforms;
    if (accountIds.length > 0) provisioning.social.account_ids = accountIds;
    if (brandIds.length > 0) provisioning.social.brand_ids = brandIds;
    if (Object.keys(provisioning.social).length === 0) delete provisioning.social;
  }

  const drive = normalizePlainObject(normalized.drive);
  if (Object.keys(drive).length > 0) {
    provisioning.drive = {};
    const root = normalizeString(drive.root);
    if (root !== null) provisioning.drive.root = root;
    if (Object.keys(provisioning.drive).length === 0) delete provisioning.drive;
  }

  return provisioning;
}

function normalizeMemoryPolicy(input = {}) {
  const normalized = normalizePlainObject(input);
  const mode = normalizeString(normalized.mode);
  if (!mode) return {};
  return {
    mode: normalizeMemoryMode(mode),
  };
}

function normalizeGovernance(input = {}) {
  const normalized = normalizePlainObject(input);
  const governance = {};
  const approvals = normalizeString(normalized.approvals);
  const maxRiskLevel = normalizeString(normalized.max_risk_level);
  const sandboxBackend = normalizeString(normalized.sandbox_backend || normalized.sandbox_backend_preference);
  if (approvals) governance.approvals = approvals;
  if (maxRiskLevel) governance.max_risk_level = maxRiskLevel;
  if (sandboxBackend) governance.sandbox_backend = sandboxBackend;
  return governance;
}

function mergeSection(baseSection = {}, patchSection = {}) {
  const base = normalizePlainObject(baseSection);
  const patch = normalizePlainObject(patchSection);
  if (Object.keys(patch).length === 0) return base;

  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      next[key] = mergeSection(base[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function mergeAgentConfiguration(currentConfig = {}, { accessPolicy = null, provisioning = null, memoryPolicy = null, governance = null } = {}) {
  const config = normalizeAgentConfig(currentConfig);
  const nextConfig = { ...config };

  if (accessPolicy && Object.keys(accessPolicy).length > 0) {
    nextConfig.access_policy = mergeSection(config.access_policy, accessPolicy);
  }

  if (provisioning && Object.keys(provisioning).length > 0) {
    nextConfig.provisioning = mergeSection(config.provisioning, provisioning);
  }

  if (memoryPolicy && Object.keys(memoryPolicy).length > 0) {
    nextConfig.memory_policy = mergeSection(config.memory_policy, memoryPolicy);
    if (memoryPolicy.mode) nextConfig.memory_mode = memoryPolicy.mode;
  }

  if (governance && Object.keys(governance).length > 0) {
    nextConfig.governance = mergeSection(config.governance, governance);
  }

  return nextConfig;
}

function reconcileSandboxCapability(capabilities = [], accessPolicy = {}, agentTypes = []) {
  const normalizedCapabilities = normalizeCapabilities(capabilities);
  const sandboxAllowed = accessPolicy?.sandbox?.allowed;

  if (sandboxAllowed === false) {
    return normalizedCapabilities.filter((value) => value !== SANDBOX_CAPABILITY_KEY);
  }

  if (sandboxAllowed === true && isSandboxEligibleAgentType(agentTypes)) {
    if (!normalizedCapabilities.includes(SANDBOX_CAPABILITY_KEY)) {
      return [...normalizedCapabilities, SANDBOX_CAPABILITY_KEY];
    }
  }

  return normalizedCapabilities;
}

function validateSandboxConfiguration({ agentTypes = [], capabilities = [], accessPolicy = {} } = {}) {
  const normalizedTypes = normalizeAgentTypes(agentTypes);
  const normalizedCapabilities = normalizeCapabilities(capabilities);
  const sandboxRequested = accessPolicy?.sandbox?.allowed === true
    || normalizedCapabilities.includes(SANDBOX_CAPABILITY_KEY);

  if (!sandboxRequested) return null;
  if (isSandboxEligibleAgentType(normalizedTypes)) return null;

  return `Sandbox is restricted to ${Array.from(SANDBOX_ELIGIBLE_AGENT_TYPES).join(', ')} agent types.`;
}

function buildLegacyAccessEntry({ explicitAllowed = null, defaultAllowed = true, source = 'default', extra = {} } = {}) {
  return {
    allowed: explicitAllowed !== null ? explicitAllowed : defaultAllowed,
    source: explicitAllowed !== null ? 'config' : source,
    ...extra,
  };
}

async function resolveAgentAccessPolicy({ workspaceId, agentId, agent = null, db = pool } = {}) {
  const { accessPolicy: configAccessPolicy, provisioning } = getAgentConfigSections(agent || {});
  const normalizedCapabilities = normalizeCapabilities(agent?.capabilities || []);
  const normalizedTypes = normalizeAgentTypes(agent?.type);
  const connectedSocialPlatforms = await listConnectedSocialPlatforms(workspaceId, db).catch(() => []);
  const storedProviders = await listAgentIntegrationProviders(workspaceId, agentId || agent?.id, db).catch(() => []);
  const hasEmailOverrides = await workspaceHasAgentAccessOverrides(workspaceId, ['email'], db).catch(() => false);
  const hasSocialOverrides = await workspaceHasAgentAccessOverrides(
    workspaceId,
    ['social_media', ...connectedSocialPlatforms],
    db
  ).catch(() => false);

  const socialPlatformsFromConfig = normalizeAgentIntegrationProviders(
    configAccessPolicy?.social?.platforms || provisioning?.social?.allowed_platforms
  );
  const socialAccountIdsFromConfig = normalizeStringArray(provisioning?.social?.account_ids);
  const socialBrandIdsFromConfig = normalizeStringArray(provisioning?.social?.brand_ids);
  const socialPlatformsFromLegacy = storedProviders.filter((provider) => connectedSocialPlatforms.includes(provider));

  return {
    email: buildLegacyAccessEntry({
      explicitAllowed: normalizeBoolean(configAccessPolicy?.email?.allowed),
      defaultAllowed: hasEmailOverrides ? storedProviders.includes('email') : true,
      source: hasEmailOverrides ? 'legacy_override' : 'default',
    }),
    social: buildLegacyAccessEntry({
      explicitAllowed: normalizeBoolean(configAccessPolicy?.social?.allowed),
      defaultAllowed: hasSocialOverrides
        ? storedProviders.includes('social_media') || socialPlatformsFromLegacy.length > 0
        : true,
      source: hasSocialOverrides ? 'legacy_override' : 'default',
      extra: {
        platforms: socialPlatformsFromConfig.length > 0 ? socialPlatformsFromConfig : socialPlatformsFromLegacy,
        account_ids: socialAccountIdsFromConfig,
        brand_ids: socialBrandIdsFromConfig,
      },
    }),
    drive: buildLegacyAccessEntry({
      explicitAllowed: normalizeBoolean(configAccessPolicy?.drive?.allowed),
    }),
    calendar: buildLegacyAccessEntry({
      explicitAllowed: normalizeBoolean(configAccessPolicy?.calendar?.allowed),
    }),
    tasks: buildLegacyAccessEntry({
      explicitAllowed: normalizeBoolean(configAccessPolicy?.tasks?.allowed),
    }),
    memory: buildLegacyAccessEntry({
      explicitAllowed: normalizeBoolean(configAccessPolicy?.memory?.allowed),
    }),
    sandbox: {
      allowed: normalizeBoolean(configAccessPolicy?.sandbox?.allowed) !== null
        ? Boolean(configAccessPolicy.sandbox.allowed)
        : normalizedCapabilities.includes(SANDBOX_CAPABILITY_KEY),
      source: normalizeBoolean(configAccessPolicy?.sandbox?.allowed) !== null ? 'config' : 'legacy_capability',
      eligible: isSandboxEligibleAgentType(normalizedTypes),
    },
  };
}

module.exports = {
  ACCESS_POLICY_KEYS,
  SANDBOX_CAPABILITY_KEY,
  normalizeAgentConfig,
  getAgentConfigSections,
  normalizeAccessPolicy,
  normalizeProvisioning,
  normalizeMemoryPolicy,
  normalizeGovernance,
  mergeAgentConfiguration,
  reconcileSandboxCapability,
  validateSandboxConfiguration,
  resolveAgentAccessPolicy,
};
