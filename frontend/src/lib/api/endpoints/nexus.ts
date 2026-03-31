import { apiFetch } from '../client';
import type {
  NexusStatusResponse,
  NexusNode,
  NexusAgentStatus,
  DeployLocalPayload,
  DeployEnterprisePayload,
  NexusTokenResponse,
  SuccessResponse,
  NexusDispatchResult,
  NexusSearchResult,
  NexusDocumentResult,
  NexusEmailResult,
  NexusCalendarEvent,
  NexusContact,
  NexusShellResult,
  NexusCapabilities,
  NexusCommandStatus,
  NexusCommandStats,
  NexusEnterpriseCatalogDispatchPayload,
  NexusEnterpriseHelperDispatchPayload,
  NexusEnterpriseLocalIntegrationPayload,
  NexusGovernanceApproval,
  NexusGovernanceAuditEvent,
} from '../types';

export async function getNodes(): Promise<NexusStatusResponse> {
  return apiFetch<NexusStatusResponse>('/api/v1/nexus/status');
}

export async function getNode(id: string): Promise<NexusNode> {
  return apiFetch<NexusNode>(`/api/v1/nexus/nodes/${id}`);
}

export async function deployLocal(
  payload: DeployLocalPayload
): Promise<NexusTokenResponse> {
  return apiFetch<NexusTokenResponse>('/api/v1/nexus/tokens/local', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deployEnterprise(
  payload: DeployEnterprisePayload
): Promise<NexusTokenResponse> {
  return apiFetch<NexusTokenResponse>('/api/v1/nexus/tokens/enterprise', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function dispatch(
  nodeId: string,
  command: string,
  args?: Record<string, unknown>
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/nexus/nodes/${nodeId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ command, args }),
  });
}

export async function getAgentConfigs(nodeId: string): Promise<NexusAgentStatus[]> {
  const data = await apiFetch<{ agents?: NexusAgentStatus[] } | NexusAgentStatus[]>(
    `/api/v1/nexus/nodes/${nodeId}/agents`
  );
  return Array.isArray(data) ? data : (data.agents ?? []);
}

export async function spawnAgent(
  nodeId: string,
  agentId: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/nexus/nodes/${nodeId}/agents/spawn`, {
    method: 'POST',
    body: JSON.stringify({ agentId }),
  });
}

export interface CreateNodeAgentDefinition {
  name: string;
  role: string;
  description: string;
  system_prompt: string;
  model: string;
  skills: string[];
  tools: string[];
}

export async function createNodeAgent(
  nodeId: string,
  definition: CreateNodeAgentDefinition
): Promise<NexusAgentStatus> {
  return apiFetch<NexusAgentStatus>(`/api/v1/nexus/nodes/${nodeId}/agents`, {
    method: 'POST',
    body: JSON.stringify(definition),
  });
}

export async function stopNodeAgent(
  nodeId: string,
  agentId: string
): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/nexus/nodes/${nodeId}/agents/${agentId}/stop`,
    { method: 'POST' }
  );
}

// ── Typed dispatch helpers ────────────────────────────────────────────────────

export async function dispatchAction(
  nodeId: string,
  action: string,
  args?: Record<string, unknown>
): Promise<NexusDispatchResult> {
  return apiFetch<NexusDispatchResult>(`/api/v1/nexus/nodes/${nodeId}/dispatch`, {
    method: 'POST',
    body: JSON.stringify({ command: action, args }),
  });
}

export async function queueDispatchAction(
  nodeId: string,
  action: string,
  args?: Record<string, unknown>
): Promise<NexusCommandStatus<NexusDispatchResult>> {
  const response = await apiFetch<{ commandId?: string; command?: NexusCommandStatus<NexusDispatchResult> }>(
    `/api/v1/nexus/nodes/${nodeId}/dispatch?wait=0`,
    {
      method: 'POST',
      body: JSON.stringify({ command: action, args, wait: false }),
    }
  );

  if (response.command) return response.command;
  return {
    id: response.commandId || '',
    type: action,
    status: 'queued',
  };
}

export async function getNodeCommand<T = NexusDispatchResult>(
  nodeId: string,
  commandId: string
): Promise<NexusCommandStatus<T>> {
  const response = await apiFetch<{ command: NexusCommandStatus<T> }>(
    `/api/v1/nexus/nodes/${nodeId}/commands/${commandId}`
  );
  return response.command;
}

export async function getNodeCommands(
  nodeId: string,
  limit = 25
): Promise<{ commands: NexusCommandStatus[]; summary: NexusCommandStats | null }> {
  return apiFetch<{ commands: NexusCommandStatus[]; summary: NexusCommandStats | null }>(
    `/api/v1/nexus/nodes/${nodeId}/commands?limit=${limit}`
  );
}

export async function dispatchSearch(
  nodeId: string,
  query: string,
  scope?: string
): Promise<NexusDispatchResult<{ results: NexusSearchResult[] }>> {
  return dispatchAction(nodeId, 'search', { query, scope }) as Promise<NexusDispatchResult<{ results: NexusSearchResult[] }>>;
}

export async function dispatchReadDocument(
  nodeId: string,
  path: string
): Promise<NexusDispatchResult<NexusDocumentResult>> {
  return dispatchAction(nodeId, 'read_document', { path }) as Promise<NexusDispatchResult<NexusDocumentResult>>;
}

export async function dispatchListDir(
  nodeId: string,
  path: string,
  recursive?: boolean,
  pattern?: string
): Promise<NexusDispatchResult<{ entries: Array<{ name: string; type: string; size?: number }> }>> {
  return dispatchAction(nodeId, 'list_dir', { path, recursive, pattern }) as Promise<NexusDispatchResult<{ entries: Array<{ name: string; type: string; size?: number }> }>>;
}

export async function dispatchListEmails(
  nodeId: string,
  limit?: number,
  folder?: string
): Promise<NexusDispatchResult<{ emails: NexusEmailResult[] }>> {
  return dispatchAction(nodeId, 'list_emails', { limit, folder }) as Promise<NexusDispatchResult<{ emails: NexusEmailResult[] }>>;
}

export async function dispatchSearchEmails(
  nodeId: string,
  query: string,
  limit?: number
): Promise<NexusDispatchResult<{ emails: NexusEmailResult[] }>> {
  return dispatchAction(nodeId, 'search_emails', { query, limit }) as Promise<NexusDispatchResult<{ emails: NexusEmailResult[] }>>;
}

export async function dispatchReadCalendar(
  nodeId: string,
  days?: number
): Promise<NexusDispatchResult<{ events: NexusCalendarEvent[] }>> {
  return dispatchAction(nodeId, 'read_calendar', { days: days ?? 7 }) as Promise<NexusDispatchResult<{ events: NexusCalendarEvent[] }>>;
}

export async function dispatchReadContacts(
  nodeId: string,
  query?: string,
  limit?: number
): Promise<NexusDispatchResult<{ contacts: NexusContact[] }>> {
  const action = query ? 'search_contacts' : 'read_contacts';
  return dispatchAction(nodeId, action, { query, limit }) as Promise<NexusDispatchResult<{ contacts: NexusContact[] }>>;
}

export async function dispatchShellExec(
  nodeId: string,
  command: string
): Promise<NexusDispatchResult<NexusShellResult>> {
  return dispatchAction(nodeId, 'shell_exec', { command }) as Promise<NexusDispatchResult<NexusShellResult>>;
}

export async function dispatchReadClipboard(
  nodeId: string
): Promise<NexusDispatchResult<{ content: string }>> {
  return dispatchAction(nodeId, 'read_clipboard', {}) as Promise<NexusDispatchResult<{ content: string }>>;
}

export async function dispatchEnterpriseCatalogAction(
  nodeId: string,
  payload: NexusEnterpriseCatalogDispatchPayload
): Promise<NexusDispatchResult> {
  return dispatchAction(nodeId, 'enterprise_action', payload as unknown as Record<string, unknown>);
}

export async function dispatchEnterpriseLocalIntegration(
  nodeId: string,
  payload: NexusEnterpriseLocalIntegrationPayload
): Promise<NexusDispatchResult> {
  return dispatchAction(nodeId, 'enterprise_local_api', payload as unknown as Record<string, unknown>);
}

export async function dispatchEnterpriseHelper(
  nodeId: string,
  payload: NexusEnterpriseHelperDispatchPayload
): Promise<NexusDispatchResult> {
  return dispatchAction(nodeId, 'enterprise_helper', payload as unknown as Record<string, unknown>);
}

export async function getNodeGovernanceApprovals(
  nodeId: string,
  status?: string,
  limit = 25
): Promise<NexusGovernanceApproval[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch<{ success: boolean; approvals: NexusGovernanceApproval[] }>(
    `/api/v1/nexus/nodes/${nodeId}/governance/approvals${suffix}`
  );
  return response.approvals ?? [];
}

export async function getNodeGovernanceScopes(
  nodeId: string,
  status?: string,
  limit = 100
): Promise<NexusGovernanceApproval[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch<{ success: boolean; scopes: NexusGovernanceApproval[] }>(
    `/api/v1/nexus/nodes/${nodeId}/governance/scopes${suffix}`
  );
  return response.scopes ?? [];
}

export async function getNodeGovernanceAudit(
  nodeId: string,
  requestType?: string,
  limit = 50
): Promise<NexusGovernanceAuditEvent[]> {
  const params = new URLSearchParams();
  if (requestType) params.set('requestType', requestType);
  params.set('limit', String(limit));
  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await apiFetch<{ success: boolean; audit: NexusGovernanceAuditEvent[] }>(
    `/api/v1/nexus/nodes/${nodeId}/governance/audit${suffix}`
  );
  return response.audit ?? [];
}

export async function approveNodeGovernanceApproval(
  nodeId: string,
  approvalId: string,
  options?: {
    comment?: string;
    scopeKey?: string;
    scopeMode?: 'single' | 'process';
    scopeExpiresAt?: string;
  }
): Promise<{ approval: NexusGovernanceApproval; executionCommandId?: string }> {
  return apiFetch<{ approval: NexusGovernanceApproval; executionCommandId?: string; queueError?: string }>(
    `/api/v1/nexus/nodes/${nodeId}/governance/approvals/${approvalId}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({
        comment: options?.comment,
        scopeKey: options?.scopeKey,
        scopeMode: options?.scopeMode,
        scopeExpiresAt: options?.scopeExpiresAt,
      }),
    }
  );
}

export async function rejectNodeGovernanceApproval(
  nodeId: string,
  approvalId: string,
  comment?: string
): Promise<{ approval: NexusGovernanceApproval }> {
  return apiFetch<{ approval: NexusGovernanceApproval }>(
    `/api/v1/nexus/nodes/${nodeId}/governance/approvals/${approvalId}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ comment }),
    }
  );
}

export async function revokeNodeGovernanceScope(
  nodeId: string,
  approvalId: string
): Promise<{ approval: NexusGovernanceApproval }> {
  return apiFetch<{ approval: NexusGovernanceApproval }>(
    `/api/v1/nexus/nodes/${nodeId}/governance/approvals/${approvalId}/revoke-scope`,
    {
      method: 'POST',
    }
  );
}

export async function getNodeCapabilities(
  nodeId: string
): Promise<NexusCapabilities> {
  return apiFetch<NexusCapabilities>(`/api/v1/nexus/nodes/${nodeId}/capabilities`);
}
