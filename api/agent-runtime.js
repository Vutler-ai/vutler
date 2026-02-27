/**
 * Story 7.2 → 8.1 — Agent Runtime Engine (workspace_id)
 * AgentRuntime class + Express routes + RC WebSocket integration.
 */

const express = require('express');
const router = express.Router();
const { resolveProviderForAgent, getAdapter, trackTokenUsage } = require('./llm-router');

// ─── Postgres Table Init ────────────────────────────────────────────────────

async function ensureTables(pg) { return; }

// ─── Running Runtimes ───────────────────────────────────────────────────────

const runtimes = new Map(); // agentId → AgentRuntime instance

// ─── AgentRuntime Class ─────────────────────────────────────────────────────

class AgentRuntime {
  constructor(agentId, config, pg, workspaceId) {
    this.agentId = agentId;
    this.config = config;
    this.pg = pg;
    this.workspaceId = workspaceId || '00000000-0000-0000-0000-000000000000';
    this.status = 'stopped';
    this.rcPollTimer = null;
    this.lastPollTs = new Date().toISOString();
  }

  async processMessage(userMessage, channelId) {
    const startTime = Date.now();
    const history = await this.loadHistory(channelId);

    const messages = [];
    if (this.config.system_prompt) {
      messages.push({ role: 'system', content: this.config.system_prompt });
    }
    const maxHistory = this.config.max_history || 40;
    messages.push(...history.slice(-maxHistory));
    messages.push({ role: 'user', content: userMessage });

    let response = null;
    let loopCount = 0;
    const maxLoops = 10;
    let currentMessages = messages;

    while (loopCount < maxLoops) {
      loopCount++;

      const resolved = await resolveProviderForAgent(this.pg, this.agentId, this.config.model, this.workspaceId);
      if (!resolved) throw new Error('No LLM provider configured for agent ' + this.agentId);

      const adapter = getAdapter(resolved.provider);
      if (!adapter) throw new Error(`Unsupported provider: ${resolved.provider}`);

      const apiKey = resolved.apiKey || resolved.config?.api_key || process.env[`${resolved.provider.toUpperCase()}_API_KEY`];
      const body = adapter.buildBody(currentMessages, resolved.model, {
        temperature: this.config.temperature ?? 0.7,
        max_tokens: this.config.max_tokens || 4096,
        tools: this.config.tools || undefined,
      });

      const url = resolved.config?.base_url
        ? `${resolved.config.base_url}${adapter.chatUrl.replace(/^https?:\/\/[^/]+/, '')}`
        : adapter.chatUrl;

      const fetchRes = await fetch(url, {
        method: 'POST',
        headers: adapter.headers(apiKey),
        body: JSON.stringify(body),
      });

      if (!fetchRes.ok) {
        const errText = await fetchRes.text().catch(() => '');
        throw new Error(`LLM error (${fetchRes.status}): ${errText}`);
      }

      const data = await fetchRes.json();
      const parsed = adapter.parseResponse(data);
      const latencyMs = Date.now() - startTime;

      trackTokenUsage(this.pg, {
        agentId: this.agentId, provider: resolved.provider, model: resolved.model,
        usage: parsed.usage, latencyMs, requestType: 'agent_runtime',
        workspaceId: this.workspaceId,
      });

      if (parsed.toolCalls && parsed.toolCalls.length > 0) {
        currentMessages.push({ role: 'assistant', content: parsed.content || '', tool_calls: parsed.toolCalls });
        for (const tc of parsed.toolCalls) {
          const toolResult = await this.executeTool(tc);
          currentMessages.push({
            role: 'tool', tool_call_id: tc.id,
            content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          });
        }
        continue;
      }

      response = {
        content: parsed.content, usage: parsed.usage, model: resolved.model,
        provider: resolved.provider, latency_ms: latencyMs, loops: loopCount,
      };
      break;
    }

    if (!response) {
      response = { content: '(max tool loops reached)', usage: { input: 0, output: 0, total: 0 }, loops: loopCount };
    }

    await this.appendHistory(channelId, [
      { role: 'user', content: userMessage },
      { role: 'assistant', content: response.content },
    ]);

    await this.pg.query(
      `UPDATE agent_runtime_status SET last_activity = NOW() WHERE agent_id = $1 AND workspace_id = $2`,
      [this.agentId, this.workspaceId]
    ).catch(() => {});

    return response;
  }

  async executeTool(toolCall) {
    const name = toolCall.function?.name || toolCall.name || 'unknown';
    console.log(`[AgentRuntime] Tool call: ${name}`, toolCall);
    return { error: `Tool "${name}" is not implemented yet.` };
  }

  async loadHistory(channelId) {
    try {
      const { rows } = await this.pg.query(
        `SELECT messages FROM agent_conversations WHERE agent_id = $1 AND channel_id = $2 AND workspace_id = $3 ORDER BY updated_at DESC LIMIT 1`,
        [this.agentId, channelId, this.workspaceId]
      );
      return rows[0]?.messages || [];
    } catch { return []; }
  }

  async appendHistory(channelId, newMessages) {
    try {
      const existing = await this.loadHistory(channelId);
      const capped = [...existing, ...newMessages].slice(-200);

      const { rowCount } = await this.pg.query(
        `UPDATE agent_conversations SET messages = $1, updated_at = NOW()
         WHERE agent_id = $2 AND channel_id = $3 AND workspace_id = $4`,
        [JSON.stringify(capped), this.agentId, channelId, this.workspaceId]
      );
      if (rowCount === 0) {
        await this.pg.query(
          `INSERT INTO agent_conversations (agent_id, channel_id, messages, workspace_id) VALUES ($1, $2, $3, $4)`,
          [this.agentId, channelId, JSON.stringify(capped), this.workspaceId]
        );
      }
    } catch (err) {
      console.error('appendHistory error:', err.message);
    }
  }

  async startRCPolling(rcBaseUrl) {
    if (this.rcPollTimer) return;
    const RC_URL = rcBaseUrl || process.env.RC_URL || 'http://localhost:3000';
    const userId = this.config.rc_user_id;
    const authToken = this.config.rc_auth_token;
    if (!userId || !authToken) return;

    const rcHeaders = { 'X-User-Id': userId, 'X-Auth-Token': authToken, 'Content-Type': 'application/json' };

    const poll = async () => {
      try {
        const subRes = await fetch(`${RC_URL}/api/v1/subscriptions.getAll`, { headers: rcHeaders });
        if (!subRes.ok) return;
        const subs = await subRes.json();

        for (const sub of (subs.update || [])) {
          const rid = sub.rid;
          const msgRes = await fetch(`${RC_URL}/api/v1/channels.history?roomId=${rid}&count=5&oldest=${this.lastPollTs}`, { headers: rcHeaders });
          if (!msgRes.ok) continue;
          const msgData = await msgRes.json();

          for (const msg of (msgData.messages || [])) {
            if (msg.u?._id === userId) continue;
            if (new Date(msg.ts) <= new Date(this.lastPollTs)) continue;

            fetch(`${RC_URL}/api/v1/chat.sendTypingEvent`, {
              method: 'POST', headers: rcHeaders,
              body: JSON.stringify({ roomId: rid, typing: true }),
            }).catch(() => {});

            try {
              const result = await this.processMessage(msg.msg, rid);
              await fetch(`${RC_URL}/api/v1/chat.sendMessage`, {
                method: 'POST', headers: rcHeaders,
                body: JSON.stringify({ message: { rid, msg: result.content } }),
              });
            } catch (err) {
              console.error(`[AgentRuntime ${this.agentId}] processMessage error:`, err.message);
            }

            fetch(`${RC_URL}/api/v1/chat.sendTypingEvent`, {
              method: 'POST', headers: rcHeaders,
              body: JSON.stringify({ roomId: rid, typing: false }),
            }).catch(() => {});
          }
        }
        this.lastPollTs = new Date().toISOString();
      } catch (err) {
        console.error(`[AgentRuntime ${this.agentId}] RC poll error:`, err.message);
      }
    };

    this.rcPollTimer = setInterval(poll, 3000);
    poll();
  }

  stopRCPolling() {
    if (this.rcPollTimer) { clearInterval(this.rcPollTimer); this.rcPollTimer = null; }
  }

  async start() {
    this.status = 'running';
    await this.pg.query(
      `INSERT INTO agent_runtime_status (agent_id, status, started_at, last_activity, config, workspace_id)
       VALUES ($1, 'running', NOW(), NOW(), $2, $3)
       ON CONFLICT (agent_id) DO UPDATE SET status = 'running', started_at = NOW(), last_activity = NOW(), error = NULL, config = $2`,
      [this.agentId, JSON.stringify(this.config), this.workspaceId]
    ).catch(() => {});
    await this.startRCPolling();
  }

  async stop() {
    this.status = 'stopped';
    this.stopRCPolling();
    await this.pg.query(
      `UPDATE agent_runtime_status SET status = 'stopped' WHERE agent_id = $1 AND workspace_id = $2`,
      [this.agentId, this.workspaceId]
    ).catch(() => {});
  }
}

// ─── Express Routes ─────────────────────────────────────────────────────────

router.post('/:id/message', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const { id: agentId } = req.params;
  const { message, channel_id } = req.body;
  const workspaceId = req.workspaceId;

  if (!message) return res.status(400).json({ error: 'message is required' });

  try {
    let rt = runtimes.get(agentId);
    if (!rt) {
      const config = await loadAgentConfig(pg, agentId, workspaceId);
      rt = new AgentRuntime(agentId, config, pg, workspaceId);
      await rt.start();
      runtimes.set(agentId, rt);
    }

    const result = await rt.processMessage(message, channel_id || 'rest-' + agentId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('agent message error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/conversations', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  try {
    const { rows } = await pg.query(
      `SELECT id, channel_id, messages, created_at, updated_at
       FROM agent_conversations WHERE agent_id = $1 AND workspace_id = $2 ORDER BY updated_at DESC LIMIT 50`,
      [req.params.id, req.workspaceId]
    );
    res.json({ success: true, conversations: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/start', async (req, res) => {
  const pg = req.app.locals.pg;
  if (!pg) return res.status(503).json({ error: 'Database not available' });

  const agentId = req.params.id;
  const workspaceId = req.workspaceId;
  if (runtimes.has(agentId)) {
    return res.status(409).json({ error: 'Agent runtime already running' });
  }

  try {
    await ensureTables(pg);
    const config = await loadAgentConfig(pg, agentId, workspaceId);
    if (req.body.system_prompt) config.system_prompt = req.body.system_prompt;
    if (req.body.model) config.model = req.body.model;
    if (req.body.rc_user_id) config.rc_user_id = req.body.rc_user_id;
    if (req.body.rc_auth_token) config.rc_auth_token = req.body.rc_auth_token;

    const rt = new AgentRuntime(agentId, config, pg, workspaceId);
    await rt.start();
    runtimes.set(agentId, rt);

    res.json({ success: true, agent_id: agentId, status: 'running' });
  } catch (err) {
    console.error('agent start error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', async (req, res) => {
  const agentId = req.params.id;
  const rt = runtimes.get(agentId);
  if (!rt) return res.status(404).json({ error: 'Agent runtime not running' });

  await rt.stop();
  runtimes.delete(agentId);
  res.json({ success: true, agent_id: agentId, status: 'stopped' });
});

router.get('/status', async (req, res) => {
  const pg = req.app.locals.pg;
  const workspaceId = req.workspaceId;
  const agents = [];

  for (const [id, rt] of runtimes) {
    agents.push({ agent_id: id, status: rt.status, in_memory: true });
  }

  if (pg) {
    try {
      const { rows } = await pg.query(
        `SELECT * FROM agent_runtime_status WHERE workspace_id = $1 ORDER BY last_activity DESC`,
        [workspaceId]
      );
      for (const row of rows) {
        if (!agents.find(a => a.agent_id === row.agent_id)) {
          agents.push({ agent_id: row.agent_id, status: row.status, started_at: row.started_at, last_activity: row.last_activity, in_memory: false });
        }
      }
    } catch { /* table may not exist */ }
  }

  res.json({ success: true, agents, count: agents.length });
});

// ─── Config Loader ──────────────────────────────────────────────────────────

async function loadAgentConfig(pg, agentId, workspaceId) {
  try {
    const { rows } = await pg.query(
      `SELECT * FROM agent_llm_configs WHERE agent_id = $1 AND workspace_id = $2 LIMIT 1`,
      [agentId, workspaceId || '00000000-0000-0000-0000-000000000000']
    );
    if (rows[0]) {
      const r = rows[0];
      return {
        system_prompt: r.system_prompt || r.config?.system_prompt || '',
        model: r.model || r.config?.model || null,
        temperature: r.temperature ?? r.config?.temperature ?? 0.7,
        tools: r.tools || r.config?.tools || null,
        max_tokens: r.max_tokens || r.config?.max_tokens || 4096,
        max_history: r.max_history || 40,
        rc_user_id: r.rc_user_id || r.config?.rc_user_id || null,
        rc_auth_token: r.rc_auth_token || r.config?.rc_auth_token || null,
      };
    }
  } catch { /* table may not exist */ }

  return { system_prompt: '', model: null, temperature: 0.7, tools: null, max_tokens: 4096, max_history: 40 };
}

module.exports = router;
module.exports.AgentRuntime = AgentRuntime;
module.exports.runtimes = runtimes;
module.exports.ensureTables = ensureTables;
module.exports.loadAgentConfig = loadAgentConfig;
