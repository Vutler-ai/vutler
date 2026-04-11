/**
 * Vutler API Types
 * Centralized types extracted from all page files.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  platform?: string;
  status: 'active' | 'inactive' | 'error' | 'online' | 'offline';
  lastActive?: string;
  model?: string;
  provider?: string;
  type?: string | string[];
  role?: string;
  autoApproveEmail?: boolean;
  auto_approve_email?: boolean;
  config?: Record<string, unknown>;
  capabilities?: string[];
  skills?: string[];
  tools?: string[];
  avatar?: string;
  username?: string;
  email?: string | null;
  description?: string;
  integrations?: string[];
  access_policy?: AgentAccessPolicy;
  provisioning?: AgentProvisioning;
  memory_policy?: AgentMemoryPolicy;
  governance?: AgentGovernance;
  drive_path?: string | null;
  system_prompt?: string | null;
  temperature?: number;
  max_tokens?: number;
  mbti?: string | null;
  badge?: string | null;
  systemAgent?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AgentCapabilityKey =
  | 'email'
  | 'social'
  | 'drive'
  | 'calendar'
  | 'tasks'
  | 'memory'
  | 'sandbox';

export interface AgentAccessEntry {
  allowed?: boolean;
  source?: string | null;
  platforms?: string[];
  eligible?: boolean;
  invalid?: boolean;
}

export interface AgentAccessPolicy {
  email?: AgentAccessEntry;
  social?: AgentAccessEntry;
  drive?: AgentAccessEntry;
  calendar?: AgentAccessEntry;
  tasks?: AgentAccessEntry;
  memory?: AgentAccessEntry;
  sandbox?: AgentAccessEntry;
}

export interface AgentProvisioningChannels {
  chat?: boolean;
  email?: boolean;
  tasks?: boolean;
}

export interface AgentEmailProvisioning {
  address?: string | null;
  email?: string | null;
  provisioned?: boolean;
}

export interface AgentSocialProvisioning {
  allowed_platforms?: string[];
  platforms?: string[];
  brand_ids?: string[];
  account_ids?: string[];
}

export interface AgentDriveProvisioning {
  root?: string | null;
}

export interface AgentProvisioning {
  channels?: AgentProvisioningChannels;
  email?: AgentEmailProvisioning;
  social?: AgentSocialProvisioning;
  drive?: AgentDriveProvisioning;
}

export interface AgentMemoryPolicy {
  mode?: 'disabled' | 'passive' | 'active' | string;
}

export interface AgentGovernance {
  approvals?: 'default' | 'strict' | string;
  max_risk_level?: 'low' | 'medium' | 'high' | string;
}

export interface AgentCapabilityState {
  workspace_available: boolean;
  agent_allowed: boolean;
  provisioned: boolean;
  effective: boolean;
  reason: string | null;
  scope?: Record<string, unknown> | null;
}

export interface AgentCapabilityMatrixWarning {
  key: string;
  message: string;
}

export interface AgentCapabilityMatrixMetadata {
  plan_id?: string;
  available_runtime_providers?: string[];
  unavailable_runtime_providers?: OrchestrationUnavailableProvider[];
}

export interface AgentCapabilityMatrix {
  agent_id: string;
  agent_types: string[];
  capabilities: Record<AgentCapabilityKey, AgentCapabilityState>;
  warnings: AgentCapabilityMatrixWarning[];
  metadata?: AgentCapabilityMatrixMetadata;
}

export interface AgentIdentityPayload {
  name: string;
  username: string;
  avatar?: string | null;
  description?: string;
}

export interface AgentProfilePayload {
  types?: string[];
  role?: string | null;
  mbti?: string | null;
}

export interface AgentBrainPayload {
  provider?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  temperature?: number;
  max_tokens?: number;
}

export interface LegacyCreateAgentPayload {
  name: string;
  username?: string;
  email?: string;
  role?: string;
  description?: string;
  model?: string;
  provider?: string;
  system_prompt?: string;
  avatar?: string | null;
  type?: string[];
  capabilities?: string[];
  template_id?: string;
  platform?: string;
  config?: Record<string, unknown>;
}

export interface AgentContractPayload {
  identity: AgentIdentityPayload;
  profile?: AgentProfilePayload;
  brain?: AgentBrainPayload;
  persistent_skills?: string[];
  access_policy?: AgentAccessPolicy;
  provisioning?: AgentProvisioning;
  memory_policy?: AgentMemoryPolicy;
  governance?: AgentGovernance;
  template_id?: string;
  platform?: string;
}

export type CreateAgentPayload = LegacyCreateAgentPayload | AgentContractPayload;

export type UpdateAgentPayload = Partial<LegacyCreateAgentPayload> &
  Partial<AgentContractPayload> & {
    auto_approve_email?: boolean;
  };

export interface PatchAgentAccessPayload {
  access_policy: AgentAccessPolicy;
}

export interface PatchAgentProvisioningPayload {
  provisioning?: AgentProvisioning;
  memory_policy?: AgentMemoryPolicy;
  governance?: AgentGovernance;
}

export interface AgentCapabilityMatrixResponse {
  success: boolean;
  data: AgentCapabilityMatrix;
}

export interface AgentAccessPatchResponse {
  success: boolean;
  access_policy: AgentAccessPolicy;
  data: AgentCapabilityMatrix;
}

export interface AgentProvisioningPatchResponse {
  success: boolean;
  provisioning: AgentProvisioning;
  memory_policy: AgentMemoryPolicy;
  governance: AgentGovernance;
  data: AgentCapabilityMatrix;
}

export interface AgentExecution {
  id: string;
  input: string;
  output: string;
  model: string;
  tokens_used: number;
  latency_ms: number;
  created_at: string;
  status?: 'success' | 'error' | 'failed' | 'running' | 'pending' | 'done' | 'completed' | string;
}

export interface AgentExecuteStreamEvent {
  type: 'delta' | 'done' | 'error';
  text?: string;
  error?: string;
  usage?: { input: number; output: number; total: number };
  latency_ms?: number;
  model?: string;
  provider?: string;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done' | 'pending' | 'completed' | 'blocked' | 'failed' | 'cancelled' | 'stalled' | 'open' | 'timed_out';
  priority: 'low' | 'medium' | 'high';
  assignee: string;
  due_date: string;
  // htasks (hierarchical)
  parent_id?: string | null;
  subtask_count?: number;
  subtask_completed_count?: number;
  // Snipara sync
  snipara_task_id?: string | null;
  swarm_task_id?: string | null;
  source?: string | null;
  // Agent
  assigned_agent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface CreateTaskPayload {
  title: string;
  description: string;
  status: Task['status'];
  priority: Task['priority'];
  assignee: string;
  due_date: string;
  assigned_agent?: string | null;
  parent_id?: string | null;
}

export interface SyncTasksResponse {
  synced: number;
  errors: number;
  total: number;
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size: number;
  path: string;
  url: string;
  uploaded_at?: string;
}

export interface OrchestrationDelegatedAgent {
  domain?: string | null;
  agentId?: string | null;
  agentRef?: string | null;
  reason?: string | null;
}

export interface OrchestrationUnavailableProvider {
  key: string;
  available?: boolean;
  reason?: string | null;
  requires_connection?: boolean | null;
  connected?: boolean | null;
  source?: string | null;
}

export interface OrchestrationUnavailableDomain {
  domain: string;
  missingProviders?: string[];
  reasons?: string[];
}

export interface WorkspaceAgentPressure {
  planId?: string;
  planLabel?: string;
  currentAgentCount?: number;
  agentLimit?: number;
  supportsAgents?: boolean;
  canAddAgents?: boolean;
  nearLimit?: boolean;
  atLimit?: boolean;
  usagePercent?: number;
}

export interface AgentRecommendation {
  type: string;
  priority?: string | null;
  title?: string | null;
  reason?: string | null;
  domain?: string | null;
  suggested_agent_type?: string | null;
  suggested_name?: string | null;
  suggested_role?: string | null;
  upgrade_required?: boolean;
  recommended_plan?: string | null;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
  client_message_id?: string | null;
  reply_to_message_id?: string | null;
  requested_agent_id?: string | null;
  display_agent_id?: string | null;
  orchestrated_by?: string | null;
  executed_by?: string | null;
  metadata?: {
    resource_artifacts?: ChatResourceArtifact[];
    orchestration_status?: string | null;
    facade_agent_id?: string | null;
    facade_agent_username?: string | null;
    requested_agent_reason?: string | null;
    delegated_agents?: OrchestrationDelegatedAgent[];
    orchestration_delegated_agents?: OrchestrationDelegatedAgent[];
    available_runtime_providers?: string[];
    unavailable_runtime_providers?: OrchestrationUnavailableProvider[];
    unavailable_domains?: OrchestrationUnavailableDomain[];
    workspace_agent_pressure?: WorkspaceAgentPressure | null;
    specialization_profile?: {
      status?: string | null;
      persistentSkillCount?: number;
      agentTypes?: string[];
      detectedDomains?: string[];
      delegatedDomainCount?: number;
      availableAgentCount?: number;
    } | null;
    agent_recommendations?: AgentRecommendation[];
    llm_provider?: string | null;
    llm_model?: string | null;
    [key: string]: unknown;
  } | null;
  attachments?: Attachment[];
}

export interface ChatActionRun {
  id: string;
  workspace_id: string;
  chat_message_id: string;
  channel_id: string;
  requested_agent_id?: string | null;
  display_agent_id?: string | null;
  orchestrated_by?: string | null;
  executed_by?: string | null;
  action_key: string;
  adapter: string;
  status: string;
  input_json?: Record<string, unknown> | null;
  output_json?: Record<string, unknown> | null;
  error_json?: Record<string, unknown> | null;
  started_at: string;
  completed_at?: string | null;
}

export interface OrchestrationRun {
  id: string;
  workspace_id: string;
  source?: string | null;
  source_ref?: Record<string, unknown> | null;
  status: string;
  mode?: string | null;
  requested_agent_id?: string | null;
  requested_agent_username?: string | null;
  display_agent_id?: string | null;
  display_agent_username?: string | null;
  orchestrated_by?: string | null;
  coordinator_agent_id?: string | null;
  coordinator_agent_username?: string | null;
  root_task_id?: string | null;
  current_step_id?: string | null;
  summary?: string | null;
  plan_json?: Record<string, unknown> | null;
  context_json?: Record<string, unknown> | null;
  result_json?: Record<string, unknown> | null;
  error_json?: Record<string, unknown> | null;
  next_wake_at?: string | null;
  last_progress_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OrchestrationRunStep {
  id: string;
  run_id: string;
  parent_step_id?: string | null;
  sequence_no: number;
  step_type: string;
  title: string;
  status: string;
  executor: string;
  selected_agent_id?: string | null;
  selected_agent_username?: string | null;
  spawned_task_id?: string | null;
  tool_name?: string | null;
  skill_key?: string | null;
  policy_bundle?: string | null;
  approval_mode?: string | null;
  retry_count?: number | null;
  input_json?: Record<string, unknown> | null;
  output_json?: Record<string, unknown> | null;
  error_json?: Record<string, unknown> | null;
  wait_json?: Record<string, unknown> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface OrchestrationRunEvent {
  id: string;
  run_id: string;
  step_id?: string | null;
  event_type: string;
  actor: string;
  payload?: Record<string, unknown> | null;
  created_at?: string | null;
}

export interface OrchestrationTimelineItem {
  kind: 'step' | 'event';
  id: string;
  timestamp?: string | null;
  data: OrchestrationRunStep | OrchestrationRunEvent;
}

export interface OrchestrationRunDetail {
  run: OrchestrationRun;
  current_step?: OrchestrationRunStep | null;
  steps: OrchestrationRunStep[];
  events: OrchestrationRunEvent[];
  timeline: {
    items: OrchestrationTimelineItem[];
    total_steps: number;
    total_events: number;
  };
  root_task?: Task | null;
}

export interface OrchestrationAutonomyMetricCount {
  kind?: 'provider' | 'tool_capability' | 'skill' | string;
  key: string;
  label: string;
  count: number;
}

export interface OrchestrationAutonomyAgentMetric {
  agent_id?: string | null;
  agent_username?: string | null;
  run_count: number;
  autonomy_limited_runs: number;
  blocked_runs: number;
  awaiting_approval_runs: number;
  completed_runs: number;
  blocker_counts: OrchestrationAutonomyMetricCount[];
  suggestion_counts: OrchestrationAutonomyMetricCount[];
  updated_at?: string | null;
}

export interface OrchestrationAutonomyMetrics {
  workspace_id: string;
  window_days: number;
  updated_at: string;
  totals: {
    total_runs: number;
    autonomy_limited_runs: number;
    blocked_runs: number;
    awaiting_approval_runs: number;
    completed_runs: number;
    failed_runs: number;
    cancelled_runs: number;
  };
  blocker_counts: OrchestrationAutonomyMetricCount[];
  suggestion_counts: OrchestrationAutonomyMetricCount[];
  run_status_counts: OrchestrationAutonomyMetricCount[];
  agent_breakdown: OrchestrationAutonomyAgentMetric[];
}

export interface ChatResourceArtifact {
  kind?: string;
  label: string;
  href: string;
  note?: string;
  action?: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: 'channel' | 'direct';
  members: string[];
  raw_name?: string;
  contact_id?: string | null;
  contact_type?: 'user' | 'agent' | null;
  avatar?: string | null;
  username?: string | null;
  contact_role?: string | null;
  contact_provider?: string | null;
  contact_model?: string | null;
  pinned?: boolean;
  muted?: boolean;
  archived?: boolean;
}

export interface ChannelMember {
  id: string;
  type: 'user' | 'agent';
  name: string;
}

export interface ChatContact {
  id: string;
  name: string;
  type: 'user' | 'agent';
  subtitle?: string;
  avatar?: string | null;
  username?: string | null;
  role?: string | null;
  provider?: string | null;
  model?: string | null;
}

export interface CreateChannelPayload {
  name: string;
  description?: string;
  type?: 'channel' | 'direct';
}

export interface SendMessagePayload {
  content: string;
  client_message_id?: string;
  attachments?: Attachment[];
}

// ─── Email ────────────────────────────────────────────────────────────────────

export type EmailFolder = 'inbox' | 'sent' | 'archive' | 'drafts' | 'trash';
export type EmailDeliveryStatus = 'accepted' | 'delivered' | 'deferred' | 'bounced' | 'failed';

export interface Email {
  uid: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  unread: boolean;
  body?: string;
  html?: string;
  folder?: string;
  deliveryStatus?: EmailDeliveryStatus | null;
  providerMessageId?: string | null;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
}

// ─── Drive ────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: number;
  created?: string;
  modified?: string;
  mime_type?: string;
  path: string;
}

// ─── Browser Operator ────────────────────────────────────────────────────────

export interface BrowserOperatorRegistryRecord<T = Record<string, unknown>> {
  key: string;
  version: string;
  status: string;
  managed_by: string;
  definition: T;
}

export interface BrowserOperatorProfileDefinition {
  profile_key: string;
  name: string;
  default_runtime_mode: string;
  governance_mode: string;
  risk_level: string;
  action_catalog_ref: string;
  supported_flows: string[];
  [key: string]: unknown;
}

export type BrowserOperatorProfile = BrowserOperatorRegistryRecord<BrowserOperatorProfileDefinition>;

export interface BrowserOperatorFlowStep {
  action_key: string;
  input?: Record<string, unknown>;
}

export interface BrowserOperatorFlowDefinition {
  flow_key: string;
  name: string;
  steps: BrowserOperatorFlowStep[];
  [key: string]: unknown;
}

export type BrowserOperatorFlow = BrowserOperatorRegistryRecord<BrowserOperatorFlowDefinition>;

export interface BrowserOperatorActionDefinition {
  action_key: string;
  risk_level: string;
  description?: string;
  [key: string]: unknown;
}

export interface BrowserOperatorActionCatalogDefinition {
  catalog_key: string;
  name: string;
  actions: BrowserOperatorActionDefinition[];
  [key: string]: unknown;
}

export type BrowserOperatorActionCatalog = BrowserOperatorRegistryRecord<BrowserOperatorActionCatalogDefinition>;

export interface BrowserOperatorRun {
  id: string;
  workspace_id: string;
  requested_by_user_id?: string | null;
  runtime_mode: string;
  profile_key: string;
  profile_version?: string | null;
  credentials_ref?: string | null;
  session_mode?: 'ephemeral' | 'named' | string;
  session_key?: string | null;
  flow_key?: string | null;
  flow_version?: string | null;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | string;
  target: Record<string, unknown>;
  governance: Record<string, unknown>;
  summary: Record<string, unknown>;
  report_format: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BrowserOperatorRunStep {
  id: string;
  run_id: string;
  step_index: number;
  action_key: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
}

export interface BrowserOperatorRunEvidence {
  id: string;
  run_id: string;
  step_id?: string | null;
  artifact_kind: string;
  storage_key: string;
  mime_type?: string | null;
  metadata: Record<string, unknown>;
  inline_text?: string | null;
  artifact_payload?: Record<string, unknown> | null;
  created_at: string;
}

export interface BrowserOperatorRunReport {
  status: string;
  profileKey: string;
  flowKey: string;
  runtimeMode: string;
  runtimeEngine?: string;
  evidenceCounts?: Record<string, unknown>;
  target: Record<string, unknown>;
  totals: {
    steps: number;
    passed: number;
    failed: number;
  };
  checks: Array<Record<string, unknown>>;
  unsupportedActions: string[];
  warnings?: Array<Record<string, unknown>>;
  generatedAt: string;
}

export interface BrowserOperatorCredential {
  id: string;
  workspace_id: string;
  app_key: string;
  credential_key: string;
  credential_type: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  last_tested_at?: string | null;
}

export interface CreateBrowserOperatorRunPayload {
  runtimeMode?: 'cloud-browser' | 'nexus-browser' | string;
  profileKey: string;
  profileVersion?: string;
  credentialsRef?: string;
  sessionMode?: 'ephemeral' | 'named';
  sessionKey?: string;
  flowKey: string;
  flowVersion?: string;
  target: {
    appKey?: string;
    baseUrl: string;
    path?: string;
  };
  governance?: Record<string, unknown>;
  reportFormat?: 'summary' | 'full' | string;
}

export interface CreateBrowserOperatorCredentialPayload {
  appKey: string;
  credentialKey: string;
  credentialType?: string;
  status?: string;
  username?: string;
  loginHint?: string;
  vaultSecretId?: string;
  credentialRef?: string;
  allowedDomains?: string[];
}

export interface CreateFolderPayload {
  path: string;
  name: string;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export type EventSource = 'manual' | 'agent' | 'goal' | 'billing' | string;

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  color: string;
  source?: EventSource;
  sourceId?: string | null;
  readOnly?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateEventPayload {
  title: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  color: string;
  source?: string;
  source_id?: string;
  metadata?: Record<string, unknown>;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface PlanLimits {
  agents?: number;
  tokens?: number;
  storage?: string;
  storage_gb?: number;
  nexusNodes?: number;
  nexus_nodes?: number;
  nexusEnterpriseNodes?: number;
  nexus_enterprise?: number;
  nexusLocalNodes?: number;
  nexus_local?: number;
  nexus_enterprise_seats?: number;
  socialPosts?: number;
  social_posts_month?: number;
}

export interface Plan {
  id: string;
  label: string;
  price: { monthly: number; yearly: number };
  features: string[];
  limits: PlanLimits;
}

export interface BillingAddon {
  id: string;
  label: string;
  price: number;
  unit: string;
  addonType?: string;
  enterpriseSeats?: number;
  enterpriseNodes?: number;
  posts?: number;
}

export interface PlansResponse {
  office: Plan[];
  agents: Plan[];
  full: Plan[];
  enterprise: Plan[];
  addons?: BillingAddon[];
}

export interface Subscription {
  planId: string | null;
  interval: 'monthly' | 'yearly';
  plan_name?: string;
  status?: string;
  current_period_end?: string | null;
  limits?: PlanLimits;
  usage?: SubscriptionUsage | null;
  addons?: {
    enterpriseSeats: number;
    enterpriseNodes: number;
    socialPosts: number;
    active: Array<{
      id: string;
      addonId: string;
      addonType: string;
      quantity: number;
      status: string;
      config?: Record<string, unknown>;
      currentPeriodEnd?: string | null;
    }>;
  } | null;
}

export interface SubscriptionUsage {
  agents: { used: number; limit: number | null };
  tokens: { used: number; limit: number | null };
  storage_gb: { used: number; limit: number | null };
  social_posts?: { used: number; limit: number | null; addon?: number | null };
}

export interface CheckoutPayload {
  planId: string;
  interval: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutResponse {
  url: string;
}

export interface PortalResponse {
  url: string;
}

// ─── Nexus ────────────────────────────────────────────────────────────────────

export interface NexusAgentStatus {
  id: string;
  name: string;
  model: string;
  status: 'idle' | 'busy' | 'stopped';
  tasksCompleted: number;
  profileKey?: string;
  profileVersion?: string;
}

export interface NexusSeatsInfo {
  max: number;
  used: number;
  available: number;
}

export interface NexusNode {
  id: string;
  name: string;
  status: 'online' | 'warning' | 'offline';
  agentCount: number;
  lastHeartbeat?: string;
  mode?: 'local' | 'enterprise' | 'standard';
  clientName?: string;
  clientId?: string;
  agents?: NexusAgentStatus[];
  seats?: NexusSeatsInfo;
  providerSources?: Record<string, NexusProviderSource>;
  discoverySnapshot?: NexusDiscoverySnapshot;
  poolAgentIds?: string[];
}

export interface NexusStats {
  total: number;
  online: number;
  agents: number;
  tasksCompleted: number;
}

export interface NexusBillingSnapshot {
  planId: string;
  limits: {
    total: number;
    local: number;
    enterprise: number;
  };
  usage: {
    total: number;
    local: number;
    enterprise: number;
  };
  remaining: {
    total: number;
    local: number;
    enterprise: number;
  };
  canProvision: {
    total: boolean;
    local: boolean;
    enterprise: boolean;
  };
  seats?: {
    planId: string;
    included: number;
    addOnSeats: number;
    total: number;
    allocated: number;
    available: number;
  };
}

export interface NexusCommandStats {
  queued: number;
  inProgress: number;
  completed24h: number;
  failed24h: number;
  expired24h: number;
  avgDurationMs: number;
}

export interface NexusStatusResponse {
  nodes: NexusNode[];
  stats: NexusStats;
  billing?: NexusBillingSnapshot | null;
  commandStats?: NexusCommandStats | null;
}

export interface NexusLocalPermissions {
  filesystem?: boolean | Record<string, unknown>;
  shell?: boolean | Record<string, unknown>;
  mail?: boolean | Record<string, unknown>;
  calendar?: boolean | Record<string, unknown>;
  contacts?: boolean | Record<string, unknown>;
  clipboard?: boolean | Record<string, unknown>;
  env?: boolean | Record<string, unknown>;
  network?: boolean | Record<string, unknown>;
  llm?: boolean | Record<string, unknown>;
  av?: boolean | Record<string, unknown>;
  allowedFolders?: string[];
  allowedActions?: string[];
  [key: string]: unknown;
}

export interface DeployLocalPayload {
  agentIds: string[];
  nodeName?: string;
  routingRules?: Array<{ pattern: string; agentId: string }>;
  ollamaEndpoint?: string;
  permissions?: NexusLocalPermissions;
}

export interface AutoSpawnRule {
  triggerPattern: string;
  agentName: string;
}

export interface EnterpriseProfileSelectionValidation {
  profileKey: string;
  profileVersion: string;
  profileName: string;
  category: string;
  agentLevel: number;
  riskPosture: 'administrative' | 'operational' | 'technical_privileged';
  deploymentMode: 'fixed' | 'elastic';
  canProceed: boolean;
  seatImpact: {
    principalAgent: number;
    registeredHelpers: number;
    localIntegrations: number;
    totalImmediate: number;
  };
  capabilities: Array<{
    capabilityKey: string;
    riskClass: string;
    classification: 'allowed' | 'restricted' | 'denied';
    required: boolean;
    optional: boolean;
  }>;
  localIntegrations: Array<{
    integrationKey: string;
    requiredLevel: number;
    toolClass: string | null;
    classification: 'allowed' | 'restricted';
  }>;
  helperProfiles: Array<{
    profileKey: string;
    mode: string;
    seatMode: string;
    classification: 'allowed' | 'restricted';
  }>;
  warnings: string[];
  summary: {
    requiredCapabilities: string[];
    optionalCapabilities: string[];
    selectedCapabilities: string[];
    selectedLocalIntegrations: string[];
    selectedHelperProfiles: string[];
  };
}

export interface DeployEnterprisePayload {
  name: string;
  clientName: string;
  seats: number;
  primaryAgentId: string;
  poolAgentIds: string[];
  allowCreatingNewAgents: boolean;
  autoSpawnRules?: AutoSpawnRule[];
  role: string;
  filesystemRoot: string;
  offlineMode: boolean;
  profileKey?: string;
  profileVersion?: string;
  deploymentMode?: 'fixed' | 'elastic';
  selectedCapabilities?: string[];
  selectedLocalIntegrations?: string[];
  selectedHelperProfiles?: string[];
}

export type NexusEnterpriseEventSubscriptionProvider =
  | 'microsoft_graph'
  | 'zoom'
  | 'google'
  | 'generic_http';

export type NexusEnterpriseEventSubscriptionStatus =
  | 'active'
  | 'paused'
  | 'disabled';

export type NexusEnterpriseProvisioningMode =
  | 'manual'
  | 'assisted'
  | 'automatic';

export type NexusEnterpriseProvisioningStatus =
  | 'manual_required'
  | 'assisted_required'
  | 'pending'
  | 'provisioned'
  | 'failed';

export interface NexusEnterpriseEventSubscription {
  id: string;
  workspaceId: string;
  provider: NexusEnterpriseEventSubscriptionProvider | string;
  profileKey?: string | null;
  agentId?: string | null;
  subscriptionType: string;
  sourceResource?: string | null;
  roomName?: string | null;
  events: string[];
  status: NexusEnterpriseEventSubscriptionStatus | string;
  deliveryMode: string;
  provisioningMode: NexusEnterpriseProvisioningMode;
  provisioningStatus: NexusEnterpriseProvisioningStatus | string;
  provisioningError?: string | null;
  callbackPath: string;
  callbackUrl: string;
  verificationSecret: string;
  config?: Record<string, unknown>;
  externalSubscriptionId?: string | null;
  lastEventAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NexusEnterpriseDriveRepo {
  rootPath: string;
  clientSlug: string;
  nodeSlug: string;
  sharedPaths: {
    context: string;
    inventory: string;
    reports: string;
    playbooks: string;
    policies: string;
    eventSubscriptions: string;
  };
  nodePaths: {
    root: string;
    imports: string;
    artifacts: string;
    logs: string;
  };
}

export interface NexusTokenResponse {
  token: string;
  payload?: {
    drive_repo?: NexusEnterpriseDriveRepo;
    [key: string]: unknown;
  };
  message?: string;
}

// ── Nexus Dispatch Types ─────────────────────────────────────────────────────

export type NexusAction =
  | 'search' | 'read_document' | 'list_dir' | 'open_file' | 'write_file'
  | 'shell_exec' | 'read_clipboard' | 'list_emails' | 'search_emails'
  | 'read_calendar' | 'read_contacts' | 'search_contacts'
  | 'terminal_open' | 'terminal_exec' | 'terminal_read' | 'terminal_snapshot' | 'terminal_close';

export interface NexusDispatchResult<T = unknown> {
  taskId: string;
  status: 'completed' | 'error' | 'dry_run' | 'approval_required';
  data?: T;
  error?: string;
  metadata?: {
    durationMs?: number;
    action: string;
    truncated?: boolean;
    governance?: Record<string, unknown>;
  };
}

export interface NexusEnterpriseCatalogExecution {
  action: NexusAction;
  params?: Record<string, unknown>;
}

export interface NexusEnterpriseCatalogDispatchPayload {
  agentId?: string;
  actionKey: string;
  requestSource?: 'chat' | 'event' | 'schedule';
  governanceMode?: 'standard' | 'full_access';
  approvalScopeKey?: string;
  approvalScopeMode?: 'single' | 'process';
  approvalScopeExpiresAt?: string;
  execution?: NexusEnterpriseCatalogExecution;
}

export interface NexusEnterpriseLocalIntegrationPayload {
  agentId?: string;
  integrationKey: string;
  operation: string;
  governanceMode?: 'standard' | 'full_access';
  approvalScopeKey?: string;
  approvalScopeMode?: 'single' | 'process';
  approvalScopeExpiresAt?: string;
  request?: {
    method?: 'GET' | 'POST';
    url: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
  defaultDecision?: 'allow' | 'dry_run' | 'approval_required' | 'deny';
}

export interface NexusEnterpriseHelperDispatchPayload {
  agentId?: string;
  helperProfileKey: string;
  helperAgentId?: string;
  reason?: string;
  governanceMode?: 'standard' | 'full_access';
  approvalScopeKey?: string;
  approvalScopeMode?: 'single' | 'process';
  approvalScopeExpiresAt?: string;
  task?: {
    title?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface NexusGovernanceApproval {
  id: string;
  workspaceId: string;
  nodeId: string;
  commandId?: string | null;
  executionCommandId?: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';
  requestType: 'catalog_action' | 'local_integration' | 'helper_delegation' | string;
  title: string;
  summary?: string | null;
  profileKey?: string | null;
  agentId?: string | null;
  governance?: Record<string, unknown>;
  requestPayload?: Record<string, unknown>;
  scopeKey?: string | null;
  scopeMode?: string | null;
  scopeExpiresAt?: string | null;
  resolutionComment?: string | null;
  resolvedByUserId?: string | null;
  resolvedByName?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NexusGovernanceAuditEvent {
  id: string;
  workspaceId: string;
  nodeId: string;
  commandId?: string | null;
  approvalId?: string | null;
  agentId?: string | null;
  profileKey?: string | null;
  requestType?: string | null;
  eventType: string;
  decision?: string | null;
  outcomeStatus?: string | null;
  message?: string | null;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export interface NexusCommandProgress {
  stage?: string;
  message?: string;
  elapsedMs?: number;
  updatedAt?: string;
}

export interface NexusCommandStatus<T = unknown> {
  id: string;
  type: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'expired';
  payload?: Record<string, unknown>;
  progress?: NexusCommandProgress | null;
  result?: T;
  error?: string;
  attempts?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  leaseMs?: number;
  durationMs?: number;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  leaseExpiresAt?: string;
  expiresAt?: string;
  updatedAt?: string;
}

export interface NexusProviderSource {
  active: string;
  fallbacks: string[];
}

export interface NexusDiscoveryApp {
  key: string;
  label: string;
  location?: string;
}

export interface NexusDiscoveryFolder {
  key: string;
  label: string;
  path: string;
}

export interface NexusDiscoveryProviderState {
  available: boolean;
  source: string;
  reason: string;
}

export interface NexusDiscoverySnapshot {
  collectedAt: string;
  platform: string;
  hostname?: string;
  homeDirectory?: string;
  detectedApps: NexusDiscoveryApp[];
  syncedFolders: NexusDiscoveryFolder[];
  providers: Record<string, NexusDiscoveryProviderState>;
  summary: {
    detectedApps: number;
    syncedFolders: number;
    readyProviders: number;
    totalProviders: number;
  };
  persistedAt?: string;
  lastCommandId?: string;
}

export interface NexusSearchResult {
  path: string;
  name: string;
  size?: number;
  modified?: string;
}

export interface NexusDocumentResult {
  content: string;
  format: string;
  metadata?: Record<string, unknown>;
}

export interface NexusEmailResult {
  sender: string;
  subject: string;
  date: string;
  preview: string;
}

export interface NexusCalendarEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
}

export interface NexusContact {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
}

export interface NexusShellResult {
  output: string;
  exitCode?: number;
}

export interface NexusTerminalOpenResult {
  sessionId: string;
  cwd: string;
  shell: string;
  cursor: number;
  bufferStart: number;
  startedAt: string;
}

export interface NexusTerminalExecResult {
  sessionId: string;
  cursor: number;
  bufferStart: number;
  output: string;
  truncated?: boolean;
  waitMs?: number;
}

export interface NexusTerminalReadResult {
  sessionId: string;
  cursor: number;
  bufferStart: number;
  output: string;
  truncated?: boolean;
  closed?: boolean;
  exitCode?: number | null;
}

export interface NexusTerminalSnapshot {
  sessionId: string;
  cwd: string;
  shell: string;
  cursor: number;
  bufferStart: number;
  startedAt: string;
  lastUsedAt: string;
  closed: boolean;
  exitCode?: number | null;
}

export interface NexusTerminalCloseResult {
  sessionId: string;
  closed: true;
}

export interface NexusCapabilities {
  platform: string;
  providers: string[];
  providerSources?: Record<string, NexusProviderSource>;
  permissions?: {
    allowedFolders: string[];
    allowedActions: string[];
  };
}

// ─── Marketplace ──────────────────────────────────────────────────────────────

export interface MarketplaceTemplateConfig {
  icon?: string;
  tags?: string[];
  model: string;
  temperature: number;
  max_tokens?: number;
  system_prompt: string;
}

export interface MarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  avatar?: string | null;
  skills?: string[];
  tags?: string[];
  permissions?: Record<string, unknown>;
  author?: string;
  rating?: number;
  avg_rating?: number;
  review_count?: number;
  install_count?: number;
  installs?: number;
  price?: number;
  created_at?: string;
  config: MarketplaceTemplateConfig;
}

export interface AgentSkill {
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
}

export interface AgentSkillsResponse {
  success: boolean;
  skills: AgentSkill[];
  grouped: Record<string, AgentSkill[]>;
  total: number;
}

export interface MarketplaceListParams {
  category?: string;
  search?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface MarketplaceListResponse {
  templates: MarketplaceTemplate[];
  total: number;
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export interface ClientDeployment {
  id: string;
  agentName: string;
  status: string;
}

export interface Client {
  id: string;
  name: string;
  contactEmail?: string;
  notes?: string;
  deployments?: ClientDeployment[];
}

export interface CreateClientPayload {
  name: string;
  contactEmail?: string;
  notes?: string;
}

// ─── Integrations ─────────────────────────────────────────────────────────────

export interface Integration {
  provider: string;
  connected: boolean;
  connected_at?: string;
  connected_by?: string;
  status?: string;
}

export type IntegrationReadiness = 'operational' | 'partial' | 'coming_soon';
export type IntegrationAccessModel = 'cloud-required' | 'local-first';
export type IntegrationCapabilityStatus =
  | 'supported'
  | 'consented'
  | 'validated'
  | 'unsupported'
  | 'local_fallback';

export interface IntegrationRuntimeState {
  workspace_available: boolean;
  provisioned: boolean;
  effective: boolean;
  reason: string | null;
}

export interface IntegrationHealthCheck {
  key: string;
  label: string;
  status: 'ok' | 'error' | string;
  code?: string;
  error?: string;
}

export interface IntegrationHealthState {
  provider: string;
  status: string;
  summary: string;
  checked_at?: string;
  checks: IntegrationHealthCheck[];
}

export interface IntegrationConsentState {
  requested_scopes: string[];
  granted_scopes: string[];
  validated_scopes: string[];
  missing_scopes: string[];
}

export interface IntegrationCapabilityEntry {
  key: string;
  label: string;
  status: IntegrationCapabilityStatus;
  description: string;
}

export interface IntegrationDetail extends Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  source: string;
  status: string;
  scopes: string[];
  config?: {
    baseUrl?: string;
    email?: string;
    connectMode?: string;
    [key: string]: unknown;
  };
  readiness: IntegrationReadiness;
  readiness_label: string;
  readiness_description: string;
  access_model: IntegrationAccessModel;
  access_model_label: string;
  access_model_description: string;
  runtime_state: IntegrationRuntimeState;
  consent: IntegrationConsentState;
  capabilities: IntegrationCapabilityEntry[];
  unsupported_capabilities: IntegrationCapabilityEntry[];
  health: IntegrationHealthState | null;
  usage: {
    api_calls_today: number;
    rate_limit_remaining: number;
  };
  webhook_url?: string;
}

export interface AgentIntegrationReadinessEntry {
  provider: string;
  name: string;
  icon: string;
  description: string;
  connected: boolean;
  status: string;
  connected_at?: string;
  readiness: IntegrationReadiness;
  readiness_label: string;
  readiness_description: string;
  access_model: IntegrationAccessModel;
  access_model_label: string;
  access_model_description: string;
  related_capabilities: AgentCapabilityKey[];
  state: AgentCapabilityState;
}

export interface AgentIntegrationReadinessPayload {
  agent_id: string;
  connectors: AgentIntegrationReadinessEntry[];
}

export interface AvailableProvider {
  provider: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  actions?: string[];
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export type ApiKeyRole = 'admin' | 'developer' | 'viewer';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  role?: ApiKeyRole;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
}

export interface ApiKeyListResponse {
  success: boolean;
  keys: ApiKey[];
}

export interface ApiKeyCreateResponse {
  success: boolean;
  key: ApiKey;
  secret: string;
  message: string;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface SettingValue {
  value: string;
  type: string;
}

export interface WorkspaceSettings {
  workspace_name?: SettingValue | string;
  workspace_description?: SettingValue | string;
  timezone?: SettingValue | string;
  default_provider?: SettingValue | string;
  drive_root?: SettingValue | string;
  snipara_api_key?: SettingValue | string;
  snipara_api_url?: SettingValue | string;
  snipara_project_id?: SettingValue | string;
  snipara_project_slug?: SettingValue | string;
  snipara_client_id?: SettingValue | string;
  snipara_swarm_id?: SettingValue | string;
  beta_features?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SettingsResponse {
  settings: WorkspaceSettings;
}

export interface UpdateSettingsPayload {
  settings: Record<string, SettingValue | unknown>;
}

export interface BetaFeatures {
  pixel_office_enabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  provider: string;
  is_active: boolean;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalAgents: number;
  activeAgents: number;
  totalMessages: number;
  uptime: number;
}

export interface DashboardData {
  stats: DashboardStats;
  agents: Agent[];
}

// ─── Health ───────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version?: string;
  uptime?: number;
}

// ─── Generic ──────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

export interface SuccessResponse {
  success: boolean;
}

// ─── Sandbox ──────────────────────────────────────────────────────────────────

export type SandboxLanguage = 'javascript' | 'python' | 'shell';
export type SandboxStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout' | 'skipped';

export interface SandboxExecution {
  id: string;
  execution_id?: string;
  agent_id?: string | null;
  language: SandboxLanguage;
  code: string;
  stdout?: string | null;
  stderr?: string | null;
  exit_code?: number | null;
  status: SandboxStatus;
  duration_ms?: number | null;
  batch_id?: string | null;
  batch_index?: number | null;
  created_at: string;
}

export interface SandboxExecutePayload {
  language: SandboxLanguage;
  code: string;
  timeout_ms?: number;
  agent_id?: string;
}

export interface SandboxBatchPayload {
  scripts: Array<{ language: SandboxLanguage; code: string; timeout_ms?: number }>;
  stop_on_error?: boolean;
  agent_id?: string;
}

export interface SandboxExecutionsParams {
  agent_id?: string;
  language?: SandboxLanguage;
  status?: SandboxStatus;
  limit?: number;
  offset?: number;
}

export interface SandboxExecutionsResponse {
  executions: SandboxExecution[];
  total: number;
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  text: string;
  type: string;
  importance: number;
  scope: 'agent' | 'template' | 'global' | string;
  scope_key?: 'instance' | 'template' | 'global' | string;
  category?: string;
  created_at: string;
  expires_at?: string | null;
  last_seen_at?: string;
  last_used_at?: string | null;
  usage_count?: number;
  duplicate_count?: number;
  promotion_score?: number;
  retrieval_score?: number;
  agent_id?: string;
  visibility?: 'internal' | 'reviewable' | 'user_visible' | string;
  status?: 'active' | 'expired' | 'invalidated' | 'superseded' | 'needs_verification' | string;
  sources?: MemorySource[];
  source_count?: number;
  verified_at?: string | null;
  verification_note?: string | null;
  invalidated_at?: string | null;
  invalidation_reason?: string | null;
  replacement_hint?: string | null;
  superseded_at?: string | null;
  superseded_by_text?: string | null;
  lifecycle_remote_synced?: boolean;
  lifecycle_remote_error?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export interface MemorySource {
  source_ref?: string | null;
  evidence_note?: string | null;
  attached_at?: string | null;
}

export interface AgentMemoryListResponse {
  memories: Memory[];
  count: number;
  total_count?: number;
  visible_count?: number;
  hidden_count?: number;
  expired_count?: number;
  deleted_count?: number;
  has_more?: boolean;
  count_is_estimate?: boolean;
}

export interface AgentContext {
  memories: Memory[];
  context: string;
  soul?: string;
  template_count: number;
  instance_count: number;
  global_count?: number;
  role: string;
  hidden_instance_count?: number;
  hidden_template_count?: number;
  hidden_global_count?: number;
  expired_instance_count?: number;
  expired_template_count?: number;
  expired_global_count?: number;
  instance_count_is_estimate?: boolean;
  template_count_is_estimate?: boolean;
  global_count_is_estimate?: boolean;
}

export interface RememberPayload {
  text: string;
  type: Memory['type'];
  importance: number;
}

export interface MemoryActionResult {
  memory_id: string;
  action: 'attach_source' | 'verify' | 'invalidate' | 'supersede' | string;
  status?: Memory['status'];
  source_ref?: string | null;
  evidence_note?: string | null;
  attached_at?: string | null;
  verified_at?: string | null;
  verification_note?: string | null;
  invalidated_at?: string | null;
  invalidation_reason?: string | null;
  replacement_hint?: string | null;
  superseded_at?: string | null;
  superseded_reason?: string | null;
  superseded_by_text?: string | null;
  remote_synced?: boolean;
  remote_error?: Record<string, unknown> | null;
}

// ─── Workspace Memory ─────────────────────────────────────────────────────────

export interface WorkspaceKnowledge {
  content: string;
  updatedAt: string;
  readOnly?: boolean;
}

export interface TemplateScope {
  scope: string;
  role: string;
  docCount: number;
  lastUpdated: string;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  scope: string;
  agentName?: string;
  importance: number;
  type: string;
  createdAt: string;
}

export interface SniparaStatusResponse {
  workspace_id: string;
  configured: boolean;
  integration_key_present: boolean;
  settings?: {
    api_url?: string | null;
    project_id?: string | null;
    project_slug?: string | null;
    swarm_id?: string | null;
    api_key_present?: boolean;
  };
  resolved?: {
    source?: string | null;
    api_url?: string | null;
    project_id?: string | null;
    project_slug?: string | null;
    swarm_id?: string | null;
    api_key_present?: boolean;
  };
}

export interface SniparaHealthResponse {
  ok?: boolean;
  configured?: boolean;
  error?: string | null;
  [key: string]: unknown;
}

export interface SniparaIndexHealth {
  supported: boolean;
  degraded: boolean;
  status?: string | null;
  score?: number | null;
  stale_documents?: number | null;
  documents_indexed?: number | null;
  last_indexed_at?: string | null;
  avg_latency_ms?: number | null;
  errors_last_24h?: number | null;
  message?: string | null;
  error?: Record<string, unknown> | null;
  raw?: Record<string, unknown>;
}

export interface SniparaSearchAnalytics {
  supported: boolean;
  degraded: boolean;
  days: number;
  total_queries?: number;
  avg_latency_ms?: number | null;
  success_rate?: number | null;
  zero_result_rate?: number | null;
  top_queries?: unknown[];
  message?: string | null;
  error?: Record<string, unknown> | null;
  raw?: Record<string, unknown>;
}

export interface SniparaHtaskPolicy {
  supported: boolean;
  degraded: boolean;
  closure_verification_required?: boolean;
  block_on_failed_checks?: boolean;
  max_depth?: number | null;
  default_mode?: string | null;
  message?: string | null;
  error?: Record<string, unknown> | null;
  raw?: Record<string, unknown>;
}

export interface SniparaHtaskMetrics {
  supported: boolean;
  degraded: boolean;
  open_count?: number;
  blocked_count?: number;
  stale_count?: number;
  avg_closure_hours?: number | null;
  message?: string | null;
  error?: Record<string, unknown> | null;
  raw?: Record<string, unknown>;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminStats {
  total: string;
  admins: string;
  users: string;
  banned: string;
  plan_free: string;
  plan_office_starter?: string;
  plan_office_team?: string;
  plan_agents_starter?: string;
  plan_agents_pro?: string;
  plan_nexus_enterprise?: string;
  plan_full?: string;
  plan_enterprise: string;
  plan_beta: string;
  plan_starter?: string;
  plan_team?: string;
  signups_7d: string;
  signups_30d: string;
}

export interface AdminUser {
  id: string;
  workspace_id: string | null;
  email: string;
  name: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  plan: string | null;
  plan_expires_at: string | null;
  beta_code: string | null;
  stripe_customer_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  last_login_at: string | null;
}

export interface AdminUsersMeta {
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface ServiceHealth {
  name: string;
  key: string;
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unknown';
  latency_ms: number | null;
  last_checked: string;
  url?: string;
  error?: string;
  required: boolean;
  description: string;
}

export interface VpsHealth {
  timestamp: string;
  hostname: string;
  cpu: {
    cores: number;
    model: string;
    usage_percent: number;
    load_average: {
      one_minute: number;
      five_minutes: number;
      fifteen_minutes: number;
    };
  };
  memory: {
    total_bytes: number;
    used_bytes: number;
    free_bytes: number;
    available_bytes: number;
    usage_percent: number;
    swap_total_bytes: number;
    swap_used_bytes: number;
    swap_usage_percent: number;
  };
  disks: {
    mount_point: string;
    filesystem: string;
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    usage_percent: number;
  }[];
  network: {
    name: string;
    rx_bytes: number;
    tx_bytes: number;
    rx_packets: number;
    tx_packets: number;
    rx_errors: number;
    tx_errors: number;
  }[];
  uptime: {
    uptime_seconds: number;
    uptime_formatted: string;
    boot_time: string;
  };
  status: 'healthy' | 'warning' | 'critical';
  alerts: string[];
}

export interface VpsHealthResponse {
  success: boolean;
  services: ServiceHealth[];
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    degraded: number;
  };
  vps: VpsHealth | null;
  timestamp: string;
}

export interface AdminChatMaintenanceResult {
  legacy_count?: number;
  technical_count?: number;
  legacy_channels?: Array<{
    id: string;
    current_name: string;
    canonical_name: string | null;
    contact_type: string;
    channel_type?: string;
  }>;
  technical_channels?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
  technical_workspace_channel_count?: number;
  technical_workspace_channels?: Array<{
    id: string;
    name: string;
    description?: string;
    channel_type?: string;
  }>;
  normalized_count?: number;
  normalized?: Array<{
    id: string;
    previous_name: string;
    canonical_name: string;
  }>;
  archived_channel_count?: number;
  archived_preference_count?: number;
  channels?: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
}
