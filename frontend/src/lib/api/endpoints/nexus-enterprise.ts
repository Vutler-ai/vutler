import { apiFetch } from '../client';
import type {
  EnterpriseProfileSelectionValidation,
  NexusEnterpriseEventSubscription,
  NexusEnterpriseEventSubscriptionProvider,
  NexusEnterpriseEventSubscriptionStatus,
  NexusEnterpriseProvisioningMode,
} from '../types';

export interface NexusEnterpriseRegistryRecord<T = Record<string, unknown>> {
  key: string;
  version: string;
  status: string;
  managed_by: string;
  definition: T;
  [key: string]: unknown;
}

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export async function getEnterpriseProfiles(): Promise<NexusEnterpriseRegistryRecord[]> {
  const response = await apiFetch<ApiEnvelope<{ profiles: NexusEnterpriseRegistryRecord[] }>>(
    '/api/v1/nexus-enterprise/profiles'
  );
  return response.data?.profiles ?? [];
}

export async function getEnterpriseProfile(
  profileKey: string,
  version?: string
): Promise<NexusEnterpriseRegistryRecord> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ profile: NexusEnterpriseRegistryRecord }>>(
    `/api/v1/nexus-enterprise/profiles/${profileKey}${suffix}`
  );
  return response.data.profile;
}

export async function getEnterpriseCapabilities(): Promise<NexusEnterpriseRegistryRecord[]> {
  const response = await apiFetch<ApiEnvelope<{ capabilities: NexusEnterpriseRegistryRecord[] }>>(
    '/api/v1/nexus-enterprise/capabilities'
  );
  return response.data?.capabilities ?? [];
}

export async function getEnterpriseAgentLevelMatrix(
  version?: string
): Promise<NexusEnterpriseRegistryRecord> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ matrix: NexusEnterpriseRegistryRecord }>>(
    `/api/v1/nexus-enterprise/agent-level-matrix${suffix}`
  );
  return response.data.matrix;
}

export async function getEnterpriseActionCatalog(
  profileKey: string,
  version?: string
): Promise<NexusEnterpriseRegistryRecord> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ actionCatalog: NexusEnterpriseRegistryRecord }>>(
    `/api/v1/nexus-enterprise/action-catalogs/${profileKey}${suffix}`
  );
  return response.data.actionCatalog;
}

export async function getEnterprisePolicyBundle(
  profileKey: string,
  version?: string
): Promise<NexusEnterpriseRegistryRecord> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ policyBundle: NexusEnterpriseRegistryRecord }>>(
    `/api/v1/nexus-enterprise/policy-bundles/${profileKey}${suffix}`
  );
  return response.data.policyBundle;
}

export async function getEnterpriseLocalIntegrations(
  profileKey: string,
  version?: string
): Promise<NexusEnterpriseRegistryRecord> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ localIntegrationRegistry: NexusEnterpriseRegistryRecord }>>(
    `/api/v1/nexus-enterprise/local-integrations/${profileKey}${suffix}`
  );
  return response.data.localIntegrationRegistry;
}

export async function getEnterpriseHelperRules(
  profileKey: string,
  version?: string
): Promise<NexusEnterpriseRegistryRecord> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ helperRules: NexusEnterpriseRegistryRecord }>>(
    `/api/v1/nexus-enterprise/helper-rules/${profileKey}${suffix}`
  );
  return response.data.helperRules;
}

export interface ValidateEnterpriseProfileSelectionPayload {
  profileKey: string;
  profileVersion?: string;
  deploymentMode?: 'fixed' | 'elastic';
  selectedCapabilities?: string[];
  selectedLocalIntegrations?: string[];
  selectedHelperProfiles?: string[];
  startActive?: boolean;
}

export async function validateEnterpriseProfileSelection(
  payload: ValidateEnterpriseProfileSelectionPayload
): Promise<EnterpriseProfileSelectionValidation> {
  const response = await apiFetch<ApiEnvelope<{ validation: EnterpriseProfileSelectionValidation }>>(
    '/api/v1/nexus-enterprise/agents/validate-profile-selection',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data.validation;
}

export interface ListEnterpriseEventSubscriptionsParams {
  provider?: NexusEnterpriseEventSubscriptionProvider;
  status?: NexusEnterpriseEventSubscriptionStatus;
}

export async function listEnterpriseEventSubscriptions(
  params: ListEnterpriseEventSubscriptionsParams = {}
): Promise<NexusEnterpriseEventSubscription[]> {
  const search = new URLSearchParams();
  if (params.provider) search.set('provider', params.provider);
  if (params.status) search.set('status', params.status);
  const suffix = search.toString() ? `?${search.toString()}` : '';
  const response = await apiFetch<ApiEnvelope<{ subscriptions: NexusEnterpriseEventSubscription[] }>>(
    `/api/v1/nexus-enterprise/event-subscriptions${suffix}`
  );
  return response.data?.subscriptions ?? [];
}

export interface CreateEnterpriseEventSubscriptionPayload {
  provider: NexusEnterpriseEventSubscriptionProvider;
  profileKey?: string;
  agentId?: string;
  subscriptionType?: string;
  sourceResource?: string;
  roomName?: string;
  events?: string[];
  status?: NexusEnterpriseEventSubscriptionStatus;
  deliveryMode?: string;
  provisioningMode?: NexusEnterpriseProvisioningMode;
  config?: Record<string, unknown>;
}

export async function createEnterpriseEventSubscription(
  payload: CreateEnterpriseEventSubscriptionPayload
): Promise<NexusEnterpriseEventSubscription> {
  const response = await apiFetch<ApiEnvelope<{ subscription: NexusEnterpriseEventSubscription }>>(
    '/api/v1/nexus-enterprise/event-subscriptions',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data.subscription;
}

export interface UpdateEnterpriseEventSubscriptionPayload {
  status?: NexusEnterpriseEventSubscriptionStatus;
  provisioningMode?: NexusEnterpriseProvisioningMode;
  provisioningStatus?: string;
  provisioningError?: string | null;
  sourceResource?: string;
  roomName?: string;
  events?: string[];
  configPatch?: Record<string, unknown>;
}

export async function updateEnterpriseEventSubscription(
  subscriptionId: string,
  payload: UpdateEnterpriseEventSubscriptionPayload
): Promise<NexusEnterpriseEventSubscription> {
  const response = await apiFetch<ApiEnvelope<{ subscription: NexusEnterpriseEventSubscription }>>(
    `/api/v1/nexus-enterprise/event-subscriptions/${subscriptionId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  );
  return response.data.subscription;
}

export async function retryEnterpriseEventSubscription(
  subscriptionId: string,
  payload: { provisioningMode?: NexusEnterpriseProvisioningMode } = {}
): Promise<NexusEnterpriseEventSubscription> {
  const response = await apiFetch<ApiEnvelope<{ subscription: NexusEnterpriseEventSubscription }>>(
    `/api/v1/nexus-enterprise/event-subscriptions/${subscriptionId}/retry`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data.subscription;
}
