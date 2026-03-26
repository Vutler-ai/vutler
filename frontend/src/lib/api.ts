/**
 * Vutler API Client
 * Typed client for the Vutler Express API with JWT authentication
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '';

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

// ========== Auth utilities ==========

export const AUTH_TOKEN_KEY = 'vutler_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  window.location.href = '/login';
}

// ========== API Client ==========

class VutlerApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic fetch wrapper with auth headers and error handling
   */
  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = getAuthToken();
    
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          ...options?.headers,
        },
      });

      if (response.status === 401) {
        // Token expired or invalid, redirect to login
        clearAuthToken();
        redirectToLogin();
        throw new Error('Authentication required');
      }

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
   * POST /api/v1/auth/login
   * Login with email and password
   */
  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    // Store the token
    setAuthToken(response.token);
    
    return response;
  }

  /**
   * POST /api/v1/auth/logout
   * Logout (clear token)
   */
  async logout(): Promise<{ success: boolean }> {
    clearAuthToken();
    return this.request<{ success: boolean }>('/api/v1/auth/logout', {
      method: 'POST',
    });
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

  // ========== Billing ==========

  /**
   * GET /api/v1/billing/plans
   * Fetch available billing plans
   */
  async fetchPlans(): Promise<unknown> {
    return this.request('/api/v1/billing/plans');
  }

  /**
   * GET /api/v1/billing/subscription
   * Fetch current subscription
   */
  async fetchSubscription(): Promise<unknown> {
    return this.request('/api/v1/billing/subscription');
  }

  /**
   * POST /api/v1/billing/checkout
   * Create a checkout session
   */
  async createCheckout(planId: string, interval: 'monthly' | 'yearly'): Promise<unknown> {
    return this.request('/api/v1/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({
        planId,
        interval,
        successUrl: typeof window !== 'undefined' ? window.location.href : '',
        cancelUrl: typeof window !== 'undefined' ? window.location.href : '',
      }),
    });
  }

  /**
   * POST /api/v1/billing/portal
   * Create a customer portal session
   */
  async createPortalSession(): Promise<unknown> {
    return this.request('/api/v1/billing/portal', { method: 'POST' });
  }

  /**
   * POST /api/v1/billing/change-plan
   * Change the current plan
   */
  async changePlan(planId: string): Promise<unknown> {
    return this.request('/api/v1/billing/change-plan', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    });
  }
}

// ========== Export singleton instance ==========

export const api = new VutlerApiClient();

// Also export the class for custom instances
export { VutlerApiClient };