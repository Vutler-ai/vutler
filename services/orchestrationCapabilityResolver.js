'use strict';

const {
  listConnectedWorkspaceIntegrationProviders,
  getSkillKeysForIntegrationProviders,
} = require('./agentIntegrationService');
const { evaluateAgentExpansion } = require('./agentExpansionAdvisor');
const {
  resolveWorkspaceCapabilityAvailability,
  filterAvailableProviders,
  getUnavailableProviders,
  filterAvailableSkillKeys,
} = require('./runtimeCapabilityAvailability');
const {
  resolveAgentEmailProvisioning,
  agentHasProvisionedEmail,
} = require('./agentProvisioningService');

const DOMAIN_RULES = [
  {
    key: 'social',
    patterns: [
      'linkedin', 'twitter', 'x ', 'post ', 'publish', 'social', 'campaign', 'thread',
      'tweet', 'followers', 'engagement', 'reach', 'impressions', 'community',
    ],
    preferredAgents: ['nora', 'luna', 'max'],
    overlayProviders: ['social_media'],
    overlaySkills: ['content_scheduling', 'social_analytics', 'engagement_monitoring', 'multi_platform_posting'],
    delegateByDefault: true,
  },
  {
    key: 'email',
    patterns: ['email', 'mail', 'reply', 'send', 'draft', 'inbox', 'outreach'],
    preferredAgents: ['andrea', 'max', 'nora', 'luna'],
    overlayProviders: ['email'],
    overlaySkills: ['email_outreach'],
    delegateByDefault: true,
  },
  {
    key: 'tasks',
    patterns: ['task', 'tache', 'tâche', 'assign', 'delegat', 'delegate', 'follow up', 'follow-up'],
    preferredAgents: ['jarvis', 'victor', 'mike'],
    overlayProviders: ['project_management'],
    overlaySkills: ['task_management', 'status_reporting'],
    delegateByDefault: false,
  },
  {
    key: 'drive',
    patterns: ['drive', 'folder', 'file', 'document', 'save', 'write this', 'upload', 'workspace'],
    preferredAgents: ['philip', 'luna', 'mike'],
    overlayProviders: ['workspace_drive'],
    overlaySkills: [
      'workspace_drive_list',
      'workspace_drive_search',
      'workspace_drive_read',
      'workspace_drive_write',
      'workspace_drive_create_folder',
    ],
    delegateByDefault: false,
  },
  {
    key: 'calendar',
    patterns: ['calendar', 'meeting', 'invite', 'schedule', 'availability', 'event'],
    preferredAgents: ['andrea', 'victor', 'jarvis'],
    overlayProviders: ['vutler_calendar', 'google'],
    overlaySkills: [
      'vutler_calendar_list',
      'vutler_calendar_create',
      'vutler_calendar_update',
      'google_calendar_list',
      'google_calendar_create',
      'google_calendar_update',
      'google_calendar_check_availability',
    ],
    delegateByDefault: false,
  },
  {
    key: 'documentation',
    patterns: ['template', 'report', 'summary', 'document', 'brief', 'playbook', 'faq', 'documentation'],
    preferredAgents: ['philip', 'luna', 'victor'],
    overlayProviders: ['workspace_drive'],
    overlaySkills: ['status_reporting', 'workspace_drive_write', 'workspace_drive_read'],
    delegateByDefault: false,
  },
];

function normalizeText(value) {
  return ` ${String(value || '').trim().toLowerCase()} `;
}

function matchesPattern(text, pattern) {
  return text.includes(` ${pattern} `) || text.includes(pattern);
}

function detectDomains(messageText = '', history = []) {
  const haystacks = [
    normalizeText(messageText),
    ...history.slice(-4).map((entry) => normalizeText(entry?.content || '')),
  ];

  const detected = [];
  for (const rule of DOMAIN_RULES) {
    const matched = rule.patterns.some((pattern) => haystacks.some((text) => matchesPattern(text, pattern)));
    if (matched) detected.push(rule);
  }
  return detected;
}

function getAgentKey(agent = {}) {
  const source = agent && typeof agent === 'object' ? agent : {};
  return String(source.username || source.name || source.id || '').trim().toLowerCase();
}

function agentSupportsRule(agent = {}, rule) {
  const key = getAgentKey(agent);
  if (!key) return false;

  if (rule.preferredAgents.includes(key)) return true;

  const capabilities = Array.isArray(agent.capabilities) ? agent.capabilities.map((value) => String(value).toLowerCase()) : [];
  if (rule.overlaySkills.some((skill) => capabilities.includes(String(skill).toLowerCase()))) return true;

  const roleText = normalizeText(`${agent.role || ''} ${agent.description || ''} ${agent.type || ''}`);
  return rule.patterns.some((pattern) => matchesPattern(roleText, pattern));
}

function pickSpecialistAgent(rule, availableAgents = [], requestedAgent = null) {
  if (agentSupportsRule(requestedAgent, rule)) return requestedAgent;

  for (const preferredAgent of rule.preferredAgents) {
    const direct = availableAgents.find((agent) => getAgentKey(agent) === preferredAgent);
    if (direct) return direct;
  }

  return availableAgents.find((agent) => agentSupportsRule(agent, rule)) || null;
}

function canAgentExecuteRule(agent, rule, provisioning) {
  if (!agent) return false;
  if (rule.key !== 'email') return true;
  return agentHasProvisionedEmail(agent, provisioning);
}

async function resolveOrchestrationCapabilities({
  workspaceId,
  messageText,
  history = [],
  requestedAgent = null,
  availableAgents = [],
  db,
} = {}) {
  const matchedRules = detectDomains(messageText, history);
  const connectedProviders = await listConnectedWorkspaceIntegrationProviders(workspaceId, db).catch(() => new Set());
  const capabilityAvailability = await resolveWorkspaceCapabilityAvailability({ workspaceId, db }).catch(() => ({
    planId: 'free',
    planLabel: 'Free',
    planFeatures: [],
    planProducts: [],
    planLimits: {},
    connectedProviders: Array.from(connectedProviders),
    providerStates: {},
    availableProviders: [],
    unavailableProviders: [],
  }));

  const overlayProviders = new Set(['project_management']);
  const overlaySkills = new Set();
  const delegatedAgents = [];
  const reasons = [];
  const unavailableDomains = [];
  const emailProvisioningByAgentId = new Map();

  await Promise.all(
    availableAgents.map(async (agent) => {
      if (!agent?.id) return;
      const provisioning = await resolveAgentEmailProvisioning({
        workspaceId,
        agentId: agent.id,
        agent,
        db,
      }).catch(() => ({
        provisioned: false,
        email: null,
        source: 'none',
      }));
      emailProvisioningByAgentId.set(String(agent.id), provisioning);
    })
  );

  for (const rule of matchedRules) {
    const availableRuleProviders = filterAvailableProviders(rule.overlayProviders, capabilityAvailability);
    const blockedRuleProviders = getUnavailableProviders(rule.overlayProviders, capabilityAvailability);
    const ruleAvailable = availableRuleProviders.length > 0;
    const requestedAgentProvisioning = requestedAgent?.id
      ? emailProvisioningByAgentId.get(String(requestedAgent.id))
      : null;
    const compatibleAgents = availableAgents.filter((agent) =>
      canAgentExecuteRule(agent, rule, emailProvisioningByAgentId.get(String(agent.id)))
    );
    const requestedAgentCanExecute = canAgentExecuteRule(requestedAgent, rule, requestedAgentProvisioning);

    for (const provider of availableRuleProviders) {
      if (provider === 'workspace_drive'
        || provider === 'vutler_calendar'
        || provider === 'project_management'
        || provider === 'email'
        || connectedProviders.has(provider)) {
        overlayProviders.add(provider);
      }
    }

    for (const skillKey of filterAvailableSkillKeys(rule.overlaySkills, capabilityAvailability)) {
      overlaySkills.add(skillKey);
    }

    const specialist = pickSpecialistAgent(
      rule,
      compatibleAgents,
      requestedAgentCanExecute ? requestedAgent : null
    );
    if (specialist && specialist !== requestedAgent && (rule.delegateByDefault || !requestedAgentCanExecute) && ruleAvailable) {
      delegatedAgents.push({
        domain: rule.key,
        agentId: specialist.id || null,
        agentRef: specialist.username || specialist.id || null,
        reason: `${rule.key}_specialist`,
      });
      reasons.push(`delegate:${rule.key}:${specialist.username || specialist.name || specialist.id}`);
    }

    if (!ruleAvailable) {
      unavailableDomains.push({
        domain: rule.key,
        missingProviders: blockedRuleProviders.map((entry) => entry.key),
        reasons: blockedRuleProviders.map((entry) => entry.reason).filter(Boolean),
      });
      for (const blocked of blockedRuleProviders) {
        reasons.push(`blocked:${rule.key}:${blocked.key}`);
      }
    } else if (rule.key === 'email' && !requestedAgentCanExecute && compatibleAgents.length === 0) {
      unavailableDomains.push({
        domain: rule.key,
        missingProviders: ['email'],
        reasons: ['No email-provisioned agent is available for this workspace run.'],
      });
      reasons.push('blocked:email:agent_provisioning');
    }
  }

  for (const skillKey of filterAvailableSkillKeys(
    getSkillKeysForIntegrationProviders(Array.from(overlayProviders)),
    capabilityAvailability
  )) {
    overlaySkills.add(skillKey);
  }

  const primaryDelegate = delegatedAgents[0] || null;
  const expansion = await evaluateAgentExpansion({
    workspaceId,
    requestedAgent,
    availableAgents,
    matchedRules,
    delegatedAgents,
    db,
  }).catch(() => ({
    workspacePressure: null,
    specializationProfile: null,
    recommendations: [],
  }));

  return {
    domains: matchedRules.map((rule) => rule.key),
    overlayProviders: Array.from(overlayProviders),
    overlaySkillKeys: Array.from(overlaySkills),
    primaryDelegate,
    delegatedAgents,
    reasons,
    availability: capabilityAvailability,
    unavailableDomains,
    workspacePressure: expansion.workspacePressure || null,
    specializationProfile: expansion.specializationProfile || null,
    recommendations: Array.isArray(expansion.recommendations) ? expansion.recommendations : [],
  };
}

module.exports = {
  DOMAIN_RULES,
  detectDomains,
  resolveOrchestrationCapabilities,
};
