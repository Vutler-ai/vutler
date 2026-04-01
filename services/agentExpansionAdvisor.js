'use strict';

const { countCountedSkills, toStringArray } = require('./agentConfigPolicy');
const { getWorkspacePlanId } = require('./workspacePlanService');
const { getPlan } = require('../packages/core/middleware/featureGate');

const DOMAIN_BLUEPRINTS = {
  social: {
    agentType: 'marketing',
    suggestedName: 'Nora',
    role: 'Own social publishing, community feedback, and weekly campaign reporting.',
  },
  email: {
    agentType: 'sales',
    suggestedName: 'Andrea',
    role: 'Own outbound email, inbox triage, and follow-up sequencing.',
  },
  tasks: {
    agentType: 'operations',
    suggestedName: 'Luna',
    role: 'Own execution follow-up, task dispatch, and operational coordination.',
  },
  drive: {
    agentType: 'content',
    suggestedName: 'Philip',
    role: 'Own documents, shared drive organization, and deliverable packaging.',
  },
  calendar: {
    agentType: 'operations',
    suggestedName: 'Victor',
    role: 'Own scheduling, availability checks, and meeting coordination.',
  },
  documentation: {
    agentType: 'content',
    suggestedName: 'Philip',
    role: 'Own templates, briefs, reporting packs, and knowledge assets.',
  },
};

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && value !== '')
      .map((value) => String(value))
  ));
}

function normalizeAgentTypes(agent = {}) {
  const raw = Array.isArray(agent.type)
    ? agent.type
    : agent.type
      ? [agent.type]
      : [];
  return uniqueStrings(raw);
}

function getPersistentSkillCount(agent = {}) {
  return countCountedSkills([
    ...toStringArray(agent.capabilities),
    ...toStringArray(agent.skills),
    ...toStringArray(agent.tools),
  ]);
}

function buildWorkspaceAgentPressure(planId, currentAgentCount) {
  const normalizedPlanId = String(planId || 'free');
  const plan = getPlan(normalizedPlanId);
  const agentLimit = Number(plan?.limits?.agents ?? 0);
  const unlimited = agentLimit < 0;
  const supportsAgents = unlimited || agentLimit > 0;
  const percentUsed = unlimited || agentLimit <= 0
    ? 0
    : Math.round((currentAgentCount / agentLimit) * 100);

  return {
    planId: normalizedPlanId,
    planLabel: plan?.label || normalizedPlanId,
    currentAgentCount,
    agentLimit,
    supportsAgents,
    canAddAgents: unlimited || (agentLimit > 0 && currentAgentCount < agentLimit),
    nearLimit: !unlimited && agentLimit > 0 && currentAgentCount >= Math.max(1, Math.ceil(agentLimit * 0.8)),
    atLimit: !unlimited && agentLimit > 0 && currentAgentCount >= agentLimit,
    usagePercent: percentUsed,
  };
}

function buildSpecializationProfile({
  requestedAgent,
  matchedRules = [],
  availableAgents = [],
  delegatedAgents = [],
} = {}) {
  const persistentSkillCount = getPersistentSkillCount(requestedAgent);
  const agentTypes = normalizeAgentTypes(requestedAgent);
  const domainCount = uniqueStrings(matchedRules.map((rule) => rule?.key || null)).length;
  const specialistCount = availableAgents.length;
  const delegatedDomainCount = uniqueStrings(delegatedAgents.map((entry) => entry?.domain || null)).length;

  let status = 'focused';
  if (persistentSkillCount >= 8 || agentTypes.length >= 3 || domainCount >= 3) {
    status = 'super_agent_risk';
  } else if (persistentSkillCount >= 6 || agentTypes.length >= 2 || domainCount >= 2 || delegatedDomainCount >= 1) {
    status = 'stretching';
  }

  return {
    status,
    persistentSkillCount,
    agentTypes,
    detectedDomains: uniqueStrings(matchedRules.map((rule) => rule?.key || null)),
    delegatedDomainCount,
    availableAgentCount: specialistCount,
  };
}

function buildCreateAgentRecommendation(rule, workspacePressure) {
  const blueprint = DOMAIN_BLUEPRINTS[rule?.key] || null;
  return {
    type: 'create_specialist_agent',
    priority: workspacePressure?.canAddAgents ? 'high' : 'medium',
    domain: rule?.key || null,
    title: blueprint
      ? `Create a dedicated ${blueprint.agentType} agent`
      : 'Create a dedicated specialist agent',
    reason: `Requests touching ${rule?.key || 'this domain'} should live in a dedicated execution lane instead of stretching a single generalist.`,
    suggested_agent_type: blueprint?.agentType || null,
    suggested_name: blueprint?.suggestedName || null,
    suggested_role: blueprint?.role || null,
    upgrade_required: workspacePressure ? !workspacePressure.canAddAgents : false,
  };
}

function buildSplitRecommendation(profile) {
  return {
    type: 'split_agent_scope',
    priority: profile.status === 'super_agent_risk' ? 'high' : 'medium',
    title: 'Split the current agent scope',
    reason: `This agent is carrying ${profile.persistentSkillCount} persistent skills across ${Math.max(profile.agentTypes.length, 1)} role lane(s) and ${Math.max(profile.detectedDomains.length, 1)} active domain(s).`,
    suggested_scope_count: Math.max(2, profile.detectedDomains.length || profile.agentTypes.length || 2),
    suggested_domains: profile.detectedDomains,
  };
}

function buildUpgradeRecommendation(workspacePressure, recommendations = []) {
  const currentPlan = String(workspacePressure?.planId || 'free');
  const recommendedPlan = (!workspacePressure?.supportsAgents || currentPlan === 'free' || currentPlan.startsWith('office_'))
    ? 'agents_starter'
    : 'agents_pro';
  return {
    type: 'upgrade_plan_for_agents',
    priority: 'high',
    title: (!workspacePressure?.supportsAgents || currentPlan === 'free' || currentPlan.startsWith('office_'))
      ? 'Upgrade to an Agents plan'
      : workspacePressure?.supportsAgents
      ? 'Upgrade plan to unlock more agent lanes'
      : 'Upgrade to an Agents plan',
    reason: recommendations.length > 0
      ? `Your current ${workspacePressure?.planLabel || 'workspace'} plan cannot absorb the specialist agents suggested by current workload patterns.`
      : `Your current ${workspacePressure?.planLabel || 'workspace'} plan is close to its agent limit.`,
    current_plan: workspacePressure?.planId || 'free',
    current_agents: workspacePressure?.currentAgentCount || 0,
    current_limit: workspacePressure?.agentLimit ?? 0,
    recommended_plan: recommendedPlan,
  };
}

async function evaluateAgentExpansion({
  workspaceId,
  requestedAgent = null,
  availableAgents = [],
  matchedRules = [],
  delegatedAgents = [],
  db,
} = {}) {
  const planId = await getWorkspacePlanId(db, workspaceId).catch(() => 'free');
  const workspacePressure = buildWorkspaceAgentPressure(planId, availableAgents.length);
  const profile = buildSpecializationProfile({
    requestedAgent,
    matchedRules,
    availableAgents,
    delegatedAgents,
  });

  const recommendations = [];
  const matchedRuleKeys = new Set(matchedRules.map((rule) => rule?.key).filter(Boolean));
  const delegatedDomains = new Set(delegatedAgents.map((entry) => entry?.domain).filter(Boolean));

  for (const rule of matchedRules) {
    if (!rule?.key) continue;
    const missingSpecialist = !delegatedDomains.has(rule.key)
      && availableAgents.length <= 1
      && matchedRuleKeys.size >= 1;
    if (rule.delegateByDefault && missingSpecialist) {
      recommendations.push(buildCreateAgentRecommendation(rule, workspacePressure));
    }
  }

  if ((profile.status === 'stretching' || profile.status === 'super_agent_risk')
      && (profile.persistentSkillCount >= 6 || profile.detectedDomains.length >= 2 || profile.agentTypes.length >= 2)) {
    recommendations.push(buildSplitRecommendation(profile));
  }

  if ((workspacePressure.atLimit || (!workspacePressure.canAddAgents && recommendations.length > 0))
      && !recommendations.some((entry) => entry.type === 'upgrade_plan_for_agents')) {
    recommendations.push(buildUpgradeRecommendation(workspacePressure, recommendations));
  }

  return {
    workspacePressure,
    specializationProfile: profile,
    recommendations,
  };
}

module.exports = {
  DOMAIN_BLUEPRINTS,
  buildWorkspaceAgentPressure,
  buildSpecializationProfile,
  evaluateAgentExpansion,
};
