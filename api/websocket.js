/**
 * Vutler WebSocket Chat Module — S4.3
 * Real-time bidirectional communication for AI agents
 *
 * Protocol:
 *   Client → Server: { type, data }
 *   Server → Client: { type, data }
 *
 * Message types (inbound):
 *   ping               — keepalive
 *   chat.message       — user sends chat message to agent
 *   message.send       — agent sends message to a channel
 *   subscribe          — subscribe to agent/channel events
 *   unsubscribe        — unsubscribe
 *   agent.register     — local daemon registers mode + capabilities
 *   dispatch.result    — local daemon reports code sync result
 *   git.pull.result    — local daemon reports git pull result
 *
 * Message types (outbound):
 *   pong               — keepalive response
 *   agent.status       — connection confirmed / status change
 *   chat.response      — LLM response to a chat message
 *   chat.thinking      — LLM is processing (typing indicator)
 *   message.sent       — confirmation message was sent
 *   error              — error message
 *   event.activity     — real-time activity feed event
 *   code.ready         — dispatch validated code to local daemon
 *   agent.registered   — confirmation of daemon registration
 */

const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { resolveApiKey } = require('./middleware/auth');
const { resolveAgentRecord } = require('../services/sniparaMemoryService');
const llmRouter = require('../services/llmRouter');

const SCHEMA = 'tenant_vutler';

// ─── Connection Registry ────────────────────────────────────────────────────

/**
 * Global connection map: connectionId → { ws, agentId, agentName, ... }
 * Shared so other modules can broadcast via app.locals
 */
const connections = new Map();

function getPg(app) {
  return app?.locals?.pg || app?.locals?.db || null;
}

async function loadWorkspaceAgent(pg, workspaceId, agentIdOrUsername, fallback = {}) {
  if (!pg || !workspaceId || !agentIdOrUsername) return null;
  const agent = await resolveAgentRecord(pg, workspaceId, agentIdOrUsername, fallback);
  return agent?.id ? agent : null;
}

async function authenticateWebSocketRequest(req, app) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedAgentId = url.searchParams.get('agent_id');
  const apiKey = url.searchParams.get('api_key') || req.headers['x-api-key'];

  if (!apiKey) {
    return { ok: false, code: 4001, reason: 'Missing api_key' };
  }

  const pg = getPg(app);
  if (!pg) {
    return { ok: false, code: 1011, reason: 'Database unavailable' };
  }

  const identity = await resolveApiKey({ app: { locals: { pg } } }, apiKey).catch((err) => {
    console.error('[WS] API key auth error:', err.message);
    return null;
  });

  if (!identity) {
    return { ok: false, code: 4003, reason: 'Invalid API key' };
  }

  let agent = null;
  if (requestedAgentId) {
    agent = await loadWorkspaceAgent(pg, identity.workspaceId, requestedAgentId);
    if (!agent) {
      return { ok: false, code: 4004, reason: 'Agent not found' };
    }
  }

  return {
    ok: true,
    apiKey,
    requestedAgentId,
    identity,
    workspaceId: identity.workspaceId,
    agent,
    pg,
  };
}

async function updateSocketAgentStatus(pg, workspaceId, agentId, status) {
  if (!pg || !workspaceId || !agentId || !status) return;
  await pg.query(
    `UPDATE ${SCHEMA}.agents
        SET status = $3,
            updated_at = NOW()
      WHERE workspace_id = $1 AND id = $2`,
    [workspaceId, agentId, status]
  ).catch(() => {});
}

async function persistConversationTurns(pg, workspaceId, conversationId, connection, userMessage, assistantMessage) {
  if (!pg || !workspaceId || !conversationId) return;

  const channel = await pg.query(
    `SELECT id
       FROM ${SCHEMA}.chat_channels
      WHERE workspace_id = $1 AND id::text = $2
      LIMIT 1`,
    [workspaceId, String(conversationId)]
  ).catch(() => ({ rows: [] }));

  if (!channel.rows?.length) return;

  await pg.query(
    `INSERT INTO ${SCHEMA}.chat_messages
       (channel_id, sender_id, sender_name, content, message_type, workspace_id, metadata)
     VALUES
       ($1, $2, $3, $4, 'text', $5, $6::jsonb),
       ($1, $7, $8, $9, 'text', $5, $10::jsonb)`,
    [
      channel.rows[0].id,
      connection.userId || connection.identity?.id || 'ws-client',
      connection.userName || connection.identity?.name || 'User',
      userMessage,
      workspaceId,
      JSON.stringify({ source: 'ws-chat', conversation_id: String(conversationId), role: 'user' }),
      connection.agentId,
      connection.agentName,
      assistantMessage,
      JSON.stringify({ source: 'ws-chat', conversation_id: String(conversationId), role: 'assistant' }),
    ]
  ).catch(() => {});
}

async function insertWorkspaceChannelMessage(pg, workspaceId, channelId, connection, text, attachments = []) {
  if (!pg || !workspaceId || !channelId || !text) return null;

  const channel = await pg.query(
    `SELECT id
       FROM ${SCHEMA}.chat_channels
      WHERE workspace_id = $1 AND id::text = $2
      LIMIT 1`,
    [workspaceId, String(channelId)]
  );
  if (!channel.rows.length) {
    throw new Error('Channel not found');
  }

  const result = await pg.query(
    `INSERT INTO ${SCHEMA}.chat_messages
       (channel_id, sender_id, sender_name, content, message_type, workspace_id, metadata)
     VALUES ($1, $2, $3, $4, 'text', $5, $6::jsonb)
     RETURNING id`,
    [
      channel.rows[0].id,
      connection.agentId || connection.identity?.id || 'ws-client',
      connection.agentName || connection.identity?.name || 'API Client',
      text,
      workspaceId,
      JSON.stringify({
        source: 'ws-chat',
        attachments: Array.isArray(attachments) ? attachments : [],
      }),
    ]
  );

  return { messageId: result.rows[0]?.id || null };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Initialize WebSocket server on the given HTTP server.
 * Attaches broadcast helpers to app.locals.
 *
 * @param {http.Server} server
 * @param {express.Application} app
 * @returns {WebSocketServer}
 */
function setupWebSocket(server, app) {
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually so /ws/chat and /ws/chat-pro can coexist.
  // Using { server, path } would cause ws to destroy non-matching upgrades,
  // preventing the chat-pro handler from ever running.
  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== '/ws/chat') return; // let other handlers (ws-chat) take it
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (err) {
      console.error('[WS] Upgrade error for /ws/chat:', err.message);
      socket.destroy();
    }
  });

  console.log('✅ WebSocket server initialized on ws://…/ws/chat');

  wss.on('connection', async (ws, req) => {
    await handleConnection(ws, req, app);
  });

  // Attach helpers to app.locals so API routes can push events
  app.locals.wsConnections     = connections;
  app.locals.broadcastToAgent  = broadcastToAgent;
  app.locals.broadcastToAll    = broadcastToAll;
  app.locals.pushActivityEvent = pushActivityEvent;

  return wss;
}

// ─── Connection Lifecycle ────────────────────────────────────────────────────

async function handleConnection(ws, req, app) {
  const auth = await authenticateWebSocketRequest(req, app);
  if (!auth.ok) {
    ws.close(auth.code, auth.reason);
    return;
  }
  const storedId = String(auth.agent?.id || auth.requestedAgentId || auth.identity.id || 'nexus-runtime');
  const agentName = auth.agent?.name || auth.identity.name || 'API Client';

  // ── Register ─────────────────────────────────────────────────────────────
  const connectionId = crypto.randomBytes(8).toString('hex');
  const connection = {
    ws,
    agentId  : storedId,
    agentName,
    agent: auth.agent || null,
    identity: auth.identity,
    workspaceId: auth.workspaceId,
    userId: auth.identity.id || null,
    userName: auth.identity.name || auth.identity.email || 'API Client',
    connectionId,
    connectedAt: new Date(),
    subscriptions: new Set()
  };
  connections.set(connectionId, connection);
  ws.connectionId = connectionId;
  ws.agentId      = storedId;

  console.log(`🔌 [WS] Agent "${agentName}" connected (${connectionId})`);

  // ── Welcome ───────────────────────────────────────────────────────────────
  send(ws, 'agent.status', {
    status        : 'connected',
    agent_id      : storedId,
    agent_name    : agentName,
    connection_id : connectionId,
    timestamp     : new Date().toISOString()
  });

  await updateSocketAgentStatus(auth.pg, auth.workspaceId, auth.agent?.id || null, 'online');

  // ── Message Handling ──────────────────────────────────────────────────────
  ws.on('message', async (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      send(ws, 'error', { message: 'Invalid JSON' });
      return;
    }
    await dispatch(connection, parsed, app);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  ws.on('close', async () => {
    connections.delete(connectionId);
    console.log(`🔌 [WS] Agent "${agentName}" disconnected (${connectionId})`);

    await updateSocketAgentStatus(auth.pg, auth.workspaceId, auth.agent?.id || null, 'offline');

    // Notify other connections of this agent (if they subscribed)
    broadcastToAgent(storedId, 'agent.status', {
      status   : 'disconnected',
      agent_id : storedId,
      timestamp: new Date().toISOString()
    }, connectionId /* exclude self */);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${connectionId}:`, err.message);
  });
}

// ─── Message Dispatcher ──────────────────────────────────────────────────────

async function dispatch(connection, { type, data = {} }, app) {
  switch (type) {

    // ── Keepalive ─────────────────────────────────────────────────────────
    case 'ping':
      send(connection.ws, 'pong', { timestamp: new Date().toISOString() });
      break;

    // ── User → Agent chat (agent answers with LLM) ────────────────────────
    case 'chat.message':
      await handleChatMessage(connection, data, app);
      break;

    // ── Agent sends message to a Rocket.Chat channel ──────────────────────
    case 'message.send':
      await handleMessageSend(connection, data, app);
      break;

    // ── Subscribe to a channel / topic ────────────────────────────────────
    case 'subscribe':
      if (data.topic) {
        connection.subscriptions.add(data.topic);
        send(connection.ws, 'subscribed', { topic: data.topic });
      }
      break;

    // ── Unsubscribe ───────────────────────────────────────────────────────
    case 'unsubscribe':
      if (data.topic) {
        connection.subscriptions.delete(data.topic);
        send(connection.ws, 'unsubscribed', { topic: data.topic });
      }
      break;

    // ── Local daemon registration ──────────────────────────────────────
    case 'agent.register':
      connection.mode = data.mode || 'agent';
      connection.capabilities = data.capabilities || [];
      connection.repos = data.repos || [];  // Phase 2: repos with allowed commands
      console.log(`[WS] Agent "${connection.agentId}" registered as ${connection.mode} (caps: ${connection.capabilities.join(', ')}, repos: ${connection.repos.length})`);
      send(connection.ws, 'agent.registered', { mode: connection.mode, capabilities: connection.capabilities });
      break;

    // ── Dispatch result from local daemon ───────────────────────────────
    case 'dispatch.result':
      console.log(`[WS] Dispatch result from "${connection.agentId}": ${data.success ? 'OK' : data.error}`);
      pushActivityEvent({
        type: 'dispatch.result',
        agent_id: connection.agentId,
        agent_name: connection.agentName,
        summary: data.success
          ? `Code synced to local: branch ${data.branch}, commit ${data.commit_sha}`
          : `Dispatch failed: ${data.error}`,
      });
      break;

    // ── Command execution result from local daemon ────────────────────
    case 'cmd.exec.result':
      console.log(`[WS] cmd.exec result from "${connection.agentId}": "${data.command}" exit=${data.exitCode} (${data.durationMs}ms)`);
      pushActivityEvent({
        type: 'cmd.exec.result',
        agent_id: connection.agentId,
        agent_name: connection.agentName,
        summary: data.success
          ? `Command "${data.command}" passed in ${data.repo} (${data.durationMs}ms)`
          : `Command "${data.command}" failed in ${data.repo}: exit ${data.exitCode}`,
        details: {
          repo: data.repo,
          command: data.command,
          exitCode: data.exitCode,
          stdout: data.stdout?.slice(0, 2000),  // truncate for activity feed
          stderr: data.stderr?.slice(0, 2000),
          durationMs: data.durationMs,
          request_id: data.request_id,
        },
      });
      break;

    // ── Git pull result from local daemon ───────────────────────────────
    case 'git.pull.result':
      console.log(`[WS] Git pull result from "${connection.agentId}": ${data.success ? 'OK' : data.error}`);
      break;

    // ── Nexus tool result (response to tool.call from llmRouter) ──────
    case 'tool.result': {
      const { request_id, success, data: toolData, error: toolError } = data;
      console.log(`[WS] tool.result from "${connection.agentId}": ${request_id} ${success ? 'ok' : 'error'}`);
      require('../services/nexusTools').handleToolResult(request_id, success, toolData, toolError);
      break;
    }

    default:
      console.log(`[WS] Unknown message type "${type}" from ${connection.agentId}`);
      send(connection.ws, 'error', { message: `Unknown type: ${type}` });
  }
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/**
 * Receive a user chat message, call the LLM, stream the response back.
 */
async function handleChatMessage(connection, data, app) {
  const { message, conversation_id, context = [] } = data;

  if (!message) {
    send(connection.ws, 'error', { message: '`message` is required' });
    return;
  }

  // Typing indicator
  send(connection.ws, 'chat.thinking', {
    agent_id      : connection.agentId,
    conversation_id,
    timestamp     : new Date().toISOString()
  });

  try {
    const pg = getPg(app);
    const agent = await loadWorkspaceAgent(pg, connection.workspaceId, connection.agentId, connection.agent || {});
    if (!agent) {
      throw new Error('This WebSocket connection is not bound to a workspace agent.');
    }

    // Build messages array
    const messages = [
      ...(context || []),
      { role: 'user', content: message }
    ];

    // Route to LLM
    const llmResult = await llmRouter.chat(agent, messages, pg, {
      wsConnections: app?.locals?.wsConnections,
    });

    const reply = llmResult.content || llmResult.message || '…';

    // Record conversation turn
    await persistConversationTurns(pg, connection.workspaceId, conversation_id, connection, message, reply);

    send(connection.ws, 'chat.response', {
      agent_id        : connection.agentId,
      agent_name      : connection.agentName,
      conversation_id,
      message         : reply,
      provider        : llmResult.provider,
      model           : llmResult.model,
      tokens          : llmResult.usage || null,
      timestamp       : new Date().toISOString()
    });

    // Push activity event
    pushActivityEvent({
      type      : 'chat',
      agent_id  : connection.agentId,
      agent_name: connection.agentName,
      summary   : `Chat via WebSocket (${(reply || '').slice(0, 60)}…)`
    });

    // Send push notification (best-effort, for background/closed app)
    if (connection.userId) {
      try {
        const { sendPushToUser } = require('../services/pushService');
        sendPushToUser(connection.userId, {
          title: connection.agentName || 'Vutler Agent',
          body: (reply || '').slice(0, 120),
          url: '/chat',
          tag: `chat-${connection.agentId}`,
        }).catch(() => {});
      } catch { /* push unavailable */ }
    }

  } catch (err) {
    console.error(`[WS] LLM error for agent ${connection.agentId}:`, err.message);
    send(connection.ws, 'error', {
      message  : 'LLM call failed',
      details  : err.message,
      timestamp: new Date().toISOString()
    });
  }
}

/**
 * Agent sends a message to a Rocket.Chat channel.
 * Delegates to the chat API helper and confirms via WebSocket.
 */
async function handleMessageSend(connection, data, app) {
  const { channel_id, text, attachments = [] } = data;

  if (!channel_id || !text) {
    send(connection.ws, 'error', { message: '`channel_id` and `text` are required' });
    return;
  }

  try {
    const result = await insertWorkspaceChannelMessage(
      getPg(app),
      connection.workspaceId,
      channel_id,
      connection,
      text,
      attachments
    );

    send(connection.ws, 'message.sent', {
      channel_id,
      message_id: result.messageId || null,
      timestamp : new Date().toISOString()
    });

    pushActivityEvent({
      type      : 'message',
      agent_id  : connection.agentId,
      agent_name: connection.agentName,
      channel_id,
      summary   : `Sent message to channel ${channel_id}`
    });

  } catch (err) {
    console.error(`[WS] Send message error:`, err.message);
    send(connection.ws, 'error', {
      message : 'Failed to send message',
      details : err.message
    });
  }
}

// ─── Broadcast Helpers ───────────────────────────────────────────────────────

/**
 * Send a typed message to one WebSocket.
 */
function send(ws, type, data = {}) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify({ type, data }));
  }
}

/**
 * Broadcast to all connections belonging to agentId.
 * @param {string}  agentId
 * @param {string}  type
 * @param {object}  data
 * @param {string=} excludeConnectionId
 */
function broadcastToAgent(agentId, type, data, excludeConnectionId) {
  for (const [cid, conn] of connections) {
    if (conn.agentId === agentId && cid !== excludeConnectionId) {
      send(conn.ws, type, data);
    }
  }
}

/**
 * Broadcast to all open connections.
 */
function broadcastToAll(type, data) {
  for (const [, conn] of connections) {
    send(conn.ws, type, data);
  }
}

/**
 * Push a real-time activity event to all subscribers of the agent's feed.
 */
function pushActivityEvent(event) {
  const payload = { ...event, timestamp: new Date().toISOString() };
  for (const [, conn] of connections) {
    if (conn.subscriptions.has('activity') ||
        conn.subscriptions.has(`activity:${event.agent_id}`)) {
      send(conn.ws, 'event.activity', payload);
    }
  }
}

/**
 * Return connection stats (for health endpoint).
 */
function getStats() {
  return {
    total     : connections.size,
    agents    : [...new Set([...connections.values()].map(c => c.agentId))].length,
    connections: [...connections.values()].map(c => ({
      connectionId: c.connectionId,
      agentId     : c.agentId,
      agentName   : c.agentName,
      connectedAt : c.connectedAt
    }))
  };
}

module.exports = { setupWebSocket, broadcastToAgent, broadcastToAll,
                   pushActivityEvent, getStats, send,
                   wsConnections: connections,
                   __test: {
                     authenticateWebSocketRequest,
                     handleChatMessage,
                     handleMessageSend,
                     insertWorkspaceChannelMessage,
                     loadWorkspaceAgent,
                     persistConversationTurns,
                     updateSocketAgentStatus,
                   } };
