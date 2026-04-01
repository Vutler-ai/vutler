'use strict';

const { getWorkspacePlanId } = require('./workspacePlanService');
const { getPlan } = require('../packages/core/middleware/featureGate');
const { listConnectedWorkspaceIntegrationProviders } = require('./agentIntegrationService');
const skillHandlers = require('../seeds/skill-handlers.json');

const PROVIDER_SPECS = {
  project_management: {
    requiresConnection: false,
    isAvailable({ features, products }) {
      return features.has('tasks') || features.has('swarm') || features.has('runtime')
        || products.has('office') || products.has('agents');
    },
    unavailableReason: 'Project/task execution is not enabled in the current workspace plan.',
  },
  workspace_drive: {
    requiresConnection: false,
    isAvailable({ features, products }) {
      return features.has('drive') || features.has('knowledge') || features.has('runtime')
        || products.has('office') || products.has('agents');
    },
    unavailableReason: 'Shared drive access is not enabled in the current workspace plan.',
  },
  vutler_calendar: {
    requiresConnection: false,
    isAvailable({ features, products }) {
      return features.has('calendar') || features.has('runtime')
        || products.has('office') || products.has('agents');
    },
    unavailableReason: 'Calendar execution is not enabled in the current workspace plan.',
  },
  email: {
    requiresConnection: false,
    isAvailable({ features, products }) {
      return features.has('email') || features.has('integrations') || features.has('tools')
        || features.has('runtime') || products.has('office') || products.has('agents');
    },
    unavailableReason: 'Email execution is not enabled in the current workspace plan.',
  },
  google: {
    requiresConnection: true,
    isAvailable({ features, products, connectedProviders }) {
      const planAllows = features.has('integrations') || features.has('tools') || features.has('providers')
        || features.has('runtime') || products.has('office') || products.has('agents');
      return planAllows && connectedProviders.has('google');
    },
    unavailableReason({ features, products, connectedProviders }) {
      const planAllows = features.has('integrations') || features.has('tools') || features.has('providers')
        || features.has('runtime') || products.has('office') || products.has('agents');
      if (!planAllows) return 'Google-backed tools are not enabled in the current workspace plan.';
      if (!connectedProviders.has('google')) return 'Google is not connected for this workspace.';
      return 'Google-backed tools are not available.';
    },
  },
  social_media: {
    requiresConnection: true,
    isAvailable({ features, products, limits, connectedProviders }) {
      const planAllows = features.has('integrations') || features.has('tools') || features.has('providers')
        || features.has('runtime') || products.has('office') || products.has('agents');
      const quotaAllows = Number(limits.social_posts_month ?? 0) !== 0;
      return planAllows && quotaAllows && connectedProviders.has('social_media');
    },
    unavailableReason({ features, products, limits, connectedProviders }) {
      const planAllows = features.has('integrations') || features.has('tools') || features.has('providers')
        || features.has('runtime') || products.has('office') || products.has('agents');
      if (!planAllows) return 'Social tooling is not enabled in the current workspace plan.';
      if (Number(limits.social_posts_month ?? 0) === 0) return 'Social posting is not included in the current workspace plan.';
      if (!connectedProviders.has('social_media')) return 'No social media account is connected for this workspace.';
      return 'Social tooling is not available.';
    },
  },
  sandbox: {
    requiresConnection: false,
    isAvailable({ features, products }) {
      return features.has('sandbox') || features.has('tools') || features.has('runtime') || products.has('agents');
    },
    unavailableReason: 'Sandbox execution is not enabled in the current workspace plan.',
  },
  web_search: {
    requiresConnection: false,
    isAvailable({ features, products }) {
      return features.has('tools') || features.has('runtime') || products.has('agents');
    },
    unavailableReason: 'Tool execution is not enabled in the current workspace plan.',
  },
};

const SKILL_PROVIDER_PREFIXES = [
  ['workspace_drive', 'workspace_drive'],
  ['vutler_calendar', 'vutler_calendar'],
  ['email_', 'email'],
  ['google_calendar', 'google'],
  ['google_drive', 'google'],
  ['social_', 'social_media'],
  ['task_', 'project_management'],
  ['project_', 'project_management'],
];

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))
  ));
}

function evaluateProvider(provider, context) {
  const spec = PROVIDER_SPECS[provider];
  if (!spec) {
    return {
      key: provider,
      available: true,
      reason: null,
      requires_connection: false,
      connected: null,
      source: 'unregistered',
    };
  }

  const available = Boolean(spec.isAvailable(context));
  const reason = available
    ? null
    : (typeof spec.unavailableReason === 'function' ? spec.unavailableReason(context) : spec.unavailableReason);

  return {
    key: provider,
    available,
    reason,
    requires_connection: Boolean(spec.requiresConnection),
    connected: spec.requiresConnection ? context.connectedProviders.has(provider) : null,
    source: spec.requiresConnection ? 'integration' : 'internal',
  };
}

function inferProviderForSkill(skillKey) {
  const normalized = String(skillKey || '').trim().toLowerCase();
  if (!normalized) return null;

  const manifestEntry = skillHandlers[normalized];
  if (manifestEntry?.type === 'integration' && manifestEntry.integration_provider) {
    const provider = String(manifestEntry.integration_provider).trim().toLowerCase();
    if (provider === 'google_calendar' || provider === 'google_drive') return 'google';
    return provider;
  }

  for (const [prefix, provider] of SKILL_PROVIDER_PREFIXES) {
    if (normalized.startsWith(prefix)) return provider;
  }

  return null;
}

async function resolveWorkspaceCapabilityAvailability({ workspaceId, db } = {}) {
  const planId = await getWorkspacePlanId(db, workspaceId).catch(() => 'free');
  const plan = getPlan(planId);
  const features = new Set(Array.isArray(plan?.features) ? plan.features : []);
  const products = new Set(Array.isArray(plan?.products) ? plan.products : []);
  const limits = plan?.limits || {};
  const connectedProviders = await listConnectedWorkspaceIntegrationProviders(workspaceId, db).catch(() => new Set());

  const providerStates = {};
  for (const provider of Object.keys(PROVIDER_SPECS)) {
    providerStates[provider] = evaluateProvider(provider, {
      planId,
      plan,
      features,
      products,
      limits,
      connectedProviders,
    });
  }

  return {
    planId,
    planLabel: plan?.label || planId,
    planFeatures: Array.from(features),
    planProducts: Array.from(products),
    planLimits: limits,
    connectedProviders: Array.from(connectedProviders),
    providerStates,
    availableProviders: Object.values(providerStates).filter((entry) => entry.available).map((entry) => entry.key),
    unavailableProviders: Object.values(providerStates).filter((entry) => !entry.available),
  };
}

function isProviderAvailable(snapshot, provider) {
  if (!provider) return true;
  const entry = snapshot?.providerStates?.[provider];
  if (!entry) return true;
  return Boolean(entry.available);
}

function filterAvailableProviders(providers = [], snapshot) {
  return uniqueStrings(providers).filter((provider) => isProviderAvailable(snapshot, provider));
}

function getUnavailableProviders(providers = [], snapshot) {
  return uniqueStrings(providers)
    .map((provider) => snapshot?.providerStates?.[provider] || {
      key: provider,
      available: true,
      reason: null,
    })
    .filter((entry) => !entry.available);
}

function filterAvailableSkillKeys(skillKeys = [], snapshot) {
  return uniqueStrings(skillKeys).filter((skillKey) => {
    const provider = inferProviderForSkill(skillKey);
    return provider ? isProviderAvailable(snapshot, provider) : true;
  });
}

module.exports = {
  PROVIDER_SPECS,
  resolveWorkspaceCapabilityAvailability,
  isProviderAvailable,
  filterAvailableProviders,
  getUnavailableProviders,
  filterAvailableSkillKeys,
  inferProviderForSkill,
};
