import { apiFetch } from '../client';
import type {
  MarketplaceTemplate,
  MarketplaceListParams,
  MarketplaceListResponse,
  AgentSkillsResponse,
  SuccessResponse,
} from '../types';

export async function getTemplates(
  params: MarketplaceListParams = {}
): Promise<MarketplaceListResponse> {
  const query = new URLSearchParams();
  if (params.category && params.category !== 'All')
    query.set('category', params.category);
  if (params.search) query.set('search', params.search);
  if (params.sort) query.set('sort', params.sort);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const url = `/api/v1/marketplace/templates${query.toString() ? `?${query}` : ''}`;
  const data = await apiFetch<MarketplaceListResponse | { templates: MarketplaceTemplate[] }>(
    url
  );
  return {
    templates: data.templates ?? [],
    total: 'total' in data ? (data.total ?? data.templates?.length ?? 0) : (data.templates?.length ?? 0),
  };
}

export async function getTemplate(id: string): Promise<MarketplaceTemplate> {
  return apiFetch<MarketplaceTemplate>(`/api/v1/marketplace/templates/${id}`);
}

export async function install(id: string): Promise<SuccessResponse> {
  return apiFetch<SuccessResponse>(
    `/api/v1/marketplace/templates/${id}/install`,
    { method: 'POST' }
  );
}

export async function getSkills(category?: string): Promise<AgentSkillsResponse> {
  const url = `/api/v1/marketplace/skills${category ? `?category=${encodeURIComponent(category)}` : ''}`;
  return apiFetch<AgentSkillsResponse>(url);
}
