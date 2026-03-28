"use strict";

const express = require("express");
const router = express.Router();

const SCHEMA = "tenant_vutler";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000001";

const MODEL_CATALOG = {
  openai: [
    { id: "gpt-5.4", name: "GPT-5.4", tier: "premium", context: 1000000 },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", tier: "budget", context: 1000000 },
    { id: "gpt-5.3-codex", name: "GPT-5.3 Codex", tier: "coding", context: 1000000 },
    { id: "gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark", tier: "fast-coding", context: 128000 },
    { id: "o3", name: "o3", tier: "reasoning", context: 200000 }
  ],
  anthropic: [
    { id: "claude-opus-4-20250514", name: "Claude Opus 4", tier: "premium", context: 200000 },
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", tier: "standard", context: 200000 },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", tier: "budget", context: 200000 }
  ],
  openrouter: [
    { id: "openrouter/auto", name: "Auto (best model per prompt)", tier: "auto", context: 200000 },
    { id: "openai/gpt-5.4", name: "GPT-5.4 (OpenRouter)", tier: "premium", context: 1000000 },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4 (OpenRouter)", tier: "standard", context: 200000 },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B (OpenRouter)", tier: "budget", context: 131072 },
    { id: "google/gemini-2.5-pro-preview", name: "Gemini 2.5 Pro (OpenRouter)", tier: "premium", context: 1000000 },
    { id: "mistralai/mixtral-8x22b-instruct", name: "Mixtral 8x22B (OpenRouter)", tier: "standard", context: 65536 }
  ],
  mistral: [
    { id: "mistral-large-latest", name: "Mistral Large", tier: "premium", context: 128000 },
    { id: "mistral-medium-latest", name: "Mistral Medium", tier: "standard", context: 32768 },
    { id: "mistral-small-latest", name: "Mistral Small", tier: "budget", context: 32768 }
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tier: "fast", context: 128000 },
    { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", tier: "ultra-fast", context: 128000 },
    { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", tier: "fast", context: 32768 }
  ],
  codex: [
    { id: "codex/gpt-5.4", name: "GPT-5.4 (Codex)", tier: "premium", context: 1000000 },
    { id: "codex/gpt-5.4-mini", name: "GPT-5.4 Mini (Codex)", tier: "budget", context: 1000000 },
    { id: "codex/gpt-5.3-codex", name: "GPT-5.3 Codex (Codex)", tier: "coding", context: 1000000 },
    { id: "codex/gpt-5.3-codex-spark", name: "GPT-5.3 Codex Spark (Codex)", tier: "fast-coding", context: 128000 },
    { id: "codex/o3", name: "o3 (Codex)", tier: "reasoning", context: 200000 }
  ]
};

const DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  mistral: "https://api.mistral.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  codex: "https://api.openai.com/v1"
};

const getWorkspaceId = (req) => req.workspaceId || req.headers["x-workspace-id"] || req.query.workspace_id || DEFAULT_WORKSPACE;

const maskApiKey = (apiKey) => {
  if (!apiKey) return null;
  const s = String(apiKey);
  if (s.length <= 10) return "***";
  return `${s.slice(0, 6)}...${s.slice(-4)}`;
};

const toProviderResponse = (row) => ({
  id: row.id,
  workspace_id: row.workspace_id,
  provider: row.provider,
  api_key: maskApiKey(row.api_key),
  base_url: row.base_url,
  is_enabled: row.is_enabled,
  is_default: row.is_default,
  config: row.config || {},
  created_at: row.created_at,
  updated_at: row.updated_at
});

async function testConnection({ provider, apiKey, baseUrl }) {
  const model = MODEL_CATALOG[provider]?.[0]?.id;
  if (!model) throw new Error("Unsupported provider");

  const base = (baseUrl || DEFAULT_BASE_URLS[provider] || "").replace(/\/$/, "");
  const msg = "Say hello";

  if (provider === "anthropic") {
    const resp = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({ model, max_tokens: 32, messages: [{ role: "user", content: msg }] })
    });
    if (!resp.ok) throw new Error(`Anthropic test failed (${resp.status})`);
    return true;
  }

  const extraHeaders = provider === "openrouter"
    ? { "HTTP-Referer": "https://vutler.com", "X-Title": "Vutler" }
    : {};

  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({ model, max_tokens: 32, messages: [{ role: "user", content: msg }] })
  });

  if (!resp.ok) throw new Error(`Provider test failed (${resp.status})`);
  return true;
}

router.get("/providers", async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const workspaceId = getWorkspaceId(req);
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.llm_providers WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId]
    );
    res.json({ success: true, providers: result.rows.map(toProviderResponse) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/providers", async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const workspaceId = getWorkspaceId(req);
    const { provider, api_key, base_url, is_enabled = true, is_default = false, config = {} } = req.body || {};

    if (!provider || !api_key) {
      return res.status(400).json({ success: false, error: "provider and api_key are required" });
    }

    if (!MODEL_CATALOG[provider]) {
      return res.status(400).json({ success: false, error: "unsupported provider" });
    }

    // SECURITY TODO: api_key is stored as plain text. Add column-level encryption
    // (e.g. pgcrypto's pgp_sym_encrypt) or an envelope encryption scheme before
    // this service handles production multi-tenant workloads.
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.llm_providers (workspace_id, provider, api_key, base_url, is_enabled, is_default, config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [workspaceId, provider, api_key, base_url || null, is_enabled, is_default, config]
    );

    res.status(201).json({ success: true, provider: toProviderResponse(result.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put("/providers/:id", async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const workspaceId = getWorkspaceId(req);
    const { id } = req.params;

    const current = await pool.query(
      `SELECT * FROM ${SCHEMA}.llm_providers WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [id, workspaceId]
    );

    if (!current.rows.length) {
      return res.status(404).json({ success: false, error: "provider not found" });
    }

    const row = current.rows[0];
    const next = {
      provider: req.body.provider ?? row.provider,
      api_key: req.body.api_key ?? row.api_key,
      base_url: req.body.base_url ?? row.base_url,
      is_enabled: req.body.is_enabled ?? row.is_enabled,
      is_default: req.body.is_default ?? row.is_default,
      config: req.body.config ?? row.config ?? {}
    };

    const updated = await pool.query(
      `UPDATE ${SCHEMA}.llm_providers
       SET provider = $1,
           api_key = $2,
           base_url = $3,
           is_enabled = $4,
           is_default = $5,
           config = $6,
           updated_at = NOW()
       WHERE id = $7 AND workspace_id = $8
       RETURNING *`,
      [next.provider, next.api_key, next.base_url, next.is_enabled, next.is_default, next.config, id, workspaceId]
    );

    res.json({ success: true, provider: toProviderResponse(updated.rows[0]) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete("/providers/:id", async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const workspaceId = getWorkspaceId(req);
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM ${SCHEMA}.llm_providers WHERE id = $1 AND workspace_id = $2 RETURNING id`,
      [id, workspaceId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: "provider not found" });
    }

    res.json({ success: true, deleted: true, id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post("/providers/:id/test", async (req, res) => {
  try {
    const pool = req.app.locals.pg;
    const workspaceId = getWorkspaceId(req);
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.llm_providers WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [id, workspaceId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: "provider not found" });
    }

    const provider = result.rows[0];
    await testConnection({
      provider: provider.provider,
      apiKey: provider.api_key,
      baseUrl: provider.base_url
    });

    res.json({ success: true, tested: true, message: "Say hello sent successfully" });
  } catch (error) {
    res.status(500).json({ success: false, tested: false, error: error.message });
  }
});

router.get("/models", async (_req, res) => {
  res.json({ success: true, models: MODEL_CATALOG });
});

module.exports = router;
