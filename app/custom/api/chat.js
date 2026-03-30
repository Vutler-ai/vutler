/**
 * Vutler Chat API — PostgreSQL-backed (v3)
 *
 * Routes are mounted at /api/v1 via packages/office/routes.js (mountRoot),
 * so each path here is prefixed: /chat/channels → /api/v1/chat/channels.
 */

'use strict';

const express = require('express');
const router = express.Router();

const { insertChatMessage, normalizeChatMessage } = require('../../../services/chatMessages');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

function getPool(req) {
  return req.app.locals.pg;
}

function wsId(req) {
  return req.workspaceId || req.headers['x-workspace-id'] || DEFAULT_WORKSPACE;
}

function normaliseChannel(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type === 'dm' ? 'direct' : row.type,
    members: row.members || [],
    message_count: row.message_count ? parseInt(row.message_count, 10) : 0,
    member_count: row.member_count ? parseInt(row.member_count, 10) : 0,
    created_at: row.created_at,
  };
}

async function triggerAgentResponse(req, channelId, workspaceId, savedMessage) {
  const pg = getPool(req);
  if (!pg) return;

  try {
    const chatRuntime = req.app?.locals?.chatRuntime;
    if (chatRuntime && typeof chatRuntime.processMessageById === 'function' && savedMessage?.id) {
      chatRuntime.processMessageById(savedMessage.id, workspaceId).catch((err) => {
        console.error('[Chat] chatRuntime processMessageById error:', err.message);
      });
      return;
    }

    if (chatRuntime && typeof chatRuntime.processMessage === 'function' && savedMessage) {
      chatRuntime.processMessage({
        id: savedMessage.id,
        channel_id: channelId,
        content: savedMessage.content,
        sender_id: savedMessage.sender_id,
        sender_name: savedMessage.sender_name,
        workspace_id: workspaceId,
      }).catch((err) => {
        console.error('[Chat] chatRuntime processMessage error:', err.message);
      });
      return;
    }

    const agentResult = await pg.query(
      `SELECT a.id, a.name, a.username, a.model, a.provider, a.system_prompt, a.temperature, a.max_tokens
       FROM ${SCHEMA}.chat_channel_members cm
       JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id
       WHERE cm.channel_id = $1 AND a.workspace_id = $2
       LIMIT 1`,
      [channelId, workspaceId]
    );

    if (agentResult.rows.length === 0) return;

    const agent = agentResult.rows[0];
    const historyResult = await pg.query(
      `SELECT sender_id, sender_name, content, created_at
       FROM ${SCHEMA}.chat_messages
       WHERE channel_id = $1 AND workspace_id = $2
       ORDER BY created_at DESC
       LIMIT 20`,
      [channelId, workspaceId]
    );

    const messages = historyResult.rows.reverse().map((m) => ({
      role: m.sender_id === agent.id.toString() ? 'assistant' : 'user',
      content: m.sender_name && m.sender_id !== agent.id.toString() ? `[${m.sender_name}]: ${m.content}` : m.content,
    }));

    const llmRouter = require('../../../services/llmRouter');
    const llmResult = await llmRouter.chat(
      {
        model: agent.model || 'claude-sonnet-4-20250514',
        provider: agent.provider || undefined,
        system_prompt: agent.system_prompt || `You are ${agent.name}, a helpful AI assistant. Respond concisely and helpfully.`,
        temperature: agent.temperature != null ? parseFloat(agent.temperature) : 0.7,
        max_tokens: agent.max_tokens || 4096,
        workspace_id: workspaceId,
      },
      messages,
      pg
    );

    await insertChatMessage(pg, req.app, SCHEMA, {
      channel_id: channelId,
      sender_id: agent.id.toString(),
      sender_name: agent.name,
      content: llmResult.content,
      message_type: 'text',
      workspace_id: workspaceId,
      processed_at: new Date(),
      processing_state: 'processed',
      reply_to_message_id: savedMessage?.id || null,
    });
  } catch (err) {
    console.error('[Chat] Agent response error:', err.message);
  }
}

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

    res.json({ success: true, channels: result.rows.map(normaliseChannel) });
  } catch (err) {
    console.error('[Chat] GET /channels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/channels', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const { name, description, type = 'channel', agentId } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const ws = wsId(req);
    const createdBy = req.headers['x-user-id'] || req.user?.id || req.agent?.id || 'system';
    const dbType = type === 'direct' ? 'dm' : type;

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

router.delete('/chat/channels/:id', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const ws = wsId(req);
    await pg.query(`DELETE FROM ${SCHEMA}.chat_messages WHERE channel_id = $1 AND workspace_id = $2`, [req.params.id, ws]);
    await pg.query(`DELETE FROM ${SCHEMA}.chat_channel_members WHERE channel_id = $1`, [req.params.id]);
    await pg.query(`DELETE FROM ${SCHEMA}.chat_channels WHERE id = $1 AND workspace_id = $2`, [req.params.id, ws]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] DELETE /channels/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/chat/channels/:id/messages', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const channelId = req.params.id;
    const ws = wsId(req);
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const before = req.query.before;
    const after = req.query.after;

    let query = `SELECT * FROM ${SCHEMA}.chat_messages WHERE channel_id = $1 AND workspace_id = $2`;
    const params = [channelId, ws];
    let idx = 3;

    if (before) {
      query += ` AND created_at < $${idx}`;
      params.push(before);
      idx++;
    }
    if (after) {
      query += ` AND created_at > $${idx}`;
      params.push(after);
      idx++;
    }

    query += ` ORDER BY created_at ASC LIMIT $${idx}`;
    params.push(limit);

    const result = await pg.query(query, params);
    res.json({ success: true, messages: result.rows.map(normalizeChatMessage) });
  } catch (err) {
    console.error('[Chat] GET /channels/:id/messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/chat/action-runs', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const ws = wsId(req);
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const params = [ws];
    const conditions = ['workspace_id = $1'];
    let idx = 2;

    if (req.query.channel_id) {
      conditions.push(`channel_id = $${idx++}`);
      params.push(req.query.channel_id);
    }
    if (req.query.message_id) {
      conditions.push(`chat_message_id = $${idx++}`);
      params.push(req.query.message_id);
    }
    if (req.query.status) {
      conditions.push(`status = $${idx++}`);
      params.push(req.query.status);
    }

    params.push(limit);
    const result = await pg.query(
      `SELECT *
       FROM ${SCHEMA}.chat_action_runs
       WHERE ${conditions.join(' AND ')}
       ORDER BY started_at DESC
       LIMIT $${idx}`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error('[Chat] GET /action-runs error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

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
    const senderId = req.headers['x-user-id'] || req.user?.id || req.agent?.id || 'user';
    const senderName = req.headers['x-user-name'] || req.user?.name || req.agent?.name || 'User';

    const saved = await insertChatMessage(pg, req.app, SCHEMA, {
      channel_id: channelId,
      sender_id: senderId,
      sender_name: senderName,
      content: text,
      message_type,
      parent_id: parent_id || null,
      client_message_id: client_message_id || null,
      workspace_id: ws,
      processing_state: 'pending',
      processing_attempts: 0,
      processing_started_at: null,
      next_retry_at: new Date(),
      last_error: null,
      reply_to_message_id: null,
    });

    res.status(201).json({ success: true, ...saved });

    // Check sender is not an agent to avoid infinite loops
    const isAgent = await pg.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE workspace_id = $1 AND (id::text = $2 OR username = $3) LIMIT 1`,
      [ws, senderId, String(senderName || '').toLowerCase()]
    );
    if (isAgent.rows.length === 0) {
      triggerAgentResponse(req, channelId, ws, saved);
    }
  } catch (err) {
    console.error('[Chat] POST /channels/:id/messages error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/channels/:id/attachments', async (_req, res) => {
  res.status(501).json({ success: false, error: 'File uploads not yet supported' });
});

router.get('/chat/channels/:id/members', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
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

    res.json({ success: true, members: result.rows });
  } catch (err) {
    console.error('[Chat] GET /channels/:id/members error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/channels/:id/members', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const { id: userId, type: memberType = 'user' } = req.body;
    if (!userId) return res.status(400).json({ success: false, error: 'id is required' });

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

    const saved = await insertChatMessage(pg, req.app, SCHEMA, {
      channel_id,
      sender_id: sId,
      sender_name: sName,
      content: body,
      message_type,
      parent_id: parent_id || null,
      workspace_id: ws,
      processing_state: 'pending',
      processing_attempts: 0,
      processing_started_at: null,
      next_retry_at: new Date(),
      last_error: null,
      reply_to_message_id: null,
    });

    res.json({ success: true, data: saved });


    const isAgent = await pg.query(
      `SELECT id FROM ${SCHEMA}.agents WHERE workspace_id = $1 AND (id::text = $2 OR username = $3) LIMIT 1`,
      [ws, sId, String(sName || '').toLowerCase()]
    );
    if (isAgent.rows.length === 0) {
      triggerAgentResponse(req, channel_id, ws, saved);
    }
  } catch (err) {
    console.error('[Chat] POST /send error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/jarvis/bootstrap', async (req, res) => {
  const pg = getPool(req);

  try {
    const userId = req.agent?.id || req.user?.id || 'user';
    const userName = req.agent?.name || req.user?.name || 'user';
    const ws = wsId(req);

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

    const dmName = jarvis ? [userId, jarvis.id.toString()].sort().join('__') : `dm_${userId}_jarvis`;

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

    res.json({ success: true, room: { id: dmName, name: dmName, type: 'direct', members: [] } });
  } catch (err) {
    console.error('[Chat] POST /jarvis/bootstrap error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
