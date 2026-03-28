'use strict';

/**
 * Agent Runtime
 *
 * Responsibilities:
 *   1. Load active agents from PostgreSQL (tenant_vutler.agents)
 *   2. Route incoming messages to the right agent
 *   3. Call LLM with agent's system prompt + conversation history
 *   4. Broadcast reply via ws-chat publishMessage
 *   5. Track agent state (active/idle/error) in PostgreSQL
 */

const { LLMRouter } = require('./services/llmRouter');
const { CryptoService } = require('./services/crypto');
const _crypto = new CryptoService();

// DB: prefer vaultbrix (tenant_vutler schema), fall back to generic postgres pool
let pg;
try {
  pg = require('./lib/vaultbrix');
} catch (_) {
  pg = require('./lib/postgres').pool;
}

// Snipara MCP integration (knowledge + memory)
const SNIPARA_API_URL = process.env.SNIPARA_API_URL || 'https://api.snipara.com/mcp/vutler';
const SNIPARA_API_KEY = process.env.SNIPARA_API_KEY || '';

// agentId → { name, systemPrompt, model, provider }
const agentMeta = new Map();
// agentId → current status string
const agentStatus = new Map();
// Set of message IDs currently being processed (dedup)
const processing = new Set();
// channelId → next round-robin index
const roundRobinIndex = new Map();
// channelId → [agentId, ...]
const channelToAgents = new Map();

const llmRouter = new LLMRouter(null, {});

// Shared context cache (MEMORY.md, SOUL.md, USER.md — reloaded every 30min)
let sharedCtx = { soul: '', memory: '', user: '', loadedAt: 0 };

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load agents from DB and mark runtime as started.
 */
async function startRuntime() {
  console.log('[RUNTIME] Starting…');
  await _loadAgents();
  console.log('[RUNTIME] Ready. Agents:', agentMeta.size, '| Channels:', channelToAgents.size);
}

/**
 * Clear in-memory state.
 */
function stopRuntime() {
  agentMeta.clear();
  agentStatus.clear();
  channelToAgents.clear();
  processing.clear();
  console.log('[RUNTIME] Stopped.');
}

/**
 * Route an incoming message to the appropriate agent and return its reply.
 *
 * @param {object} message - { id, channel_id, user_id, content, history? }
 *   history: array of { role, content } for conversation context (optional)
 * @returns {Promise<{ agentId, agentName, reply }>}
 */
async function processAgentMessage(message) {
  const { id: msgId, channel_id: channelId, user_id: userId, content, history = [] } = message;

  if (!content?.trim()) throw new Error('Empty message content');
  if (processing.has(msgId)) throw new Error('Message already being processed');

  const agentIds = channelToAgents.get(channelId);
  if (!agentIds?.length) throw new Error(`No agents assigned to channel ${channelId}`);

  // Round-robin selection (mention routing can be added above this layer)
  const idx = roundRobinIndex.get(channelId) || 0;
  const agentId = agentIds[idx % agentIds.length];
  roundRobinIndex.set(channelId, (idx + 1) % agentIds.length);

  processing.add(msgId);
  setTimeout(() => processing.delete(msgId), 5 * 60_000);

  const meta = agentMeta.get(agentId);
  console.log(`[RUNTIME] ${meta.name} ← "${content.slice(0, 60)}"`);

  await _setStatus(agentId, 'processing');
  const start = Date.now();

  try {
    // Enrich system prompt with shared context + knowledge + memories
    const [knowledge, memories, shared] = await Promise.all([
      _queryKnowledge(agentId, content).catch(() => ''),
      _recallMemories(agentId, content).catch(() => []),
      _loadSharedContext().catch(() => ({})),
    ]);

    let systemPrompt = meta.systemPrompt;
    if (shared.soul)   systemPrompt += '\n\n## Soul\n'           + shared.soul;
    if (shared.user)   systemPrompt += '\n\n## About the User\n' + shared.user;
    if (shared.memory) systemPrompt += '\n\n## Shared Memory\n'  + shared.memory;
    if (knowledge)     systemPrompt += '\n\nRelevant knowledge:\n' + knowledge;
    if (memories?.length) {
      systemPrompt += '\n\nAgent Memories:\n' + memories.map(m => `- ${m.content}`).join('\n');
    }

    // Inject decrypted agent secrets into system prompt
    try {
      const cfgRow = await pg.query(
        `SELECT config FROM tenant_vutler.agent_configs WHERE agent_id = $1 LIMIT 1`, [agentId]
      );
      const agentSecrets = cfgRow.rows[0]?.config?.secrets;
      if (agentSecrets?.length) {
        const decrypted = agentSecrets.map(s => {
          try { return `- ${s.key}: ${_crypto.decrypt(s.value)}`; }
          catch { return null; }
        }).filter(Boolean);
        if (decrypted.length) {
          systemPrompt += '\n\n[Agent Credentials]\nYou have access to the following API credentials. Use them when making external API calls:\n' + decrypted.join('\n') + '\n[/Agent Credentials]';
        }
      }
    } catch (_) { /* secrets unavailable — non-blocking */ }

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10),
      { role: 'user', content },
    ];

    const result = await llmRouter.chat(agentId, messages, {
      provider: meta.provider,
      model: meta.model,
    });

    const reply = (result.content || '').trim() || '…';
    const latency = Date.now() - start;

    await _logTokens(agentId, result, latency);
    await _setStatus(agentId, 'active');

    // Store meaningful user messages and substantive replies as memories
    _maybeStoreMemory(agentId, content, reply, meta.name);

    console.log(`[RUNTIME] ${meta.name} replied in ${latency}ms (${result.usage?.total ?? 0} tok, ${result.provider}/${result.model})`);

    return { agentId, agentName: meta.name, reply };

  } catch (err) {
    await _setStatus(agentId, 'error');
    setTimeout(() => _setStatus(agentId, 'active'), 10_000);
    throw err;
  }
}

/**
 * Return a snapshot of currently loaded agents and their statuses.
 * @returns {Array<{ id, name, status }>}
 */
function getActiveAgents() {
  return Array.from(agentMeta.entries()).map(([id, meta]) => ({
    id,
    name: meta.name,
    status: agentStatus.get(id) || 'active',
  }));
}

// ─── Internal: Data Loading ───────────────────────────────────────────────────

async function _loadAgents() {
  const { rows: agents } = await pg.query(`
    SELECT id, display_name, system_prompt, llm_provider, llm_model
    FROM agents WHERE status = 'active'
  `);

  const { rows: assignments } = await pg.query(`
    SELECT agent_id, channel_id FROM agent_channels WHERE is_active = TRUE
  `);

  agentMeta.clear();
  channelToAgents.clear();

  for (const a of agents) {
    agentMeta.set(a.id, {
      name:         a.display_name,
      systemPrompt: a.system_prompt || `You are ${a.display_name}. Be concise and helpful.`,
      provider:     a.llm_provider  || null,
      model:        a.llm_model     || null,
    });
    agentStatus.set(a.id, 'active');
  }

  for (const row of assignments) {
    if (!agentMeta.has(row.agent_id)) continue;
    if (!channelToAgents.has(row.channel_id)) channelToAgents.set(row.channel_id, []);
    channelToAgents.get(row.channel_id).push(row.agent_id);
  }

  console.log(`[RUNTIME] Loaded ${agents.length} agents, ${channelToAgents.size} channels.`);
}

// ─── Internal: Agent State ────────────────────────────────────────────────────

async function _setStatus(agentId, status) {
  agentStatus.set(agentId, status);
  try {
    await pg.query(
      `UPDATE agents SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, agentId]
    );
  } catch (err) {
    console.warn('[RUNTIME] Could not update agent status:', err.message);
  }
}

async function _logTokens(agentId, result, latencyMs) {
  try {
    await pg.query(
      `INSERT INTO token_usage
         (agent_id, provider, model, input_tokens, output_tokens, cost, latency_ms, request_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        agentId,
        result.provider  || 'unknown',
        result.model     || 'unknown',
        result.usage?.input  ?? 0,
        result.usage?.output ?? 0,
        result.cost ?? 0,
        latencyMs,
        'chat',
      ]
    );
  } catch (_) { /* non-critical */ }
}

// ─── Internal: Snipara (Knowledge + Memory) ───────────────────────────────────

async function _callSnipara(method, params) {
  if (!SNIPARA_API_KEY) return null;
  try {
    const res = await fetch(SNIPARA_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': SNIPARA_API_KEY },
      body: JSON.stringify({
        jsonrpc: '2.0', id: Date.now(),
        method: 'tools/call',
        params: { name: method, arguments: params },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.error ? null : data.result;
  } catch { return null; }
}

async function _loadSharedContext() {
  const now = Date.now();
  if (sharedCtx.loadedAt && (now - sharedCtx.loadedAt) < 30 * 60_000) return sharedCtx;

  const docs = ['agents/MEMORY.md', 'agents/SOUL.md', 'agents/USER.md'];
  const [memRes, soulRes, userRes] = await Promise.all(
    docs.map(p => _callSnipara('rlm_load_document', { path: p }).catch(() => null))
  );

  const extract = (r) => {
    if (!r) return '';
    const c = r.content || r;
    if (Array.isArray(c)) return c.map(x => x.text || '').join('\n');
    return typeof c === 'string' ? c : (c.text || '');
  };

  sharedCtx = {
    memory:   extract(memRes).slice(0, 4000),
    soul:     extract(soulRes).slice(0, 2000),
    user:     extract(userRes).slice(0, 1000),
    loadedAt: now,
  };
  return sharedCtx;
}

async function _queryKnowledge(agentId, query) {
  const result = await _callSnipara('rlm_context_query', { query, project: 'vutler' });
  if (!result) return '';
  const text = typeof result === 'string' ? result : (result.content || result.text || '');
  return text.slice(0, 2000);
}

async function _recallMemories(agentId, query) {
  const result = await _callSnipara('rlm_recall', {
    query, limit: 5, tags: [`agentId:${agentId}`]
  });
  return (result?.content || result?.memories || []).slice(0, 5);
}

async function _storeMemory(agentId, content, type = 'fact') {
  if (content.length < 50) return;
  const skip = ['how can i help', 'let me know', 'is there anything'];
  if (skip.some(p => content.toLowerCase().includes(p))) return;
  await _callSnipara('rlm_remember', {
    content, type, tags: [`agentId:${agentId}`], metadata: { agent_id: agentId }
  });
}

function _maybeStoreMemory(agentId, userContent, agentReply, agentName) {
  // User preference signals
  if (userContent.length > 50) {
    const lower = userContent.toLowerCase();
    if (/\b(my |i am |i'm |prefer |like |want |need )\b/.test(lower)) {
      _storeMemory(agentId, `User: ${userContent}`, 'preference').catch(() => {});
    }
  }
  // Substantive agent replies as learnings
  if (agentReply && agentReply.length > 100 && !agentReply.startsWith('…')) {
    _storeMemory(agentId, `[${agentName}] ${agentReply.slice(0, 500)}`, 'learning').catch(() => {});
  }
}

module.exports = { startRuntime, stopRuntime, processAgentMessage, getActiveAgents };
