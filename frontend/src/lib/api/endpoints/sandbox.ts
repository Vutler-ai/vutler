import { apiFetch } from '../client';
import type {
  SandboxExecution,
  SandboxExecutePayload,
  SandboxBatchPayload,
  SandboxExecutionsParams,
  SandboxExecutionsResponse,
  SandboxAnalytics,
} from '../types';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export async function executeSandbox(
  payload: SandboxExecutePayload
): Promise<SandboxExecution> {
  const res = await apiFetch<ApiResponse<SandboxExecution>>('/api/v1/sandbox/execute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function executeBatch(
  payload: SandboxBatchPayload
): Promise<SandboxExecution[]> {
  const res = await apiFetch<ApiResponse<SandboxExecution[]>>('/api/v1/sandbox/batch', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function getSandboxExecutions(
  params?: SandboxExecutionsParams
): Promise<SandboxExecutionsResponse> {
  const query = new URLSearchParams();
  if (params?.agent_id) query.set('agent_id', params.agent_id);
  if (params?.language) query.set('language', params.language);
  if (params?.status) query.set('status', params.status);
  if (params?.limit != null) query.set('limit', String(params.limit));
  if (params?.offset != null) query.set('offset', String(params.offset));

  const qs = query.toString();
  const res = await apiFetch<ApiResponse<SandboxExecutionsResponse>>(
    `/api/v1/sandbox/executions${qs ? `?${qs}` : ''}`
  );
  return res.data;
}

export async function getSandboxExecution(id: string): Promise<SandboxExecution> {
  const res = await apiFetch<ApiResponse<SandboxExecution>>(
    `/api/v1/sandbox/executions/${id}`
  );
  return res.data;
}

export async function getSandboxAnalytics(days = 7): Promise<SandboxAnalytics> {
  const res = await apiFetch<ApiResponse<SandboxAnalytics>>(
    `/api/v1/sandbox/analytics?days=${days}`
  );
  return res.data;
}
