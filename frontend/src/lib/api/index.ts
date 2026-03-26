// Core client
export {
  apiFetch,
  authFetch,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  isAuthenticated,
  redirectToLogin,
  AUTH_TOKEN_KEY,
} from './client';

// Types
export type * from './types';

// Endpoint modules
export * as agentsApi from './endpoints/agents';
export * as tasksApi from './endpoints/tasks';
export * as chatApi from './endpoints/chat';
export * as emailApi from './endpoints/email';
export * as driveApi from './endpoints/drive';
export * as calendarApi from './endpoints/calendar';
export * as billingApi from './endpoints/billing';
export * as nexusApi from './endpoints/nexus';
export * as marketplaceApi from './endpoints/marketplace';
export * as clientsApi from './endpoints/clients';
export * as integrationsApi from './endpoints/integrations';
export * as settingsApi from './endpoints/settings';
