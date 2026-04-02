import { apiFetch } from '../client';
import type { OrchestrationAutonomyMetrics, OrchestrationRunDetail } from '../types';

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

export async function getOrchestrationAutonomyMetrics(params?: { windowDays?: number }) {
  const query = new URLSearchParams();
  if (params?.windowDays) query.set('windowDays', String(params.windowDays));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const data = await apiFetch<{ data?: OrchestrationAutonomyMetrics } | OrchestrationAutonomyMetrics>(
    `/api/v1/orchestration/metrics/autonomy${suffix}`
  );
  if (typeof data === 'object' && data && 'data' in data && data.data) return data.data;
  return data as OrchestrationAutonomyMetrics;
}
