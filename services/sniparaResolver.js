'use strict';

const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const DEFAULT_SNIPARA_URL = process.env.SNIPARA_MCP_URL ||
  process.env.SNIPARA_API_URL ||
  'https://api.snipara.com/mcp/test-workspace-api-vutler';
const DEFAULT_SNIPARA_KEY = process.env.SNIPARA_API_KEY ||
  process.env.RLM_TOKEN ||
  '';
const CACHE_TTL_MS = 60_000;
const cache = new Map();

function normalizeWorkspaceId(workspaceId) {
  return workspaceId || DEFAULT_WORKSPACE;
}

function parseSettingValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && typeof value.value === 'string') return value.value;
  return null;
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
    configured: Boolean(DEFAULT_SNIPARA_KEY),
    source: DEFAULT_SNIPARA_KEY ? 'env' : 'none',
  };

  if (db && ws) {
    try {
      const settings = await db.query(
        `SELECT key, value
         FROM tenant_vutler.workspace_settings
         WHERE workspace_id = $1
           AND key IN ('snipara_api_key', 'snipara_api_url', 'snipara_project_id')`,
        [ws]
      );

      const map = new Map(settings.rows.map((row) => [row.key, parseSettingValue(row.value)]));
      const apiKey = map.get('snipara_api_key') || resolved.apiKey;
      const apiUrl = map.get('snipara_api_url') || resolved.apiUrl;
      const projectId = map.get('snipara_project_id') || null;

      resolved = {
        workspaceId: ws,
        apiUrl,
        apiKey,
        projectId,
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
          resolved = {
            workspaceId: ws,
            apiUrl,
            apiKey: row.snipara_api_key,
            projectId: row.snipara_project_id || projectId,
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

async function callSniparaTool({ db, workspaceId, toolName, args = {}, timeoutMs = 15_000 }) {
  const config = await resolveSniparaConfig(db, workspaceId);
  if (!config.configured || !config.apiKey || !config.apiUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    if (!response.ok) {
      throw new Error(`Snipara ${toolName} HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload.error) {
      throw new Error(payload.error.message || `Snipara ${toolName} error`);
    }

    return parseSniparaResult(payload);
  } finally {
    clearTimeout(timeout);
  }
}

function clearSniparaConfigCache(workspaceId) {
  if (!workspaceId) {
    cache.clear();
    return;
  }
  cache.delete(normalizeWorkspaceId(workspaceId));
}

module.exports = {
  DEFAULT_WORKSPACE,
  resolveSniparaConfig,
  callSniparaTool,
  parseSniparaResult,
  clearSniparaConfigCache,
};
