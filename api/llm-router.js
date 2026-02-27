/**
 * Story 7.1 → 8.1 — LLM Router API (workspace_id)
 */

const express = require('express');
const router = express.Router();

// ─── Provider Adapters ──────────────────────────────────────────────────────

const ADAPTERS = {
  anthropic: {
    name: 'Anthropic',
    chatUrl: 'https://api.anthropic.com/v1/messages',
    headers(apiKey) {
      return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' };
    },
    buildBody(messages, model, opts) {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      const filtered = messages.filter(m => m.role !== 'system');
      return {
        model: model || 'claude-3-haiku-20240307', messages: filtered,
        max_tokens: opts.max_tokens || 4096, temperature: opts.temperature ?? 0.7,
        ...(system && { system }), ...(opts.stream && { stream: true }), ...(opts.tools && { tools: opts.tools }),
      };
    },
    parseResponse(data) {
      const textBlock = (data.content || []).find(b => b.type === 'text');
      const toolBlocks = (data.content || []).filter(b => b.type === 'tool_use');
      return {
        content: textBlock?.text || '', toolCalls: toolBlocks.length ? toolBlocks : null,
        stopReason: data.stop_reason,
        usage: { input: data.usage?.input_tokens || 0, output: data.usage?.output_tokens || 0, total: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0) },
      };
    },
    parseStreamChunk(line) {
      if (!line.startsWith('data: ')) return null;
      const json = JSON.parse(line.slice(6));
      if (json.type === 'content_block_delta' && json.delta?.text) return { text: json.delta.text };
      if (json.type === 'message_delta' && json.usage) return { usage: { input: json.usage.input_tokens || 0, output: json.usage.output_tokens || 0 } };
      if (json.type === 'message_stop') return { done: true };
      return null;
    },
  },
  openai: {
    name: 'OpenAI',
    chatUrl: 'https://api.openai.com/v1/chat/completions',
    headers(apiKey) { return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }; },
    buildBody(messages, model, opts) {
      return {
        model: model || 'gpt-4o-mini', messages, temperature: opts.temperature ?? 0.7, max_tokens: opts.max_tokens || 4096,
        ...(opts.stream && { stream: true, stream_options: { include_usage: true } }), ...(opts.tools && { tools: opts.tools }),
      };
    },
    parseResponse(data) {
      const choice = data.choices?.[0];
      return {
        content: choice?.message?.content || '', toolCalls: choice?.message?.tool_calls || null, stopReason: choice?.finish_reason,
        usage: { input: data.usage?.prompt_tokens || 0, output: data.usage?.completion_tokens || 0, total: data.usage?.total_tokens || 0 },
      };
    },
    parseStreamChunk(line) {
      if (!line.startsWith('data: ')) return null;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') return { done: true };
      const json = JSON.parse(raw);
      const delta = json.choices?.[0]?.delta;
      if (delta?.content) return { text: delta.content };
      if (json.usage) return { usage: { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } };
      return null;
    },
  },
  groq: {
    name: 'Groq', chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
    get headers() { return ADAPTERS.openai.headers; }, get buildBody() { return ADAPTERS.openai.buildBody; },
    get parseResponse() { return ADAPTERS.openai.parseResponse; }, get parseStreamChunk() { return ADAPTERS.openai.parseStreamChunk; },
  },
  mistral: {
    name: 'Mistral', chatUrl: 'https://api.mistral.ai/v1/chat/completions',
    get headers() { return ADAPTERS.openai.headers; }, get buildBody() { return ADAPTERS.openai.buildBody; },
    get parseResponse() { return ADAPTERS.openai.parseResponse; }, get parseStreamChunk() { return ADAPTERS.openai.parseStreamChunk; },
  },
  ollama: {
    name: 'Ollama', chatUrl: 'http://localhost:11434/api/chat',
    headers() { return { 'Content-Type': 'application/json' }; },
    buildBody(messages, model, opts) {
      return { model: model || 'llama3', messages, stream: !!opts.stream, options: { temperature: opts.temperature ?? 0.7, num_predict: opts.max_tokens || 4096 } };
    },
    parseResponse(data) {
      return {
        content: data.message?.content || '', toolCalls: null, stopReason: data.done ? 'stop' : null,
        usage: { input: data.prompt_eval_count || 0, output: data.eval_count || 0, total: (data.prompt_eval_count || 0) + (data.eval_count || 0) },
      };
    },
    parseStreamChunk(line) {
      const json = JSON.parse(line);
      if (json.done) return { done: true, usage: { input: json.prompt_eval_count || 0, output: json.eval_count || 0 } };
      if (json.message?.content) return { text: json.message.content };
      return null;
    },
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getAdapter(providerName) { return ADAPTERS[providerName?.toLowerCase()]; }

/**
 * Resolve which provider/model/apiKey to use for an agent.
 * Sprint 8.1: Added workspaceId parameter for tenant isolation
 */
async function resolveProviderForAgent(pg, agentId, requestedModel, workspaceId) {
  const wsId = workspaceId || '00000000-0000-0000-0000-000000000000';

  // 1. Check agent_model_assignments (if table exists)
  let row;
  try {
    const r = await pg.query(
      `SELECT ama.model_id, ama.provider, ama.model_name,
              wlp.api_key_encrypted, wlp.api_key_hash, wlp.config
       FROM agent_model_assignments ama
       LEFT JOIN workspace_llm_providers wlp ON LOWER(wlp.provider) = LOWER(ama.provider) AND wlp.workspace_id = $2
       WHERE ama.agent_id = $1 AND ama.is_active = true
       ORDER BY ama.priority ASC NULLS LAST
       LIMIT 1`,
      [agentId, wsId]
    );
    row = r.rows[0];
  } catch { /* table may not exist */ }

  if (row) {
    return { provider: row.provider, model: requestedModel || row.model_name, apiKey: row.api_key_encrypted || row.config?.api_key || null, config: row.config || {} };
  }

  // 2. Workspace default
  try {
    const r = await pg.query(
      `SELECT * FROM workspace_llm_providers WHERE status = 'active' AND is_default = true AND workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [wsId]
    );
    const def = r.rows[0];
    if (def) {
      const models = typeof def.models === 'string' ? JSON.parse(def.models) : (def.models || []);
      return { provider: def.provider, model: requestedModel || models[0] || null, apiKey: def.api_key_encrypted || def.config?.api_key || null, config: def.config || {} };
    }
  } catch { /* fall through */ }

  // 3. Any active provider in workspace
  try {
    const r = await pg.query(
      `SELECT * FROM workspace_llm_providers WHERE status = 'active' AND workspace_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [wsId]
    );
    const any = r.rows[0];
    if (any) {
      const models = typeof any.models === 'string' ? JSON.parse(any.models) : (any.models || []);
      return { provider: any.provider, model: requestedModel || models[0] || null, apiKey: any.api_key_encrypted || any.config?.api_key || null, config: any.config || {} };
    }
  } catch {}

  return null;
}

async function trackTokenUsage(pg, data) {
  try {
    await pg.query(
      `INSERT INTO token_usage (agent_id, provider, model, input_tokens, output_tokens, cost_usd, workspace_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [data.agentId, data.provider, data.model, data.usage.input, data.usage.output,
       data.cost || 0,
       data.workspaceId || '00000000-0000-0000-0000-000000000000']
    );
  } catch (err) {
    console.error('token_usage insert failed:', err.message);
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.post('/chat', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const { agentId, messages, model: requestedModel, stream, temperature, max_tokens, tools } = req.body;
  const workspaceId = req.workspaceId;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const resolved = await resolveProviderForAgent(pg, agentId, requestedModel, workspaceId);
    if (!resolved) {
      return res.status(400).json({ error: 'No LLM provider configured.' });
    }

    const adapter = getAdapter(resolved.provider);
    if (!adapter) return res.status(400).json({ error: `Unsupported provider: ${resolved.provider}` });

    const apiKey = resolved.apiKey || resolved.config?.api_key || process.env[`${resolved.provider.toUpperCase()}_API_KEY`];
    const headers = adapter.headers(apiKey);
    const body = adapter.buildBody(messages, resolved.model, {
      stream: !!stream, temperature: temperature ?? 0.7, max_tokens: max_tokens || 4096, tools,
    });

    const startTime = Date.now();
    const url = resolved.config?.base_url
      ? `${resolved.config.base_url}${adapter.chatUrl.replace(/^https?:\/\/[^/]+/, '')}`
      : adapter.chatUrl;

    const fetchRes = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });

    if (!fetchRes.ok) {
      const errText = await fetchRes.text().catch(() => '');
      return res.status(fetchRes.status).json({ error: `Provider error: ${errText}` });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      let fullText = '';
      let finalUsage = null;
      const reader = fetchRes.body;
      const decoder = new TextDecoder();
      let buffer = '';

      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed = adapter.parseStreamChunk(trimmed);
            if (!parsed) continue;
            if (parsed.text) { fullText += parsed.text; res.write(`data: ${JSON.stringify({ text: parsed.text })}\n\n`); }
            if (parsed.usage) finalUsage = parsed.usage;
            if (parsed.done && parsed.usage) finalUsage = parsed.usage;
          } catch { /* skip */ }
        }
      }

      const latencyMs = Date.now() - startTime;
      const usage = finalUsage || { input: 0, output: 0, total: 0 };
      if (!usage.total) usage.total = (usage.input || 0) + (usage.output || 0);

      res.write(`data: ${JSON.stringify({ done: true, usage, model: resolved.model, provider: resolved.provider })}\n\n`);
      res.end();

      trackTokenUsage(pg, { agentId, provider: resolved.provider, model: resolved.model, usage, latencyMs, requestType: 'chat_stream', workspaceId });
      return;
    }

    const data = await fetchRes.json();
    const latencyMs = Date.now() - startTime;
    const parsed = adapter.parseResponse(data);

    trackTokenUsage(pg, { agentId, provider: resolved.provider, model: resolved.model, usage: parsed.usage, latencyMs, requestType: 'chat', workspaceId });

    res.json({
      success: true, content: parsed.content, toolCalls: parsed.toolCalls, stopReason: parsed.stopReason,
      usage: parsed.usage, model: resolved.model, provider: resolved.provider, latency_ms: latencyMs,
    });
  } catch (err) {
    console.error('LLM Router /chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/providers', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  try {
    const { rows } = await pg.query(
      `SELECT id, provider, api_key_hash, models, plan, status, is_default, created_at, updated_at
       FROM workspace_llm_providers WHERE workspace_id = $1 ORDER BY provider`,
      [req.workspaceId]
    );
    res.json({ success: true, providers: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/models', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  try {
    const { rows } = await pg.query(
      `SELECT provider, models, plan, status FROM workspace_llm_providers WHERE status = 'active' AND workspace_id = $1`,
      [req.workspaceId]
    );
    const allModels = [];
    for (const row of rows) {
      const models = typeof row.models === 'string' ? JSON.parse(row.models) : (row.models || []);
      for (const m of models) allModels.push({ provider: row.provider, model: m, plan: row.plan });
    }
    res.json({ success: true, models: allModels, count: allModels.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/providers', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const { provider, api_key, models, plan, is_default, config } = req.body;
  const workspaceId = req.workspaceId;
  if (!provider) return res.status(400).json({ error: 'provider is required' });

  try {
    const maskedKey = api_key ? (api_key.slice(0, 6) + '...' + api_key.slice(-4)) : null;
    await pg.query(
      `INSERT INTO workspace_llm_providers (provider, api_key_hash, api_key_encrypted, models, plan, status, is_default, config, workspace_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, NOW())
       ON CONFLICT (provider) DO UPDATE SET
         api_key_hash = COALESCE($2, workspace_llm_providers.api_key_hash),
         api_key_encrypted = COALESCE($3, workspace_llm_providers.api_key_encrypted),
         models = COALESCE($4, workspace_llm_providers.models),
         plan = COALESCE($5, workspace_llm_providers.plan),
         is_default = COALESCE($6, workspace_llm_providers.is_default),
         config = COALESCE($7, workspace_llm_providers.config),
         status = 'active', updated_at = NOW()`,
      [provider, maskedKey, api_key, JSON.stringify(models || []), plan || null, is_default || false, JSON.stringify(config || {}), workspaceId]
    );
    res.json({ success: true, message: `Provider ${provider} saved` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.ADAPTERS = ADAPTERS;
module.exports.resolveProviderForAgent = resolveProviderForAgent;
module.exports.getAdapter = getAdapter;
module.exports.trackTokenUsage = trackTokenUsage;
