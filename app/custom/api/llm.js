/**
 * Vutler LLM Providers API (custom surface)
 * Mirrors the tenant-wide provider catalog for authenticated agents.
 */

const express = require('express');
const pool = require('../../../lib/vaultbrix');
const { authenticateAgent } = require('../lib/auth');

const router = express.Router();
const SCHEMA = 'tenant_vutler';

function getDb(req) {
  return req.app.locals.pg || pool;
}

function prettifyProvider(provider) {
  if (!provider) return 'Provider';
  return String(provider)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeProviderRow(row) {
  const config = row.config || {};
  return {
    id: row.id,
    provider: row.provider,
    name: row.name || config.display_name || prettifyProvider(row.provider),
    baseUrl: config.base_url || null,
    isActive: String(row.status || 'active').toLowerCase() === 'active',
    hasKey: Boolean(row.api_key_encrypted),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    config: {
      ...config,
      status: row.status || null,
      is_byok: row.is_byok ?? null,
      models: row.models || null,
    },
  };
}

/**
 * GET /api/v1/llm/providers
 * Lists workspace providers (shared with mongo-based catalog)
 */
router.get('/llm/providers', authenticateAgent, async (req, res) => {
  try {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      return res.status(401).json({ success: false, error: 'Workspace context required' });
    }

    const result = await getDb(req).query(
      `SELECT id, provider, name, api_key_encrypted, is_byok, models, config, status, created_at, updated_at
         FROM ${SCHEMA}.llm_providers
        WHERE workspace_id = $1
        ORDER BY created_at DESC`,
      [workspaceId]
    );

    const providers = result.rows.map(normalizeProviderRow);
    res.json({ success: true, providers, count: providers.length });
  } catch (error) {
    console.error('[LLM API] Error fetching providers:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch LLM providers', message: error.message });
  }
});

const MODEL_CATALOG = {
  openai: [
    { id: 'gpt-5.4', name: 'GPT-5.4', tier: 'premium', context: 1000000 },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', tier: 'budget', context: 1000000 },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', tier: 'coding', context: 1000000 },
    { id: 'gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark', tier: 'fast-coding', context: 128000 },
    { id: 'o3', name: 'o3', tier: 'reasoning', context: 200000 },
  ],
  anthropic: [
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', tier: 'premium', context: 200000 },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'standard', context: 200000 },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', tier: 'budget', context: 200000 },
  ],
  openrouter: [
    { id: 'openrouter/auto', name: 'Auto (best model per prompt)', tier: 'auto', context: 200000 },
    { id: 'openai/gpt-5.4', name: 'GPT-5.4 (OpenRouter)', tier: 'premium', context: 1000000 },
    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (OpenRouter)', tier: 'standard', context: 200000 },
    { id: 'meta-llama/llama-3.3-70b-instruct', name: 'Llama 3.3 70B (OpenRouter)', tier: 'budget', context: 131072 },
    { id: 'google/gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro (OpenRouter)', tier: 'premium', context: 1000000 },
    { id: 'mistralai/mixtral-8x22b-instruct', name: 'Mixtral 8x22B (OpenRouter)', tier: 'standard', context: 65536 },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large', tier: 'premium', context: 128000 },
    { id: 'mistral-medium-latest', name: 'Mistral Medium', tier: 'standard', context: 32768 },
    { id: 'mistral-small-latest', name: 'Mistral Small', tier: 'budget', context: 32768 },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', tier: 'fast', context: 128000 },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', tier: 'ultra-fast', context: 128000 },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', tier: 'fast', context: 32768 },
  ],
  codex: [
    { id: 'codex/gpt-5.4', name: 'GPT-5.4 (Codex)', tier: 'premium', context: 1000000 },
    { id: 'codex/gpt-5.4-mini', name: 'GPT-5.4 Mini (Codex)', tier: 'budget', context: 1000000 },
    { id: 'codex/gpt-5.3-codex', name: 'GPT-5.3 Codex (Codex)', tier: 'coding', context: 1000000 },
    { id: 'codex/gpt-5.3-codex-spark', name: 'GPT-5.3 Codex Spark (Codex)', tier: 'fast-coding', context: 128000 },
    { id: 'codex/o3', name: 'o3 (Codex)', tier: 'reasoning', context: 200000 },
  ],
};

/**
 * GET /api/v1/llm/models
 * Returns all available models grouped by provider
 */
router.get('/models', (_req, res) => {
  res.json({ success: true, models: MODEL_CATALOG });
});

module.exports = router;
