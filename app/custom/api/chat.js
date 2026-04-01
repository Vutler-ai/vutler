/**
 * Vutler Chat API — PostgreSQL-backed (v3)
 *
 * Routes are mounted at /api/v1 via packages/office/routes.js (mountRoot),
 * so each path here is prefixed: /chat/channels → /api/v1/chat/channels.
 */

'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { insertChatMessage, normalizeChatMessage } = require('../../../services/chatMessages');
const {
  canonicalDmNameForContact,
  ensureChatPreferencesTable,
  findExistingDmChannelId,
  normalizeLegacyDmRows,
} = require('../../../services/chatChannelMaintenance');
const { createMemoryRuntimeService } = require('../../../services/memory/runtime');
const { uploadFileToAgentDrive } = require('../../../services/agentDriveService');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const memoryRuntime = createMemoryRuntimeService();
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 5,
    fileSize: 15 * 1024 * 1024,
  },
});

function getPool(req) {
  return req.app.locals.pg;
}

function wsId(req) {
  return req.workspaceId || req.headers['x-workspace-id'] || DEFAULT_WORKSPACE;
}

function normaliseChannel(row) {
  return {
    id: row.id,
    name: row.display_name || row.name,
    description: row.display_description || row.description || '',
    type: row.type === 'dm' ? 'direct' : row.type,
    members: row.members || [],
    message_count: row.message_count ? parseInt(row.message_count, 10) : 0,
    member_count: row.member_count ? parseInt(row.member_count, 10) : 0,
    created_at: row.created_at,
    raw_name: row.name,
    contact_id: row.contact_id || null,
    contact_type: row.contact_type || null,
    avatar: row.contact_avatar || null,
    username: row.contact_username || null,
    contact_role: row.contact_role || null,
    contact_provider: row.contact_provider || null,
    contact_model: row.contact_model || null,
    pinned: Boolean(row.pinned),
    muted: Boolean(row.muted),
    archived: Boolean(row.archived),
  };
}

function actorId(req) {
  return req.headers['x-user-id'] || req.user?.id || req.agent?.id || null;
}

function actorName(req) {
  return req.headers['x-user-name'] || req.user?.name || req.agent?.name || 'User';
}

async function resolveAttachmentAgentForChannel(pg, workspaceId, channelId, preferredAgentId = null) {
  if (preferredAgentId) {
    const preferred = await pg.query(
      `SELECT a.id, a.name, a.username, a.workspace_id
       FROM ${SCHEMA}.chat_channel_members cm
       JOIN ${SCHEMA}.agents a
         ON a.id::text = cm.user_id
        AND a.workspace_id = $2
       WHERE cm.channel_id = $1
         AND a.id::text = $3
       LIMIT 1`,
      [channelId, workspaceId, preferredAgentId]
    );
    if (preferred.rows[0]) return preferred.rows[0];
  }

  const result = await pg.query(
    `SELECT a.id, a.name, a.username, a.workspace_id
     FROM ${SCHEMA}.chat_channel_members cm
     JOIN ${SCHEMA}.agents a
       ON a.id::text = cm.user_id
      AND a.workspace_id = $2
     WHERE cm.channel_id = $1
     ORDER BY cm.joined_at ASC
     LIMIT 2`,
    [channelId, workspaceId]
  );

  if (result.rows.length === 1) return result.rows[0];
  return null;
}

async function fetchChannelById(pg, workspaceId, channelId, currentUserId) {
  await ensureChatPreferencesTable(pg, SCHEMA);

  const result = await pg.query(
    `SELECT c.*,
        (SELECT COUNT(*) FROM ${SCHEMA}.chat_messages m WHERE m.channel_id = c.id) AS message_count,
        (SELECT COUNT(*) FROM ${SCHEMA}.chat_channel_members cm WHERE cm.channel_id = c.id) AS member_count,
        (SELECT MAX(m2.created_at) FROM ${SCHEMA}.chat_messages m2 WHERE m2.channel_id = c.id) AS last_message_at,
        contact.contact_id,
        contact.contact_type,
        contact.contact_name AS display_name,
        contact.contact_description AS display_description,
        contact.contact_avatar,
        contact.contact_username,
        contact.contact_role,
        contact.contact_provider,
        contact.contact_model,
        COALESCE(pref.pinned, FALSE) AS pinned,
        COALESCE(pref.muted, FALSE) AS muted,
        COALESCE(pref.archived, FALSE) AS archived
     FROM ${SCHEMA}.chat_channels c
     LEFT JOIN LATERAL (
       SELECT
         cm.user_id AS contact_id,
         CASE
           WHEN a.id IS NOT NULL THEN a.name
           WHEN ua.id IS NOT NULL THEN COALESCE(NULLIF(ua.name, ''), ua.email)
           ELSE cm.user_id
         END AS contact_name,
         CASE WHEN a.id IS NOT NULL THEN 'agent' ELSE 'user' END AS contact_type,
         CASE
           WHEN a.id IS NOT NULL THEN COALESCE(
             NULLIF(a.role, ''),
             NULLIF(a.description, ''),
             NULLIF(a.model, ''),
             'Agent'
           )
           ELSE COALESCE(ua.email, 'Workspace member')
         END AS contact_description,
         COALESCE(a.avatar, ua.avatar_url) AS contact_avatar,
         a.username AS contact_username,
         a.role AS contact_role,
         a.provider AS contact_provider,
         a.model AS contact_model
       FROM ${SCHEMA}.chat_channel_members cm
       LEFT JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id AND a.workspace_id = c.workspace_id
       LEFT JOIN ${SCHEMA}.users_auth ua ON ua.id::text = cm.user_id
       WHERE cm.channel_id = c.id
         AND ($3::text IS NULL OR cm.user_id <> $3::text)
       ORDER BY CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END, cm.joined_at ASC
       LIMIT 1
     ) contact ON c.type = 'dm'
     LEFT JOIN ${SCHEMA}.chat_channel_preferences pref
       ON pref.workspace_id = c.workspace_id
      AND pref.channel_id::text = c.id::text
      AND pref.user_id = COALESCE($3::text, '')
     WHERE c.workspace_id = $1 AND c.id = $2
     LIMIT 1`,
    [workspaceId, channelId, currentUserId]
  );

  return result.rows[0] || null;
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
    const memoryBundle = await memoryRuntime.preparePromptContext({
      db: pg,
      workspaceId,
      agent,
      query: messages.map((message) => message.content).join('\n').slice(0, 2000),
      runtime: 'chat',
      includeSummaries: true,
    }).catch(() => ({ prompt: '' }));
    const fallbackPrompt = `You are ${agent.name}, a helpful AI assistant. Respond concisely and helpfully.`;
    const systemPrompt = memoryBundle.prompt
      ? `${agent.system_prompt || fallbackPrompt}\n\n${memoryBundle.prompt}`
      : (agent.system_prompt || fallbackPrompt);

    const llmResult = await llmRouter.chat(
      {
        model: agent.model || 'claude-sonnet-4-20250514',
        provider: agent.provider || undefined,
        system_prompt: systemPrompt,
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
    await ensureChatPreferencesTable(pg, SCHEMA);
    const ws = wsId(req);
    const currentUserId = actorId(req);
    const result = await pg.query(
      `SELECT c.*,
          (SELECT COUNT(*) FROM ${SCHEMA}.chat_messages m WHERE m.channel_id = c.id) AS message_count,
          (SELECT COUNT(*) FROM ${SCHEMA}.chat_channel_members cm WHERE cm.channel_id = c.id) AS member_count,
          (SELECT MAX(m2.created_at) FROM ${SCHEMA}.chat_messages m2 WHERE m2.channel_id = c.id) AS last_message_at,
          contact.contact_id,
          contact.contact_type,
          contact.contact_name AS display_name,
          contact.contact_description AS display_description,
          contact.contact_avatar,
          contact.contact_username,
          contact.contact_role,
          contact.contact_provider,
          contact.contact_model,
          COALESCE(pref.pinned, FALSE) AS pinned,
          COALESCE(pref.muted, FALSE) AS muted,
          COALESCE(pref.archived, FALSE) AS archived
       FROM ${SCHEMA}.chat_channels c
       LEFT JOIN LATERAL (
         SELECT
           cm.user_id AS contact_id,
           CASE
             WHEN a.id IS NOT NULL THEN a.name
             WHEN ua.id IS NOT NULL THEN COALESCE(NULLIF(ua.name, ''), ua.email)
             ELSE cm.user_id
           END AS contact_name,
           CASE WHEN a.id IS NOT NULL THEN 'agent' ELSE 'user' END AS contact_type,
           CASE
             WHEN a.id IS NOT NULL THEN COALESCE(
               NULLIF(a.role, ''),
               NULLIF(a.description, ''),
               NULLIF(a.model, ''),
               'Agent'
             )
             ELSE COALESCE(ua.email, 'Workspace member')
           END AS contact_description,
           COALESCE(a.avatar, ua.avatar_url) AS contact_avatar,
           a.username AS contact_username,
           a.role AS contact_role,
           a.provider AS contact_provider,
           a.model AS contact_model
         FROM ${SCHEMA}.chat_channel_members cm
         LEFT JOIN ${SCHEMA}.agents a ON a.id::text = cm.user_id AND a.workspace_id = c.workspace_id
         LEFT JOIN ${SCHEMA}.users_auth ua ON ua.id::text = cm.user_id
         WHERE cm.channel_id = c.id
           AND ($2::text IS NULL OR cm.user_id <> $2::text)
         ORDER BY CASE WHEN a.id IS NOT NULL THEN 0 ELSE 1 END, cm.joined_at ASC
         LIMIT 1
       ) contact ON c.type = 'dm'
       LEFT JOIN ${SCHEMA}.chat_channel_preferences pref
         ON pref.workspace_id = c.workspace_id
        AND pref.channel_id::text = c.id::text
        AND pref.user_id = COALESCE($2::text, '')
       WHERE c.workspace_id = $1
       ORDER BY
         COALESCE(pref.pinned, FALSE) DESC,
         last_message_at DESC NULLS LAST,
         c.created_at DESC`,
      [ws, currentUserId]
    );

    const normalizedRows = await normalizeLegacyDmRows(pg, result.rows, { schema: SCHEMA });
    res.json({ success: true, channels: normalizedRows.rows.map(normaliseChannel) });
  } catch (err) {
    console.error('[Chat] GET /channels error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/channels', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const { name, description, type = 'channel' } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const ws = wsId(req);
    const createdBy = actorId(req) || 'system';
    const dbType = type === 'direct' ? 'dm' : type;

    if (dbType === 'dm') {
      return res.status(400).json({
        success: false,
        error: 'Direct messages must be created via /api/v1/chat/dm',
      });
    }

    const result = await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description || '', dbType, ws, createdBy]
    );

    const channel = result.rows[0];
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
    await ensureChatPreferencesTable(pg, SCHEMA);
    const ws = wsId(req);
    await pg.query(
      `DELETE FROM ${SCHEMA}.chat_messages WHERE channel_id = $1 AND workspace_id = $2`,
      [req.params.id, ws]
    );
    await pg.query(`DELETE FROM ${SCHEMA}.chat_channel_members WHERE channel_id = $1`, [req.params.id]);
    await pg.query(
      `DELETE FROM ${SCHEMA}.chat_channel_preferences WHERE channel_id = $1 AND workspace_id = $2`,
      [req.params.id, ws]
    );
    await pg.query(`DELETE FROM ${SCHEMA}.chat_channels WHERE id = $1 AND workspace_id = $2`, [req.params.id, ws]);
    res.json({ success: true });
  } catch (err) {
    console.error('[Chat] DELETE /channels/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/chat/contacts', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const ws = wsId(req);
    const currentUserId = actorId(req);
    const query = String(req.query.query || '').trim();
    const like = `%${query}%`;

    const [agentsResult, usersResult] = await Promise.all([
      pg.query(
        `SELECT a.id::text AS id,
                a.name,
                'agent' AS type,
                COALESCE(NULLIF(a.role, ''), NULLIF(a.description, ''), NULLIF(a.model, ''), 'Agent') AS subtitle,
                a.avatar,
                a.username,
                a.role,
                a.provider,
                a.model
         FROM ${SCHEMA}.agents a
         WHERE a.workspace_id = $1
           AND (
             $2 = ''
             OR a.name ILIKE $3
             OR COALESCE(a.username, '') ILIKE $3
             OR COALESCE(a.description, '') ILIKE $3
           )
         ORDER BY a.name ASC
         LIMIT 50`,
        [ws, query, like]
      ),
      pg.query(
        `SELECT ua.id::text AS id,
                COALESCE(NULLIF(ua.name, ''), ua.email) AS name,
                'user' AS type,
                ua.email AS subtitle,
                ua.avatar_url AS avatar,
                NULL::text AS username,
                NULL::text AS role,
                NULL::text AS provider,
                NULL::text AS model
         FROM ${SCHEMA}.workspace_members wm
         JOIN ${SCHEMA}.users_auth ua ON ua.id = wm.user_id
         WHERE wm.workspace_id = $1
           AND ($2::text IS NULL OR ua.id::text <> $2::text)
           AND (
             $3 = ''
             OR COALESCE(ua.name, '') ILIKE $4
             OR ua.email ILIKE $4
           )
         ORDER BY COALESCE(NULLIF(ua.name, ''), ua.email) ASC
         LIMIT 50`,
        [ws, currentUserId, query, like]
      ),
    ]);

    const contacts = [...agentsResult.rows, ...usersResult.rows]
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'agent' ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    res.json({ success: true, contacts });
  } catch (err) {
    console.error('[Chat] GET /contacts error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/dm', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    await ensureChatPreferencesTable(pg, SCHEMA);
    const ws = wsId(req);
    const currentUserId = actorId(req);
    const currentUserName = actorName(req);
    const contactId = String(req.body.contactId || '').trim();
    const contactType = req.body.contactType === 'user' ? 'user' : 'agent';

    if (!currentUserId) {
      return res.status(401).json({ success: false, error: 'Authenticated user required' });
    }
    if (!contactId) {
      return res.status(400).json({ success: false, error: 'contactId is required' });
    }
    if (contactId === currentUserId) {
      return res.status(400).json({ success: false, error: 'Cannot open a DM with yourself' });
    }

    let contact = null;
    if (contactType === 'agent') {
      const result = await pg.query(
        `SELECT id::text AS id, name, username
         FROM ${SCHEMA}.agents
         WHERE workspace_id = $1 AND id::text = $2
         LIMIT 1`,
        [ws, contactId]
      );
      contact = result.rows[0] || null;
    } else {
      const result = await pg.query(
        `SELECT ua.id::text AS id, COALESCE(NULLIF(ua.name, ''), ua.email) AS name
         FROM ${SCHEMA}.workspace_members wm
         JOIN ${SCHEMA}.users_auth ua ON ua.id = wm.user_id
         WHERE wm.workspace_id = $1 AND ua.id::text = $2
         LIMIT 1`,
        [ws, contactId]
      );
      contact = result.rows[0] || null;
    }

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found in this workspace' });
    }

    const existingChannelId = await findExistingDmChannelId(pg, {
      schema: SCHEMA,
      workspaceId: ws,
      currentUserId,
      contactId,
    });

    if (existingChannelId) {
      const existingChannel = await fetchChannelById(pg, ws, existingChannelId, currentUserId);
      return res.json({ success: true, channel: normaliseChannel(existingChannel) });
    }

    const channelName = canonicalDmNameForContact(contact.name, contact.username) || `DM-${contactId.slice(0, 8)}`;
    const channelDescription = `Direct message with ${contact.name}`;

    const created = await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
       VALUES ($1, $2, 'dm', $3, $4)
       RETURNING id`,
      [channelName, channelDescription, ws, currentUserId]
    );

    await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT DO NOTHING`,
      [created.rows[0].id, currentUserId]
    );

    await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [created.rows[0].id, contactId, contactType === 'agent' ? 'agent' : 'member']
    );

    const channel = await fetchChannelById(pg, ws, created.rows[0].id, currentUserId);
    res.status(201).json({ success: true, channel: normaliseChannel(channel), created_by_name: currentUserName });
  } catch (err) {
    console.error('[Chat] POST /dm error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/chat/channels/:id/preferences', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    await ensureChatPreferencesTable(pg, SCHEMA);
    const ws = wsId(req);
    const userId = actorId(req);
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authenticated user required' });
    }

    const channelId = req.params.id;
    const pinned = req.body.pinned === true;
    const muted = req.body.muted === true;
    const archived = req.body.archived === true;

    await pg.query(
      `INSERT INTO ${SCHEMA}.chat_channel_preferences (
         workspace_id, channel_id, user_id, pinned, muted, archived, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (workspace_id, channel_id, user_id)
       DO UPDATE SET
         pinned = EXCLUDED.pinned,
         muted = EXCLUDED.muted,
         archived = EXCLUDED.archived,
         updated_at = NOW()`,
      [ws, channelId, userId, pinned, muted, archived]
    );

    const channel = await fetchChannelById(pg, ws, channelId, userId);
    res.json({ success: true, channel: normaliseChannel(channel) });
  } catch (err) {
    console.error('[Chat] PATCH /channels/:id/preferences error:', err.message);
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

    if (!before && !after) {
      query = `
        SELECT * FROM (
          SELECT *
          FROM ${SCHEMA}.chat_messages
          WHERE channel_id = $1 AND workspace_id = $2
          ORDER BY created_at DESC
          LIMIT $${idx}
        ) recent_messages
        ORDER BY created_at ASC
      `;
      params.push(limit);
    } else {
      query += ` ORDER BY created_at ASC LIMIT $${idx}`;
      params.push(limit);
    }

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
    if (/chat_action_runs|started_at|requested_agent_id|display_agent_id|orchestrated_by|executed_by|input_json|output_json|error_json|completed_at/i.test(String(err.message || ''))) {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/chat/channels/:id/messages', async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const channelId = req.params.id;
    const { content, client_message_id, message_type = 'text', parent_id } = req.body;
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
    if (!content && !req.body.text && attachments.length === 0) {
      return res.status(400).json({ success: false, error: 'content or attachments are required' });
    }

    const text = content || req.body.text || '';
    const ws = wsId(req);
    const senderId = actorId(req) || 'user';
    const senderName = actorName(req);

    const saved = await insertChatMessage(pg, req.app, SCHEMA, {
      channel_id: channelId,
      sender_id: senderId,
      sender_name: senderName,
      content: text,
      message_type,
      parent_id: parent_id || null,
      attachments,
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

router.post('/chat/channels/:id/attachments', attachmentUpload.array('files', 5), async (req, res) => {
  const pg = getPool(req);
  if (!pg) return res.status(503).json({ success: false, error: 'Database unavailable' });

  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files provided' });
    }

    const channelId = req.params.id;
    const ws = wsId(req);
    const preferredAgentId = String(req.body?.agent_id || req.body?.agentId || '').trim() || null;
    const agent = await resolveAttachmentAgentForChannel(pg, ws, channelId, preferredAgentId);
    if (!agent) {
      return res.status(400).json({ success: false, error: 'This channel is not bound to a single agent drive' });
    }

    const uploaderId = actorId(req) || req.userId || 'user';
    const uploads = [];
    for (const file of files) {
      const uploaded = await uploadFileToAgentDrive(pg, {
        workspaceId: ws,
        agent,
        uploadedBy: uploaderId,
        file,
        targetSubfolder: 'Chat',
      });
      uploads.push({
        id: uploaded.id,
        filename: uploaded.name,
        mime: uploaded.mimeType,
        size: uploaded.size,
        path: uploaded.path,
        url: `/api/v1/drive/download/${uploaded.id}?path=${encodeURIComponent(uploaded.path)}&inline=true`,
        uploaded_at: new Date().toISOString(),
      });
    }

    res.status(201).json({ success: true, attachments: uploads });
  } catch (err) {
    console.error('[Chat] POST /channels/:id/attachments error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
    const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
    const body = content || text || '';
    if (!channel_id || (!body && attachments.length === 0)) {
      return res.status(400).json({ success: false, error: 'channel_id and content or attachments are required' });
    }

    const ws = wsId(req);
    const sId = sender_id || actorId(req) || 'user';
    const sName = sender_name || actorName(req);

    const saved = await insertChatMessage(pg, req.app, SCHEMA, {
      channel_id,
      sender_id: sId,
      sender_name: sName,
      content: body,
      message_type,
      parent_id: parent_id || null,
      attachments,
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
    const userId = actorId(req) || 'user';
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

    const dmName = canonicalDmNameForContact(jarvis?.name || 'Jarvis', jarvis?.username) || 'DM-jarvis';

    if (pg) {
      const existing = await pg.query(
        `SELECT id FROM ${SCHEMA}.chat_channels WHERE name = $1 AND workspace_id = $2 LIMIT 1`,
        [dmName, ws]
      );

      if (existing.rows.length > 0) {
        const room = await fetchChannelById(pg, ws, existing.rows[0].id, userId);
        return res.json({ success: true, room: normaliseChannel(room) });
      }

      if (jarvis) {
        const existingDmId = await findExistingDmChannelId(pg, {
          schema: SCHEMA,
          workspaceId: ws,
          currentUserId: userId,
          contactId: jarvis.id.toString(),
        });
        if (existingDmId) {
          const room = await fetchChannelById(pg, ws, existingDmId, userId);
          return res.json({ success: true, room: normaliseChannel(room) });
        }
      }

      const created = await pg.query(
        `INSERT INTO ${SCHEMA}.chat_channels (name, description, type, workspace_id, created_by)
         VALUES ($1, $2, 'dm', $3, $4)
         RETURNING *`,
        [dmName, `Direct message with ${jarvis?.name || 'Jarvis'}`, ws, userId]
      );

      if (jarvis) {
        await pg.query(
          `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
           VALUES ($1, $2, 'agent') ON CONFLICT DO NOTHING`,
          [created.rows[0].id, jarvis.id.toString()]
        );
      }

      await pg.query(
        `INSERT INTO ${SCHEMA}.chat_channel_members (channel_id, user_id, role)
         VALUES ($1, $2, 'member') ON CONFLICT DO NOTHING`,
        [created.rows[0].id, userId]
      );

      const room = await fetchChannelById(pg, ws, created.rows[0].id, userId);
      return res.json({ success: true, room: normaliseChannel(room) });
    }

    res.json({ success: true, room: { id: dmName, name: dmName, type: 'direct', members: [] } });
  } catch (err) {
    console.error('[Chat] POST /jarvis/bootstrap error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
