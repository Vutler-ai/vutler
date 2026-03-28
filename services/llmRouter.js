'use strict';

const https = require('https');
const sniparaClient = require('./sniparaClient');

// ── Memory tool definitions injected when an agent has a Snipara scope ────────

const MEMORY_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'remember',
      description: 'Store important information for future reference. Use when the user shares facts, preferences, decisions, or context you should remember.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The information to remember' },
          importance: { type: 'integer', minimum: 1, maximum: 10, description: 'How important (1=trivial, 10=critical)' },
          type: { type: 'string', enum: ['fact', 'preference', 'decision', 'context', 'action_log'], description: 'Type of memory' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall',
      description: 'Search your memory for relevant information before responding. Use when you need context about the user, project, or previous interactions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to search for in memory' },
        },
        required: ['query'],
      },
    },
  },
];

const PROVIDERS = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'gpt-5.4',
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
  codex: {
    baseURL: 'https://api.openai.com/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'gpt-5.4',
    defaultHeaders: {},
  },
};

function detectProvider(model) {
  if (!model) return 'openrouter'; // default to OpenRouter auto
  const m = String(model).toLowerCase();
  if (m.startsWith('codex/')) return 'codex';
  if (m.includes('claude') || m.includes('sonnet') || m.includes('haiku') || m.includes('opus')) return 'anthropic';
  if (m.includes('/')) return 'openrouter';
  if (m.includes('mistral')) return 'mistral';
  if (m.includes('llama') || m.includes('mixtral') || m.includes('groq')) return 'groq';
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4')) return 'openai';
  return 'openrouter'; // fallback to OpenRouter auto for unknown models
}

// Strip codex/ prefix to get the real OpenAI model ID
function resolveCodexModel(model) {
  return String(model).replace(/^codex\//, '');
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

// Resolve OAuth token for the "codex" provider from workspace_integrations (ChatGPT OAuth)
async function resolveCodexOAuthToken(db, workspaceId) {
  if (!db || !workspaceId) return null;
  try {
    const r = await db.query(
      `SELECT access_token, refresh_token, token_expires_at
       FROM tenant_vutler.workspace_integrations
       WHERE workspace_id = $1 AND provider = 'chatgpt' AND connected = TRUE
       LIMIT 1`,
      [workspaceId]
    );
    const row = r.rows?.[0];
    if (!row?.access_token) return null;

    // Check if token is expired or about to expire (within 5 min)
    const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
    if (expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000) {
      try {
        const { refreshChatGPTToken } = require('../api/integrations');
        const newToken = await refreshChatGPTToken(workspaceId);
        return newToken || row.access_token; // Fall back to existing token
      } catch (refreshErr) {
        console.warn('[LLM Router] ChatGPT token refresh failed:', refreshErr.message);
        return row.access_token; // Try the existing token anyway
      }
    }

    return row.access_token;
  } catch (err) {
    console.warn('[LLM Router] resolveCodexOAuthToken failed:', err.message);
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
  const tools = options.tools || null;

  if (cfg.format === 'anthropic') {
    const sysMsg = systemPrompt || messages.find(m => m.role === 'system')?.content || '';
    const userMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

    const body = {
      model: model || cfg.defaultModel,
      max_tokens: maxTokens,
      temperature,
      system: sysMsg,
      messages: userMsgs,
    };
    if (tools && tools.length > 0) body.tools = tools;

    return {
      hostname,
      path,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...cfg.defaultHeaders,
      },
      body,
    };
  }

  const allMsgs = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages.filter(m => m.role !== 'system')]
    : messages;

  const body = {
    model: model || cfg.defaultModel,
    messages: allMsgs,
    temperature,
    max_tokens: maxTokens,
  };
  if (tools && tools.length > 0) body.tools = tools;

  return {
    hostname,
    path,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...cfg.defaultHeaders,
    },
    body,
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
    // Anthropic: content is an array of blocks (text | tool_use)
    const contentBlocks = result.content || [];
    const textContent = contentBlocks.filter(b => b.type === 'text').map(b => b.text).join('');
    const toolCalls = contentBlocks
      .filter(b => b.type === 'tool_use')
      .map(b => ({ id: b.id, name: b.name, arguments: b.input || {} }));

    return {
      content: textContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : null,
      stop_reason: result.stop_reason || null,
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

  // OpenAI-compatible: tool_calls live on message
  const message = result.choices?.[0]?.message || {};
  const rawToolCalls = message.tool_calls || null;
  const toolCalls = rawToolCalls
    ? rawToolCalls.map(tc => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: (() => {
          try { return JSON.parse(tc.function?.arguments || '{}'); } catch { return {}; }
        })(),
      }))
    : null;

  return {
    content: message.content || '',
    tool_calls: toolCalls,
    stop_reason: result.choices?.[0]?.finish_reason || null,
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

async function runOnce(attempt, messages, tools) {
  const start = Date.now();
  const req = buildRequest(attempt.provider, attempt.model, messages, attempt.system_prompt, {
    temperature: attempt.temperature,
    maxTokens: attempt.max_tokens,
    apiKey: attempt.api_key,
    baseURL: attempt.base_url,
    tools: tools || null,
  });
  const result = await httpPost(req.hostname, req.path, req.headers, req.body);
  return normalizeResponse(attempt.provider, attempt.model, result, Date.now() - start);
}

async function chat(agent, messages, db) {
  const MODEL_MAP = {
    // Legacy OpenAI models → current
    'gpt-4o': 'gpt-5.4',
    'gpt-4o-mini': 'gpt-5.4-mini',
    'gpt-4.1': 'gpt-5.4',
    'gpt-4.1-mini': 'gpt-5.4-mini',
    'gpt-5.2': 'gpt-5.4',
    'gpt-5.3': 'gpt-5.4',
    'o4-mini': 'o3',
    // Legacy Codex models → current
    'codex/gpt-4o': 'codex/gpt-5.4',
    'codex/gpt-4o-mini': 'codex/gpt-5.4-mini',
    'codex/gpt-4.1': 'codex/gpt-5.4',
    'codex/gpt-4.1-mini': 'codex/gpt-5.4-mini',
    // Legacy Anthropic models → current
    'claude-sonnet-4.5': 'claude-sonnet-4-20250514',
    'claude-3.5-sonnet': 'claude-sonnet-4-20250514',
    'claude-3-opus': 'claude-opus-4-20250514',
    'claude-3-5-haiku-latest': 'claude-haiku-4-5',
  };

  const rawModel = agent?.model || 'claude-sonnet-4-20250514';
  const model = MODEL_MAP[rawModel] || rawModel;
  const workspaceId = agent?.workspace_id || agent?.workspaceId || null;

  const primaryProvider = agent?.provider || detectProvider(model);
  const fallbackProvider = agent?.fallback_provider || agent?.fallback?.provider || null;
  const fallbackModel = agent?.fallback_model || agent?.fallback?.model || null;

  // Determine memory scope — prefer snipara_instance_id, fall back to memory_scope,
  // then username (the Snipara scope used by sniparaClient), then null
  const memoryScope = agent?.snipara_instance_id || agent?.memory_scope
    || agent?.username
    || (agent?.name ? agent.name.toLowerCase().replace(/\s+/g, '-') : null)
    || null;

  // Inject memory tools and augment system prompt when memory is configured
  const memoryTools = memoryScope ? MEMORY_TOOLS : null;
  let effectiveSystemPrompt = agent?.system_prompt || '';
  if (memoryScope) {
    const memoryInstruction = '\n\nYou have access to persistent memory. Use remember() to store important information and recall() to search your memory before responding to questions about past context.';
    effectiveSystemPrompt = effectiveSystemPrompt + memoryInstruction;
  }

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

    let api_key, base_url;
    if (a.provider === 'codex') {
      // Codex uses OAuth token from workspace_integrations (ChatGPT OAuth)
      api_key = await resolveCodexOAuthToken(db, workspaceId);
      base_url = providerCfg.baseURL;
      if (!api_key) {
        lastErr = new Error('ChatGPT not connected. Connect via Integrations > ChatGPT.');
        continue;
      }
    } else {
      const row = await resolveWorkspaceProvider(db, workspaceId, a.provider);
      api_key = row?.api_key || process.env[`${a.provider.toUpperCase()}_API_KEY`] || process.env.OPENAI_API_KEY;
      base_url = row?.base_url || providerCfg.baseURL;
    }

    // For codex provider, strip the codex/ prefix to get the real OpenAI model ID
    const resolvedModel = a.provider === 'codex'
      ? resolveCodexModel(a.model || providerCfg.defaultModel)
      : (a.model || providerCfg.defaultModel);

    const attempt = {
      ...agent,
      provider: a.provider,
      model: resolvedModel,
      api_key,
      base_url,
      system_prompt: effectiveSystemPrompt,
    };

    try {
      // ── Tool-call loop (max 3 iterations to prevent infinite loops) ──────────
      let currentMessages = [...messages];
      let llmResult;
      const MAX_TOOL_ITERATIONS = 3;

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        llmResult = await runOnce(attempt, currentMessages, memoryTools);

        // No tool calls → we have the final answer
        if (!llmResult.tool_calls || llmResult.tool_calls.length === 0) break;

        // Process each tool call
        let continueLoop = false;
        for (const toolCall of llmResult.tool_calls) {
          const agentName = agent?.name || agent?.username || 'agent';
          const args = toolCall.arguments || {};

          if (toolCall.name === 'remember' && memoryScope) {
            const importance = args.importance || 5;
            console.log(`[Memory] Agent ${agentName} remembered: "${(args.content || '').slice(0, 100)}" (importance: ${importance})`);
            await sniparaClient.remember(memoryScope, args.content || '', {
              type: args.type || 'fact',
              importance,
            });
            // remember doesn't need a re-call — inject a confirmation as tool result
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
              { role: 'tool', tool_call_id: toolCall.id, name: 'remember', content: 'Memory stored successfully.' },
            ];
            continueLoop = true;

          } else if (toolCall.name === 'recall' && memoryScope) {
            const query = args.query || '';
            console.log(`[Memory] Agent ${agentName} recalling: "${query.slice(0, 80)}"`);
            const recallResult = await sniparaClient.recall(memoryScope, query);
            const recalledText = sniparaClient.extractText(recallResult) || 'No relevant memories found.';
            // Inject recall result and let LLM continue
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
              { role: 'tool', tool_call_id: toolCall.id, name: 'recall', content: recalledText },
            ];
            continueLoop = true;
          }
        }

        if (!continueLoop) break;
      }

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
