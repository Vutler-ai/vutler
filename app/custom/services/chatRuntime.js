/**
 * Chat Runtime v2 — Snipara-connected agent message processor
 * Agents load their soul/context from Snipara memory, not static DB prompts
 */
'use strict';

const pool = require('../../../lib/vaultbrix');
const { chat: llmChat } = require('../../../services/llmRouter');
const { getSwarmCoordinator } = require('../../../services/swarmCoordinator');

const SCHEMA = 'tenant_vutler';
const POLL_INTERVAL = 3000;
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// Snipara config
const SNIPARA_URL = process.env.SNIPARA_API_URL || 'https://api.snipara.com/mcp/test-workspace-api-vutler';
const SNIPARA_KEY = process.env.SNIPARA_API_KEY || '';

// In-memory caches
const processedIds = new Set();
let running = false;
let agentCache = null;
let agentCacheTime = 0;
const CACHE_TTL = 60000;

// Poll error tracking
let pollInterval = POLL_INTERVAL;
let consecutiveErrors = 0;
let lastErrorMessage = null;
let lastErrorLogTime = 0;
const MAX_POLL_INTERVAL = 60000;
const ERROR_LOG_THROTTLE = 30000;
const MAX_CONSECUTIVE_ERRORS = 10;

// Soul cache per agent (TTL 5 min)
const soulCache = new Map();
const SOUL_CACHE_TTL = 300000;

function normalizeRole(role) {
  return String(role || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'general';
}

function getMemoryScope(agentId, level, role) {
  if (level === 'instance') {
    return { scope: 'agent', category: String(agentId || 'unknown-agent') };
  }
  if (level === 'template') {
    return { scope: 'project', category: `template-${normalizeRole(role)}` };
  }
  return { scope: 'project', category: 'platform-standards' };
}

/**
 * Call Snipara MCP tool via JSON-RPC 2.0
 */
async function sniparaCall(toolName, args) {
  if (!SNIPARA_KEY) {
    console.warn('[ChatRuntime] No SNIPARA_API_KEY — skipping Snipara call');
    return null;
  }

  try {
    const fetch = globalThis.fetch || require('node-fetch');
    const resp = await fetch(SNIPARA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SNIPARA_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      })
    });

    if (!resp.ok) {
      console.error(`[ChatRuntime] Snipara ${toolName} HTTP ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    if (data.error) {
      console.error(`[ChatRuntime] Snipara ${toolName} error:`, data.error.message || data.error);
      return null;
    }

    // Extract text content from MCP response
    const result = data.result;
    if (result && result.content && Array.isArray(result.content)) {
      return result.content.map(c => c.text || '').join('\n');
    }
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (err) {
    console.error(`[ChatRuntime] Snipara ${toolName} failed:`, err.message);
    return null;
  }
}

/**
 * Load agent soul from Snipara memory (with cache)
 */
async function getAgentSoul(agent) {
  const agentName = agent.username || agent.name.toLowerCase();
  const cacheKey = agentName;
  const now = Date.now();

  // Check cache
  const cached = soulCache.get(cacheKey);
  if (cached && (now - cached.time) < SOUL_CACHE_TTL) {
    return cached.soul;
  }

  const role = agent.role || agent.username || agent.name;
  const instanceScope = getMemoryScope(agentName, 'instance', role);
  const templateScope = getMemoryScope(agentName, 'template', role);
  const globalScope = getMemoryScope(agentName, 'global', role);

  // 3-level recall at startup: instance + template + global
  const [instanceMemories, templateMemories, globalMemories] = await Promise.all([
    sniparaCall('rlm_recall', {
      query: `${agentName} personality soul role instructions behavior preferences`,
      agent_id: agentName,
      scope: instanceScope.scope,
      category: instanceScope.category,
      limit: 8
    }),
    sniparaCall('rlm_recall', {
      query: `${role} template best practices role instructions`,
      scope: templateScope.scope,
      category: templateScope.category,
      limit: 6
    }),
    sniparaCall('rlm_recall', {
      query: 'platform standards guardrails policies defaults',
      scope: globalScope.scope,
      category: globalScope.category,
      limit: 6
    })
  ]);

  const recalled = [instanceMemories, templateMemories, globalMemories]
    .filter(Boolean)
    .join('\n\n');

  // Also get relevant context
  const context = await sniparaCall('rlm_context_query', {
    query: `${agentName} agent role responsibilities at Starbox Group`,
    max_tokens: 1000
  });

  // Build soul from Snipara data + DB fallback
  let soul = '';

  if (recalled && recalled.trim()) {
    soul += `## Your Memories\n${recalled}\n\n`;
  }

  if (context && context.trim()) {
    soul += `## Context\n${context}\n\n`;
  }

  // Always include base identity
  soul += `## Identity\nYou are ${agent.name}, an AI agent at Starbox Group.\n`;
  soul += `Your username in the swarm is "${agentName}".\n`;
  soul += `You work as part of a multi-agent team coordinated by Jarvis.\n`;
  soul += `Respond in the same language as the user (French or English).\n`;
  soul += `Be concise, helpful, and stay in character.\n`;

  // Add DB system_prompt as additional context if it exists
  if (agent.system_prompt) {
    soul += `\n## Additional Instructions\n${agent.system_prompt}\n`;
  }

  // Cache it
  soulCache.set(cacheKey, { soul, time: now });
  console.log(`[ChatRuntime] Soul loaded for ${agentName} (${soul.length} chars, snipara: ${recalled ? 'yes' : 'no'})`);

  return soul;
}

/**
 * Remember interaction in Snipara (async, fire-and-forget)
 */
function rememberInteraction(agentName, userMessage, agentResponse) {
  // Only remember significant exchanges (not short greetings)
  if (userMessage.length < 20 && agentResponse.length < 50) return;

  const instanceScope = getMemoryScope(agentName, 'instance');

  sniparaCall('rlm_remember', {
    agent_id: agentName,
    scope: instanceScope.scope,
    category: instanceScope.category,
    text: `User asked: "${userMessage.substring(0, 200)}" — I responded about ${agentResponse.substring(0, 100)}...`,
    type: 'fact',
    importance: 0.3
  }).catch(() => {}); // fire and forget
}

async function loadAgents() {
  const now = Date.now();
  if (agentCache && (now - agentCacheTime) < CACHE_TTL) return agentCache;

  const result = await pool.query(
    `SELECT id, name, username, model, provider, system_prompt, temperature, max_tokens, status
     FROM ${SCHEMA}.agents WHERE workspace_id = $1 AND status = 'online'`,
    [DEFAULT_WORKSPACE]
  );
  agentCache = result.rows;
  agentCacheTime = now;
  return agentCache;
}

async function getChannelAgents(channelId) {
  const result = await pool.query(
    `SELECT cm.user_id, a.id, a.name, a.username, a.model, a.provider, a.system_prompt, a.temperature, a.max_tokens
     FROM ${SCHEMA}.chat_channel_members cm
     JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id OR a.username = cm.user_id
     WHERE cm.channel_id = $1`,
    [channelId]
  );
  return result.rows;
}

function findMentionedAgent(content, agents) {
  if (!content) return null;
  const lower = content.toLowerCase();
  for (const agent of agents) {
    if (lower.includes(`@${agent.username?.toLowerCase()}`) || lower.includes(`@${agent.name?.toLowerCase()}`)) {
      return agent;
    }
  }
  return null;
}

async function getRecentHistory(channelId, limit = 10) {
  const result = await pool.query(
    `SELECT sender_id, sender_name, content FROM ${SCHEMA}.chat_messages
     WHERE channel_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [channelId, limit]
  );
  // Determine role: rows with sender_id matching any agent are 'assistant', others are 'user'
  const agentIds = new Set((agentCache || []).map(a => String(a.id)));
  return result.rows.reverse().map(m => ({
    role: agentIds.has(String(m.sender_id)) ? 'assistant' : 'user',
    content: `${m.sender_name}: ${m.content}`
  }));
}

async function processMessage(msg) {
  // Optimistic lock: mark as processed immediately to prevent duplicate processing
  // from concurrent poll loop + triggerAgentResponse calls.
  // Only skip UUID messages (e.g. fake IDs in tests won't have a DB row).
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (msg.id && uuidRegex.test(msg.id)) {
    try {
      const lockResult = await pool.query(
        `UPDATE ${SCHEMA}.chat_messages SET processed_at = NOW()
         WHERE id = $1 AND processed_at IS NULL
         RETURNING id`,
        [msg.id]
      );
      // If no row was updated, another process already claimed this message — skip.
      if (lockResult.rowCount === 0) {
        console.log(`[ChatRuntime] Message ${msg.id} already claimed — skipping`);
        return;
      }
    } catch (lockErr) {
      // Non-UUID or missing column — proceed anyway (will fail gracefully later)
      console.warn(`[ChatRuntime] Could not lock message ${msg.id}:`, lockErr.message);
    }
  }

  try {
    let channelAgents = await getChannelAgents(msg.channel_id);
    if (channelAgents.length === 0) {
      channelAgents = await loadAgents();
    }

    if (channelAgents.length === 0) {
      console.warn('[ChatRuntime] No agents available');
      return;
    }

    const swarmCoordinator = getSwarmCoordinator();
    try {
      const routing = await swarmCoordinator.analyzeAndRoute(msg, channelAgents);
      if (routing?.routed) {
          await pool.query(
            `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, workspace_id, processed_at)
             VALUES ($1, $2, $3, $4, 'text', $5, NOW())`,
            [
              msg.channel_id,
              'mike',
              'Mike',
              `Bien reçu. J'orchestre l'équipe et on lance l'exécution. (${routing.created_count} tâche(s) distribuée(s))`,
              DEFAULT_WORKSPACE
            ]
          );
          return;
        }
    } catch (swarmErr) {
      console.error('[ChatRuntime] Swarm analyzeAndRoute failed:', swarmErr.message);
    }

    // Route: @mention or random
    let targetAgent = findMentionedAgent(msg.content, channelAgents);
    if (!targetAgent) {
      const idx = Math.floor(Math.random() * channelAgents.length);
      targetAgent = channelAgents[idx];
    }

    console.log(`[ChatRuntime] Routing to ${targetAgent.name} in channel ${msg.channel_id}`);

    // Load soul from Snipara
    const soul = await getAgentSoul(targetAgent);

    // Build conversation context
    const history = await getRecentHistory(msg.channel_id, 10);
    history.push({ role: 'user', content: msg.content });

    // Call LLM with Snipara-enriched soul
    const response = await llmChat(
      {
        model: targetAgent.model,
        provider: targetAgent.provider,
        system_prompt: soul,
        temperature: parseFloat(targetAgent.temperature) || 0.7,
        max_tokens: targetAgent.max_tokens || 4096,
      },
      history
    );

    // Insert agent response
    await pool.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, workspace_id, processed_at)
       VALUES ($1, $2, $3, $4, 'text', $5, NOW())`,
      [msg.channel_id, targetAgent.id, targetAgent.name, response.content, DEFAULT_WORKSPACE]
    );

    console.log(`[ChatRuntime] ${targetAgent.name} replied (${response.latency_ms}ms, ${response.provider}/${response.model}, soul: ${soul.length} chars)`);

    // Remember this interaction in Snipara (async)
    const agentName = targetAgent.username || targetAgent.name.toLowerCase();
    rememberInteraction(agentName, msg.content, response.content);

  } catch (err) {
    console.error(`[ChatRuntime] Error processing message ${msg.id}:`, err.message);
    processedIds.add(msg.id);
  }
}

async function pollOnce() {
  try {
    const result = await pool.query(
      `SELECT m.* FROM ${SCHEMA}.chat_messages m
       WHERE m.processed_at IS NULL
         AND m.workspace_id = $1
         AND m.sender_id NOT IN (SELECT id::text FROM ${SCHEMA}.agents WHERE workspace_id = $1)
         AND m.created_at > NOW() - INTERVAL '5 minutes'
       ORDER BY m.created_at ASC
       LIMIT 10`,
      [DEFAULT_WORKSPACE]
    );

    for (const msg of result.rows) {
      if (processedIds.has(msg.id)) continue;
      processedIds.add(msg.id);
      await processMessage(msg);
    }

    if (processedIds.size > 1000) {
      const arr = [...processedIds];
      arr.slice(0, arr.length - 500).forEach(id => processedIds.delete(id));
    }

    // Success: reset error state and interval
    if (consecutiveErrors > 0) {
      console.log('[ChatRuntime] DB connection restored — resuming normal polling');
    }
    consecutiveErrors = 0;
    lastErrorMessage = null;
    lastErrorLogTime = 0;
    pollInterval = POLL_INTERVAL;
  } catch (err) {
    consecutiveErrors++;
    const now = Date.now();
    const sameError = err.message === lastErrorMessage;
    const throttled = sameError && (now - lastErrorLogTime) < ERROR_LOG_THROTTLE;

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      pollInterval = MAX_POLL_INTERVAL;
      if (!throttled) {
        console.error(`[ChatRuntime] Disabled — DB unavailable (will retry in 60s): ${err.message}`);
        lastErrorMessage = err.message;
        lastErrorLogTime = now;
      }
    } else if (!throttled) {
      console.error('[ChatRuntime] Poll error:', err.message);
      lastErrorMessage = err.message;
      lastErrorLogTime = now;
      // Exponential backoff: double interval up to max
      pollInterval = Math.min(pollInterval * 2, MAX_POLL_INTERVAL);
    }
  }
}

function start() {
  if (running) return;
  running = true;
  console.log(`[ChatRuntime] Started v2 — Snipara ${SNIPARA_KEY ? 'connected' : 'DISABLED (no key)'} — polling every 3s`);

  const tick = async () => {
    if (!running) return;
    await pollOnce();
    setTimeout(tick, pollInterval);
  };

  setTimeout(tick, 5000);
}

function stop() {
  running = false;
  console.log('[ChatRuntime] Stopped');
}

module.exports = { start, stop, getMemoryScope, processMessage };
