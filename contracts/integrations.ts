/**
 * Integrations API Contracts
 * Shared between frontend and backend
 */

export type IntegrationProvider = 
  | 'notion' 
  | 'jira' 
  | 'linear'
  | 'github' 
  | 'slack' 
  | 'discord'
  | 'n8n'
  | 'zapier';

export type IntegrationStatus = 'connected' | 'disconnected' | 'error';

export interface Integration {
  id: number;
  workspaceId: string;
  provider: IntegrationProvider;
  name: string;
  status: IntegrationStatus;
  config: Record<string, any>;
  credentials?: Record<string, any>;  // Never send to frontend
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationListResponse {
  success: boolean;
  integrations: Omit<Integration, 'credentials'>[];  // Strip credentials
}

export interface ConnectIntegrationRequest {
  provider: IntegrationProvider;
  name?: string;
  credentials: Record<string, any>;  // API key, OAuth token, etc.
  config?: Record<string, any>;
}

export interface ConnectIntegrationResponse {
  success: boolean;
  integration: Omit<Integration, 'credentials'>;
}

export interface DisconnectIntegrationRequest {
  id: number;
}

export interface DisconnectIntegrationResponse {
  success: boolean;
  message: string;
}

export interface TestIntegrationRequest {
  id: number;
}

export interface TestIntegrationResponse {
  success: boolean;
  status: IntegrationStatus;
  message: string;
}
