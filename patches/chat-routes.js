/**
 * Sprint 15.1 — Agent Chat Routes (RC-free, JWT-only)
 * POST /:id/chat — basic chat (hardcoded agents)
 * POST /:id/chat-v2 — runtime engine chat (DB agents)
 * Mike ⚙️ — 2026-02-27
 */

const express = require('express');
const router = express.Router();
const { resolveProviderForAgent, getAdapter, trackTokenUsage } = require('../llm-router');

// ─── Agent Configs (MVP hardcoded) ──────────────────────────────────────────

const AGENT_CONFIGS = {
  jarvis: { name: 'Jarvis', role: 'Coordinator & Strategy', personality: 'INTJ, direct, strategic' },
  mike: { name: 'Mike', role: 'Lead Engineer', personality: 'INTP, analytical, technical' },
  philip: { name: 'Philip', role: 'UI/UX Designer', personality: 'ISFP, creative, detail-oriented' },
  luna: { name: 'Luna', role: 'Product Manager', personality: 'ENTJ, decisive, organized' },
  andrea: { name: 'Andrea', role: 'Office Manager', personality: 'ISTJ, methodical, reliable' },
  max: { name: 'Max', role: 'Marketing & Growth', personality: 'ENTP, creative, strategic' },
  victor: { name: 'Victor', role: 'Sales', personality: 'ENFJ, persuasive, empathetic' },
  oscar: { name: 'Oscar', role: 'Content & Copy', personality: 'ENFP, creative, engaging' },
  nora: { name: 'Nora', role: 'Community Manager', personality: 'ESFJ, social, supportive' },
  stephen: { name: 'Stephen', role: 'Research', personality: 'INFJ, thoughtful, deep' },
  sentinel: { name: 'Sentinel', role: 'News Intelligence', personality: 'ISTJ, factual, precise' },
  marcus: { name: 'Marcus', role: 'Portfolio Manager', personality: 'ENTJ, analytical, decisive' },
  rex: { name: 'Rex', role: 'Security & SRE', personality: 'ISTP, pragmatic, hands-on' },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildSystemPrompt(agent, memories) {
  let prompt = `You are ${agent.name}, a Vutler AI agent.\nRole: ${agent.role}\nPersonality: ${agent.personality}\n\nYou work as part of the Vutler team. Stay in character. Be helpful, concise, and professional.`;

  if (memories && memories.length > 0) {
    prompt += '\n\n## Recent Memories\n';
    for (const m of memories) {
      prompt += `- [${m.type || 'note'}] ${m.content || m.text || JSON.stringify(m)}\n`;
    }
  }

  return prompt;
}

/**
 * Get a working LLM adapter + apiKey + chatUrl
 * Falls back to env vars if DB resolver fails
 */
async function resolveOrFallback(pg, agentId, workspaceId) {
  let resolved = null;
  try {
    resolved = await resolveProviderForAgent(pg, agentId, null, workspaceId);
  } catch (e) {
    console.log('[chat] resolveProviderForAgent failed:', e.message);
  }

  if (resolved) {
    const adapter = getAdapter(resolved.provider);
    const apiKey = resolved.apiKey || resolved.config?.api_key || process.env[`${resolved.provider.toUpperCase()}_API_KEY`];
    const model = resolved.model || 'claude-3-5-sonnet-20241022';
    const chatUrl = resolved.config?.base_url
      ? `${resolved.config.base_url}/v1/messages`
      : adapter.chatUrl;
    return { adapter, apiKey, model, provider: resolved.provider, chatUrl };
  }

  // Fallback: env vars
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    let fallbackKey;
    try { fallbackKey = require('../anthropic-key'); } catch (_) {}
    if (!fallbackKey) return null;
    var key = fallbackKey;
  } else {
    var key = apiKey;
  }

  const adapter = getAdapter('anthropic');
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  return {
    adapter,
    apiKey: key,
    model: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    chatUrl: baseUrl + '/v1/messages',
  };
}

// ─── POST /:id/chat — basic hardcoded agent chat ────────────────────────────

router.post('/:id/chat', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const agentId = req.params.id.toLowerCase();
  const { message, conversation_id } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message (string) is required' });
  }

  const agentConfig = AGENT_CONFIGS[agentId];
  if (!agentConfig) {
    return res.status(404).json({ error: `Agent '${agentId}' not found`, available: Object.keys(AGENT_CONFIGS) });
  }

  try {
    // Load or create conversation
    let convId = conversation_id;
    let conversationMessages = [];

    if (convId) {
      const convRes = await pg.query(
        'SELECT id, messages FROM tenant_vutler.agent_conversations WHERE id = $1 AND agent_id = $2',
        [convId, agentId]
      );
      if (convRes.rows[0]) {
        conversationMessages = convRes.rows[0].messages || [];
      } else {
        convId = null;
      }
    }

    if (!convId) {
      const createRes = await pg.query(
        `INSERT INTO tenant_vutler.agent_conversations (id, agent_id, channel_id, messages, created_at, updated_at, workspace_id)
         VALUES (gen_random_uuid(), $1, 'api', '[]'::jsonb, NOW(), NOW(), '00000000-0000-0000-0000-000000000001')
         RETURNING id`,
        [agentId]
      );
      convId = createRes.rows[0].id;
    }

    // Load memories
    let memories = [];
    try {
      const memRes = await pg.query(
        'SELECT type, content, metadata, created_at FROM tenant_vutler.agent_memories WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 10',
        [agentId]
      );
      memories = memRes.rows;
    } catch (e) {
      console.log('Memory load skipped:', e.message);
    }

    // Build LLM messages
    const systemPrompt = buildSystemPrompt(agentConfig, memories);
    const historyMessages = conversationMessages.slice(-20);
    const cleanHistory = historyMessages.map(m => ({ role: m.role, content: m.content }));
    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...cleanHistory,
      { role: 'user', content: message },
    ];

    const workspaceId = req.workspaceId || '00000000-0000-0000-0000-000000000001';
    const resolved = await resolveOrFallback(pg, agentId, workspaceId);

    if (!resolved || !resolved.adapter || !resolved.apiKey) {
      return res.status(500).json({ error: 'No LLM provider configured and no ANTHROPIC_API_KEY in env' });
    }

    const { adapter, apiKey, model, provider, chatUrl } = resolved;

    const headers = adapter.headers(apiKey);
    const body = adapter.buildBody(llmMessages, model, {
      temperature: 0.7,
      max_tokens: 4096,
    });

    const startTime = Date.now();
    const fetchRes = await fetch(chatUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!fetchRes.ok) {
      const errText = await fetchRes.text().catch(() => '');
      return res.status(502).json({ error: `LLM provider error (${fetchRes.status}): ${errText.slice(0, 500)}` });
    }

    const data = await fetchRes.json();
    const latencyMs = Date.now() - startTime;
    const parsed = adapter.parseResponse(data);

    // Save messages
    const updatedMessages = [
      ...conversationMessages,
      { role: 'user', content: message, ts: new Date().toISOString() },
      { role: 'assistant', content: parsed.content, ts: new Date().toISOString() },
    ];

    await pg.query(
      'UPDATE tenant_vutler.agent_conversations SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(updatedMessages), convId]
    );

    trackTokenUsage(pg, { agentId, provider, model, usage: parsed.usage, latencyMs, requestType: 'agent_chat', workspaceId });

    res.json({
      success: true,
      response: parsed.content,
      conversation_id: convId,
      agent: agentId,
      usage: parsed.usage,
      model,
      provider,
      latency_ms: latencyMs,
    });

  } catch (err) {
    console.error(`Agent chat error (${agentId}):`, err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /:id/chat-v2 — runtime engine chat ────────────────────────────────

router.post('/:id/chat-v2', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const agentId = req.params.id;
  const { message, stream = false } = req.body;

  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    // Get API key from env (ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY)
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'No ANTHROPIC_API_KEY configured' });

    const AgentLoop = require('../../runtime/agent-loop');

    const agentLoop = new AgentLoop(pg, apiKey);
    // Override endpoint to use ANTHROPIC_BASE_URL
    agentLoop.anthropicEndpoint = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com') + '/v1/messages';

    // Verify agent exists in DB
    const agentCheck = await pg.query(
      'SELECT id FROM tenant_vutler.agent_llm_configs WHERE agent_id = $1',
      [agentId]
    );

    // Also accept hardcoded agents
    if (agentCheck.rowCount === 0 && !AGENT_CONFIGS[agentId.toLowerCase()]) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      const result = await agentLoop.run(agentId, message, {
        streaming: true,
        onChunk: (text) => {
          res.write(`data: ${JSON.stringify({ type: 'text', content: text })}\n\n`);
        }
      });

      res.write(`data: ${JSON.stringify({ type: 'done', iterations: result.iterations, toolCalls: result.toolCalls.length })}\n\n`);
      res.end();
    } else {
      const result = await agentLoop.run(agentId, message);
      res.json({
        success: true,
        response: result.response,
        metadata: {
          iterations: result.iterations,
          toolCallsCount: result.toolCalls.length,
          toolCalls: result.toolCalls
        }
      });
    }

  } catch (error) {
    console.error('[chat-v2] Error:', error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ success: false, error: error.message });
    }
  }
});

// GET /:id/conversations
router.get('/:id/conversations', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const agentId = req.params.id.toLowerCase();
  try {
    const { rows } = await pg.query(
      `SELECT id, channel_id, created_at, updated_at, 
              jsonb_array_length(messages) as message_count
       FROM tenant_vutler.agent_conversations WHERE agent_id = $1 
       ORDER BY updated_at DESC LIMIT 20`,
      [agentId]
    );
    res.json({ success: true, conversations: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id/conversations/:convId
router.get('/:id/conversations/:convId', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  try {
    const { rows } = await pg.query(
      'SELECT * FROM tenant_vutler.agent_conversations WHERE id = $1 AND agent_id = $2',
      [req.params.convId, req.params.id.toLowerCase()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Conversation not found' });
    res.json({ success: true, conversation: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
