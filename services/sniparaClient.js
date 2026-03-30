'use strict';

/**
 * Snipara Memory Client (server-side)
 * Lightweight HTTP client for rlm_remember / rlm_recall / rlm_context_query.
 * All errors are swallowed and logged — memory unavailability must never break chat.
 */

const https = require('https');
const { resolveSniparaConfig } = require('./sniparaResolver');

const SNIPARA_API = process.env.SNIPARA_MCP_URL ||
  process.env.SNIPARA_API_URL ||
  'https://api.snipara.com/mcp/test-workspace-api-vutler';

const SNIPARA_TOKEN = process.env.SNIPARA_API_KEY ||
  process.env.RLM_TOKEN ||
  'REDACTED_SNIPARA_KEY_2';

function httpPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Authorization': `Bearer ${token}`,
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          resolve({});
        }
      });
    });

    req.setTimeout(10000, () => req.destroy(new Error('Snipara timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Store a memory in Snipara.
 * @param {string} scope - Memory scope (e.g. "instance-jarvis" or agent id)
 * @param {string} content - Text to remember
 * @param {object} opts - Optional: { type, importance }
 * @returns {Promise<object|null>}
 */
async function remember(scope, content, opts = {}, runtime = {}) {
  try {
    const config = await resolveSniparaConfig(runtime.db, runtime.workspaceId);
    if (!config?.configured || !config.apiKey) return null;
    const result = await httpPost(config.apiUrl || SNIPARA_API, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'rlm_remember',
        arguments: {
          content,
          scope,
          type: opts.type || 'fact',
          importance: opts.importance || 5,
        },
      },
    }, config.apiKey);

    console.log(`[Memory] Remembered in scope "${scope}": "${content.slice(0, 80)}..." (importance: ${opts.importance || 5})`);
    return result;
  } catch (err) {
    console.warn(`[Memory] remember failed (scope=${scope}): ${err.message}`);
    return null;
  }
}

/**
 * Search Snipara memory for relevant context.
 * @param {string} scope - Memory scope
 * @param {string} query - Search query
 * @param {object} opts - Optional extra params
 * @returns {Promise<object|null>}
 */
async function recall(scope, query, opts = {}, runtime = {}) {
  try {
    const config = await resolveSniparaConfig(runtime.db, runtime.workspaceId);
    if (!config?.configured || !config.apiKey) return null;
    const result = await httpPost(config.apiUrl || SNIPARA_API, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'rlm_recall',
        arguments: {
          query,
          scope,
          ...opts,
        },
      },
    }, config.apiKey);

    console.log(`[Memory] Recalled in scope "${scope}" for query: "${query.slice(0, 60)}..."`);
    return result;
  } catch (err) {
    console.warn(`[Memory] recall failed (scope=${scope}): ${err.message}`);
    return null;
  }
}

/**
 * Get full memory context for a scope.
 * @param {string} scope - Memory scope
 * @returns {Promise<object|null>}
 */
async function getContext(scope, runtime = {}) {
  try {
    const config = await resolveSniparaConfig(runtime.db, runtime.workspaceId);
    if (!config?.configured || !config.apiKey) return null;
    const result = await httpPost(config.apiUrl || SNIPARA_API, {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'rlm_context_query',
        arguments: { scope },
      },
    }, config.apiKey);

    return result;
  } catch (err) {
    console.warn(`[Memory] getContext failed (scope=${scope}): ${err.message}`);
    return null;
  }
}

/**
 * Extract text from a Snipara tool result response.
 * Handles both JSONRPC and plain result shapes.
 * @param {object} response - Raw Snipara API response
 * @returns {string}
 */
function extractText(response) {
  if (!response) return '';
  // JSONRPC result shape
  const result = response.result || response;
  if (typeof result === 'string') return result;
  if (result.content) {
    if (Array.isArray(result.content)) {
      return result.content.map(c => c.text || '').join('\n');
    }
    if (typeof result.content === 'string') return result.content;
  }
  if (result.memories && Array.isArray(result.memories)) {
    return result.memories.map(m => m.content || m).join('\n');
  }
  if (result.text) return result.text;
  return JSON.stringify(result);
}

module.exports = { remember, recall, getContext, extractText };
