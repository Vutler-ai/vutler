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
  type?: string;
  role?: string;
  autoApproveEmail?: boolean;
  auto_approve_email?: boolean;
  config?: Record<string, unknown>;
  capabilities?: string[];
  skills?: string[];
  tools?: string[];
  avatar?: string;
  username?: string;
}

export interface CreateAgentPayload {
  name: string;
  platform: string;
  config?: Record<string, unknown>;
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
  status: 'todo' | 'in_progress' | 'done' | 'pending' | 'completed';
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
}

// ─── Email ────────────────────────────────────────────────────────────────────

export type EmailFolder = 'inbox' | 'sent' | 'archive' | 'drafts' | 'trash';

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
  target: Record<string, unknown>;
  evidenceCounts?: Record<string, unknown>;
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

export interface PlansResponse {
  office: Plan[];
  agents: Plan[];
  full: Plan[];
}

export interface Subscription {
  planId: string | null;
  interval: 'monthly' | 'yearly';
  plan_name?: string;
  status?: string;
  current_period_end?: string | null;
  usage?: SubscriptionUsage | null;
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

export interface DeployLocalPayload {
  agentIds: string[];
  routingRules?: Array<{ pattern: string; agentId: string }>;
  ollamaEndpoint?: string;
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

export interface NexusTokenResponse {
  token: string;
}

// ── Nexus Dispatch Types ─────────────────────────────────────────────────────

export type NexusAction =
  | 'search' | 'read_document' | 'list_dir' | 'open_file' | 'write_file'
  | 'shell_exec' | 'read_clipboard' | 'list_emails' | 'search_emails'
  | 'read_calendar' | 'read_contacts' | 'search_contacts';

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

export interface NexusCapabilities {
  platform: string;
  providers: string[];
  providerSources?: Record<string, NexusProviderSource>;
  permissions?: { allowedFolders: string[] };
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
  status?: 'active' | 'expired' | string;
  metadata?: Record<string, unknown>;
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

// ─── Admin ───────────────────────────────────────────────────────────────────

export interface AdminStats {
  total: string;
  admins: string;
  users: string;
  banned: string;
  plan_free: string;
  plan_starter: string;
  plan_team: string;
  plan_enterprise: string;
  plan_beta: string;
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
