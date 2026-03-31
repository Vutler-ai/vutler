/**
 * Chat API — PostgreSQL-backed (v2)
 * Pure PostgreSQL, no MongoDB/Rocket.Chat dependencies
 */
'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const llmRouter = require('../services/llmRouter');
const { createMemoryRuntimeService } = require('../services/memory/runtime');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const memoryRuntime = createMemoryRuntimeService();

// ── Agent response helper (runs async, does not block user) ──
async function _triggerAgentResponse(req, channelId, wsId) {
  try {
    // Find agents in this channel
    const agentResult = await pool.query(
      `SELECT a.id, a.name, a.username, a.model, a.provider, a.system_prompt, a.temperature, a.max_tokens
       FROM ${SCHEMA}.chat_channel_members cm
       JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id
       WHERE cm.channel_id = $1
       LIMIT 1`,
      [channelId]
    );

    if (agentResult.rows.length === 0) return; // No agent in channel

    const agent = agentResult.rows[0];
    console.log(`[Chat] Agent detected: ${agent.name} in channel ${channelId}`);

    // Get recent message history (last 20)
    const historyResult = await pool.query(
      `SELECT sender_id, sender_name, content, created_at
       FROM ${SCHEMA}.chat_messages
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [channelId]
    );

    const messages = historyResult.rows.reverse().map((m) => ({
      role: m.sender_id === agent.id.toString() ? 'assistant' : 'user',
      content: m.sender_name && m.sender_id !== agent.id.toString()
        ? `[${m.sender_name}]: ${m.content}`
        : m.content,
    }));

    let llmResult;
    try {
      if (
        req &&
        req.app &&
        req.app.locals &&
        req.app.locals.chatRuntime &&
        typeof req.app.locals.chatRuntime.processMessage === 'function'
      ) {
        llmResult = await req.app.locals.chatRuntime.processMessage(agent, messages);
      } else {
        throw new Error('chatRuntime not available, using llmRouter');
      }
    } catch (crErr) {
      console.log('[Chat] ChatRuntime fallback to llmRouter:', crErr.message);
      const memoryBundle = await memoryRuntime.preparePromptContext({
        db: pool,
        workspaceId: wsId,
        agent,
        query: messages.map((message) => message.content).join('\n').slice(0, 2000),
        runtime: 'chat',
        includeSummaries: true,
      }).catch(() => ({ prompt: '' }));
      // Call LLM via router
      llmResult = await llmRouter.chat(
        {
          model: agent.model || 'claude-sonnet-4-20250514',
          provider: agent.provider || undefined,
          system_prompt: memoryBundle.prompt
            ? `${agent.system_prompt || `You are ${agent.name}, a helpful AI assistant. Respond concisely and helpfully.`}\n\n${memoryBundle.prompt}`
            : (agent.system_prompt || `You are ${agent.name}, a helpful AI assistant. Respond concisely and helpfully.`),
          temperature: agent.temperature != null ? parseFloat(agent.temperature) : 0.7,
          max_tokens: agent.max_tokens || 4096,
        },
        messages
      );
    }

    console.log(`[Chat] Agent response from ${agent.name}: ${llmResult.content.substring(0, 100)}... (${llmResult.latency_ms}ms, ${llmResult.provider}/${llmResult.model})`);

    // Save agent response
    await pool.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, workspace_id, metadata)
       VALUES ($1, $2, $3, $4, 'text', $5, $6::jsonb)`,
      [
        channelId,
        agent.id.toString(),
        agent.name,
        llmResult.content,
        wsId,
        JSON.stringify({
          resource_artifacts: llmResult.resource_artifacts || [],
          llm_provider: llmResult.provider || null,
          llm_model: llmResult.model || null,
        }),
      ]
    );

    console.log(`[Chat] Agent message saved for ${agent.name}`);
  } catch (err) {
    console.error('[Chat] Agent response error:', err.message);
  }
}

// GET /channels — list all channels
router.get('/channels', async (req, res) => {
  try {
    const wsId = req.headers['x-workspace-id'] || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM ${SCHEMA}.chat_messages m WHERE m.channel_id = c.id) as message_count,
        (SELECT COUNT(*) FROM ${SCHEMA}.chat_channel_members cm WHERE cm.channel_id = c.id) as member_count
       FROM ${SCHEMA}.chat_channels c
       WHERE c.workspace_id = $1
       ORDER BY c.created_at ASC`,
      [wsId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Chat API] channels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /messages?channel_id=X&limit=50&before=timestamp
router.get('/messages', async (req, res) => {
  try {
    const { channel_id, limit = 50, before, after } = req.query;
    if (!channel_id) {
      return res.status(400).json({ success: false, error: 'channel_id is required' });
    }

    let query = `SELECT * FROM ${SCHEMA}.chat_messages WHERE channel_id = $1`;
    const params = [channel_id];
    let paramIdx = 2;

    if (before) {
      query += ` AND created_at < $${paramIdx}`;
      params.push(before);
      paramIdx++;
    }
    if (after) {
      query += ` AND created_at > $${paramIdx}`;
      params.push(after);
      paramIdx++;
    }

    query += ` ORDER BY created_at ASC LIMIT $${paramIdx}`;
    params.push(Math.min(parseInt(limit) || 50, 200));

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Chat API] messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /send — send a message
router.post('/send', async (req, res) => {
  try {
    const { channel_id, content, sender_id, sender_name, message_type = 'text', parent_id } = req.body;
    if (!channel_id || !content) {
      return res.status(400).json({ success: false, error: 'channel_id and content are required' });
    }

    const sId = sender_id || req.headers['x-user-id'] || 'user';
    const sName = sender_name || req.headers['x-user-name'] || 'User';
    const wsId = req.headers['x-workspace-id'] || DEFAULT_WORKSPACE;

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, parent_id, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [channel_id, sId, sName, content, message_type, parent_id || null, wsId]
    );

    // Return user message immediately
    res.json({ success: true, data: result.rows[0] });

    // Trigger agent response async — but NOT if sender is an agent (prevents loop)
    const isAgentSender = await pool.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE id::text = $1 OR username = $2 LIMIT 1`,
      [sId, sName.toLowerCase()]
    );
    if (isAgentSender.rows.length === 0) {
      _triggerAgentResponse(req, channel_id, wsId);
    } else {
      console.log('[Chat] Skipping agent trigger — sender is agent:', sName);
    }
  } catch (err) {
    console.error('[Chat API] send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /channels — create a new channel
router.post('/channels', async (req, res) => {
  try {
    const { name, description, type = 'channel', agentId } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const wsId = req.headers['x-workspace-id'] || DEFAULT_WORKSPACE;
    const createdBy = req.headers['x-user-id'] || 'system';

    // For DM channels, return existing if found
    if (type === 'dm' && agentId) {
      const existing = await pool.query(
        `SELECT * FROM ${SCHEMA}.chat_channels WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
        [name, wsId]
      );
      if (existing.rows.length > 0) {
        return res.json({ success: true, data: existing.rows[0] });
      }
    }

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description || '', type, wsId, createdBy]
    );

    const channel = result.rows[0];

    // Auto-add agent as member for DM channels
    if (type === 'dm' && agentId) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
         VALUES ($1, $2, 'agent')
         ON CONFLICT DO NOTHING`,
        [channel.id, agentId.toString()]
      );
      console.log('[Chat] Auto-added agent', agentId, 'to DM channel', channel.id);
    }

    res.json({ success: true, data: channel });
  } catch (err) {
    console.error('[Chat API] create channel error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /agents — list available agents
router.get('/agents', async (req, res) => {
  try {
    const wsId = req.headers['x-workspace-id'] || DEFAULT_WORKSPACE;
    const result = await pool.query(
      `SELECT id, name, username, status, avatar, role, description, model, provider
       FROM ${SCHEMA}.agents
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [wsId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Chat API] agents error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /channels/:id/members — list channel members
router.get('/channels/:id/members', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.chat_channel_members WHERE channel_id = $1 ORDER BY joined_at ASC`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Chat API] members error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /channels/:id/members — add member to channel
router.post('/channels/:id/members', async (req, res) => {
  try {
    const { user_id, role = 'member' } = req.body;
    if (!user_id) {
      return res.status(400).json({ success: false, error: 'user_id is required' });
    }
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [req.params.id, user_id, role]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error('[Chat API] add member error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
