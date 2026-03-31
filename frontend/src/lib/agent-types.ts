// ─── Agent Type Definitions ──────────────────────────────────────────────────
// Maps agent types to their metadata, icons, and recommended skills.
// Skill keys must match those in seeds/agent-skills.json.

export interface AgentTypeDefinition {
  key: string;
  label: string;
  icon: string;
  description: string;
  recommendedSkills: string[];
}

export interface ToolCapabilityDefinition {
  key: string;
  label: string;
  description: string;
  alwaysOn?: boolean;
}

export const AGENT_TYPES: AgentTypeDefinition[] = [
  {
    key: 'sales',
    label: 'Sales',
    icon: '🎯',
    description: 'Lead generation, pipeline management, outreach',
    recommendedSkills: ['lead_scoring', 'crm_sync', 'email_outreach', 'pipeline_management'],
  },
  {
    key: 'marketing',
    label: 'Marketing',
    icon: '📣',
    description: 'Campaigns, social media, SEO, content',
    recommendedSkills: ['content_scheduling', 'social_analytics', 'campaign_planning', 'keyword_research'],
  },
  {
    key: 'operations',
    label: 'Operations',
    icon: '⚙️',
    description: 'Project management, HR, procurement',
    recommendedSkills: ['task_management', 'timeline_tracking', 'resource_allocation', 'status_reporting'],
  },
  {
    key: 'technical',
    label: 'Technical',
    icon: '💻',
    description: 'Data analysis, diagnostics, document processing',
    recommendedSkills: ['data_analysis', 'report_generation', 'equipment_diagnostics'],
  },
  {
    key: 'support',
    label: 'Support',
    icon: '🤝',
    description: 'Ticket management, customer satisfaction',
    recommendedSkills: ['ticket_triage', 'ticket_resolution', 'satisfaction_tracking'],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    icon: '📊',
    description: 'Sentiment analysis, insights, reporting',
    recommendedSkills: ['sentiment_analysis', 'theme_extraction', 'insight_reporting'],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: '💰',
    description: 'Bookkeeping, invoicing, forecasting',
    recommendedSkills: ['invoice_processing', 'expense_tracking', 'financial_reporting', 'bookkeeping'],
  },
  {
    key: 'content',
    label: 'Content',
    icon: '📝',
    description: 'Articles, FAQs, documentation, translation',
    recommendedSkills: ['article_creation', 'faq_management', 'search_optimization'],
  },
  {
    key: 'security',
    label: 'Security',
    icon: '🔒',
    description: 'Vulnerability scanning, incident response, audits',
    recommendedSkills: ['vulnerability_scanning', 'incident_response', 'security_audit'],
  },
  {
    key: 'devops',
    label: 'DevOps',
    icon: '🔧',
    description: 'CI/CD, infrastructure, monitoring',
    recommendedSkills: ['cicd_automation', 'infrastructure_as_code', 'monitoring_alerting'],
  },
  {
    key: 'legal',
    label: 'Legal',
    icon: '⚖️',
    description: 'Contracts, compliance, GDPR',
    recommendedSkills: ['contract_review', 'compliance_assessment', 'policy_drafting'],
  },
  {
    key: 'data',
    label: 'Data',
    icon: '💾',
    description: 'ETL, data quality, schema management',
    recommendedSkills: ['etl_pipelines', 'data_quality', 'schema_management'],
  },
  {
    key: 'qa',
    label: 'QA',
    icon: '🧪',
    description: 'Test automation, bug tracking, regression',
    recommendedSkills: ['test_automation', 'bug_tracking', 'regression_testing'],
  },
  {
    key: 'networking',
    label: 'Networking',
    icon: '🌐',
    description: 'Firewall, DNS, VPN management',
    recommendedSkills: ['firewall_management', 'dns_management', 'vpn_configuration'],
  },
  {
    key: 'iot',
    label: 'IoT',
    icon: '📡',
    description: 'Device management, sensor data, edge computing',
    recommendedSkills: ['device_management', 'sensor_data_analysis', 'edge_computing'],
  },
  {
    key: 'design',
    label: 'Design',
    icon: '🎨',
    description: 'User research, usability testing',
    recommendedSkills: ['user_research', 'usability_testing'],
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    icon: '🏠',
    description: 'Listings, valuations, scheduling',
    recommendedSkills: ['property_listing', 'market_valuation', 'appointment_scheduling'],
  },
  {
    key: 'healthcare',
    label: 'Healthcare',
    icon: '🏥',
    description: 'Insurance verification, patient intake',
    recommendedSkills: ['insurance_verification', 'patient_intake'],
  },
  {
    key: 'integration',
    label: 'Integration',
    icon: '🔗',
    description: 'CRM sync, API connectors, data pipelines',
    recommendedSkills: ['crm_sync', 'etl_pipelines', 'data_quality'],
  },
];

// ─── Skill Limits ────────────────────────────────────────────────────────────

export const SKILL_LIMITS = {
  /** Hard maximum — checkboxes disabled beyond this */
  max: 8,
  /** Recommended sweet spot */
  recommended: 5,
} as const;

/** Maximum number of agent types that can be combined */
export const MAX_AGENT_TYPES = 3;

export const ALWAYS_ON_TOOL_CAPABILITIES: ToolCapabilityDefinition[] = [
  {
    key: 'workspace_drive_list',
    label: 'Workspace Drive List',
    description: 'List files and folders in the shared workspace drive.',
    alwaysOn: true,
  },
  {
    key: 'workspace_drive_search',
    label: 'Workspace Drive Search',
    description: 'Search internal workspace files by name or path.',
    alwaysOn: true,
  },
  {
    key: 'workspace_drive_read',
    label: 'Workspace Drive Read',
    description: 'Read text content from the internal workspace drive.',
    alwaysOn: true,
  },
  {
    key: 'workspace_drive_write',
    label: 'Workspace Drive Write',
    description: 'Create and update internal workspace documents.',
    alwaysOn: true,
  },
  {
    key: 'workspace_drive_create_folder',
    label: 'Workspace Drive Create Folder',
    description: 'Create folders in the shared workspace drive.',
    alwaysOn: true,
  },
];

export const OPTIONAL_TOOL_CAPABILITIES: ToolCapabilityDefinition[] = [
  { key: 'workspace_drive', label: 'Workspace Drive (Legacy)', description: 'Legacy workspace drive tool flag kept for compatibility.' },
  { key: 'google_drive', label: 'Google Drive (Legacy)', description: 'Legacy Google Drive tool flag kept for compatibility.' },
  { key: 'google_calendar', label: 'Google Calendar (Legacy)', description: 'Legacy Google Calendar tool flag kept for compatibility.' },
  { key: 'network_access', label: 'Network Access', description: 'Make HTTP requests to external services.' },
  { key: 'code_execution', label: 'Code Execution', description: 'Execute code in the sandbox.' },
  { key: 'web_search', label: 'Web Search', description: 'Search the internet.' },
  { key: 'tool_use', label: 'Tool Use', description: 'Use external tools and APIs.' },
  { key: 'calendar_management', label: 'Calendar Management', description: 'Coordinate calendars and meeting hygiene rules.' },
  { key: 'google_drive_list', label: 'Google Drive List', description: 'List files from the connected Google Drive integration.' },
  { key: 'google_drive_search', label: 'Google Drive Search', description: 'Search the connected Google Drive integration.' },
  { key: 'google_drive_read', label: 'Google Drive Read', description: 'Read file content from the connected Google Drive integration.' },
  { key: 'google_calendar_list', label: 'Google Calendar List', description: 'List upcoming events from the connected Google Calendar.' },
  { key: 'google_calendar_create', label: 'Google Calendar Create', description: 'Create Google Calendar events.' },
  { key: 'google_calendar_update', label: 'Google Calendar Update', description: 'Update Google Calendar events.' },
  { key: 'google_calendar_delete', label: 'Google Calendar Delete', description: 'Delete Google Calendar events.' },
  { key: 'google_calendar_check_availability', label: 'Google Calendar Availability', description: 'Check free/busy availability in Google Calendar.' },
];

export const NON_COUNTED_CAPABILITY_KEYS = new Set([
  ...ALWAYS_ON_TOOL_CAPABILITIES.map((tool) => tool.key),
  ...OPTIONAL_TOOL_CAPABILITIES.map((tool) => tool.key),
]);

export type SkillLimitStatus = 'good' | 'warning' | 'limit';

export function getSkillLimitStatus(count: number): SkillLimitStatus {
  if (count >= SKILL_LIMITS.max) return 'limit';
  if (count >= 6) return 'warning';
  return 'good';
}

export function getSkillLimitMessage(count: number): string | null {
  if (count >= SKILL_LIMITS.max) return 'Maximum reached — remove a skill to add another';
  if (count >= 6) return 'Consider keeping your agent focused for best performance';
  if (count >= 4) return 'Good focus';
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Get an agent type definition by key */
export function getAgentType(key: string): AgentTypeDefinition | undefined {
  return AGENT_TYPES.find(t => t.key === key);
}

/** Get recommended skills for one or multiple agent types (deduplicated) */
export function getRecommendedSkills(typeKeys: string | string[]): string[] {
  const keys = Array.isArray(typeKeys) ? typeKeys : [typeKeys];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const key of keys) {
    for (const skill of getAgentType(key)?.recommendedSkills ?? []) {
      if (!seen.has(skill)) {
        seen.add(skill);
        result.push(skill);
      }
    }
  }
  return result;
}

export function isNonCountedCapabilityKey(key: string): boolean {
  return NON_COUNTED_CAPABILITY_KEYS.has(key);
}
