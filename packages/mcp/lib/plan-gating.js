'use strict';

const api = require('./api-client');

const PLAN_TOOL_MATRIX = {
  free: new Set([
    'list_agents',
    'run_agent',
    'stop_agent',
  ]),
  office_starter: new Set([
    'list_agents',
    'run_agent',
    'stop_agent',
    'send_email',
    'list_emails',
    'read_email',
    'list_tasks',
    'create_task',
    'update_task',
    'list_files',
    'upload_file',
    'download_file',
    'list_events',
    'create_event',
    'send_chat',
    'search_memory',
  ]),
  office_team: new Set([
    'list_agents',
    'run_agent',
    'stop_agent',
    'send_email',
    'list_emails',
    'read_email',
    'list_tasks',
    'create_task',
    'update_task',
    'list_files',
    'upload_file',
    'download_file',
    'list_events',
    'create_event',
    'send_chat',
    'search_memory',
    'list_clients',
    'create_client',
  ]),
  agents_starter: new Set([
    'list_agents',
    'run_agent',
    'stop_agent',
    'search_memory',
  ]),
  agents_pro: new Set([
    'list_agents',
    'run_agent',
    'stop_agent',
    'search_memory',
  ]),
  full: 'all',
  nexus_enterprise: 'all',
  enterprise: 'all',
  beta: 'all',
};

const PLAN_CACHE_TTL_MS = 30_000;
let cachedPlan = { planId: null, expiresAt: 0 };

function normalizePlanId(planId) {
  return String(planId || 'free').trim().toLowerCase() || 'free';
}

async function resolveWorkspacePlanId() {
  if (process.env.VUTLER_MCP_DISABLE_PLAN_GATING === 'true') {
    return null;
  }

  if (cachedPlan.expiresAt > Date.now()) {
    return cachedPlan.planId;
  }

  try {
    const result = await api.get('/api/v1/billing/subscription');
    const planId = normalizePlanId(
      result?.data?.planId
      || result?.data?.plan
      || result?.planId
      || result?.plan
      || result?.subscription?.planId
    );

    cachedPlan = {
      planId,
      expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
    };
    return planId;
  } catch (_) {
    cachedPlan = {
      planId: 'free',
      expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
    };
    return 'free';
  }
}

function getAllowedToolNames(planId, allToolNames = []) {
  if (!planId) {
    return process.env.VUTLER_MCP_DISABLE_PLAN_GATING === 'true'
      ? new Set(allToolNames)
      : PLAN_TOOL_MATRIX.free;
  }
  const allowed = PLAN_TOOL_MATRIX[normalizePlanId(planId)];
  if (allowed === 'all') return new Set(allToolNames);
  if (!allowed) return PLAN_TOOL_MATRIX.free;
  return allowed;
}

function isToolAllowed(planId, toolName, allToolNames = []) {
  return getAllowedToolNames(planId, allToolNames).has(toolName);
}

module.exports = {
  getAllowedToolNames,
  isToolAllowed,
  resolveWorkspacePlanId,
};
