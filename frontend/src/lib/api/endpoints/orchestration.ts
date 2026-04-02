import { apiFetch } from '../client';
import type { OrchestrationRunDetail } from '../types';

export async function getOrchestrationRun(id: string): Promise<OrchestrationRunDetail> {
  const data = await apiFetch<{ data?: OrchestrationRunDetail } | OrchestrationRunDetail>(`/api/v1/orchestration/runs/${id}`);
  if ('data' in data && data.data) return data.data;
  return data as OrchestrationRunDetail;
}

export async function approveOrchestrationRun(id: string, payload?: { approved?: boolean; note?: string | null }) {
  const data = await apiFetch<{ data?: unknown } | unknown>(`/api/v1/orchestration/runs/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
  if (typeof data === 'object' && data && 'data' in data) return data.data;
  return data;
}

export async function resumeOrchestrationRun(id: string, payload?: { note?: string | null }) {
  const data = await apiFetch<{ data?: unknown } | unknown>(`/api/v1/orchestration/runs/${id}/resume`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
  if (typeof data === 'object' && data && 'data' in data) return data.data;
  return data;
}

export async function cancelOrchestrationRun(id: string, payload?: { note?: string | null }) {
  const data = await apiFetch<{ data?: unknown } | unknown>(`/api/v1/orchestration/runs/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
  if (typeof data === 'object' && data && 'data' in data) return data.data;
  return data;
}
