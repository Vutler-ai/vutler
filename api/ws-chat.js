/**
 * WebSocket Chat Pro (/ws/chat-pro)
 * JWT-authenticated realtime channel events for chat UI.
 */
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const JWT_SECRET = process.env.JWT_SECRET || 'MISSING-SET-JWT_SECRET-ENV';

const connections = new Map(); // connectionId -> { ws, userId, userName, workspaceId, channels:Set }
const channelSubs = new Map(); // channelId -> Set<connectionId>
const workspaceSubs = new Map(); // workspaceId -> Set<connectionId>

function parseJWT(token) {
  try {
    const [h, b, s] = String(token || '').split('.');
    if (!h || !b || !s) return null;
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (s !== expectedSig) return null;
    const payload = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function send(ws, type, data = {}) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({ type, data }));
  }
}

function addSub(connectionId, channelId) {
  if (!channelSubs.has(channelId)) channelSubs.set(channelId, new Set());
  channelSubs.get(channelId).add(connectionId);
  const conn = connections.get(connectionId);
  if (conn) conn.channels.add(channelId);
}

function removeSub(connectionId, channelId) {
  channelSubs.get(channelId)?.delete(connectionId);
  if (channelSubs.get(channelId)?.size === 0) channelSubs.delete(channelId);
  const conn = connections.get(connectionId);
  if (conn) conn.channels.delete(channelId);
}

function addWorkspaceSub(connectionId, workspaceId) {
  const normalized = String(workspaceId || '').trim();
  if (!normalized) return;
  if (!workspaceSubs.has(normalized)) workspaceSubs.set(normalized, new Set());
  workspaceSubs.get(normalized).add(connectionId);
}

function removeWorkspaceSub(connectionId, workspaceId) {
  const normalized = String(workspaceId || '').trim();
  if (!normalized) return;
  workspaceSubs.get(normalized)?.delete(connectionId);
  if (workspaceSubs.get(normalized)?.size === 0) workspaceSubs.delete(normalized);
}

function broadcastToChannel(channelId, type, data = {}, excludeConnectionId = null) {
  const subs = channelSubs.get(channelId);
  if (!subs) return;
  for (const cid of subs) {
    if (excludeConnectionId && cid === excludeConnectionId) continue;
    const conn = connections.get(cid);
    if (conn) send(conn.ws, type, data);
  }
}

function broadcastToWorkspace(workspaceId, type, data = {}, excludeConnectionId = null) {
  const normalized = String(workspaceId || '').trim();
  if (!normalized) return;
  const subs = workspaceSubs.get(normalized);
  if (!subs) return;
  for (const cid of subs) {
    if (excludeConnectionId && cid === excludeConnectionId) continue;
    const conn = connections.get(cid);
    if (conn) send(conn.ws, type, data);
  }
}

function publishMessage(message) {
  if (!message?.channel_id) return;
  broadcastToChannel(message.channel_id, 'message:new', message);
}

function publishWorkspaceEvent(workspaceId, event = {}) {
  const normalized = String(workspaceId || '').trim();
  if (!normalized) return false;

  broadcastToWorkspace(normalized, 'workspace:event', {
    id: event.id || crypto.randomBytes(8).toString('hex'),
    type: event.type || 'workspace.updated',
    entity: event.entity || null,
    origin: event.origin || 'server',
    reason: event.reason || null,
    timestamp: event.timestamp || new Date().toISOString(),
    workspaceId: normalized,
    task: event.task || null,
    run: event.run || null,
    payload: event.payload || null,
  });

  return true;
}

function setupChatWebSocket(server, app) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname !== '/ws/chat-pro') return;

      const token = url.searchParams.get('token') || null;
      const decoded = parseJWT(token);
      if (!decoded?.userId) {
        console.warn('[WS-Chat] Rejected /ws/chat-pro connection: invalid or missing JWT token');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      console.log(`[WS-Chat] Accepted /ws/chat-pro connection for userId=${decoded.userId}`);

      req.wsUser = {
        userId: decoded.userId,
        userName: decoded.name || decoded.email || 'User',
        workspaceId: decoded.workspaceId // SECURITY: workspace from JWT only (audit 2026-03-29)
      };

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch (err) {
      console.error('[WS-Chat] Upgrade error for /ws/chat-pro:', err?.message || err);
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws, req) => {
    const connectionId = crypto.randomBytes(8).toString('hex');
    const conn = {
      ws,
      connectionId,
      userId: req.wsUser.userId,
      userName: req.wsUser.userName,
      workspaceId: req.wsUser.workspaceId,
      channels: new Set()
    };
    connections.set(connectionId, conn);

    send(ws, 'connected', {
      connectionId,
      userId: conn.userId,
      userName: conn.userName
    });

    ws.on('message', (raw) => {
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return send(ws, 'error', { message: 'Invalid JSON' });
      }

      const { type, data = {} } = parsed;
      if (type === 'ping') return send(ws, 'pong', { ts: Date.now() });

      if (type === 'channel:join' && data.channelId) {
        const channelId = String(data.channelId);
        let allowed = true;
        try {
          const chatAPI = app?.locals?.chatAPI || require('./chat');
          if (typeof chatAPI?.canAccessChannelForUser === 'function') {
            allowed = chatAPI.canAccessChannelForUser(channelId, conn.userId);
          }
        } catch {
          allowed = true;
        }

        if (!allowed) {
          return send(ws, 'error', { message: 'Forbidden channel' });
        }

        addSub(connectionId, channelId);
        return send(ws, 'channel:joined', { channelId });
      }

      if (type === 'channel:leave' && data.channelId) {
        removeSub(connectionId, String(data.channelId));
        return send(ws, 'channel:left', { channelId: String(data.channelId) });
      }

      if (type === 'workspace:join') {
        addWorkspaceSub(connectionId, conn.workspaceId);
        return send(ws, 'workspace:joined', { workspaceId: conn.workspaceId });
      }

      if (type === 'workspace:leave') {
        removeWorkspaceSub(connectionId, conn.workspaceId);
        return send(ws, 'workspace:left', { workspaceId: conn.workspaceId });
      }

      if (type === 'typing' && data.channelId) {
        broadcastToChannel(String(data.channelId), 'message:typing', {
          channelId: String(data.channelId),
          userId: conn.userId,
          userName: conn.userName
        }, connectionId);
      }
    });

    ws.on('close', () => {
      const c = connections.get(connectionId);
      if (c) {
        for (const ch of c.channels) removeSub(connectionId, ch);
        removeWorkspaceSub(connectionId, c.workspaceId);
      }
      connections.delete(connectionId);
    });
  });

  console.log('[WS-Chat] WebSocket handler initialized');
  return wss;
}

module.exports = { setupChatWebSocket, publishMessage, publishWorkspaceEvent };
