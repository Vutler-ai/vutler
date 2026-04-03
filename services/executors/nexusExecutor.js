'use strict';

async function executeNexusPlan(plan = {}, context = {}) {
  const toolName = plan.metadata?.toolName || plan.toolName || plan.params?.tool_name || null;
  const nodeId = context.nexusNodeId || plan.metadata?.nexusNodeId || null;
  if (!toolName) {
    throw new Error('Nexus execution plan is missing a tool name.');
  }
  if (!nodeId) {
    throw new Error('Nexus execution requires a node id.');
  }

  const { executeNexusTool } = require('../nexusTools');
  const args = {
    ...(plan.params?.args || plan.input?.params || {}),
  };
  const effectiveAgentId = args.agentId || args.agent_id || plan.selectedAgentId || plan.agentId || context.selectedAgentId || null;
  if (effectiveAgentId && !args.agentId && !args.agent_id) {
    args.agentId = effectiveAgentId;
  }

  return executeNexusTool(nodeId, toolName, args, {
    wsConnections: context.wsConnections || null,
    workspaceId: context.workspaceId || null,
    db: context.db || null,
  });
}

module.exports = {
  executeNexusPlan,
};
