'use strict';

const pool = require('../lib/vaultbrix');

const SCHEMA = 'tenant_vutler';

function normalizeEmail(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || null;
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

function getConfiguredEmailProvisioning(agent = null) {
  const config = normalizeAgentConfig(agent?.config || {});
  const emailConfig = config?.provisioning?.email;
  if (!emailConfig || typeof emailConfig !== 'object' || Array.isArray(emailConfig)) {
    return {
      provisioned: null,
      email: null,
    };
  }

  const provisioned = typeof emailConfig.provisioned === 'boolean' ? emailConfig.provisioned : null;
  const email = normalizeEmail(emailConfig.address || emailConfig.email);
  return {
    provisioned,
    email,
  };
}

async function resolveAgentEmailProvisioning({ workspaceId, agentId, agent = null, db = pool } = {}) {
  const configuredProvisioning = getConfiguredEmailProvisioning(agent);
  if (configuredProvisioning.provisioned === false) {
    return {
      provisioned: false,
      email: configuredProvisioning.email,
      source: 'config',
    };
  }
  if (configuredProvisioning.provisioned === true || configuredProvisioning.email) {
    return {
      provisioned: true,
      email: configuredProvisioning.email,
      source: 'config',
    };
  }

  const directEmail = normalizeEmail(agent?.email || agent?.email_address || agent?.emailAddress);
  if (directEmail) {
    return {
      provisioned: true,
      email: directEmail,
      source: 'agent',
    };
  }

  if (!workspaceId || !agentId || !db?.query) {
    return {
      provisioned: false,
      email: null,
      source: 'none',
    };
  }

  try {
    const routeResult = await db.query(
      `SELECT email_address
       FROM ${SCHEMA}.email_routes
       WHERE workspace_id = $1
         AND agent_id::text = $2
       ORDER BY created_at ASC
       LIMIT 1`,
      [workspaceId, String(agentId)]
    );
    const routedEmail = normalizeEmail(routeResult.rows[0]?.email_address);
    if (routedEmail) {
      return {
        provisioned: true,
        email: routedEmail,
        source: 'email_route',
      };
    }
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') throw err;
  }

  try {
    const agentResult = await db.query(
      `SELECT email
       FROM ${SCHEMA}.agents
       WHERE workspace_id = $1
         AND id::text = $2
       LIMIT 1`,
      [workspaceId, String(agentId)]
    );
    const fallbackEmail = normalizeEmail(agentResult.rows[0]?.email);
    if (fallbackEmail) {
      return {
        provisioned: true,
        email: fallbackEmail,
        source: 'agent_record',
      };
    }
  } catch (err) {
    if (err?.code !== '42P01' && err?.code !== '42703') throw err;
  }

  return {
    provisioned: false,
    email: null,
    source: 'none',
  };
}

function agentHasProvisionedEmail(agent = null, provisioning = null) {
  const configuredProvisioning = getConfiguredEmailProvisioning(agent);
  if (configuredProvisioning.provisioned === false) return false;
  if (configuredProvisioning.provisioned === true || configuredProvisioning.email) return true;
  if (provisioning?.provisioned) return true;
  return Boolean(normalizeEmail(agent?.email || agent?.email_address || agent?.emailAddress));
}

function filterProvisionedSkillKeys(skillKeys = [], { agent = null, emailProvisioning = null } = {}) {
  return skillKeys.filter((skillKey) => {
    const normalized = String(skillKey || '').trim().toLowerCase();
    if (!normalized.startsWith('email_')) return true;
    return agentHasProvisionedEmail(agent, emailProvisioning);
  });
}

function getProvisioningReasonForSkill(skillKey, { agent = null, emailProvisioning = null } = {}) {
  const normalized = String(skillKey || '').trim().toLowerCase();
  if (!normalized.startsWith('email_')) return null;
  if (agentHasProvisionedEmail(agent, emailProvisioning)) return null;
  return 'Email is not provisioned for this agent.';
}

function getUnavailableAgentProviders(providers = [], { agent = null, emailProvisioning = null } = {}) {
  return providers
    .map((provider) => String(provider || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((provider) => provider === 'email' && !agentHasProvisionedEmail(agent, emailProvisioning))
    .map((provider) => ({
      key: provider,
      available: false,
      reason: 'Email is not provisioned for this agent.',
      source: 'agent_provisioning',
    }));
}

module.exports = {
  resolveAgentEmailProvisioning,
  agentHasProvisionedEmail,
  filterProvisionedSkillKeys,
  getProvisioningReasonForSkill,
  getUnavailableAgentProviders,
  getConfiguredEmailProvisioning,
};
