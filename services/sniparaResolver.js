'use strict';

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const DEFAULT_SNIPARA_PROJECT_SLUG = process.env.SNIPARA_PROJECT_SLUG || 'vutler';
const DEFAULT_SNIPARA_URL = process.env.SNIPARA_MCP_URL ||
  process.env.SNIPARA_PROJECT_MCP_URL ||
  process.env.SNIPARA_API_URL ||
  `https://api.snipara.com/mcp/${DEFAULT_SNIPARA_PROJECT_SLUG}`;
const DEFAULT_SNIPARA_KEY = process.env.SNIPARA_API_KEY ||
  process.env.RLM_TOKEN ||
  '';
const DEFAULT_SNIPARA_SWARM_ID = process.env.SNIPARA_SWARM_ID || null;
const CACHE_TTL_MS = 60_000;
const FAILURE_TTL_MS = Number(process.env.SNIPARA_FAILURE_TTL_MS || 60_000);
const RESPONSE_PREVIEW_LIMIT = 280;
const cache = new Map();
const failureCache = new Map();

class SniparaToolError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SniparaToolError';
    this.statusCode = details.statusCode || null;
    this.toolName = details.toolName || null;
    this.workspaceId = details.workspaceId || null;
    this.apiUrl = details.apiUrl || null;
    this.responsePreview = details.responsePreview || null;
    this.code = details.code || null;
    this.causeMessage = details.causeMessage || null;
  }
}

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || DEFAULT_WORKSPACE;
}

function parseSettingValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && typeof value.value === 'string') return value.value;
  return null;
}

function normalizeProjectSlug(projectSlug) {
  return String(projectSlug || DEFAULT_SNIPARA_PROJECT_SLUG)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || DEFAULT_SNIPARA_PROJECT_SLUG;
}

function buildSniparaProjectUrl(projectSlug, fallbackUrl = DEFAULT_SNIPARA_URL) {
  const slug = normalizeProjectSlug(projectSlug);
  if (process.env.SNIPARA_PROJECT_MCP_URL && !projectSlug) return process.env.SNIPARA_PROJECT_MCP_URL;
  return `https://api.snipara.com/mcp/${slug}` || fallbackUrl;
}

async function resolveSniparaConfig(db, workspaceId = DEFAULT_WORKSPACE) {
  const ws = normalizeWorkspaceId(workspaceId);
  const cached = cache.get(ws);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let resolved = {
    workspaceId: ws,
    apiUrl: DEFAULT_SNIPARA_URL,
    apiKey: DEFAULT_SNIPARA_KEY,
    projectId: null,
    projectSlug: DEFAULT_SNIPARA_PROJECT_SLUG,
    swarmId: DEFAULT_SNIPARA_SWARM_ID,
    configured: Boolean(DEFAULT_SNIPARA_KEY),
    source: DEFAULT_SNIPARA_KEY ? 'env' : 'none',
  };

  if (db && ws) {
    try {
      const settings = await db.query(
        `SELECT key, value
         FROM tenant_vutler.workspace_settings
         WHERE workspace_id = $1
           AND key IN ('snipara_api_key', 'snipara_api_url', 'snipara_project_id', 'snipara_project_slug', 'snipara_swarm_id')`,
        [ws]
      );

      const map = new Map(settings.rows.map((row) => [row.key, parseSettingValue(row.value)]));
      const apiKey = map.get('snipara_api_key') || resolved.apiKey;
      const projectSlug = normalizeProjectSlug(map.get('snipara_project_slug') || DEFAULT_SNIPARA_PROJECT_SLUG);
      const apiUrl = map.get('snipara_api_url') || buildSniparaProjectUrl(projectSlug, resolved.apiUrl);
      const projectId = map.get('snipara_project_id') || null;
      const swarmId = map.get('snipara_swarm_id') || DEFAULT_SNIPARA_SWARM_ID;

      resolved = {
        workspaceId: ws,
        apiUrl,
        apiKey,
        projectId,
        projectSlug,
        swarmId,
        configured: Boolean(apiKey),
        source: map.get('snipara_api_key') ? 'workspace_settings' : resolved.source,
      };

      if (!map.get('snipara_api_key')) {
        const legacy = await db.query(
          `SELECT snipara_api_key, snipara_project_id
           FROM tenant_vutler.workspaces
           WHERE id = $1
           LIMIT 1`,
          [ws]
        ).catch(() => ({ rows: [] }));
        const row = legacy.rows?.[0];
        if (row?.snipara_api_key) {
          const legacyProjectSlug = normalizeProjectSlug(map.get('snipara_project_slug') || DEFAULT_SNIPARA_PROJECT_SLUG);
          resolved = {
            workspaceId: ws,
            apiUrl: buildSniparaProjectUrl(legacyProjectSlug, apiUrl),
            apiKey: row.snipara_api_key,
            projectId: row.snipara_project_id || projectId,
            projectSlug: legacyProjectSlug,
            swarmId,
            configured: true,
            source: 'workspaces',
          };
        }
      }
    } catch (_) {}
  }

  cache.set(ws, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}

function parseSniparaResult(payload) {
  if (!payload) return null;
  const result = payload.result || payload;
  if (!result) return null;
  if (result.structuredContent) return result.structuredContent;
  if (Array.isArray(result.content)) {
    const text = result.content.map((item) => item.text || '').join('\n').trim();
    try { return JSON.parse(text); } catch { return text; }
  }
  return result;
}

function summarizeSnippet(value, limit = RESPONSE_PREVIEW_LIMIT) {
  if (value == null) return null;
  let text = '';
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value);
    } catch (_) {
      text = String(value);
    }
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1)}…`;
}

function serializeSniparaError(error) {
  if (!error) return null;
  return {
    name: error.name || 'Error',
    message: error.message || 'Unknown Snipara error',
    status_code: Number.isFinite(error.statusCode) ? error.statusCode : null,
    tool_name: error.toolName || null,
    workspace_id: error.workspaceId || null,
    api_url: error.apiUrl || null,
    response_preview: error.responsePreview || null,
    code: error.code || null,
    cause: error.causeMessage || null,
  };
}

async function safeReadResponseText(response) {
  try {
    return await response.text();
  } catch (_) {
    return '';
  }
}

function shouldCacheSniparaFailure(error) {
  if (!error) return false;
  if (error.code === 'circuit_open') return false;
  if (error.code === 'timeout' || error.code === 'request_failed' || error.code === 'invalid_json') return true;
  if (Number.isFinite(error.statusCode)) {
    // Keep the circuit breaker for infra/auth failures, not task-level business errors.
    return error.statusCode === 401
      || error.statusCode === 403
      || error.statusCode === 408
      || error.statusCode === 429
      || error.statusCode >= 500;
  }
  return false;
}

function getSniparaFailureState(workspaceId) {
  const key = normalizeWorkspaceId(workspaceId);
  const entry = failureCache.get(key);
  if (!entry) return null;
  if (entry.until <= Date.now()) {
    failureCache.delete(key);
    return null;
  }
  return {
    workspace_id: key,
    open: true,
    retry_at: new Date(entry.until).toISOString(),
    ttl_ms: Math.max(0, entry.until - Date.now()),
    error: entry.error,
  };
}

function cacheSniparaFailure(workspaceId, error) {
  if (!shouldCacheSniparaFailure(error)) return;
  const key = normalizeWorkspaceId(workspaceId);
  failureCache.set(key, {
    until: Date.now() + FAILURE_TTL_MS,
    error: serializeSniparaError(error),
  });
}

function clearSniparaFailureCache(workspaceId) {
  if (!workspaceId) {
    failureCache.clear();
    return;
  }
  failureCache.delete(normalizeWorkspaceId(workspaceId));
}

async function callSniparaTool({ db, workspaceId, toolName, args = {}, timeoutMs = 15_000, bypassFailureCache = false }) {
  const config = await resolveSniparaConfig(db, workspaceId);
  if (!config.configured || !config.apiKey || !config.apiUrl) return null;
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const failureState = !bypassFailureCache ? getSniparaFailureState(resolvedWorkspaceId) : null;
  if (failureState?.open) {
    throw new SniparaToolError(
      `Snipara ${toolName} short-circuited after recent failure`,
      {
        statusCode: failureState.error?.status_code || null,
        toolName,
        workspaceId: resolvedWorkspaceId,
        apiUrl: config.apiUrl,
        responsePreview: failureState.error?.response_preview || null,
        code: 'circuit_open',
        causeMessage: failureState.error?.message || null,
      }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey,
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: {
            ...args,
            workspace_id: args.workspace_id || normalizeWorkspaceId(workspaceId),
          },
        },
      }),
      signal: controller.signal,
    });

    const rawText = await safeReadResponseText(response);
    if (!response.ok) {
      throw new SniparaToolError(`Snipara ${toolName} HTTP ${response.status}`, {
        statusCode: response.status,
        toolName,
        workspaceId: resolvedWorkspaceId,
        apiUrl: config.apiUrl,
        responsePreview: summarizeSnippet(rawText),
        code: 'http_error',
      });
    }

    let payload = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
      throw new SniparaToolError(`Snipara ${toolName} returned invalid JSON`, {
        toolName,
        workspaceId: resolvedWorkspaceId,
        apiUrl: config.apiUrl,
        responsePreview: summarizeSnippet(rawText),
        code: 'invalid_json',
        causeMessage: error.message,
      });
    }

    if (payload.error) {
      throw new SniparaToolError(payload.error.message || `Snipara ${toolName} error`, {
        statusCode: Number.isFinite(payload.error.code) ? payload.error.code : null,
        toolName,
        workspaceId: resolvedWorkspaceId,
        apiUrl: config.apiUrl,
        responsePreview: summarizeSnippet(payload.error),
        code: 'tool_error',
      });
    }

    clearSniparaFailureCache(resolvedWorkspaceId);
    return parseSniparaResult(payload);
  } catch (error) {
    if (error instanceof SniparaToolError) {
      cacheSniparaFailure(resolvedWorkspaceId, error);
      throw error;
    }
    const wrapped = new SniparaToolError(
      error?.name === 'AbortError'
        ? `Snipara ${toolName} timed out after ${timeoutMs}ms`
        : `Snipara ${toolName} request failed: ${error.message}`,
      {
        toolName,
        workspaceId: resolvedWorkspaceId,
        apiUrl: config.apiUrl,
        code: error?.name === 'AbortError' ? 'timeout' : 'request_failed',
        causeMessage: error?.message || null,
      }
    );
    cacheSniparaFailure(resolvedWorkspaceId, wrapped);
    throw wrapped;
  } finally {
    clearTimeout(timeout);
  }
}

async function probeSniparaHealth({ db, workspaceId = DEFAULT_WORKSPACE, timeoutMs = 5_000 } = {}) {
  const resolvedWorkspaceId = normalizeWorkspaceId(workspaceId);
  const resolved = await resolveSniparaConfig(db, resolvedWorkspaceId);

  const data = {
    ok: false,
    workspace_id: resolvedWorkspaceId,
    resolved: {
      source: resolved.source,
      configured: Boolean(resolved.configured),
      api_url: resolved.apiUrl || null,
      project_id: resolved.projectId || null,
      project_slug: resolved.projectSlug || null,
      swarm_id: resolved.swarmId || null,
      api_key_present: Boolean(resolved.apiKey),
    },
    circuit_breaker: getSniparaFailureState(resolvedWorkspaceId),
    transport_probe: null,
    tool_probe: null,
  };

  if (!resolved.configured || !resolved.apiKey || !resolved.apiUrl) {
    data.tool_probe = {
      ok: false,
      code: 'not_configured',
      message: 'Snipara is not configured for this workspace',
    };
    return data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    try {
      const response = await fetch(resolved.apiUrl, {
        method: 'POST',
        headers: {
          Accept: 'application/json, text/event-stream',
          'X-API-Key': resolved.apiKey,
          Authorization: `Bearer ${resolved.apiKey}`,
        },
        signal: controller.signal,
      });
      const rawText = await safeReadResponseText(response);
      data.transport_probe = {
        ok: response.ok,
        status_code: response.status,
        content_type: response.headers.get('content-type') || null,
        response_preview: summarizeSnippet(rawText),
      };
    } catch (error) {
      data.transport_probe = {
        ok: false,
        ...serializeSniparaError(new SniparaToolError(
          error?.name === 'AbortError'
            ? `Snipara transport probe timed out after ${timeoutMs}ms`
            : `Snipara transport probe failed: ${error.message}`,
          {
            workspaceId: resolvedWorkspaceId,
            apiUrl: resolved.apiUrl,
            code: error?.name === 'AbortError' ? 'timeout' : 'request_failed',
            causeMessage: error?.message || null,
          }
        )),
      };
    }
  } finally {
    clearTimeout(timeout);
  }

  try {
    const result = await callSniparaTool({
      db,
      workspaceId: resolvedWorkspaceId,
      toolName: 'rlm_shared_context',
      args: {},
      timeoutMs,
      bypassFailureCache: true,
    });

    data.tool_probe = {
      ok: true,
      tool_name: 'rlm_shared_context',
      result_preview: summarizeSnippet(result),
    };
    data.ok = true;
  } catch (error) {
    data.tool_probe = {
      ok: false,
      ...serializeSniparaError(error),
    };
  }

  return data;
}

function clearSniparaConfigCache(workspaceId) {
  if (!workspaceId) {
    cache.clear();
    failureCache.clear();
    return;
  }
  const normalized = normalizeWorkspaceId(workspaceId);
  cache.delete(normalized);
  failureCache.delete(normalized);
}

module.exports = {
  DEFAULT_WORKSPACE,
  DEFAULT_SNIPARA_PROJECT_SLUG,
  DEFAULT_SNIPARA_SWARM_ID,
  SniparaToolError,
  resolveSniparaConfig,
  callSniparaTool,
  probeSniparaHealth,
  parseSniparaResult,
  getSniparaFailureState,
  serializeSniparaError,
  clearSniparaConfigCache,
  clearSniparaFailureCache,
  normalizeProjectSlug,
  buildSniparaProjectUrl,
};
