/**
 * Vutler API Client
 * Typed client for the Vutler Express API
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ========== Types ==========

export interface Agent {
  id: string;
  name: string;
  platform: string;
  status: 'active' | 'inactive' | 'error';
  lastActive?: string;
  config?: Record<string, unknown>;
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

  /**
   * Generic fetch wrapper with error handling
   */
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
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred');
    }
  }

  /**
   * GET /api/v1/dashboard
   * Fetch dashboard stats and agents list
   */
  async getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>('/api/v1/dashboard');
  }

  /**
   * GET /api/v1/agents
   * Fetch all agents
   */
  async getAgents(): Promise<Agent[]> {
    return this.request<Agent[]>('/api/v1/agents');
  }

  /**
   * GET /api/v1/health
   * Check API health status
   */
  async getHealth(): Promise<HealthStatus> {
    return this.request<HealthStatus>('/api/v1/health');
  }

  /**
   * POST /api/v1/agents
   * Create a new agent
   */
  async createAgent(payload: CreateAgentPayload): Promise<Agent> {
    return this.request<Agent>('/api/v1/agents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * GET /api/v1/agents/:id
   * Fetch a single agent by ID
   */
  async getAgent(id: string): Promise<Agent> {
    return this.request<Agent>(`/api/v1/agents/${id}`);
  }

  /**
   * DELETE /api/v1/agents/:id
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/api/v1/agents/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * PUT /api/v1/agents/:id
   * Update an agent
   */
  async updateAgent(
    id: string,
    payload: Partial<CreateAgentPayload>
  ): Promise<Agent> {
    return this.request<Agent>(`/api/v1/agents/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

// ========== Export singleton instance ==========

export const api = new VutlerApiClient();

// Also export the class for custom instances
export { VutlerApiClient };
