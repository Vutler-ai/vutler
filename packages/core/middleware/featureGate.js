'use strict';

/**
 * featureGate.js — Single Source of Truth for all Vutler plans.
 *
 * Usage:
 *   const { getPlan, hasFeature, gateFeature } = require('@vutler/core/middleware/featureGate');
 *
 * Limits: -1 means unlimited (enterprise).
 * Features: ['*'] means all features allowed.
 * Prices: in cents (e.g. 2900 = $29.00).
 */

// ---------------------------------------------------------------------------
// Plan definitions
//
// NOTE: LLM usage is BYOK (Bring Your Own Key) — users connect their own
// OpenRouter, Anthropic, or OpenAI key. There are no token_month limits on
// any plan. Token tracking in /usage is for monitoring only, not enforcement.
// ---------------------------------------------------------------------------

const PLANS = {
  free: {
    label: 'Free',
    tier: 'free',
    products: [],
    features: ['chat', 'dashboard'],
    limits: { agents: 1, storage_gb: 0.5, users: 1 },
    snipara: ['context'],
    price: { monthly: 0, yearly: 0 },
  },
  office_starter: {
    label: 'Office Starter',
    tier: 'office',
    products: ['office'],
    features: ['chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'dashboard', 'pixel-office'],
    limits: { agents: 0, storage_gb: 5, users: 1 },
    snipara: ['context'],
    price: { monthly: 2900, yearly: 29000 },
  },
  office_team: {
    label: 'Office Pro',
    tier: 'office',
    products: ['office'],
    features: ['chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'whatsapp', 'dashboard', 'goals', 'crm', 'pixel-office'],
    limits: { agents: 0, storage_gb: 50, users: 5 },
    snipara: ['context'],
    price: { monthly: 7900, yearly: 79000 },
  },
  agents_starter: {
    label: 'Agents Starter',
    tier: 'agents',
    products: ['agents'],
    features: ['agents', 'nexus', 'sandbox', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard', 'cloud_sandbox', 'mobile_dispatch'],
    limits: { agents: 10, storage_gb: 5, users: 1 },
    snipara: ['context', 'memory'],
    price: { monthly: 2900, yearly: 29000 },
  },
  agents_pro: {
    label: 'Agents Pro',
    tier: 'agents',
    products: ['agents'],
    features: ['agents', 'nexus', 'sandbox', 'builder', 'swarm', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard', 'cloud_sandbox', 'mobile_dispatch', 'enterprise_nexus'],
    limits: { agents: 50, storage_gb: 25, users: 5 },
    snipara: ['context', 'memory'],
    price: { monthly: 7900, yearly: 79000 },
  },
  full: {
    label: 'Full Platform',
    tier: 'full',
    products: ['office', 'agents'],
    features: ['*'],
    limits: { agents: 50, storage_gb: 100, users: 10 },
    snipara: ['context', 'memory'],
    price: { monthly: 12900, yearly: 129000 },
  },
  enterprise: {
    label: 'Enterprise',
    tier: 'full',
    products: ['office', 'agents'],
    features: ['*'],
    limits: { agents: 100, storage_gb: 250, users: 20 },
    snipara: ['context', 'memory'],
    price: { monthly: 19900, yearly: 0 }, // $199+/mo, annual is custom
  },
  beta: {
    label: 'Beta',
    tier: 'full',
    products: ['office', 'agents'],
    features: ['*'],
    limits: { agents: 50, storage_gb: 50, users: 5 },
    snipara: ['context', 'memory'],
    price: { monthly: 0, yearly: 0 },
  },
};

/** All valid plan identifiers. */
const VALID_PLAN_IDS = Object.keys(PLANS);

// ---------------------------------------------------------------------------
// Accessor helpers
// ---------------------------------------------------------------------------

/**
 * Returns the plan definition for the given ID, falling back to 'free'.
 * @param {string} planId
 * @returns {object}
 */
function getPlan(planId) {
  return PLANS[planId] || PLANS.free;
}

/**
 * Returns the features array for a plan. ['*'] means all features.
 * @param {string} planId
 * @returns {string[]}
 */
function getAllowedFeatures(planId) {
  return getPlan(planId).features;
}

/**
 * Returns true if the plan grants access to the given feature.
 * Handles the '*' wildcard (enterprise / full / beta).
 * @param {string} planId
 * @param {string} featureName
 * @returns {boolean}
 */
function hasFeature(planId, featureName) {
  const features = getAllowedFeatures(planId);
  return features.includes('*') || features.includes(featureName);
}

/**
 * Returns the limits object for a plan.
 * @param {string} planId
 * @returns {object}
 */
function getPlanLimits(planId) {
  return getPlan(planId).limits;
}

/**
 * Returns true if the plan includes the given Snipara capability.
 * @param {string} planId
 * @param {'context'|'memory'} capability
 * @returns {boolean}
 */
function hasSniparaCapability(planId, capability) {
  return getPlan(planId).snipara.includes(capability);
}

/**
 * Returns true if the plan includes access to the given product.
 * @param {string} planId
 * @param {'office'|'agents'} product
 * @returns {boolean}
 */
function hasProduct(planId, product) {
  return getPlan(planId).products.includes(product);
}

/**
 * Returns the nexus node limits (local, enterprise, total) for a plan.
 * Falls back gracefully for plans that predate the split limits.
 * @param {string} planId
 * @returns {{ local: number, enterprise: number, total: number }}
 */
function getNexusLimits(planId) {
  const plan = getPlan(planId);
  return {
    local: plan.limits.nexus_local ?? plan.limits.nexus_nodes ?? 0,
    enterprise: plan.limits.nexus_enterprise ?? 0,
    total: plan.limits.nexus_nodes ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Express middleware factory. Gates a route behind a feature check.
 * Reads the workspace plan from req.workspacePlan, defaulting to 'free'.
 *
 * @param {string} featureName - Feature key to check (e.g. 'chat', 'agents')
 * @returns {Function} Express middleware
 *
 * @example
 *   router.get('/agents', gateFeature('agents'), handler);
 */
function gateFeature(featureName) {
  return async (req, res, next) => {
    try {
      // Load plan inline if not already set (avoids global async middleware)
      if (!req.workspacePlan) {
        const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
        try {
          const { queryWithWorkspace } = require('../../../services/pg');
          const { rows } = await queryWithWorkspace(
            workspaceId,
            'SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2',
            [workspaceId, 'billing_plan']
          );
          req.workspacePlan = rows[0]?.value?.plan || 'free';
        } catch (_) {
          req.workspacePlan = 'full'; // Default to full in dev/error
        }
      }

      const planId = req.workspacePlan;

      if (hasFeature(planId, featureName)) {
        return next();
      }

      return res.status(403).json({
        error: 'feature_not_available',
        message: `Feature "${featureName}" is not available on your "${planId}" plan.`,
        upgrade_url: '/settings/billing',
      });
    } catch (err) {
      next(); // On any error, let the request through
    }
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  PLANS,
  VALID_PLAN_IDS,
  getPlan,
  getAllowedFeatures,
  hasFeature,
  getPlanLimits,
  hasSniparaCapability,
  hasProduct,
  gateFeature,
  getNexusLimits,
};
