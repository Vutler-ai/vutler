'use strict';

const api = require('./api-client');
const {
  DEFAULT_API_URL,
  inspectClientConfig,
} = require('./bootstrap');
const {
  getAllowedToolNames,
  resolveWorkspacePlanId,
} = require('./plan-gating');

async function runDoctor({
  allToolNames = [],
  clientName = null,
  filePath = null,
  cwd = process.cwd(),
} = {}) {
  const apiUrl = process.env.VUTLER_API_URL || DEFAULT_API_URL;
  const apiKey = process.env.VUTLER_API_KEY || '';
  const hasApiKey = Boolean(String(apiKey).trim());
  const checks = [];
  let planId = null;
  let clientConfig = null;

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

  if (clientName || filePath) {
    clientConfig = inspectClientConfig({
      clientName: clientName || 'claude-code',
      filePath,
      cwd,
    });

    checks.push({
      name: 'client_config_path',
      ok: clientConfig.exists,
      detail: clientConfig.exists
        ? `Found ${clientConfig.label} config at ${clientConfig.path}.`
        : `No ${clientConfig.label} config found at ${clientConfig.path}.`,
    });

    if (clientConfig.exists) {
      checks.push({
        name: 'client_config_json',
        ok: clientConfig.validJson,
        detail: clientConfig.validJson
          ? `Config file at ${clientConfig.path} is valid JSON.`
          : clientConfig.issues.find((issue) => issue.includes('not valid JSON'))
            || `Config file at ${clientConfig.path} is not valid JSON.`,
      });
    }

    if (clientConfig.validJson) {
      checks.push({
        name: 'client_config_server',
        ok: clientConfig.hasVutlerServer,
        detail: clientConfig.hasVutlerServer
          ? `Config defines mcpServers.vutler with API URL ${clientConfig.apiUrl}.`
          : clientConfig.issues.find((issue) => issue.includes('does not define mcpServers.vutler'))
            || 'Config does not define mcpServers.vutler.',
      });
    }

    if (clientConfig.hasVutlerServer) {
      checks.push({
        name: 'client_config_command',
        ok: clientConfig.usesExpectedPackage,
        detail: clientConfig.usesExpectedPackage
          ? 'Config launches @vutler/mcp through npx.'
          : clientConfig.issues.find((issue) => issue.includes('launch @vutler/mcp'))
            || 'Config does not launch @vutler/mcp via npx.',
      });
      checks.push({
        name: 'client_config_api_key',
        ok: clientConfig.apiKeyState === 'embedded',
        detail: clientConfig.apiKeyState === 'embedded'
          ? 'Client config contains a non-placeholder VUTLER_API_KEY.'
          : clientConfig.apiKeyState === 'placeholder'
            ? 'Client config still uses the placeholder VUTLER_API_KEY.'
            : 'Client config does not set VUTLER_API_KEY.',
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
    clientConfig,
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
  ];

  if (result.clientConfig) {
    lines.push(`Client config: ${result.clientConfig.label}`);
    lines.push(`Config path: ${result.clientConfig.path}`);
    lines.push(`Config ready: ${result.clientConfig.ready ? 'yes' : 'no'}`);
  }

  lines.push('');
  lines.push('Checks:');
  lines.push(...result.checks.map((check) => `- [${check.ok ? 'ok' : 'fail'}] ${check.name}: ${check.detail}`));

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
