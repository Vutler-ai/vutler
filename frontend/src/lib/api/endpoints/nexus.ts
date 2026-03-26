import { apiFetch } from '../client';
import type {
  NexusStatusResponse,
  NexusNode,
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
