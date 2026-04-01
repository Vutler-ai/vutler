'use strict';

const { getNexusLimits, getPlan } = require('../packages/core/middleware/featureGate');
const { DEFAULT_WORKSPACE, getWorkspacePlanId } = require('./workspacePlanService');
const { getWorkspaceBillingAddonSummary } = require('./workspaceBillingAddons');

function getNodeMode(node = {}) {
  const config = node.config || node.metadata || {};
  if (config.mode === 'enterprise' || node.mode === 'enterprise') return 'enterprise';
  if (config.mode === 'local' || node.mode === 'local') return 'local';
  if (config.client_name || config.clientName || node.client_name) return 'enterprise';
  if (node.type === 'local') return 'local';
  return 'standard';
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

async function getWorkspaceEnterpriseSeatUsage(pg, workspaceId = DEFAULT_WORKSPACE) {
  const result = await pg.query(
    `SELECT id, type, mode, status, client_name, config
       FROM tenant_vutler.nexus_nodes
      WHERE workspace_id = $1`,
    [workspaceId]
  );

  let allocated = 0;
  for (const row of result.rows) {
    if (row.status === 'revoked' || row.status === 'deleted') continue;
    if (getNodeMode(row) !== 'enterprise') continue;
    const seatCount = Number(row.config?.max_seats ?? row.config?.seats ?? 0);
    if (Number.isFinite(seatCount) && seatCount > 0) allocated += seatCount;
  }

  return allocated;
}

async function getWorkspaceEnterpriseSeatSummary(pg, workspaceId = DEFAULT_WORKSPACE) {
  const planId = await getWorkspacePlanId(pg, workspaceId);
  const addonSummary = await getWorkspaceBillingAddonSummary(workspaceId, pg).catch(() => ({
    enterpriseSeats: 0,
    enterpriseNodes: 0,
    socialPosts: 0,
    active: [],
  }));
  const plan = getPlan(planId);
  const included = Number(plan?.limits?.nexus_enterprise_seats ?? 0);
  const addOnSeats = Number(addonSummary.enterpriseSeats || 0);
  const allocated = await getWorkspaceEnterpriseSeatUsage(pg, workspaceId);
  const total = included === -1 ? -1 : included + addOnSeats;

  return {
    planId,
    included,
    addOnSeats,
    total,
    allocated,
    available: total === -1 ? -1 : Math.max(0, total - allocated),
  };
}

async function assertNexusProvisionAllowed({ pg, workspaceId, mode }) {
  const planId = await getWorkspacePlanId(pg, workspaceId);
  const addonSummary = await getWorkspaceBillingAddonSummary(workspaceId, pg).catch(() => ({
    enterpriseSeats: 0,
    enterpriseNodes: 0,
    socialPosts: 0,
    active: [],
  }));
  const limits = getNexusLimits(planId);
  if (limits.enterprise !== -1) limits.enterprise += addonSummary.enterpriseNodes;
  if (limits.total !== -1) limits.total += addonSummary.enterpriseNodes;
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
  const addonSummary = await getWorkspaceBillingAddonSummary(workspaceId, pg).catch(() => ({
    enterpriseSeats: 0,
    enterpriseNodes: 0,
    socialPosts: 0,
    active: [],
  }));
  const limits = getNexusLimits(planId);
  if (limits.enterprise !== -1) limits.enterprise += addonSummary.enterpriseNodes;
  if (limits.total !== -1) limits.total += addonSummary.enterpriseNodes;
  const usage = await getWorkspaceNexusUsage(pg, workspaceId);

  const remaining = {
    total: limits.total === -1 ? -1 : Math.max(0, limits.total - usage.total),
    local: limits.local === -1 ? -1 : Math.max(0, limits.local - usage.local),
    enterprise: limits.enterprise === -1 ? -1 : Math.max(0, limits.enterprise - usage.enterprise),
  };
  const seats = await getWorkspaceEnterpriseSeatSummary(pg, workspaceId).catch(() => ({
    planId,
    included: 0,
    addOnSeats: addonSummary.enterpriseSeats,
    total: addonSummary.enterpriseSeats,
    allocated: 0,
    available: addonSummary.enterpriseSeats,
  }));

  return {
    planId,
    limits,
    usage,
    addons: {
      enterpriseSeats: addonSummary.enterpriseSeats,
      enterpriseNodes: addonSummary.enterpriseNodes,
    },
    seats,
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
  getWorkspaceEnterpriseSeatSummary,
  getWorkspaceEnterpriseSeatUsage,
  getWorkspaceNexusBillingSummary,
  getWorkspaceNexusUsage,
  getWorkspacePlanId,
};
