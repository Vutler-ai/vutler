'use strict';

async function executeSkillPlan(plan = {}, context = {}) {
  const skillKey = plan.metadata?.skillKey
    || plan.input?.skillKey
    || plan.params?.skill_key
    || plan.input?.params?.skill_key
    || null;
  if (!skillKey) {
    throw new Error('Skill execution plan is missing a skill key.');
  }

  const { getSkillRegistry } = require('../skills');
  return getSkillRegistry({ wsConnections: context.wsConnections }).execute(skillKey, {
    workspaceId: plan.workspace_id || plan.workspaceId || context.workspaceId || null,
    agentId: plan.selectedAgentId || plan.agentId || context.selectedAgentId || null,
    params: plan.params?.params || plan.input?.params || {},
    model: context.model || plan.metadata?.model || null,
    provider: context.provider || plan.metadata?.provider || null,
    chatActionRunId: context.chatActionRunId || plan.metadata?.chatActionRunId || null,
    chatActionContext: context.chatActionContext || plan.metadata?.chatActionContext || null,
  });
}

module.exports = {
  executeSkillPlan,
};
