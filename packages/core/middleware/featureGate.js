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
// ---------------------------------------------------------------------------

const PLANS = {
  free: {
    label: 'Free',
    tier: 'free',
    products: [],
    features: [],
    limits: { agents: 1, tokens_month: 50000, storage_gb: 1 },
    snipara: ['context'],
    price: { monthly: 0, yearly: 0 },
  },
  office_starter: {
    label: 'Office Starter',
    tier: 'office',
    products: ['office'],
    features: ['chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'whatsapp', 'dashboard', 'goals', 'crm', 'pixel-office'],
    limits: { agents: 0, tokens_month: 100000, storage_gb: 10 },
    snipara: ['context'],
    price: { monthly: 2900, yearly: 29000 },
  },
  office_team: {
    label: 'Office Team',
    tier: 'office',
    products: ['office'],
    features: ['chat', 'drive', 'email', 'tasks', 'calendar', 'integrations', 'whatsapp', 'dashboard', 'goals', 'crm', 'pixel-office'],
    limits: { agents: 0, tokens_month: 500000, storage_gb: 100 },
    snipara: ['context'],
    price: { monthly: 7900, yearly: 79000 },
  },
  agents_starter: {
    label: 'Agents Starter',
    tier: 'agents',
    products: ['agents'],
    features: ['agents', 'nexus', 'marketplace', 'sandbox', 'builder', 'swarm', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard'],
    limits: { agents: 25, tokens_month: 250000, storage_gb: 10, nexus_nodes: 2 },
    snipara: ['context', 'memory'],
    price: { monthly: 2900, yearly: 29000 },
  },
  agents_pro: {
    label: 'Agents Pro',
    tier: 'agents',
    products: ['agents'],
    features: ['agents', 'nexus', 'marketplace', 'sandbox', 'builder', 'swarm', 'automations', 'llm-settings', 'tools', 'runtime', 'deployments', 'templates', 'knowledge', 'providers', 'dashboard'],
    limits: { agents: 100, tokens_month: 1000000, storage_gb: 100, nexus_nodes: 10 },
    snipara: ['context', 'memory'],
    price: { monthly: 7900, yearly: 79000 },
  },
  full: {
    label: 'Full Platform',
    tier: 'full',
    products: ['office', 'agents'],
    features: ['*'],
    limits: { agents: 100, tokens_month: 1000000, storage_gb: 100, nexus_nodes: 10 },
    snipara: ['context', 'memory'],
    price: { monthly: 12900, yearly: 129000 },
  },
  enterprise: {
    label: 'Enterprise',
    tier: 'full',
    products: ['office', 'agents'],
    features: ['*'],
    limits: { agents: -1, tokens_month: -1, storage_gb: -1, nexus_nodes: -1 },
    snipara: ['context', 'memory'],
    price: { monthly: 0, yearly: 0 }, // custom pricing
  },
  beta: {
    label: 'Beta',
    tier: 'full',
    products: ['office', 'agents'],
    features: ['*'],
    limits: { agents: 50, tokens_month: 500000, storage_gb: 50, nexus_nodes: 5 },
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
  return (req, res, next) => {
    const planId = req.workspacePlan || 'free';

    if (hasFeature(planId, featureName)) {
      return next();
    }

    return res.status(403).json({
      error: 'feature_not_available',
      message: `Feature "${featureName}" is not available on your "${planId}" plan.`,
      upgrade_url: '/settings/billing',
    });
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
};
