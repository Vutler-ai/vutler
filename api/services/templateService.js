'use strict';

const crypto = require('crypto');

const templatesStore = [];

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100);
}

function createTemplate(payload, authorId) {
  const slugBase = slugify(payload.name);
  const candidate = templatesStore.find((t) => t.slug === slugBase);
  const slug = candidate ? `${slugBase}-${templatesStore.length + 1}` : slugBase;

  const now = new Date().toISOString();
  const item = {
    id: crypto.randomUUID(),
    slug,
    name: payload.name,
    description: payload.description,
    short_description: payload.short_description || payload.description.slice(0, 200),
    author_id: authorId || null,
    category: payload.category,
    difficulty: payload.difficulty || 'beginner',
    schema_version: '1.0',
    template_config: payload.template_config,
    required_integrations: payload.required_integrations || payload.template_config.integrations || [],
    estimated_setup_time_seconds: payload.estimated_setup_time_seconds || 120,
    tags: payload.tags || [],
    icon_url: payload.icon_url || null,
    config_schema: payload.config_schema || { type: 'object', properties: {} },
    deploy_count: 0,
    avg_rating: null,
    review_count: 0,
    status: 'approved',
    created_at: now,
    updated_at: now,
    published_at: now,
  };

  templatesStore.push(item);
  return item;
}

function listTemplates(params = {}) {
  const {
    q,
    category,
    difficulty,
    sort = 'relevance',
    page = 1,
    limit = 20,
  } = params;

  let data = templatesStore.filter((t) => t.status === 'approved');

  if (q) {
    const s = q.toLowerCase();
    data = data.filter((t) =>
      t.name.toLowerCase().includes(s) ||
      (t.description || '').toLowerCase().includes(s) ||
      (t.tags || []).some((tag) => tag.toLowerCase().includes(s))
    );
  }

  if (category) data = data.filter((t) => t.category === category);
  if (difficulty) data = data.filter((t) => t.difficulty === difficulty);

  const sorted = [...data];
  if (sort === 'popular') sorted.sort((a, b) => b.deploy_count - a.deploy_count);
  else if (sort === 'newest') sorted.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  else if (sort === 'rating') sorted.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));

  const p = Number(page) || 1;
  const l = Math.min(Number(limit) || 20, 100);
  const start = (p - 1) * l;
  const items = sorted.slice(start, start + l);

  return {
    data: items.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      short_description: t.short_description,
      category: t.category,
      difficulty: t.difficulty,
      estimated_setup_time_seconds: t.estimated_setup_time_seconds,
      icon_url: t.icon_url,
      stats: {
        deploy_count: t.deploy_count,
        avg_rating: t.avg_rating,
        review_count: t.review_count,
      },
    })),
    pagination: {
      page: p,
      limit: l,
      total: sorted.length,
      total_pages: Math.max(1, Math.ceil(sorted.length / l)),
    },
    meta: {
      filters_applied: { q, category, difficulty },
      sort,
    },
  };
}

function getTemplateByIdOrSlug(idOrSlug) {
  return templatesStore.find((t) => t.id === idOrSlug || t.slug === idOrSlug) || null;
}

function getTemplateDetail(idOrSlug, integrationProviders = []) {
  const item = getTemplateByIdOrSlug(idOrSlug);
  if (!item) return null;

  const providers = new Set(integrationProviders);
  const missing = (item.required_integrations || [])
    .filter((i) => i.required !== false && !providers.has(i.provider))
    .map((i) => ({
      provider: i.provider,
      name: i.provider,
      configure_url: `/integrations/${i.provider}`,
    }));

  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    description: item.description,
    short_description: item.short_description,
    author: { id: item.author_id, name: item.author_id ? 'Template Author' : 'Vutler Team', avatar_url: null },
    category: item.category,
    difficulty: item.difficulty,
    estimated_setup_time_seconds: item.estimated_setup_time_seconds,
    tags: item.tags,
    icon_url: item.icon_url,
    validation: {
      can_deploy: missing.length === 0,
      missing_integrations: missing,
      warnings: missing.length ? ['Some integrations are missing'] : [],
    },
    stats: {
      deploy_count: item.deploy_count,
      avg_rating: item.avg_rating,
      review_count: item.review_count,
    },
    config_schema: item.config_schema,
    required_integrations: item.required_integrations,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function seedTemplates(list) {
  list.forEach((item) => {
    if (!getTemplateByIdOrSlug(item.id) && !getTemplateByIdOrSlug(item.slug)) templatesStore.push(item);
  });
}

function getStore() {
  return templatesStore;
}

module.exports = {
  createTemplate,
  listTemplates,
  getTemplateDetail,
  getTemplateByIdOrSlug,
  seedTemplates,
  getStore,
};
