/**
 * Vutler Chat WebSocket — Sprint 15
 * Real-time chat events: message_new, message_update, typing, channel_update
 * 
 * Mounts on /ws/chat alongside existing /ws
 * 
 * Usage: require('./ws-chat').setupChatWebSocket(server, app)
 */

const { WebSocketServer } = require('ws');
const url = require('url');

// Connection registry: Map<string, { ws, userId, userName, channels: Set<string> }>
const chatConnections = new Map();

/**
 * Setup chat WebSocket server
 */
function setupChatWebSocket(server, app) {
  const wss = new WebSocketServer({ noServer: true });
  
  // Attach connection map to app for use by REST routes
  app.locals.wsChatConnections = chatConnections;
  
  // Handle upgrade — route /ws/chat to this WSS
  const existingUpgrade = server.listeners('upgrade');
  
  server.on('upgrade', (request, socket, head) => {
    const pathname = url.parse(request.url).pathname;
    
    if (pathname === '/ws/chat') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
    // Don't destroy — let existing /ws handler pick up other paths
  });
  
  wss.on('connection', (ws, req) => {
    const connId = Math.random().toString(36).slice(2);
    const params = url.parse(req.url, true).query;
    
    const conn = {
      ws,
      userId: params.userId || 'anonymous',
      userName: params.userName || 'Anonymous',
      channels: new Set(),
      connId
    };
    
    chatConnections.set(connId, conn);
    console.log(`[WS/Chat] Connected: ${conn.userId} (${connId})`);
    
    ws.send(JSON.stringify({ type: 'connected', data: { connId, userId: conn.userId } }));
    
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw);
        handleMessage(conn, msg, app);
      } catch (e) {
        ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid JSON' } }));
      }
    });
    
    ws.on('close', () => {
      chatConnections.delete(connId);
      console.log(`[WS/Chat] Disconnected: ${conn.userId} (${connId})`);
    });
    
    ws.on('error', () => {
      chatConnections.delete(connId);
    });
  });
  
  // Heartbeat
  setInterval(() => {
    for (const [id, conn] of chatConnections) {
      if (conn.ws.readyState !== 1) {
        chatConnections.delete(id);
        continue;
      }
      try { conn.ws.ping(); } catch (_) { chatConnections.delete(id); }
    }
  }, 30000);
  
  console.log('✅ Chat WebSocket initialized on ws://…/ws/chat');
  return wss;
}

/**
 * Handle incoming WS message
 */
function handleMessage(conn, msg, app) {
  const { type, data } = msg;
  
  switch (type) {
    case 'ping':
      conn.ws.send(JSON.stringify({ type: 'pong' }));
      break;
      
    case 'subscribe':
      // Subscribe to channel events
      if (data && data.channelId) {
        conn.channels.add(data.channelId);
        conn.ws.send(JSON.stringify({ type: 'subscribed', data: { channelId: data.channelId } }));
      }
      break;
      
    case 'unsubscribe':
      if (data && data.channelId) {
        conn.channels.delete(data.channelId);
        conn.ws.send(JSON.stringify({ type: 'unsubscribed', data: { channelId: data.channelId } }));
      }
      break;
      
    case 'typing':
      // Broadcast typing indicator to channel members
      if (data && data.channelId) {
        broadcastToChannelWs(data.channelId, 'typing', {
          channelId: data.channelId,
          userId: conn.userId,
          userName: conn.userName,
          isTyping: data.isTyping !== false
        }, conn.connId);
      }
      break;
      
    case 'message_send':
      // Send message via WS (alternative to REST)
      handleWsMessage(conn, data, app);
      break;
      
    default:
      conn.ws.send(JSON.stringify({ type: 'error', data: { message: `Unknown type: ${type}` } }));
  }
}

/**
 * Handle message sent via WebSocket
 */
async function handleWsMessage(conn, data, app) {
  if (!data || !data.channelId || !data.content) {
    conn.ws.send(JSON.stringify({ type: 'error', data: { message: 'channelId and content required' } }));
    return;
  }
  
  try {
    const pool = app.locals.pg;
    const { rows: [message] } = await pool.query(`
      INSERT INTO chat_messages (channel_id, sender_id, sender_name, content, parent_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [data.channelId, conn.userId, conn.userName, data.content, data.parentId || null]);
    
    // Broadcast to all subscribers of this channel
    broadcastToChannelWs(data.channelId, 'message_new', { message });
    
  } catch (err) {
    conn.ws.send(JSON.stringify({ type: 'error', data: { message: err.message } }));
  }
}

/**
 * Broadcast event to all connections subscribed to a channel
 */
function broadcastToChannelWs(channelId, event, data, excludeConnId) {
  for (const [id, conn] of chatConnections) {
    if (id === excludeConnId) continue;
    if (conn.channels.has(channelId) || conn.userId) {
      try {
        conn.ws.send(JSON.stringify({ type: event, data }));
      } catch (_) {}
    }
  }
}

function getStats() {
  return {
    connections: chatConnections.size,
    users: new Set([...chatConnections.values()].map(c => c.userId)).size
  };
}

module.exports = { setupChatWebSocket, chatConnections, getStats };
