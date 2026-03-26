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
  status: 'active' | 'inactive' | 'error';
  lastActive?: string;
  model?: string;
  provider?: string;
  autoApproveEmail?: boolean;
  auto_approve_email?: boolean;
  config?: Record<string, unknown>;
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
  attachments?: Attachment[];
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: 'channel' | 'direct';
  members: string[];
}

export interface ChannelMember {
  id: string;
  type: 'user' | 'agent';
  name: string;
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

export type EmailFolder = 'inbox' | 'sent';

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
  modified: string;
  mime_type?: string;
  path: string;
}

export interface CreateFolderPayload {
  path: string;
  name: string;
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  color: string;
}

export interface CreateEventPayload {
  title: string;
  start: string;
  end: string;
  description?: string;
  color: string;
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export interface PlanLimits {
  agents?: number;
  tokens?: number;
  storage?: string;
  nexusNodes?: number;
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

export interface NexusNode {
  id: string;
  name: string;
  status: 'online' | 'warning' | 'offline';
  agentCount: number;
  lastHeartbeat?: string;
  mode?: 'local' | 'enterprise' | 'standard';
  clientName?: string;
  clientId?: string;
}

export interface NexusStats {
  total: number;
  online: number;
  agents: number;
  tasksCompleted: number;
}

export interface NexusStatusResponse {
  nodes: NexusNode[];
  stats: NexusStats;
}

export interface DeployLocalPayload {
  agentId: string;
  ollamaEndpoint?: string;
}

export interface DeployEnterprisePayload {
  name: string;
  clientName: string;
  role: string;
  filesystemRoot: string;
  offlineMode: boolean;
}

export interface NexusTokenResponse {
  token: string;
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

// ─── Memory ───────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  text: string;
  type: 'fact' | 'learning' | 'decision' | 'preference';
  importance: number;
  scope: 'agent' | 'template' | 'global';
  category?: string;
  created_at: string;
  agent_id?: string;
}

export interface AgentContext {
  memories: Memory[];
  context: string;
  soul?: string;
  template_count: number;
  instance_count: number;
  role: string;
}

export interface RememberPayload {
  text: string;
  type: Memory['type'];
  importance: number;
}
