'use strict';

const crypto = require('crypto');
const { deployTemplateToAgent, deriveAgentIdentity } = require('../../services/nexusService');

const deployments = new Map();

function createDeployment({ template, workspaceId, deployedBy, agentName, config }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const identity = deriveAgentIdentity({ agentName, template, config });
  const deployment = {
    id,
    template_id: template.id,
    workspace_id: workspaceId,
    deployed_by: deployedBy,
    agent_id: null,
    agent_name: identity.name,
    status: 'pending',
    progress_percent: 0,
    template_snapshot: template,
    deployment_config: config || {},
    error: null,
    started_at: now,
    completed_at: null,
  };
  deployments.set(id, deployment);

  setTimeout(async () => {
    try {
      deployment.status = 'in_progress';
      deployment.progress_percent = 55;
      const agent = await deployTemplateToAgent({
        template,
        agentName: identity.name,
        workspaceId,
        deployedBy,
        config,
      });
      deployment.agent_id = agent.id;
      deployment.status = 'success';
      deployment.progress_percent = 100;
      deployment.completed_at = new Date().toISOString();
    } catch (err) {
      deployment.status = 'failed';
      deployment.error = {
        code: err.code || 'internal_error',
        message: err.message || 'Deployment failed',
        actionable: true,
        help_url: '/help/marketplace-deploy',
      };
      deployment.completed_at = new Date().toISOString();
    }
  }, 50);

  return deployment;
}

function getDeploymentStatus(id) {
  return deployments.get(id) || null;
}

module.exports = {
  createDeployment,
  getDeploymentStatus,
};
