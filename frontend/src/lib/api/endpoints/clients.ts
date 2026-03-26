import { apiFetch } from '../client';
import type { Client, CreateClientPayload, SuccessResponse } from '../types';

export async function getClients(): Promise<Client[]> {
  const data = await apiFetch<{ clients?: Client[] } | Client[]>(
    '/api/v1/clients'
  );
  return Array.isArray(data) ? data : (data.clients ?? []);
}

export async function createClient(
  payload: CreateClientPayload
): Promise<Client> {
  const data = await apiFetch<{ client?: Client } | Client>(
    '/api/v1/clients',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return 'client' in data && data.client ? data.client : (data as Client);
}

export async function updateClient(
  id: string,
  payload: Partial<CreateClientPayload>
): Promise<Client> {
  return apiFetch<Client>(`/api/v1/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteClient(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/clients/${id}`, {
    method: 'DELETE',
  });
}
