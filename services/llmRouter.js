'use strict';

const https = require('https');

const PROVIDERS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'gpt-4o',
    defaultHeaders: {},
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    path: '/messages',
    format: 'anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultHeaders: { 'anthropic-version': '2023-06-01' },
  },
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'openrouter/auto',
    defaultHeaders: {
      'HTTP-Referer': 'https://app.vutler.ai',
      'X-Title': 'Vutler',
    },
  },
  mistral: {
    baseURL: 'https://api.mistral.ai/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'mistral-large-latest',
    defaultHeaders: {},
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'llama-3.3-70b-versatile',
    defaultHeaders: {},
  },
};

function detectProvider(model) {
  if (!model) return 'openrouter'; // default to OpenRouter auto
  const m = String(model).toLowerCase();
  if (m.includes('claude') || m.includes('sonnet') || m.includes('haiku') || m.includes('opus')) return 'anthropic';
  if (m.includes('/')) return 'openrouter';
  if (m.includes('mistral')) return 'mistral';
  if (m.includes('llama') || m.includes('mixtral') || m.includes('groq')) return 'groq';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3')) return 'openai';
  return 'openrouter'; // fallback to OpenRouter auto for unknown models
}

function parseUrl(baseURL) {
  const u = new URL(baseURL);
  return { hostname: u.hostname, pathPrefix: u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '') };
}

async function resolveWorkspaceProvider(db, workspaceId, providerName) {
  if (!db || !workspaceId || !providerName) return null;
  try {
    const r = await db.query(
      `SELECT id, provider, api_key, base_url, config, is_enabled
       FROM tenant_vutler.llm_providers
       WHERE workspace_id = $1 AND provider = $2 AND is_enabled = true
       LIMIT 1`,
      [workspaceId, providerName]
    );
    return r.rows?.[0] || null;
  } catch (err) {
    console.warn('[LLM Router] resolveWorkspaceProvider failed:', err.message);
    return null;
  }
}

function buildRequest(provider, model, messages, systemPrompt, options = {}) {
  const cfg = PROVIDERS[provider];
  if (!cfg) throw new Error(`Unsupported provider: ${provider}`);

  const temperature = options.temperature ?? 0.7;
  const maxTokens = options.maxTokens ?? 4096;
  const apiKey = options.apiKey;
  if (!apiKey) throw new Error(`Missing api_key for provider ${provider}`);

  const baseURL = options.baseURL || cfg.baseURL;
  const { hostname, pathPrefix } = parseUrl(baseURL);
  const path = `${pathPrefix}${cfg.path}`;

  if (cfg.format === 'anthropic') {
    const sysMsg = systemPrompt || messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    return {
      hostname,
      path,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...cfg.defaultHeaders,
      },
      body: {
        model: model || cfg.defaultModel,
        max_tokens: maxTokens,
        temperature,
        system: sysMsg,
        messages: userMsgs,
      },
    };
  }

  const allMsgs = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages.filter(m => m.role !== 'system')]
    : messages;

  return {
    hostname,
    path,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...cfg.defaultHeaders,
    },
    body: {
      model: model || cfg.defaultModel,
      messages: allMsgs,
      temperature,
      max_tokens: maxTokens,
    },
  };
}

function httpPost(hostname, path, headers, body, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({ hostname, port: 443, path, method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let obj;
        try {
          obj = raw ? JSON.parse(raw) : {};
        } catch (e) {
          return reject(new Error(`LLM parse error: ${e.message}`));
        }
        if (res.statusCode >= 400) return reject(new Error(`LLM HTTP ${res.statusCode}: ${JSON.stringify(obj)}`));
        resolve(obj);
      });
    });

    req.setTimeout(timeoutMs, () => req.destroy(new Error('LLM timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function normalizeResponse(provider, model, result, latency_ms) {
  if (provider === 'anthropic') {
    return {
      content: result.content?.[0]?.text || '',
      provider,
      model: result.model || model,
      usage: {
        input_tokens: result.usage?.input_tokens || 0,
        output_tokens: result.usage?.output_tokens || 0,
      },
      cost: 0,
      latency_ms,
    };
  }

  return {
    content: result.choices?.[0]?.message?.content || '',
    provider,
    model: result.model || model,
    usage: {
      input_tokens: result.usage?.prompt_tokens || 0,
      output_tokens: result.usage?.completion_tokens || 0,
    },
    cost: 0,
    latency_ms,
  };
}

async function logUsage(db, workspaceId, agent, llmResult) {
  console.log('[LLM_USAGE]', JSON.stringify({
    workspace_id: workspaceId || null,
    provider: llmResult.provider,
    model: llmResult.model,
    input_tokens: llmResult.usage?.input_tokens || 0,
    output_tokens: llmResult.usage?.output_tokens || 0,
    latency_ms: llmResult.latency_ms || 0,
  }));

  if (!db || !workspaceId) return;
  try {
    await db.query(
      `INSERT INTO tenant_vutler.llm_usage_logs
       (workspace_id, agent_id, provider, model, tokens_input, tokens_output, latency_ms, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [
        workspaceId,
        agent?.id || null,
        llmResult.provider,
        llmResult.model,
        llmResult.usage?.input_tokens || 0,
        llmResult.usage?.output_tokens || 0,
        llmResult.latency_ms || 0,
      ]
    );
  } catch (_) {}
}

async function runOnce(attempt, messages) {
  const start = Date.now();
  const req = buildRequest(attempt.provider, attempt.model, messages, attempt.system_prompt, {
    temperature: attempt.temperature,
    maxTokens: attempt.max_tokens,
    apiKey: attempt.api_key,
    baseURL: attempt.base_url,
  });
  const result = await httpPost(req.hostname, req.path, req.headers, req.body);
  return normalizeResponse(attempt.provider, attempt.model, result, Date.now() - start);
}

async function chat(agent, messages, db) {
  const MODEL_MAP = {
    'claude-sonnet-4.5': 'claude-sonnet-4-20250514',
    'claude-3.5-sonnet': 'claude-sonnet-4-20250514',
    'claude-3-opus': 'claude-3-opus-20240229',
  };

  const rawModel = agent?.model || 'claude-sonnet-4-20250514';
  const model = MODEL_MAP[rawModel] || rawModel;
  const workspaceId = agent?.workspace_id || agent?.workspaceId || null;

  const primaryProvider = agent?.provider || detectProvider(model);
  const fallbackProvider = agent?.fallback_provider || agent?.fallback?.provider || null;
  const fallbackModel = agent?.fallback_model || agent?.fallback?.model || null;

  const attempts = [
    { provider: primaryProvider, model },
    ...(fallbackProvider ? [{ provider: fallbackProvider, model: fallbackModel || PROVIDERS[fallbackProvider]?.defaultModel }] : []),
  ];

  let lastErr;
  for (const a of attempts) {
    const providerCfg = PROVIDERS[a.provider];
    if (!providerCfg) {
      lastErr = new Error(`Unknown provider: ${a.provider}`);
      continue;
    }

    const row = await resolveWorkspaceProvider(db, workspaceId, a.provider);
    const api_key = row?.api_key || process.env[`${a.provider.toUpperCase()}_API_KEY`] || process.env.OPENAI_API_KEY;
    const base_url = row?.base_url || providerCfg.baseURL;

    const attempt = {
      ...agent,
      provider: a.provider,
      model: a.model || providerCfg.defaultModel,
      api_key,
      base_url,
      system_prompt: agent?.system_prompt,
    };

    try {
      const llmResult = await runOnce(attempt, messages);
      await logUsage(db, workspaceId, agent, llmResult);
      return llmResult;
    } catch (err) {
      lastErr = err;
      console.warn(`[LLM Router] attempt failed (${a.provider}/${a.model}):`, err.message);
    }
  }

  throw lastErr || new Error('No provider attempt available');
}

async function testProviderConnection({ provider, model, apiKey, baseURL }) {
  const req = buildRequest(provider, model, [{ role: 'user', content: 'Hello' }], '', {
    apiKey,
    baseURL,
    temperature: 0,
    maxTokens: 16,
  });
  await httpPost(req.hostname, req.path, req.headers, req.body, 30000);
  return { ok: true };
}

module.exports = { chat, detectProvider, PROVIDERS, testProviderConnection };
