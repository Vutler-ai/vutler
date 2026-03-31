'use strict';

const { getNexusLimits } = require('../packages/core/middleware/featureGate');

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function getNodeMode(node = {}) {
  const config = node.config || node.metadata || {};
  if (config.mode === 'enterprise' || node.mode === 'enterprise') return 'enterprise';
  if (config.mode === 'local' || node.mode === 'local') return 'local';
  if (config.client_name || config.clientName || node.client_name) return 'enterprise';
  if (node.type === 'local') return 'local';
  return 'standard';
}

async function getWorkspacePlanId(pg, workspaceId = DEFAULT_WORKSPACE) {
  try {
    const settings = await pg.query(
      `SELECT value
         FROM tenant_vutler.workspace_settings
        WHERE workspace_id = $1
          AND key = 'billing_plan'
        LIMIT 1`,
      [workspaceId]
    );
    const raw = settings.rows[0]?.value;
    const planFromSettings = raw && typeof raw === 'object' ? raw.plan : raw;
    if (planFromSettings) return String(planFromSettings).toLowerCase();
  } catch (_) {
    // Fall through to workspaces.plan
  }

  try {
    const workspaces = await pg.query(
      `SELECT plan
         FROM tenant_vutler.workspaces
        WHERE id = $1
        LIMIT 1`,
      [workspaceId]
    );
    return String(workspaces.rows[0]?.plan || 'free').toLowerCase();
  } catch (_) {
    return 'free';
  }
}

async function getWorkspaceNexusUsage(pg, workspaceId = DEFAULT_WORKSPACE) {
  const result = await pg.query(
    `SELECT id, type, mode, status, client_name, config
       FROM tenant_vutler.nexus_nodes
      WHERE workspace_id = $1`,
    [workspaceId]
  );

  const usage = { total: 0, local: 0, enterprise: 0 };
  for (const row of result.rows) {
    if (row.status === 'revoked' || row.status === 'deleted') continue;
    usage.total += 1;
    const mode = getNodeMode(row);
    if (mode === 'enterprise') usage.enterprise += 1;
    if (mode === 'local') usage.local += 1;
  }

  return usage;
}

async function assertNexusProvisionAllowed({ pg, workspaceId, mode }) {
  const planId = await getWorkspacePlanId(pg, workspaceId);
  const limits = getNexusLimits(planId);
  const usage = await getWorkspaceNexusUsage(pg, workspaceId);

  const scopedLimit = mode === 'enterprise' ? limits.enterprise : limits.local;
  const scopedUsage = mode === 'enterprise' ? usage.enterprise : usage.local;

  if (scopedLimit !== -1 && scopedUsage >= scopedLimit) {
    const err = new Error(
      mode === 'enterprise'
        ? `Your ${planId} plan includes ${scopedLimit} Nexus Enterprise node${scopedLimit === 1 ? '' : 's'}. Upgrade billing to deploy another enterprise node.`
        : `Your ${planId} plan includes ${scopedLimit} Nexus Local node${scopedLimit === 1 ? '' : 's'}. Upgrade billing to deploy another local node.`
    );
    err.statusCode = 403;
    err.code = 'NEXUS_LIMIT_REACHED';
    err.details = { mode, planId, limits, usage };
    throw err;
  }

  if (limits.total !== -1 && usage.total >= limits.total) {
    const err = new Error(
      `Your ${planId} plan includes ${limits.total} Nexus node${limits.total === 1 ? '' : 's'} in total. Upgrade billing to deploy another node.`
    );
    err.statusCode = 403;
    err.code = 'NEXUS_TOTAL_LIMIT_REACHED';
    err.details = { mode, planId, limits, usage };
    throw err;
  }

  return { planId, limits, usage };
}

async function getWorkspaceNexusBillingSummary(pg, workspaceId = DEFAULT_WORKSPACE) {
  const planId = await getWorkspacePlanId(pg, workspaceId);
  const limits = getNexusLimits(planId);
  const usage = await getWorkspaceNexusUsage(pg, workspaceId);

  const remaining = {
    total: limits.total === -1 ? -1 : Math.max(0, limits.total - usage.total),
    local: limits.local === -1 ? -1 : Math.max(0, limits.local - usage.local),
    enterprise: limits.enterprise === -1 ? -1 : Math.max(0, limits.enterprise - usage.enterprise),
  };

  return {
    planId,
    limits,
    usage,
    remaining,
    canProvision: {
      local: remaining.local === -1 || remaining.local > 0,
      enterprise: remaining.enterprise === -1 || remaining.enterprise > 0,
      total: remaining.total === -1 || remaining.total > 0,
    },
  };
}

module.exports = {
  DEFAULT_WORKSPACE,
  assertNexusProvisionAllowed,
  getNodeMode,
  getWorkspaceNexusBillingSummary,
  getWorkspaceNexusUsage,
  getWorkspacePlanId,
};
