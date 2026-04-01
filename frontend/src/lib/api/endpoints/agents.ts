import { apiFetch } from '../client';
import type {
  Agent,
  CreateAgentPayload,
  AgentExecution,
  SuccessResponse,
} from '../types';

export async function getAgents(): Promise<Agent[]> {
  const data = await apiFetch<{ agents?: Agent[] } | Agent[]>('/api/v1/agents');
  return Array.isArray(data) ? data : (data.agents ?? []);
}

export async function getAgent(id: string): Promise<Agent> {
  const data = await apiFetch<{ agent?: Agent } & Agent>(`/api/v1/agents/${id}`);
  return data.agent ?? data;
}

export async function createAgent(payload: CreateAgentPayload): Promise<Agent> {
  return apiFetch<Agent>('/api/v1/agents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAgent(
  id: string,
  payload: Partial<CreateAgentPayload> & { auto_approve_email?: boolean }
): Promise<Agent> {
  return apiFetch<Agent>(`/api/v1/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAgent(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(`/api/v1/agents/${id}`, {
    method: 'DELETE',
  });
}

export async function getAgentExecutions(
  agentId: string
): Promise<AgentExecution[]> {
  const data = await apiFetch<{ executions?: AgentExecution[] }>(
    `/api/v1/agents/${agentId}/executions`
  );
  return data.executions ?? [];
}

/**
 * Execute an agent (non-streaming).
 * For streaming use the raw fetch approach with getAuthToken() directly.
 */
export async function executeAgent(
  agentId: string,
  message: string
): Promise<{ response: string }> {
  return apiFetch<{ response: string }>(`/api/v1/agents/${agentId}/execute`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

/**
 * Returns the stream URL for agent execution.
 * Callers handle the EventSource / fetch stream themselves.
 */
export function getAgentExecuteStreamUrl(agentId: string, message: string): string {
  return `/api/v1/agents/${agentId}/execute/stream?message=${encodeURIComponent(message)}`;
}
