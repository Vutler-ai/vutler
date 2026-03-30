'use strict';

const https = require('https');
const sniparaClient = require('./sniparaClient');
const { insertChatActionRun, updateChatActionRun } = require('./chatActionRuns');

function formatToolResultContent(result) {
  if (!result) return 'Tool completed with no result.';
  if (result.success === false) return `Error: ${result.error || 'Tool execution failed'}`;

  const payload = Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result;
  if (typeof payload === 'string') return payload;

  try {
    return JSON.stringify(payload);
  } catch (_) {
    return 'Tool completed successfully.';
  }
}

async function startToolActionRun(db, chatActionContext, agent, actionKey, adapter, inputJson) {
  if (!db || !chatActionContext?.messageId || !chatActionContext?.workspaceId || !chatActionContext?.channelId) {
    return null;
  }

  return insertChatActionRun(db, 'tenant_vutler', {
    workspace_id: chatActionContext.workspaceId,
    chat_message_id: chatActionContext.messageId,
    channel_id: chatActionContext.channelId,
    requested_agent_id: chatActionContext.requestedAgentId || agent?.id || null,
    display_agent_id: chatActionContext.displayAgentId || agent?.id || null,
    orchestrated_by: chatActionContext.orchestratedBy || 'jarvis',
    executed_by: agent?.id || null,
    action_key: actionKey,
    adapter,
    status: 'running',
    input_json: inputJson,
  });
}

async function finishToolActionRun(db, runId, agentId, result, err) {
  if (!db || !runId) return;

  const isError = Boolean(err) || result?.success === false;
  await updateChatActionRun(db, 'tenant_vutler', runId, {
    status: isError ? 'error' : 'success',
    executed_by: agentId || null,
    output_json: isError ? null : (result?.data ?? result ?? null),
    error_json: isError ? { error: err?.message || result?.error || 'Tool execution failed' } : null,
  }).catch(() => {});
}

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

// ── Social media tool definition ──────────────────────────────────────────────

const SOCIAL_MEDIA_TOOL = {
  type: 'function',
  function: {
    name: 'vutler_post_social_media',
    description: 'Post content to connected social media accounts (LinkedIn, X, Instagram, TikTok, etc.). Use when asked to publish or share content on social media.',
    parameters: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The text content to post' },
        platforms: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific platforms to post to (e.g. ["linkedin", "twitter"]). If omitted, posts to all connected accounts.',
        },
        scheduled_at: { type: 'string', description: 'Optional: ISO 8601 datetime to schedule the post for later' },
      },
      required: ['caption'],
    },
  },
};

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
    baseURL: 'https://chatgpt.com/backend-api',
    path: '/codex/responses',
    format: 'responses',
    defaultModel: 'gpt-5.3-codex',
    defaultHeaders: {},
  },
  'vutler-trial': {
    baseURL: 'https://api.openai.com/v1',
    path: '/chat/completions',
    format: 'openai',
    defaultModel: 'gpt-4o-mini',
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

// ── Trial token helpers ──────────────────────────────────────────────────────
const _trialRateWindows = new Map(); // workspaceId → timestamp[]
const TRIAL_RATE_LIMIT = 5;
const TRIAL_RATE_WINDOW_MS = 60000;

// Cleanup stale rate-limit entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - TRIAL_RATE_WINDOW_MS * 2;
  for (const [wsId, timestamps] of _trialRateWindows) {
    const fresh = timestamps.filter(t => t > cutoff);
    if (fresh.length === 0) _trialRateWindows.delete(wsId);
    else _trialRateWindows.set(wsId, fresh);
  }
}, 300000);

async function checkTrialQuota(db, workspaceId) {
  const rows = await db.query(
    `SELECT key, value FROM tenant_vutler.workspace_settings
     WHERE workspace_id = $1 AND key IN ('trial_tokens_total', 'trial_tokens_used', 'trial_expires_at')`,
    [workspaceId]
  );
  const s = {};
  for (const r of rows.rows) s[r.key] = r.value;

  const total = parseInt(s.trial_tokens_total, 10) || 0;
  const used = parseInt(s.trial_tokens_used, 10) || 0;
  const expiresAt = s.trial_expires_at ? new Date(s.trial_expires_at) : null;

  if (expiresAt && expiresAt < new Date()) {
    return { allowed: false, remaining: 0, reason: 'Trial expired' };
  }
  const remaining = total - used;
  if (remaining <= 0) {
    return { allowed: false, remaining: 0, reason: 'Trial tokens exhausted' };
  }
  return { allowed: true, remaining };
}

function checkTrialRateLimit(workspaceId) {
  const now = Date.now();
  const timestamps = _trialRateWindows.get(workspaceId) || [];
  const recent = timestamps.filter(t => t > now - TRIAL_RATE_WINDOW_MS);
  if (recent.length >= TRIAL_RATE_LIMIT) {
    return { allowed: false, reason: 'Trial rate limit exceeded (5 req/min)' };
  }
  recent.push(now);
  _trialRateWindows.set(workspaceId, recent);
  return { allowed: true };
}

async function debitTrialTokens(db, workspaceId, tokensUsed) {
  try {
    await db.query(
      `UPDATE tenant_vutler.workspace_settings
       SET value = to_jsonb((value::text::int + $1)), updated_at = NOW()
       WHERE workspace_id = $2 AND key = 'trial_tokens_used'`,
      [tokensUsed, workspaceId]
    );
  } catch (err) {
    console.warn('[LLM Router] debitTrialTokens error:', err.message);
  }
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

  // Responses API format (used by Codex via chatgpt.com/backend-api)
  if (cfg.format === 'responses') {
    const input = [];
    for (const m of messages.filter(m => m.role !== 'system')) {
      input.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
    }

    const body = {
      model: model || cfg.defaultModel,
      instructions: systemPrompt || 'You are a helpful AI assistant.',
      input,
      store: false,
      stream: true,
    };

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

// Stream SSE response from Codex/Responses API and collect the final response object
function httpPostStream(hostname, path, headers, body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    headers['Content-Length'] = Buffer.byteLength(data);

    const req = https.request({ hostname, port: 443, path, method: 'POST', headers }, (res) => {
      if (res.statusCode >= 400) {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => {
          try { reject(new Error(`LLM HTTP ${res.statusCode}: ${raw}`)); }
          catch { reject(new Error(`LLM HTTP ${res.statusCode}`)); }
        });
        return;
      }

      let raw = '';
      let lastResponseObj = null;
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        // Parse SSE events: collect all "response.completed" or last "response.*" event
        const lines = raw.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (!payload || payload === '[DONE]') continue;
            try {
              const evt = JSON.parse(payload);
              // Prefer the completed response event
              if (evt.type === 'response.completed' && evt.response) {
                lastResponseObj = evt.response;
              } else if (evt.type === 'response.done' && evt.response) {
                lastResponseObj = evt.response;
              } else if (evt.output_text !== undefined) {
                // Some endpoints return the final object directly
                lastResponseObj = evt;
              }
            } catch (_) {}
          }
        }
        if (lastResponseObj) {
          resolve(lastResponseObj);
        } else {
          // Fallback: try to parse the entire raw as JSON (non-streaming response)
          try { resolve(JSON.parse(raw)); }
          catch { reject(new Error(`LLM stream parse error: no valid response event found`)); }
        }
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

  // Responses API format (Codex): output is an array of items
  if (result.output && !result.choices) {
    const outputItems = Array.isArray(result.output) ? result.output : [];
    const textContent = outputItems
      .filter(o => o.type === 'message')
      .flatMap(o => (o.content || []).filter(c => c.type === 'output_text').map(c => c.text))
      .join('');
    return {
      content: textContent || result.output_text || '',
      tool_calls: null,
      stop_reason: result.status || 'completed',
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
  const cfg = PROVIDERS[attempt.provider];
  const poster = (cfg && cfg.format === 'responses') ? httpPostStream : httpPost;
  const result = await poster(req.hostname, req.path, req.headers, req.body);
  return normalizeResponse(attempt.provider, attempt.model, result, Date.now() - start);
}

async function chat(agent, messages, db, opts = {}) {
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

  // Inject social media tool when agent has relevant skills
  const agentSkills = agent?.skills || agent?.tools || [];
  const hasSocialSkill = Array.isArray(agentSkills) && agentSkills.some(s =>
    typeof s === 'string' && (s.includes('social') || s.includes('posting') || s.includes('content_scheduling') || s.includes('multi_platform'))
  );
  const socialMediaTools = hasSocialSkill ? [SOCIAL_MEDIA_TOOL] : [];

  let effectiveSystemPrompt = agent?.system_prompt || '';
  if (memoryScope) {
    const memoryInstruction = '\n\nYou have access to persistent memory. Use remember() to store important information and recall() to search your memory before responding to questions about past context.';
    effectiveSystemPrompt = effectiveSystemPrompt + memoryInstruction;
  }
  if (hasSocialSkill) {
    effectiveSystemPrompt += '\n\nYou can post to social media using vutler_post_social_media(). The user has connected social accounts. Use this tool when asked to publish, share, or schedule content on social media.';
  }

  const attempts = [
    { provider: primaryProvider, model },
    ...(fallbackProvider ? [{ provider: fallbackProvider, model: fallbackModel || PROVIDERS[fallbackProvider]?.defaultModel }] : []),
  ];

  let lastErr;
  const chatActionContext = opts.chatActionContext || null;
  for (const a of attempts) {
    const providerCfg = PROVIDERS[a.provider];
    if (!providerCfg) {
      lastErr = new Error(`Unknown provider: ${a.provider}`);
      continue;
    }

    let api_key, base_url;
    if (a.provider === 'vutler-trial') {
      // Trial tokens: enforce quota, rate limit, and gpt-4o-mini only
      const quota = await checkTrialQuota(db, workspaceId);
      if (!quota.allowed) {
        lastErr = new Error(quota.reason);
        continue;
      }
      const rateCheck = checkTrialRateLimit(workspaceId);
      if (!rateCheck.allowed) {
        lastErr = new Error(rateCheck.reason);
        continue;
      }
      const row = await resolveWorkspaceProvider(db, workspaceId, 'vutler-trial');
      api_key = row?.api_key || process.env.VUTLER_TRIAL_OPENAI_KEY;
      base_url = providerCfg.baseURL;
      a.model = 'gpt-4o-mini'; // force trial model
      if (!api_key) {
        lastErr = new Error('Trial not provisioned. No shared key available.');
        continue;
      }
    } else if (a.provider === 'codex') {
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
        // Inject Nexus local tools when a node is online for this workspace
        let nexusTools = [];
        let nexusNodeId = null;
        if (opts.wsConnections && workspaceId) {
          try {
            const { getNexusToolsForWorkspace, getOnlineNexusNode } = require('./nexusTools');
            nexusTools = await getNexusToolsForWorkspace(workspaceId, db);
            if (nexusTools.length > 0) {
              const node = await getOnlineNexusNode(workspaceId, db);
              nexusNodeId = node?.id || null;
            }
          } catch (_) { /* nexusTools not available — skip */ }
        }
        // Inject skill tools when the agent has skills configured
        let skillTools = [];
        if (Array.isArray(agentSkills) && agentSkills.length > 0) {
          try {
            const { getSkillRegistry } = require('./skills');
            skillTools = getSkillRegistry().getSkillTools(agentSkills);
          } catch (_) { /* skills not available — skip */ }
        }
        const allTools = [...(memoryTools || []), ...socialMediaTools, ...nexusTools, ...skillTools];
        llmResult = await runOnce(attempt, currentMessages, allTools.length > 0 ? allTools : null);

        // No tool calls → we have the final answer
        if (!llmResult.tool_calls || llmResult.tool_calls.length === 0) break;

        // Process each tool call
        let continueLoop = false;
        for (const toolCall of llmResult.tool_calls) {
          const agentName = agent?.name || agent?.username || 'agent';
          const args = toolCall.arguments || {};

          if (toolCall.name === 'remember' && memoryScope) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'remember', 'memory', args);
            const importance = args.importance || 5;
            console.log(`[Memory] Agent ${agentName} remembered: "${(args.content || '').slice(0, 100)}" (importance: ${importance})`);
            try {
              await sniparaClient.remember(memoryScope, args.content || '', {
                type: args.type || 'fact',
                importance,
              }, { db, workspaceId });
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, { success: true, data: { stored: true } }, null);
            } catch (rememberErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, rememberErr);
              throw rememberErr;
            }
            // remember doesn't need a re-call — inject a confirmation as tool result
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
              { role: 'tool', tool_call_id: toolCall.id, name: 'remember', content: 'Memory stored successfully.' },
            ];
            continueLoop = true;

          } else if (toolCall.name === 'recall' && memoryScope) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'recall', 'memory', args);
            const query = args.query || '';
            console.log(`[Memory] Agent ${agentName} recalling: "${query.slice(0, 80)}"`);
            let recalledText = 'No relevant memories found.';
            try {
              const recallResult = await sniparaClient.recall(memoryScope, query, {}, { db, workspaceId });
              recalledText = sniparaClient.extractText(recallResult) || 'No relevant memories found.';
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, { success: true, data: { result: recalledText } }, null);
            } catch (recallErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, recallErr);
              throw recallErr;
            }
            // Inject recall result and let LLM continue
            currentMessages = [
              ...currentMessages,
              { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
              { role: 'tool', tool_call_id: toolCall.id, name: 'recall', content: recalledText },
            ];
            continueLoop = true;

          } else if (toolCall.name === 'vutler_post_social_media' && hasSocialSkill) {
            const actionRun = await startToolActionRun(db, chatActionContext, agent, 'vutler_post_social_media', 'social', args);
            const caption = args.caption || '';
            console.log(`[Social] Agent ${agentName} posting: "${caption.slice(0, 100)}"`);
            try {
              const POSTFORME_API_URL = process.env.POSTFORME_API_URL || 'https://app.postforme.dev/api/v1';
              const POSTFORME_API_KEY = process.env.POSTFORME_API_KEY || '';
              // Get workspace social accounts
              const externalId = `ws_${workspaceId}`;
              const accountsRes = await fetch(`${POSTFORME_API_URL}/socials?external_id=${externalId}`, {
                headers: { 'Authorization': `Bearer ${POSTFORME_API_KEY}` },
              });
              const accountsData = await accountsRes.json();
              const allAccounts = accountsData.data || accountsData.accounts || accountsData || [];
              let accounts = Array.isArray(allAccounts) ? allAccounts.map(a => a.id || a.social_account_id) : [];
              // Filter by platform if specified
              if (args.platforms && args.platforms.length > 0) {
                const filtered = allAccounts.filter(a => args.platforms.includes(a.platform || a.type));
                if (filtered.length > 0) accounts = filtered.map(a => a.id || a.social_account_id);
              }
              if (accounts.length === 0) throw new Error('No social accounts connected');
              const postBody = { caption, social_accounts: accounts };
              if (args.scheduled_at) postBody.scheduled_at = args.scheduled_at;
              const postRes = await fetch(`${POSTFORME_API_URL}/posts`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${POSTFORME_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(postBody),
              });
              const postData = await postRes.json();
              // Track usage in DB
              if (db) {
                try {
                  await db.query(
                    `INSERT INTO tenant_vutler.social_posts_usage (workspace_id, agent_id, platform, post_id, caption, status)
                     VALUES ($1, $2, 'multi', $3, $4, 'processing')`,
                    [workspaceId, agent?.id || null, postData.id || null, caption.slice(0, 500)]
                  );
                } catch (_) {}
              }
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: toolCall.id, name: 'vutler_post_social_media', content: `Post published successfully to ${accounts.length} account(s). Post ID: ${postData.id || 'pending'}` },
              ];
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, {
                success: true,
                data: {
                  account_count: accounts.length,
                  post_id: postData.id || null,
                },
              }, null);
            } catch (socialErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, socialErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: toolCall.id, name: 'vutler_post_social_media', content: `Error posting: ${socialErr.message}` },
              ];
            }
            continueLoop = true;

          } else if (toolCall.name && toolCall.name.startsWith('skill_')) {
            const skillKey = toolCall.name.slice('skill_'.length);
            console.log(`[Skills] Agent ${agentName} calling skill: ${skillKey}(${JSON.stringify(args).slice(0, 100)})`);
            const actionRun = await startToolActionRun(db, chatActionContext, agent, skillKey, 'skill', args);
            try {
              const { getSkillRegistry } = require('./skills');
              const skillResult = await getSkillRegistry({ wsConnections: opts.wsConnections }).execute(skillKey, {
                workspaceId,
                agentId: agent?.id || null,
                params: args,
                model: attempt.model,
                provider: attempt.provider,
                chatActionRunId: actionRun?.id || null,
                chatActionContext,
              });

              await finishToolActionRun(db, actionRun?.id, agent?.id || null, skillResult, null);

              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: toolCall.id, name: toolCall.name, content: formatToolResultContent(skillResult) },
              ];
            } catch (skillErr) {
              await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, skillErr);
              currentMessages = [
                ...currentMessages,
                { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                { role: 'tool', tool_call_id: toolCall.id, name: toolCall.name, content: `Error: ${skillErr.message}` },
              ];
            }
            continueLoop = true;

          // ── Nexus tool execution (local node bridge) ──────────────────
          } else if (nexusNodeId && opts.wsConnections) {
            const { NEXUS_TOOL_NAMES, executeNexusTool } = require('./nexusTools');
            if (NEXUS_TOOL_NAMES.has(toolCall.name)) {
              const agentName = agent?.name || agent?.username || 'agent';
              console.log(`[Nexus] Agent ${agentName} calling tool: ${toolCall.name}(${JSON.stringify(args).slice(0, 100)})`);
              const actionRun = await startToolActionRun(db, chatActionContext, agent, toolCall.name, 'nexus', args);
              try {
                const toolResult = await executeNexusTool(nexusNodeId, toolCall.name, args, opts.wsConnections);
                const content = toolResult.success
                  ? JSON.stringify(toolResult.data)
                  : `Error: ${toolResult.error || 'Tool execution failed'}`;
                await finishToolActionRun(db, actionRun?.id, agent?.id || null, toolResult, null);
                currentMessages = [
                  ...currentMessages,
                  { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                  { role: 'tool', tool_call_id: toolCall.id, name: toolCall.name, content },
                ];
              } catch (nexusErr) {
                await finishToolActionRun(db, actionRun?.id, agent?.id || null, null, nexusErr);
                currentMessages = [
                  ...currentMessages,
                  { role: 'assistant', content: llmResult.content || '', tool_calls: llmResult.tool_calls },
                  { role: 'tool', tool_call_id: toolCall.id, name: toolCall.name, content: `Error: ${nexusErr.message}` },
                ];
              }
              continueLoop = true;
            }
          }
        }

        if (!continueLoop) break;
      }

      await logUsage(db, workspaceId, agent, llmResult);

      // Debit trial tokens if using the shared trial provider
      if (a.provider === 'vutler-trial' && llmResult.usage) {
        const totalTokens = (llmResult.usage.input_tokens || 0) + (llmResult.usage.output_tokens || 0);
        if (totalTokens > 0) await debitTrialTokens(db, workspaceId, totalTokens);
      }

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
