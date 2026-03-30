/**
 * Vutler Chat API — PostgreSQL-backed (v3)
 *
 * Routes are mounted at /api/v1 via packages/office/routes.js (mountRoot),
 * so each path here is prefixed: /chat/channels → /api/v1/chat/channels.
 *
 * URL contract matches frontend endpoints (chat.ts):
 *   GET    /chat/channels
 *   POST   /chat/channels
 *   DELETE /chat/channels/:id
 *   GET    /chat/channels/:id/messages
 *   POST   /chat/channels/:id/messages
 *   GET    /chat/channels/:id/members
 *   POST   /chat/channels/:id/members
 *   DELETE /chat/channels/:id/members/:memberId
 *   POST   /chat/channels/:id/attachments  (stub, returns 501)
 *   GET    /chat/agents
 *   POST   /chat/jarvis/bootstrap          (legacy compat)
 *   POST   /chat/send                      (legacy compat)
 */

'use strict';

const express = require('express');
const router = express.Router();

const { publishMessage } = require('../../../api/ws-chat');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPool(req) {
  return req.app.locals.pg;
}

function wsId(req) {
  return req.headers['x-workspace-id'] || req.workspaceId || DEFAULT_WORKSPACE;
}

/**
 * Normalise a channel row from DB to the shape the frontend expects.
 * DB uses type='dm', frontend expects type='direct'.
 */
function normaliseChannel(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type === 'dm' ? 'direct' : row.type,
    members: row.members || [],
    message_count: row.message_count ? parseInt(row.message_count) : 0,
    member_count: row.member_count ? parseInt(row.member_count) : 0,
    created_at: row.created_at,
  };
}

/**
 * Normalise a message row from DB to the shape the frontend expects.
 */
function normaliseMessage(row) {
  return {
    id: row.id,
    channel_id: row.channel_id,
    content: row.content,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    message_type: row.message_type || 'text',
    parent_id: row.parent_id || null,
    client_message_id: row.client_message_id || null,
    attachments: row.attachments || [],
    created_at: row.created_at,
  };
}

// ── Agent auto-response helper (async, non-blocking) ─────────────────────────

async function triggerAgentResponse(req, channelId, workspaceId, savedMessage) {
  const pg = getPool(req);
  if (!pg) return;

  try {
    // Try chatRuntime first — it handles soul loading, swarm routing, and Snipara memory.
    // processMessage expects a full message row: { id, channel_id, content, sender_id, sender_name, workspace_id }
    const chatRuntime = req.app && req.app.locals && req.app.locals.chatRuntime;
    if (chatRuntime && typeof chatRuntime.processMessage === 'function' && savedMessage) {
      await chatRuntime.processMessage({
        id: savedMessage.id,
        channel_id: channelId,
        content: savedMessage.content,
        sender_id: savedMessage.sender_id,
        sender_name: savedMessage.sender_name,
        workspace_id: workspaceId,
      });
      console.log(`[Chat] chatRuntime handled agent response in channel ${channelId}`);
      return;
    }

    // Fallback: direct LLM call without chatRuntime
    const agentResult = await pg.query(
      `SELECT a.id, a.name, a.username, a.model, a.provider, a.system_prompt, a.temperature, a.max_tokens
       FROM ${SCHEMA}.chat_channel_members cm
       JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id
       WHERE cm.channel_id = $1
       LIMIT 1`,
      [channelId]
    );

    if (agentResult.rows.length === 0) return;

    const agent = agentResult.rows[0];
    console.log(`[Chat] Direct LLM fallback for agent ${agent.name} in channel ${channelId}`);

    const historyResult = await pg.query(
      `SELECT sender_id, sender_name, content, created_at
       FROM ${SCHEMA}.chat_messages
       WHERE channel_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [channelId]
    );

    const messages = historyResult.rows.reverse().map((m) => ({
      role: m.sender_id === agent.id.toString() ? 'assistant' : 'user',
      content:
        m.sender_name && m.sender_id !== agent.id.toString()
          ? `[${m.sender_name}]: ${m.content}`
          : m.content,
    }));

    const llmRouter = require('../../../services/llmRouter');
    const llmResult = await llmRouter.chat(
      {
        model: agent.model || 'claude-sonnet-4-20250514',
        provider: agent.provider || undefined,
        system_prompt:
          agent.system_prompt ||
          `You are ${agent.name}, a helpful AI assistant. Respond concisely and helpfully.`,
        temperature: agent.temperature != null ? parseFloat(agent.temperature) : 0.7,
        max_tokens: agent.max_tokens || 4096,
        workspace_id: workspaceId,
      },
      messages,
      pg  // pass DB so llmRouter can resolve workspace LLM provider config
    );

    const fallbackResult = await pg.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, workspace_id)
       VALUES ($1, $2, $3, $4, 'text', $5)
       RETURNING *`,
      [channelId, agent.id.toString(), agent.name, llmResult.content, workspaceId]
    );

    // Push reply to connected WebSocket clients
    if (fallbackResult.rows[0]) publishMessage(fallbackResult.rows[0]);

    console.log(`[Chat] Agent ${agent.name} responded in channel ${channelId} (${llmResult.latency_ms}ms, ${llmResult.provider}/${llmResult.model})`);
  } catch (err) {
    console.error('[Chat] Agent response error:', err.message);
  }
}

// ── GET /chat/channels ────────────────────────────────────────────────────────

router.get('/chat/channels', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const ws = wsId(req);
    const result = await pg.query(
      `SELECT c.*,
          (SELECT COUNT(*) FROM ${SCHEMA}.chat_messages m WHERE m.channel_id = c.id) AS message_count,
          (SELECT COUNT(*) FROM ${SCHEMA}.chat_channel_members cm WHERE cm.channel_id = c.id) AS member_count,
          (SELECT MAX(m2.created_at) FROM ${SCHEMA}.chat_messages m2 WHERE m2.channel_id = c.id) AS last_message_at
       FROM ${SCHEMA}.chat_channels c
       WHERE c.workspace_id = $1
       ORDER BY last_message_at DESC NULLS LAST, c.created_at DESC`,
      [ws]
    );

    const channels = result.rows.map(normaliseChannel);
    // Return in the shape getChannels() in chat.ts expects:
    // apiFetch returns the full body; chat.ts does: Array.isArray(data) ? data : (data.channels ?? [])
    res.json({ success: true, channels });
  } catch (err) {
    console.error('[Chat] GET /channels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /chat/channels ───────────────────────────────────────────────────────

router.post('/chat/channels', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const { name, description, type = 'channel', agentId } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const ws = wsId(req);
    const createdBy = req.headers['x-user-id'] || req.user?.id || req.agent?.id || 'system';

    // Normalise incoming type: frontend sends 'direct', DB uses 'dm'
    const dbType = type === 'direct' ? 'dm' : type;

    // For DM channels, return existing if found
    if (dbType === 'dm' && agentId) {
      const existing = await pg.query(
        `SELECT * FROM ${SCHEMA}.chat_channels WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
        [name, ws]
      );
      if (existing.rows.length > 0) {
        return res.json({ success: true, ...normaliseChannel(existing.rows[0]) });
      }
    }

    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description || '', dbType, ws, createdBy]
    );

    const channel = result.rows[0];

    // Auto-add agent as member for DM channels
    if (dbType === 'dm' && agentId) {
      await pg.query(
        `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
         VALUES ($1, $2, 'agent')
         ON CONFLICT DO NOTHING`,
        [channel.id, agentId.toString()]
      );
    }

    res.status(201).json({ success: true, ...normaliseChannel(channel) });
  } catch (err) {
    console.error('[Chat] POST /channels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /chat/channels/:id ─────────────────────────────────────────────────

router.delete('/chat/channels/:id', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    await pg.query(`DELETE FROM ${SCHEMA}.chat_messages WHERE channel_id = $1`, [req.params.id]);
    await pg.query(`DELETE FROM ${SCHEMA}.chat_channel_members WHERE channel_id = $1`, [req.params.id]);
    await pg.query(`DELETE FROM ${SCHEMA}.chat_channels WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] DELETE /channels/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /chat/channels/:id/messages ──────────────────────────────────────────

router.get('/chat/channels/:id/messages', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const channelId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit || '50') || 50, 200);
    const before = req.query.before;
    const after = req.query.after;

    let query = `SELECT * FROM ${SCHEMA}.chat_messages WHERE channel_id = $1`;
    const params = [channelId];
    let idx = 2;

    if (before) { query += ` AND created_at < $${idx}`; params.push(before); idx++; }
    if (after)  { query += ` AND created_at > $${idx}`; params.push(after);  idx++; }

    query += ` ORDER BY created_at ASC LIMIT $${idx}`;
    params.push(limit);

    const result = await pg.query(query, params);
    const messages = result.rows.map(normaliseMessage);

    // Return in the shape getMessages() in chat.ts expects:
    // apiFetch returns full body; chat.ts does: Array.isArray(data) ? data : (data.messages ?? [])
    res.json({ success: true, messages });
  } catch (err) {
    console.error('[Chat] GET /channels/:id/messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /chat/channels/:id/messages ─────────────────────────────────────────

router.post('/chat/channels/:id/messages', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const channelId = req.params.id;
    const { content, client_message_id, message_type = 'text', parent_id } = req.body;

    if (!content && !req.body.text) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const text = content || req.body.text;
    const ws = wsId(req);
    const senderId =
      req.headers['x-user-id'] ||
      req.user?.id ||
      req.agent?.id ||
      'user';
    const senderName =
      req.headers['x-user-name'] ||
      req.user?.name ||
      req.agent?.name ||
      'User';

    // Try with client_message_id column first; fall back without it (column may not exist yet)
    let saved;
    try {
      const result = await pg.query(
        `INSERT INTO ${SCHEMA}.chat_messages
           (channel_id, sender_id, sender_name, content, message_type, parent_id, client_message_id, workspace_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [channelId, senderId, senderName, text, message_type, parent_id || null, client_message_id || null, ws]
      );
      saved = normaliseMessage(result.rows[0]);
    } catch (colErr) {
      if (colErr.message && colErr.message.includes('client_message_id')) {
        const result = await pg.query(
          `INSERT INTO ${SCHEMA}.chat_messages
             (channel_id, sender_id, sender_name, content, message_type, parent_id, workspace_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [channelId, senderId, senderName, text, message_type, parent_id || null, ws]
        );
        saved = { ...normaliseMessage(result.rows[0]), client_message_id: client_message_id || null };
      } else {
        throw colErr;
      }
    }

    // Respond immediately, then trigger agent response async
    res.status(201).json({ success: true, ...saved });

    // Broadcast user message to other connected WS clients
    publishMessage(saved);

    // Check sender is not an agent to avoid infinite loops
    const isAgent = await pg.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE id::text = $1 OR username = $2 LIMIT 1`,
      [senderId, senderName.toLowerCase()]
    );
    if (isAgent.rows.length === 0) {
      triggerAgentResponse(req, channelId, ws, saved);
    }
  } catch (err) {
    console.error('[Chat] POST /channels/:id/messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /chat/channels/:id/attachments (stub) ───────────────────────────────

router.post('/chat/channels/:id/attachments', async (_req, res) => {
  res.status(501).json({ success: false, error: 'File uploads not yet supported' });
});

// ── GET /chat/channels/:id/members ───────────────────────────────────────────

router.get('/chat/channels/:id/members', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    // Join with agents table to enrich member data
    const result = await pg.query(
      `SELECT cm.user_id AS id, cm.role,
              COALESCE(a.name, cm.user_id) AS name,
              CASE WHEN a.id IS NOT NULL THEN 'agent' ELSE 'user' END AS type,
              a.avatar, a.username
       FROM ${SCHEMA}.chat_channel_members cm
       LEFT JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id
       WHERE cm.channel_id = $1
       ORDER BY cm.joined_at ASC`,
      [req.params.id]
    );

    // Return in the shape getChannelMembers() in chat.ts expects:
    // apiFetch returns full body; chat.ts does: Array.isArray(data) ? data : (data.members ?? [])
    res.json({ success: true, members: result.rows });
  } catch (err) {
    console.error('[Chat] GET /channels/:id/members error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /chat/channels/:id/members ──────────────────────────────────────────

router.post('/chat/channels/:id/members', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const { id: userId, type: memberType = 'user', name } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'id is required' });
    }

    const role = memberType === 'agent' ? 'agent' : 'member';

    await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [req.params.id, userId.toString(), role]
    );

    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[Chat] POST /channels/:id/members error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /chat/channels/:id/members/:memberId ───────────────────────────────

router.delete('/chat/channels/:id/members/:memberId', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    await pg.query(
      `DELETE FROM ${SCHEMA}.chat_channel_members WHERE channel_id = $1 AND user_id = $2`,
      [req.params.id, req.params.memberId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] DELETE /channels/:id/members/:memberId error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /chat/agents ──────────────────────────────────────────────────────────

router.get('/chat/agents', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const ws = wsId(req);
    const result = await pg.query(
      `SELECT id, name, username, status, avatar, role, description, model, provider
       FROM ${SCHEMA}.agents
       WHERE workspace_id = $1
       ORDER BY name ASC`,
      [ws]
    );
    res.json({ success: true, agents: result.rows });
  } catch (err) {
    console.error('[Chat] GET /agents error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /chat/send (legacy compat) ──────────────────────────────────────────
// Kept so any external agents still using this endpoint continue to work.

router.post('/chat/send', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const { channel_id, content, text, sender_id, sender_name, message_type = 'text', parent_id } = req.body;
    const body = content || text;
    if (!channel_id || !body) {
      return res.status(400).json({ success: false, error: 'channel_id and content are required' });
    }

    const ws = wsId(req);
    const sId = sender_id || req.headers['x-user-id'] || req.agent?.id || 'user';
    const sName = sender_name || req.headers['x-user-name'] || req.agent?.name || 'User';

    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.chat_messages (channel_id, sender_id, sender_name, content, message_type, parent_id, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [channel_id, sId, sName, body, message_type, parent_id || null, ws]
    );

    const saved = normaliseMessage(result.rows[0]);
    res.json({ success: true, data: saved });

    // Broadcast via WebSocket
    publishMessage(saved);

    const isAgent = await pg.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE id::text = $1 OR username = $2 LIMIT 1`,
      [sId, sName.toLowerCase()]
    );
    if (isAgent.rows.length === 0) {
      triggerAgentResponse(req, channel_id, ws, saved);
    }
  } catch (err) {
    console.error('[Chat] POST /send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /chat/jarvis/bootstrap (legacy compat) ───────────────────────────────

router.post('/chat/jarvis/bootstrap', async (req, res) => {
  const pg = getPool(req);

  try {
    const userId = req.agent?.id || req.user?.id || 'user';
    const userName = req.agent?.name || req.user?.name || 'user';
    const ws = wsId(req);

    // Find Jarvis agent
    let jarvis = null;
    if (pg) {
      const r = await pg.query(
        `SELECT id, name FROM ${SCHEMA}.agents
         WHERE workspace_id = $1 AND LOWER(name) = 'jarvis'
         LIMIT 1`,
        [ws]
      );
      jarvis = r.rows[0] || null;
    }

    const dmName = jarvis
      ? [userId, jarvis.id.toString()].sort().join('__')
      : `dm_${userId}_jarvis`;

    // Create or return existing channel
    if (pg) {
      const existing = await pg.query(
        `SELECT * FROM ${SCHEMA}.chat_channels WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
        [dmName, ws]
      );

      if (existing.rows.length > 0) {
        return res.json({ success: true, room: normaliseChannel(existing.rows[0]) });
      }

      const created = await pg.query(
        `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
         VALUES ($1, $2, 'dm', $3, $4)
         RETURNING *`,
        [dmName, `DM ${userName} ↔ Jarvis`, ws, userId]
      );

      if (jarvis) {
        await pg.query(
          `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
           VALUES ($1, $2, 'agent') ON CONFLICT DO NOTHING`,
          [created.rows[0].id, jarvis.id.toString()]
        );
      }

      return res.json({ success: true, room: normaliseChannel(created.rows[0]) });
    }

    // Fallback if no DB
    res.json({ success: true, room: { id: dmName, name: dmName, type: 'direct', members: [] } });
  } catch (err) {
    console.error('[Chat] POST /jarvis/bootstrap error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
