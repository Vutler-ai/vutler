import { apiFetch } from '../client';
import type { Integration, AvailableProvider, SuccessResponse } from '../types';

const OAUTH_PROVIDERS = new Set(['google', 'github', 'microsoft365']);

export async function getIntegrations(): Promise<Integration[]> {
  const data = await apiFetch<{ integrations?: Integration[] } | Integration[]>(
    '/api/v1/integrations'
  );
  return Array.isArray(data) ? data : (data.integrations ?? []);
}

export async function getAvailableProviders(): Promise<AvailableProvider[]> {
  const data = await apiFetch<{ providers?: AvailableProvider[] } | AvailableProvider[]>(
    '/api/v1/integrations/available'
  );
  return Array.isArray(data) ? data : (data.providers ?? []);
}

export async function connect(provider: string): Promise<{ url?: string }> {
  if (OAUTH_PROVIDERS.has(provider)) {
    const response = await apiFetch<{ authUrl?: string; url?: string }>(
      `/api/v1/integrations/${provider}/connect`
    );
    return { url: response.url || response.authUrl };
  }

  const response = await apiFetch<{ authUrl?: string; url?: string }>(
    `/api/v1/integrations/${provider}/connect`,
    { method: 'POST' }
  );
  return { url: response.url || response.authUrl };
}

export async function disconnect(provider: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/integrations/${provider}/disconnect`,
    { method: 'DELETE' }
  );
}
