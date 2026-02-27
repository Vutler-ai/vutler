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

  // Agents
  async getAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('/api/v1/agents');
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
    return this.request<Task[]>('/api/v1/tasks');
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
    return this.request<Goal[]>('/api/v1/goals');
  }

  async getGoal(id: string): Promise<Goal> {
    return this.request<Goal>(`/api/v1/goals/${id}`);
  }

  async createGoal(payload: Partial<Goal>): Promise<Goal> {
    return this.request<Goal>('/api/v1/goals', { method: 'POST', body: JSON.stringify(payload) });
  }

  // Events
  async getEvents(): Promise<CalendarEvent[]> {
    return this.request<CalendarEvent[]>('/api/v1/events');
  }

  async createEvent(payload: Partial<CalendarEvent>): Promise<CalendarEvent> {
    return this.request<CalendarEvent>('/api/v1/events', { method: 'POST', body: JSON.stringify(payload) });
  }

  // Emails
  async getEmails(): Promise<Email[]> {
    return this.request<Email[]>('/api/v1/emails');
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
