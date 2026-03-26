'use strict';

/**
 * Feature Gate Middleware
 * Controls access to Office/Agents features based on workspace plan.
 *
 * Plans:
 *  - 'office'  → chat, drive, email, tasks, calendar, integrations, whatsapp
 *  - 'agents'  → agents, nexus, marketplace, sandbox, builder, swarm, automations, llm, tools
 *  - 'full'    → everything (default for existing workspaces)
 */

const PLAN_FEATURES = {
  office: [
    'chat', 'drive', 'email', 'tasks', 'calendar',
    'integrations', 'whatsapp', 'dashboard', 'goals',
  ],
  agents: [
    'agents', 'nexus', 'marketplace', 'sandbox', 'builder',
    'swarm', 'automations', 'llm', 'tools', 'runtime',
    'deployments', 'templates', 'knowledge',
  ],
  full: ['*'],
};

// Snipara capabilities per plan
const PLAN_SNIPARA = {
  office: ['context'],                // rlm_context_query, rlm_search only
  agents: ['context', 'memory'],      // + rlm_remember, rlm_recall, swarm tools
  full:   ['context', 'memory'],
};

/**
 * Express middleware factory.
 * @param {string} feature - Feature key to check (e.g. 'chat', 'agents')
 */
function gateFeature(feature) {
  return (req, res, next) => {
    const plan = req.workspace?.plan || 'full';
    const allowed = PLAN_FEATURES[plan] || [];

    if (allowed.includes('*') || allowed.includes(feature)) {
      return next();
    }

    return res.status(403).json({
      error: 'feature_not_available',
      message: `Feature "${feature}" is not available on your "${plan}" plan.`,
      upgrade_url: '/settings/billing',
    });
  };
}

/**
 * Check if a workspace has access to a Snipara capability.
 * @param {string} plan - Workspace plan
 * @param {'context'|'memory'} capability - Snipara capability
 * @returns {boolean}
 */
function hasSniparaCapability(plan, capability) {
  const caps = PLAN_SNIPARA[plan] || PLAN_SNIPARA.full;
  return caps.includes(capability);
}

/**
 * Returns all allowed features for a plan (used by frontend sidebar).
 * @param {string} plan
 * @returns {string[]}
 */
function getAllowedFeatures(plan) {
  if (plan === 'full') {
    return [...PLAN_FEATURES.office, ...PLAN_FEATURES.agents];
  }
  return PLAN_FEATURES[plan] || [];
}

module.exports = {
  gateFeature,
  hasSniparaCapability,
  getAllowedFeatures,
  PLAN_FEATURES,
  PLAN_SNIPARA,
};
