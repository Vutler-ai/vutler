export const AUTH_TOKEN_KEY = 'vutler_auth_token';
export const ADMIN_TOKEN_KEY = 'vutler_admin_token';

export const AUTH_TOKEN_COOKIE = 'vutler_auth';
export const ADMIN_TOKEN_COOKIE = 'vutler_admin';
export const WORKSPACE_FEATURES_COOKIE = 'vutler_features';

export interface WorkspaceFeatureSnapshot {
  plan: string;
  features: string[];
  snipara?: string[];
  updatedAt?: string;
}
