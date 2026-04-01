import { apiFetch } from '../client';
import type {
  BrowserOperatorActionCatalog,
  BrowserOperatorCredential,
  BrowserOperatorFlow,
  BrowserOperatorProfile,
  BrowserOperatorRun,
  BrowserOperatorRunEvidence,
  BrowserOperatorRunReport,
  BrowserOperatorRunStep,
  CreateBrowserOperatorCredentialPayload,
  CreateBrowserOperatorRunPayload,
} from '../types';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export async function getBrowserOperatorProfiles(): Promise<BrowserOperatorProfile[]> {
  const response = await apiFetch<ApiEnvelope<{ profiles: BrowserOperatorProfile[] }>>(
    '/api/v1/browser-operator/profiles'
  );
  return response.data.profiles;
}

export async function getBrowserOperatorProfile(profileKey: string, version?: string): Promise<BrowserOperatorProfile> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ profile: BrowserOperatorProfile }>>(
    `/api/v1/browser-operator/profiles/${encodeURIComponent(profileKey)}${suffix}`
  );
  return response.data.profile;
}

export async function getBrowserOperatorFlows(): Promise<BrowserOperatorFlow[]> {
  const response = await apiFetch<ApiEnvelope<{ flows: BrowserOperatorFlow[] }>>(
    '/api/v1/browser-operator/flows'
  );
  return response.data.flows;
}

export async function getBrowserOperatorFlow(flowKey: string, version?: string): Promise<BrowserOperatorFlow> {
  const suffix = version ? `?version=${encodeURIComponent(version)}` : '';
  const response = await apiFetch<ApiEnvelope<{ flow: BrowserOperatorFlow }>>(
    `/api/v1/browser-operator/flows/${encodeURIComponent(flowKey)}${suffix}`
  );
  return response.data.flow;
}

export async function getBrowserOperatorActionCatalog(params?: {
  profileKey?: string;
  catalogKey?: string;
  version?: string;
}): Promise<BrowserOperatorActionCatalog> {
  const searchParams = new URLSearchParams();
  if (params?.profileKey) searchParams.set('profileKey', params.profileKey);
  if (params?.catalogKey) searchParams.set('catalogKey', params.catalogKey);
  if (params?.version) searchParams.set('version', params.version);
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : '';
  const response = await apiFetch<ApiEnvelope<{ actionCatalog: BrowserOperatorActionCatalog }>>(
    `/api/v1/browser-operator/action-catalog${suffix}`
  );
  return response.data.actionCatalog;
}

export async function createBrowserOperatorRun(
  payload: CreateBrowserOperatorRunPayload
): Promise<BrowserOperatorRun> {
  const response = await apiFetch<ApiEnvelope<{ run: BrowserOperatorRun }>>(
    '/api/v1/browser-operator/runs',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data.run;
}

export async function getBrowserOperatorRuns(limit?: number): Promise<BrowserOperatorRun[]> {
  const suffix = typeof limit === 'number' ? `?limit=${encodeURIComponent(String(limit))}` : '';
  const response = await apiFetch<ApiEnvelope<{ runs: BrowserOperatorRun[] }>>(
    `/api/v1/browser-operator/runs${suffix}`
  );
  return response.data.runs;
}

export async function getBrowserOperatorRun(runId: string): Promise<BrowserOperatorRun> {
  const response = await apiFetch<ApiEnvelope<{ run: BrowserOperatorRun }>>(
    `/api/v1/browser-operator/runs/${encodeURIComponent(runId)}`
  );
  return response.data.run;
}

export async function getBrowserOperatorRunSteps(runId: string): Promise<BrowserOperatorRunStep[]> {
  const response = await apiFetch<ApiEnvelope<{ steps: BrowserOperatorRunStep[] }>>(
    `/api/v1/browser-operator/runs/${encodeURIComponent(runId)}/steps`
  );
  return response.data.steps;
}

export async function getBrowserOperatorRunEvidence(runId: string): Promise<BrowserOperatorRunEvidence[]> {
  const response = await apiFetch<ApiEnvelope<{ evidence: BrowserOperatorRunEvidence[] }>>(
    `/api/v1/browser-operator/runs/${encodeURIComponent(runId)}/evidence`
  );
  return response.data.evidence;
}

export async function getBrowserOperatorRunReport(runId: string): Promise<BrowserOperatorRunReport> {
  const response = await apiFetch<ApiEnvelope<{ report: BrowserOperatorRunReport }>>(
    `/api/v1/browser-operator/runs/${encodeURIComponent(runId)}/report`
  );
  return response.data.report;
}

export async function cancelBrowserOperatorRun(runId: string): Promise<BrowserOperatorRun> {
  const response = await apiFetch<ApiEnvelope<{ run: BrowserOperatorRun }>>(
    `/api/v1/browser-operator/runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: 'POST',
    }
  );
  return response.data.run;
}

export async function getBrowserOperatorCredentials(): Promise<BrowserOperatorCredential[]> {
  const response = await apiFetch<ApiEnvelope<{ credentials: BrowserOperatorCredential[] }>>(
    '/api/v1/browser-operator/credentials'
  );
  return response.data.credentials;
}

export async function createBrowserOperatorCredential(
  payload: CreateBrowserOperatorCredentialPayload
): Promise<BrowserOperatorCredential> {
  const response = await apiFetch<ApiEnvelope<{ credential: BrowserOperatorCredential }>>(
    '/api/v1/browser-operator/credentials',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data.credential;
}

export async function rotateBrowserOperatorCredential(
  credentialId: string,
  payload: Partial<CreateBrowserOperatorCredentialPayload> & { rotationNote?: string }
): Promise<BrowserOperatorCredential> {
  const response = await apiFetch<ApiEnvelope<{ credential: BrowserOperatorCredential }>>(
    `/api/v1/browser-operator/credentials/${encodeURIComponent(credentialId)}/rotate`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
  return response.data.credential;
}

export async function testBrowserOperatorCredential(
  credentialId: string,
  payload?: { baseUrl?: string }
): Promise<{
  credential: BrowserOperatorCredential;
  result: {
    success: boolean;
    mode: string;
    checks: {
      active: boolean;
      domainAllowed: boolean;
    };
  };
}> {
  const response = await apiFetch<
    ApiEnvelope<{
      credential: BrowserOperatorCredential;
      result: {
        success: boolean;
        mode: string;
        checks: {
          active: boolean;
          domainAllowed: boolean;
        };
      };
    }>
  >(`/api/v1/browser-operator/credentials/${encodeURIComponent(credentialId)}/test`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
  return response.data;
}
