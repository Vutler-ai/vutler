import { apiFetch } from '../client';
import type {
  NexusStatusResponse,
  NexusNode,
  NexusAgentStatus,
  DeployLocalPayload,
  DeployEnterprisePayload,
  NexusTokenResponse,
  SuccessResponse,
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
