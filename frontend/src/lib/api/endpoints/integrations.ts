import { apiFetch } from '../client';
import type { Integration, AvailableProvider, SuccessResponse } from '../types';

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
  return apiFetch<{ url?: string }>(
    `/api/v1/integrations/${provider}/connect`,
    { method: 'POST' }
  );
}

export async function disconnect(provider: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/integrations/${provider}/disconnect`,
    { method: 'DELETE' }
  );
}
