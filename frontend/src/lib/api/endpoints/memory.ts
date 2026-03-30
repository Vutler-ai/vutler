import { apiFetch } from '../client';
import type {
  Memory,
  AgentContext,
  RememberPayload,
  SuccessResponse,
  WorkspaceKnowledge,
  TemplateScope,
  MemorySearchResult,
  AgentMemoryListResponse,
} from '../types';

export async function recallMemories(agentId: string, query?: string): Promise<Memory[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (query) params.set('q', query);
  const data = await apiFetch<AgentMemoryListResponse>(`/api/v1/agents/${agentId}/memories?${params}`);
  return data.memories ?? [];
}

export async function getAgentMemorySummary(agentId: string): Promise<AgentMemoryListResponse> {
  return apiFetch<AgentMemoryListResponse>(
    `/api/v1/agents/${agentId}/memories?countOnly=true&limit=200`
  );
}

export async function recallTemplateMemories(agentId: string, role?: string): Promise<Memory[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (role) params.set('role', role);
  const data = await apiFetch<{ memories?: Memory[] }>(
    `/api/v1/agents/${agentId}/memories/template?${params}`
  );
  return data.memories ?? [];
}

export async function rememberMemory(agentId: string, payload: RememberPayload): Promise<void> {
  await apiFetch<SuccessResponse>(`/api/v1/agents/${agentId}/memories`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMemory(agentId: string, memoryId: string): Promise<void> {
  await apiFetch<SuccessResponse>(`/api/v1/agents/${agentId}/memories/${memoryId}`, {
    method: 'DELETE',
  });
}

export async function getAgentContext(agentId: string, role?: string): Promise<AgentContext> {
  const params = new URLSearchParams();
  if (role) params.set('role', role);
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch<AgentContext>(`/api/v1/agents/${agentId}/memories/context${qs}`);
}

export async function promoteMemory(agentId: string, memoryId: string, role?: string): Promise<void> {
  await apiFetch<SuccessResponse>(
    `/api/v1/agents/${agentId}/memories/${memoryId}/promote`,
    {
      method: 'POST',
      body: JSON.stringify({ role: role ?? 'general' }),
    }
  );
}

export async function getWorkspaceKnowledge(): Promise<WorkspaceKnowledge> {
  return apiFetch<WorkspaceKnowledge>('/api/v1/memory/workspace-knowledge');
}

export async function updateWorkspaceKnowledge(content: string): Promise<WorkspaceKnowledge> {
  return apiFetch<WorkspaceKnowledge>('/api/v1/memory/workspace-knowledge', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function getTemplateScopes(): Promise<TemplateScope[]> {
  const data = await apiFetch<{ templates?: TemplateScope[] } | TemplateScope[]>(
    '/api/v1/memory/templates'
  );
  return Array.isArray(data) ? data : (data.templates ?? []);
}

export async function searchMemory(query: string): Promise<MemorySearchResult[]> {
  const params = new URLSearchParams({ q: query });
  const data = await apiFetch<{ results?: MemorySearchResult[] } | MemorySearchResult[]>(
    `/api/v1/memory/search?${params}`
  );
  return Array.isArray(data) ? data : (data.results ?? []);
}
