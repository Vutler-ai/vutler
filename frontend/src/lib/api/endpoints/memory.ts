import { apiFetch } from '../client';
import type {
  Memory,
  AgentContext,
  RememberPayload,
  SuccessResponse,
  WorkspaceKnowledge,
  ContinuityBrief,
  JournalState,
  JournalAutomationPolicies,
  JournalAutomationPolicy,
  JournalAutomationSweepResult,
  JournalAutomationRuntimeStatus,
  JournalSummarizeResult,
  GroupMemorySpace,
  AgentGroupMemoryResponse,
  TemplateScope,
  MemorySearchResult,
  AgentMemoryListResponse,
  MemoryActionResult,
  SniparaStatusResponse,
  SniparaHealthResponse,
  SniparaProvisioningDiagnostics,
  SniparaProvisioningOperationsResponse,
  SniparaProvisioningProbeResult,
  SniparaProvisionResult,
  SniparaWebhookEventLogResponse,
  SniparaIndexHealth,
  SniparaSearchAnalytics,
  SniparaHtaskPolicy,
  SniparaHtaskMetrics,
  SniparaSharedTemplates,
  SniparaSharedCollections,
  SniparaSharedUploads,
  SniparaSharedDocumentUploadPayload,
  SniparaSharedDocumentUploadResult,
  SniparaSyncStatus,
} from '../types';

export interface RecallMemoriesOptions {
  query?: string;
  view?: 'active' | 'graveyard' | 'all';
}

export async function recallMemories(agentId: string, options: RecallMemoriesOptions = {}): Promise<Memory[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (options.query) params.set('q', options.query);
  if (options.view) params.set('view', options.view);
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

export async function attachMemorySource(
  agentId: string,
  memoryId: string,
  payload: { source_ref: string; evidence_note?: string }
): Promise<MemoryActionResult> {
  const response = await apiFetch<{ data?: MemoryActionResult }>(
    `/api/v1/agents/${agentId}/memories/${memoryId}/attach-source`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data as MemoryActionResult;
}

export async function verifyMemory(
  agentId: string,
  memoryId: string,
  payload: { evidence_note?: string; probe?: Record<string, unknown> } = {}
): Promise<MemoryActionResult> {
  const response = await apiFetch<{ data?: MemoryActionResult }>(
    `/api/v1/agents/${agentId}/memories/${memoryId}/verify`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data as MemoryActionResult;
}

export async function invalidateMemory(
  agentId: string,
  memoryId: string,
  payload: { reason: string; replacement_hint?: string }
): Promise<MemoryActionResult> {
  const response = await apiFetch<{ data?: MemoryActionResult }>(
    `/api/v1/agents/${agentId}/memories/${memoryId}/invalidate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data as MemoryActionResult;
}

export async function supersedeMemory(
  agentId: string,
  memoryId: string,
  payload: { new_text: string; reason: string; type?: string; importance?: number }
): Promise<MemoryActionResult> {
  const response = await apiFetch<{ data?: MemoryActionResult }>(
    `/api/v1/agents/${agentId}/memories/${memoryId}/supersede`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data as MemoryActionResult;
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

export async function updateWorkspaceKnowledgePolicy(
  policy: { read_access: 'workspace' | 'admin'; write_access: 'workspace' | 'admin' }
): Promise<WorkspaceKnowledge> {
  return apiFetch<WorkspaceKnowledge>('/api/v1/memory/workspace-knowledge/policy', {
    method: 'PUT',
    body: JSON.stringify(policy),
  });
}

export async function getWorkspaceSessionBrief(): Promise<ContinuityBrief> {
  return apiFetch<ContinuityBrief>('/api/v1/memory/session-brief');
}

export async function updateWorkspaceSessionBrief(content: string): Promise<ContinuityBrief> {
  return apiFetch<ContinuityBrief>('/api/v1/memory/session-brief', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function getWorkspaceJournal(date?: string): Promise<JournalState> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  return apiFetch<JournalState>(`/api/v1/memory/journal/workspace${params.toString() ? `?${params}` : ''}`);
}

export async function updateWorkspaceJournal(date: string, content: string): Promise<JournalState> {
  return apiFetch<JournalState>('/api/v1/memory/journal/workspace', {
    method: 'PUT',
    body: JSON.stringify({ date, content }),
  });
}

export async function summarizeWorkspaceJournal(date: string): Promise<JournalSummarizeResult['data']> {
  const response = await apiFetch<JournalSummarizeResult>('/api/v1/memory/journal/workspace/summarize', {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
  return response.data;
}

export async function getJournalAutomationPolicies(): Promise<JournalAutomationPolicies> {
  const response = await apiFetch<{ data: JournalAutomationPolicies }>('/api/v1/memory/journal-automation');
  return response.data;
}

export async function getJournalAutomationSweepStatus(): Promise<JournalAutomationSweepResult> {
  const response = await apiFetch<{ data: JournalAutomationSweepResult }>('/api/v1/memory/journal-automation/sweep-status');
  return response.data;
}

export async function getJournalAutomationRuntimeStatus(): Promise<JournalAutomationRuntimeStatus> {
  const response = await apiFetch<{ data: JournalAutomationRuntimeStatus }>('/api/v1/memory/journal-automation/runtime-status');
  return response.data;
}

export async function updateJournalAutomationPolicy(
  scope: 'workspace' | 'agent',
  payload: { mode: 'manual' | 'on_save'; minimum_length: number; sweep_enabled?: boolean }
): Promise<JournalAutomationPolicy> {
  const response = await apiFetch<{ data: JournalAutomationPolicy }>(`/api/v1/memory/journal-automation/${scope}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function runJournalAutomationSweep(
  payload: { scope?: 'all' | 'workspace' | 'agent'; date?: string; force?: boolean } = {}
): Promise<JournalAutomationSweepResult> {
  const response = await apiFetch<{ data: JournalAutomationSweepResult }>('/api/v1/memory/journal-automation/sweep', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data;
}

export async function getGroupMemorySpaces(): Promise<GroupMemorySpace[]> {
  const response = await apiFetch<{ spaces?: GroupMemorySpace[] }>('/api/v1/memory/group-memory');
  return response.spaces ?? [];
}

export async function createGroupMemorySpace(
  payload: Partial<GroupMemorySpace> & { name: string; content?: string }
): Promise<GroupMemorySpace> {
  const response = await apiFetch<{ data?: GroupMemorySpace }>('/api/v1/memory/group-memory', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.data as GroupMemorySpace;
}

export async function updateGroupMemorySpace(
  spaceId: string,
  payload: Partial<GroupMemorySpace> & { content?: string }
): Promise<GroupMemorySpace> {
  const response = await apiFetch<{ data?: GroupMemorySpace }>(`/api/v1/memory/group-memory/${spaceId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.data as GroupMemorySpace;
}

export async function deleteGroupMemorySpace(spaceId: string): Promise<void> {
  await apiFetch<SuccessResponse>(`/api/v1/memory/group-memory/${spaceId}`, {
    method: 'DELETE',
  });
}

export async function getAgentProfileBrief(agentId: string): Promise<ContinuityBrief> {
  return apiFetch<ContinuityBrief>(`/api/v1/memory/agents/${agentId}/profile-brief`);
}

export async function updateAgentProfileBrief(agentId: string, content: string): Promise<ContinuityBrief> {
  return apiFetch<ContinuityBrief>(`/api/v1/memory/agents/${agentId}/profile-brief`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function getAgentSessionBrief(agentId: string): Promise<ContinuityBrief> {
  return apiFetch<ContinuityBrief>(`/api/v1/memory/agents/${agentId}/session-brief`);
}

export async function updateAgentSessionBrief(agentId: string, content: string): Promise<ContinuityBrief> {
  return apiFetch<ContinuityBrief>(`/api/v1/memory/agents/${agentId}/session-brief`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function getAgentJournal(agentId: string, date?: string): Promise<JournalState> {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  return apiFetch<JournalState>(`/api/v1/memory/agents/${agentId}/journal${params.toString() ? `?${params}` : ''}`);
}

export async function updateAgentJournal(agentId: string, date: string, content: string): Promise<JournalState> {
  return apiFetch<JournalState>(`/api/v1/memory/agents/${agentId}/journal`, {
    method: 'PUT',
    body: JSON.stringify({ date, content }),
  });
}

export async function summarizeAgentJournal(agentId: string, date: string): Promise<JournalSummarizeResult['data']> {
  const response = await apiFetch<JournalSummarizeResult>(`/api/v1/memory/agents/${agentId}/journal/summarize`, {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
  return response.data;
}

export async function getAgentGroupMemory(agentId: string): Promise<AgentGroupMemoryResponse> {
  return apiFetch<AgentGroupMemoryResponse>(`/api/v1/memory/agents/${agentId}/group-memory`);
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

export async function getSniparaAdminStatus(): Promise<SniparaStatusResponse> {
  const response = await apiFetch<{ data?: SniparaStatusResponse }>('/api/v1/snipara/admin/status');
  return response.data as SniparaStatusResponse;
}

export async function getSniparaTransportHealth(): Promise<SniparaHealthResponse> {
  const response = await apiFetch<{ data?: SniparaHealthResponse }>('/api/v1/snipara/admin/health');
  return response.data as SniparaHealthResponse;
}

export async function getSniparaProvisioningDiagnostics(): Promise<SniparaProvisioningDiagnostics> {
  const response = await apiFetch<{ data?: SniparaProvisioningDiagnostics }>('/api/v1/snipara/admin/provisioning');
  return response.data as SniparaProvisioningDiagnostics;
}

export async function provisionSniparaWorkspace(force = false): Promise<SniparaProvisionResult> {
  const response = await apiFetch<{ data?: SniparaProvisionResult }>('/api/v1/snipara/admin/provision', {
    method: 'POST',
    body: JSON.stringify({ force }),
  });
  return response.data as SniparaProvisionResult;
}

export async function getSniparaProvisioningOperations(limit = 10): Promise<SniparaProvisioningOperationsResponse> {
  const response = await apiFetch<{ data?: SniparaProvisioningOperationsResponse }>(
    `/api/v1/snipara/admin/provisioning/operations?limit=${limit}`
  );
  return response.data as SniparaProvisioningOperationsResponse;
}

export async function runSniparaProvisioningProbe(): Promise<SniparaProvisioningProbeResult> {
  const response = await apiFetch<{ data?: SniparaProvisioningProbeResult }>('/api/v1/snipara/admin/provisioning/probe', {
    method: 'POST',
  });
  return response.data as SniparaProvisioningProbeResult;
}

export async function getSniparaWebhookEvents(limit = 10): Promise<SniparaWebhookEventLogResponse> {
  const response = await apiFetch<{ data?: SniparaWebhookEventLogResponse }>(
    `/api/v1/snipara/admin/webhook-events?limit=${limit}`
  );
  return response.data as SniparaWebhookEventLogResponse;
}

export async function getSniparaIndexHealth(): Promise<SniparaIndexHealth> {
  const response = await apiFetch<{ data?: SniparaIndexHealth }>('/api/v1/snipara/admin/index-health');
  return response.data as SniparaIndexHealth;
}

export async function getSniparaSearchAnalytics(days = 30): Promise<SniparaSearchAnalytics> {
  const response = await apiFetch<{ data?: SniparaSearchAnalytics }>(
    `/api/v1/snipara/admin/search-analytics?days=${days}`
  );
  return response.data as SniparaSearchAnalytics;
}

export async function getSniparaHtaskPolicy(): Promise<SniparaHtaskPolicy> {
  const response = await apiFetch<{ data?: SniparaHtaskPolicy }>('/api/v1/snipara/admin/htask-policy');
  return response.data as SniparaHtaskPolicy;
}

export async function getSniparaHtaskMetrics(): Promise<SniparaHtaskMetrics> {
  const response = await apiFetch<{ data?: SniparaHtaskMetrics }>('/api/v1/snipara/admin/htask-metrics');
  return response.data as SniparaHtaskMetrics;
}

export async function getSniparaSharedTemplates(category?: string): Promise<SniparaSharedTemplates> {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  const response = await apiFetch<{ data?: SniparaSharedTemplates }>(
    `/api/v1/snipara/admin/shared/templates${params.toString() ? `?${params}` : ''}`
  );
  return response.data as SniparaSharedTemplates;
}

export async function getSniparaSharedCollections(includePublic = true): Promise<SniparaSharedCollections> {
  const response = await apiFetch<{ data?: SniparaSharedCollections }>(
    `/api/v1/snipara/admin/shared/collections?include_public=${includePublic ? 'true' : 'false'}`
  );
  return response.data as SniparaSharedCollections;
}

export async function getSniparaSharedUploads(limit = 10): Promise<SniparaSharedUploads> {
  const response = await apiFetch<{ data?: SniparaSharedUploads }>(
    `/api/v1/snipara/admin/shared/uploads?limit=${Math.max(1, Math.min(50, limit))}`
  );
  return response.data as SniparaSharedUploads;
}

export async function uploadSniparaSharedDocument(
  payload: SniparaSharedDocumentUploadPayload
): Promise<SniparaSharedDocumentUploadResult> {
  const response = await apiFetch<{ data?: SniparaSharedDocumentUploadResult }>(
    '/api/v1/snipara/admin/shared/documents',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data as SniparaSharedDocumentUploadResult;
}

export async function getSniparaSyncStatus(): Promise<SniparaSyncStatus> {
  const response = await apiFetch<{ data?: SniparaSyncStatus }>('/api/v1/snipara/admin/sync-status');
  return response.data as SniparaSyncStatus;
}
