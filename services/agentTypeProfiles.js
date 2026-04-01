'use strict';

const AGENT_TYPE_DEFAULTS = {
  sales: ['lead_scoring', 'crm_sync', 'email_outreach', 'pipeline_management'],
  marketing: ['content_scheduling', 'social_analytics', 'campaign_planning', 'keyword_research'],
  operations: ['task_management', 'timeline_tracking', 'resource_allocation', 'status_reporting'],
  technical: ['data_analysis', 'report_generation', 'equipment_diagnostics'],
  support: ['ticket_triage', 'ticket_resolution', 'satisfaction_tracking'],
  analytics: ['sentiment_analysis', 'theme_extraction', 'insight_reporting'],
  finance: ['invoice_processing', 'expense_tracking', 'financial_reporting', 'bookkeeping'],
  content: ['article_creation', 'faq_management', 'search_optimization'],
  security: ['vulnerability_scanning', 'incident_response', 'security_audit'],
  devops: ['cicd_automation', 'infrastructure_as_code', 'monitoring_alerting'],
  legal: ['contract_review', 'compliance_assessment', 'policy_drafting'],
  data: ['etl_pipelines', 'data_quality', 'schema_management'],
  qa: ['test_automation', 'bug_tracking', 'regression_testing'],
  networking: ['firewall_management', 'dns_management', 'vpn_configuration'],
  iot: ['device_management', 'sensor_data_analysis', 'edge_computing'],
  design: ['user_research', 'usability_testing'],
  'real-estate': ['property_listing', 'market_valuation', 'appointment_scheduling'],
  healthcare: ['insurance_verification', 'patient_intake'],
  integration: ['crm_sync', 'etl_pipelines', 'data_quality'],
};

const SANDBOX_ELIGIBLE_AGENT_TYPES = new Set([
  'technical',
  'security',
  'qa',
  'devops',
  'engineering',
]);

function normalizeAgentTypes(type) {
  if (!type) return [];
  if (Array.isArray(type)) return type.map((value) => String(value || '').trim()).filter(Boolean);

  try {
    const parsed = JSON.parse(type);
    if (Array.isArray(parsed)) return parsed.map((value) => String(value || '').trim()).filter(Boolean);
  } catch (_) {}

  return [String(type).trim()].filter(Boolean);
}

function getDefaultCapabilitiesForAgentTypes(type, maxSkills = 8) {
  const types = normalizeAgentTypes(type);
  const skills = [];

  for (const key of types) {
    const defaults = AGENT_TYPE_DEFAULTS[key];
    if (!Array.isArray(defaults)) continue;
    for (const skill of defaults) {
      if (!skills.includes(skill)) skills.push(skill);
      if (skills.length >= maxSkills) return skills;
    }
  }

  return skills;
}

function isSandboxEligibleAgentType(type) {
  const types = normalizeAgentTypes(type);
  return types.some((value) => SANDBOX_ELIGIBLE_AGENT_TYPES.has(value));
}

module.exports = {
  AGENT_TYPE_DEFAULTS,
  SANDBOX_ELIGIBLE_AGENT_TYPES,
  normalizeAgentTypes,
  getDefaultCapabilitiesForAgentTypes,
  isSandboxEligibleAgentType,
};
