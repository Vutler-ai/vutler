'use strict';

const api = require('./api-client');
const {
  DEFAULT_API_URL,
} = require('./bootstrap');
const {
  getAllowedToolNames,
  resolveWorkspacePlanId,
} = require('./plan-gating');

async function runDoctor({ allToolNames = [] } = {}) {
  const apiUrl = process.env.VUTLER_API_URL || DEFAULT_API_URL;
  const apiKey = process.env.VUTLER_API_KEY || '';
  const hasApiKey = Boolean(String(apiKey).trim());
  const checks = [];
  let planId = null;

  checks.push({
    name: 'environment',
    ok: hasApiKey,
    detail: hasApiKey
      ? 'VUTLER_API_KEY is present.'
      : 'VUTLER_API_KEY is missing. Setup can still write config, but live API checks will fail.',
  });

  if (hasApiKey) {
    try {
      await api.get('/api/v1/agents', { limit: 1 });
      checks.push({
        name: 'workspace_api',
        ok: true,
        detail: 'Authenticated successfully against /api/v1/agents.',
      });
    } catch (error) {
      checks.push({
        name: 'workspace_api',
        ok: false,
        detail: error.message,
      });
    }

    try {
      planId = await resolveWorkspacePlanId();
      const allowedTools = Array.from(getAllowedToolNames(planId, allToolNames));
      checks.push({
        name: 'plan_gating',
        ok: true,
        detail: `Resolved plan ${planId || 'unknown'} with ${allowedTools.length} allowed tools.`,
      });
    } catch (error) {
      checks.push({
        name: 'plan_gating',
        ok: false,
        detail: error.message,
      });
    }
  }

  const allowedTools = hasApiKey
    ? Array.from(getAllowedToolNames(planId, allToolNames))
    : [];
  const ok = checks.every((check) => check.ok);

  return {
    ok,
    apiUrl,
    hasApiKey,
    planId,
    allowedTools,
    checks,
  };
}

function formatDoctorReport(result, { json = false } = {}) {
  if (json) {
    return `${JSON.stringify(result, null, 2)}\n`;
  }

  const lines = [
    'vutler-mcp doctor',
    '',
    `API URL: ${result.apiUrl}`,
    `API key: ${result.hasApiKey ? 'present' : 'missing'}`,
    `Plan: ${result.planId || 'unknown'}`,
    `Allowed tools: ${result.allowedTools.length}`,
    '',
    'Checks:',
    ...result.checks.map((check) => `- [${check.ok ? 'ok' : 'fail'}] ${check.name}: ${check.detail}`),
  ];

  if (result.allowedTools.length > 0) {
    lines.push('');
    lines.push('Allowed tool set:');
    lines.push(result.allowedTools.join(', '));
  }

  return `${lines.join('\n')}\n`;
}

module.exports = {
  runDoctor,
  formatDoctorReport,
};
