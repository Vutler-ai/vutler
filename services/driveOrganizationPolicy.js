'use strict';

const { normalizeAgentTypes } = require('./agentTypeProfiles');

const DEFAULT_AGENT_DRIVE_LANE = 'General';

const AGENT_DRIVE_LANE_RULES = Object.freeze([
  { folder: 'Marketing', types: ['marketing', 'content'] },
  { folder: 'Sales', types: ['sales'] },
  { folder: 'Operations', types: ['operations'] },
  { folder: 'Support', types: ['support'] },
  { folder: 'Technical', types: ['technical', 'security', 'qa', 'devops', 'engineering', 'data', 'integration', 'networking', 'iot'] },
  { folder: 'Finance', types: ['finance'] },
  { folder: 'Documentation', types: ['legal', 'analytics', 'design'] },
  { folder: 'Healthcare', types: ['healthcare'] },
  { folder: 'Real-Estate', types: ['real-estate'] },
]);

const ROLE_KEYWORD_RULES = Object.freeze([
  { folder: 'Marketing', terms: ['marketing', 'content', 'brand', 'seo', 'social'] },
  { folder: 'Sales', terms: ['sales', 'business development', 'account executive'] },
  { folder: 'Operations', terms: ['operations', 'ops', 'project', 'coordinator'] },
  { folder: 'Support', terms: ['support', 'success', 'service desk', 'helpdesk'] },
  { folder: 'Technical', terms: ['technical', 'engineering', 'developer', 'security', 'devops', 'qa', 'data'] },
  { folder: 'Finance', terms: ['finance', 'accounting', 'bookkeeping'] },
  { folder: 'Documentation', terms: ['documentation', 'legal', 'research', 'translator', 'analyst'] },
  { folder: 'Healthcare', terms: ['healthcare', 'patient', 'clinic'] },
  { folder: 'Real-Estate', terms: ['real estate', 'property'] },
]);

function uniqueStrings(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
}

function resolveAgentDriveLane(agent = {}) {
  const types = normalizeAgentTypes(agent.type);
  for (const rule of AGENT_DRIVE_LANE_RULES) {
    if (rule.types.some((type) => types.includes(type))) {
      return rule.folder;
    }
  }

  const roleHaystack = [
    agent.role,
    agent.roleTitle,
    agent.title,
    agent.description,
    agent.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const rule of ROLE_KEYWORD_RULES) {
    if (rule.terms.some((term) => roleHaystack.includes(term))) {
      return rule.folder;
    }
  }

  return DEFAULT_AGENT_DRIVE_LANE;
}

function listAgentDriveLaneFolders() {
  return uniqueStrings([
    ...AGENT_DRIVE_LANE_RULES.map((rule) => rule.folder),
    DEFAULT_AGENT_DRIVE_LANE,
  ]);
}

module.exports = {
  AGENT_DRIVE_LANE_RULES,
  DEFAULT_AGENT_DRIVE_LANE,
  listAgentDriveLaneFolders,
  resolveAgentDriveLane,
};
