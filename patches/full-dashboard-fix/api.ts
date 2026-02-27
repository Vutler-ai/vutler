/**
 * Vutler API Client
 * Typed client for the Vutler Express API
 */

import { getAuthHeaders } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ========== Types ==========

export interface Agent {
  id: string;
  _id?: string;
  name: string;
  emoji?: string;
  role?: string;
  roleColor?: string;
  mbti?: string;
  model?: string;
  modelBadge?: string;
  currentTask?: string;
  status: 'active' | 'inactive' | 'idle' | 'paused' | 'error';
  cpu?: number;
  tokensToday?: string;
  platform?: string;
  lastActive?: string;
  config?: Record<string, unknown>;
  soul?: string;
  provider?: string;
  capabilities?: string[];
  channels?: string[];
  traits?: string[];
  quote?: string;
}

export interface Task {
  id: string;
  _id?: string;
  title: string;
  description: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'backlog' | 'in-progress' | 'review' | 'done';
  agentId: string;
  agentName?: string;
  agentEmoji?: string;
  dueDate: string;
  progress: number;
  tags: string[];
  checklist: { label: string; done: boolean }[];
  timeSpent?: string;
  sprint?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CalendarEvent {
  id: string;
  _id?: string;
  title: string;
  date: string; // ISO date
  day?: number; // day of month
  time: string;
  endTime: string;
  type: 'MEETING' | 'AGENT TASK' | 'DEPLOY';
  agentId: string;
  agentName?: string;
  agentEmoji?: string;
  agentColor?: string;
  description: string;
  createdAt?: string;
}

export interface Email {
  id: string;
  _id?: string;
  from: string;
  fromEmail: string;
  avatar: string;
  subject: string;
  preview: string;
  body: string;
  time: string;
  unread: boolean;
  flagged: boolean;
  agentHandled: boolean;
  handledBy?: string;
  needsApproval?: boolean;
  aiDraft?: string;
  createdAt?: string;
}

export interface Goal {
  id: string;
  _id?: string;
  title: string;
  agentId: string;
  agentName?: string;
  agentEmoji?: string;
  agentRole?: string;
  deadline: string;
  status: 'ON-TRACK' | 'AT-RISK' | 'BEHIND';
  progress: number;
  priority: 'High' | 'Medium' | 'Low';
  resourceCap?: string;
  autonomyLevel?: string;
  phases: { name: string; status: 'done' | 'active' | 'pending' }[];
  checkins: { date: string; note: string }[];
  aiInsight?: string;
  createdAt?: string;
}

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

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version?: string;
  uptime?: number;
}

export interface CreateAgentPayload {
  name: string;
  platform: string;
  config?: Record<string, unknown>;
}

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}

// ========== API Client ==========

class VutlerApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const error: ApiError = await response.json().catch(() => ({
          error: 'Request failed',
          statusCode: response.status,
        }));
        throw new Error(error.message || error.error || 'Request failed');
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error) throw error;
      throw new Error('Unknown error occurred');
    }
  }

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>('/api/v1/dashboard');
  }

  // Agents (graceful 401)
  async getAgents(): Promise<Agent[]> {
    try {
      const res = await this.request<Agent[] | { agents?: Agent[] }>('/api/v1/agents');
      if (Array.isArray(res)) return res;
      return res.agents || [];
    } catch {
      // 401/auth errors → return empty list gracefully
      return [];
    }
  }

  async getAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/api/v1/agents/${id}`);
  }

  async createAgent(payload: CreateAgentPayload): Promise<Agent> {
    return this.request<Agent>('/api/v1/agents', { method: 'POST', body: JSON.stringify(payload) });
  }

  async updateAgent(id: string, payload: Partial<CreateAgentPayload>): Promise<Agent> {
    return this.request<Agent>(`/api/v1/agents/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  async deleteAgent(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/agents/${id}`, { method: 'DELETE' });
  }

  // Tasks
  async getTasks(): Promise<Task[]> {
    const res = await this.request<{ success: boolean; tasks: Task[] } | Task[]>('/api/v1/tasks');
    if (Array.isArray(res)) return res;
    return res.tasks || [];
  }

  async getTask(id: string): Promise<Task> {
    return this.request<Task>(`/api/v1/tasks/${id}`);
  }

  async createTask(payload: Partial<Task>): Promise<Task> {
    return this.request<Task>('/api/v1/tasks', { method: 'POST', body: JSON.stringify(payload) });
  }

  async updateTask(id: string, payload: Partial<Task>): Promise<Task> {
    return this.request<Task>(`/api/v1/tasks/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  }

  // Goals
  async getGoals(): Promise<Goal[]> {
    const res = await this.request<{ success: boolean; goals: Goal[] } | Goal[]>('/api/v1/goals');
    if (Array.isArray(res)) return res;
    return res.goals || [];
  }

  async getGoal(id: string): Promise<Goal> {
    return this.request<Goal>(`/api/v1/goals/${id}`);
  }

  async createGoal(payload: Partial<Goal>): Promise<Goal> {
    return this.request<Goal>('/api/v1/goals', { method: 'POST', body: JSON.stringify(payload) });
  }

  // Events (calendar)
  async getEvents(): Promise<CalendarEvent[]> {
    const res = await this.request<{ success: boolean; events: CalendarEvent[] }>('/api/v1/calendar/events');
    return res.events || [];
  }

  async createEvent(payload: Partial<CalendarEvent>): Promise<CalendarEvent> {
    const res = await this.request<{ success: boolean; event: CalendarEvent }>('/api/v1/calendar/events', { method: 'POST', body: JSON.stringify(payload) });
    return res.event;
  }

  // Emails (normalize PG shape to frontend shape)
  async getEmails(): Promise<Email[]> {
    const res = await this.request<{ success: boolean; emails: Record<string, unknown>[] }>('/api/v1/emails');
    return (res.emails || []).map((e: Record<string, unknown>) => ({
      id: (e.id || e._id || '') as string,
      _id: (e._id || e.id || '') as string,
      from: (e.from_addr || e.from || 'Unknown') as string,
      fromEmail: (e.from_addr || e.fromEmail || '') as string,
      avatar: ((e.from_addr || '') as string).charAt(0).toUpperCase(),
      subject: (e.subject || '(no subject)') as string,
      preview: ((e.body || '') as string).slice(0, 100),
      body: (e.body || e.html_body || '') as string,
      time: e.created_at ? new Date(e.created_at as string).toLocaleString() : '',
      unread: e.is_read === false,
      flagged: false,
      agentHandled: !!e.agent_id,
      handledBy: (e.agent_id || undefined) as string | undefined,
      createdAt: (e.created_at || '') as string,
    }));
  }

  async getEmail(id: string): Promise<Email> {
    return this.request<Email>(`/api/v1/emails/${id}`);
  }

  // Health
  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/api/v1/health');
  }
}

export const api = new VutlerApiClient();
export { VutlerApiClient };
