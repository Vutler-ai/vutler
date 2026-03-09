'use strict';

const { IntegrationErrorCode, RETRY_POLICY, isRetryable } = require('../api/integrations/errorTaxonomy');

function sanitizeAgentUsername(input) {
  const raw = String(input || '').toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  if (normalized.length >= 3) return normalized;

  return `agent-${Date.now()}`;
}

function deriveAgentIdentity({ agentName, template, config = {} }) {
  const displayName = String(
    agentName ||
    config.agent_name ||
    config.agentName ||
    template?.template_config?.name ||
    template?.name ||
    'Agent'
  ).trim();

  return {
    name: displayName,
    username: sanitizeAgentUsername(displayName),
  };
}

async function executeWithRetry(fn) {
  let attempt = 0;
  while (attempt < RETRY_POLICY.maxAttempts) {
    attempt += 1;
    try {
      return await fn(attempt);
    } catch (err) {
      const code = err && err.code ? err.code : IntegrationErrorCode.INTERNAL_ERROR;
      if (!isRetryable(code) || attempt >= RETRY_POLICY.maxAttempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_POLICY.backoffMs * attempt));
    }
  }
}

async function deployTemplateToAgent({ template, agentName, workspaceId, deployedBy, config = {} }) {
  return executeWithRetry(async () => {
    const identity = deriveAgentIdentity({ agentName, template, config });

    return {
      id: `agent-${Date.now()}`,
      name: identity.name,
      username: identity.username,
      workspace_id: workspaceId,
      deployed_by: deployedBy,
      template_id: template.id,
      status: 'online',
      runtime: template.template_config?.runtime || {},
      config,
      created_at: new Date().toISOString(),
    };
  });
}

module.exports = {
  deployTemplateToAgent,
  executeWithRetry,
  sanitizeAgentUsername,
  deriveAgentIdentity,
};
