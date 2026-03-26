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
 *
 * Message types (outbound):
 *   pong               — keepalive response
 *   agent.status       — connection confirmed / status change
 *   chat.response      — LLM response to a chat message
 *   chat.thinking      — LLM is processing (typing indicator)
 *   message.sent       — confirmation message was sent
 *   error              — error message
 *   event.activity     — real-time activity feed event
 */

const crypto = require('crypto');
const { WebSocketServer } = require('ws');

// ─── Connection Registry ────────────────────────────────────────────────────

/**
 * Global connection map: connectionId → { ws, agentId, agentName, ... }
 * Shared so other modules can broadcast via app.locals
 */
const connections = new Map();

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
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

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
  const url     = new URL(req.url, `http://${req.headers.host}`);
  const agentId = url.searchParams.get('agent_id');
  const apiKey  = url.searchParams.get('api_key') || req.headers['x-api-key'];

  // ── Auth ────────────────────────────────────────────────────────────────
  if (!apiKey) {
    ws.close(4001, 'Missing api_key');
    return;
  }

  let agent;
  try {
    const { verifyApiKey } = require('../lib/auth');
    const db = app.locals.db;
    agent = await verifyApiKey(db, apiKey);
  } catch (err) {
    console.error('WS auth error:', err);
    ws.close(4002, 'Authentication failed');
    return;
  }

  if (!agent) {
    ws.close(4003, 'Invalid API key');
    return;
  }

  const storedId = String(agentId || agent._id || 'nexus-runtime');

  // ── Register ─────────────────────────────────────────────────────────────
  const connectionId = crypto.randomBytes(8).toString('hex');
  const connection = {
    ws,
    agentId  : storedId,
    agentName: agent.name,
    connectionId,
    connectedAt: new Date(),
    subscriptions: new Set()
  };
  connections.set(connectionId, connection);
  ws.connectionId = connectionId;
  ws.agentId      = storedId;

  console.log(`🔌 [WS] Agent "${agent.name}" connected (${connectionId})`);

  // ── Welcome ───────────────────────────────────────────────────────────────
  send(ws, 'agent.status', {
    status        : 'connected',
    agent_id      : storedId,
    agent_name    : agent.name,
    connection_id : connectionId,
    timestamp     : new Date().toISOString()
  });

  // Update last_seen in DB (fire-and-forget)
  try {
    await app.locals.db.collection('users').updateOne(
      { _id: agent._id },
      { $set: { status: 'online', lastSeen: new Date() } }
    );
  } catch (_) {}

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
    console.log(`🔌 [WS] Agent "${agent.name}" disconnected (${connectionId})`);

    // Mark offline in DB
    try {
      await app.locals.db.collection('users').updateOne(
        { _id: agent._id },
        { $set: { status: 'offline', lastSeen: new Date() } }
      );
    } catch (_) {}

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
    const db = app.locals.db;

    // Fetch agent with LLM config
    const agent = await db.collection('users').findOne({ _id: connection.agentId });

    // Build messages array
    const messages = [
      ...(context || []),
      { role: 'user', content: message }
    ];

    // Route to LLM
    const llmRouter = require('../services/llmRouter');
    const llmResult = await llmRouter.chat(agent, messages, db);

    const reply = llmResult.content || llmResult.message || '…';

    // Log token usage
    if (llmResult.usage) {
      await db.collection('token_usage').insertOne({
        agent_id     : connection.agentId,
        workspace_id : agent.workspaceId || null,
        provider     : llmResult.provider,
        model        : llmResult.model,
        tier         : llmResult.tier || 'byokey',
        tokens_input : llmResult.usage.input_tokens  || 0,
        tokens_output: llmResult.usage.output_tokens || 0,
        tokens_total : (llmResult.usage.input_tokens  || 0) +
                       (llmResult.usage.output_tokens || 0),
        cost         : llmResult.cost || 0,
        latency_ms   : llmResult.latency_ms || 0,
        request_type : 'chat_ws',
        timestamp    : new Date()
      });
    }

    // Record conversation turn
    if (conversation_id) {
      await db.collection('conversations').insertMany([
        { conversation_id, agent_id: connection.agentId, role: 'user',
          content: message, timestamp: new Date() },
        { conversation_id, agent_id: connection.agentId, role: 'assistant',
          content: reply, timestamp: new Date() }
      ]);
    }

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
    const chatAPI = require('./chat');
    const result  = await chatAPI.sendMessage(app.locals.db, {
      agentId   : connection.agentId,
      agentName : connection.agentName,
      channelId : channel_id,
      text,
      attachments
    });

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
                   wsConnections: connections };