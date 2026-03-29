'use strict';

const EventEmitter = require('events');
const WebSocket = require('ws');

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_BASE_MS     = 1_000;
const RECONNECT_MAX_MS      = 60_000;

/**
 * WSClient — persistent WebSocket connection between Nexus and Vutler cloud.
 *
 * Events:
 *   'connected'    — WS handshake complete
 *   'disconnected' — connection closed (will auto-reconnect unless close() called)
 *   'message'      — incoming parsed message object { type, payload }
 *   'error'        — error object
 *
 * Usage:
 *   const client = new WSClient({ url, apiKey, nodeId });
 *   client.on('message', msg => …);
 *   client.connect();
 *   client.send('nexus.heartbeat', { status: 'online' });
 *   client.close(); // graceful shutdown
 */
class WSClient extends EventEmitter {
  /**
   * @param {object}  opts
   * @param {string}  opts.url      — wss:// endpoint
   * @param {string}  opts.apiKey   — VUTLER_API_KEY / VUTLER_KEY
   * @param {string}  [opts.nodeId] — node identifier (added to every outgoing message)
   */
  constructor(opts = {}) {
    super();
    if (!opts.url)    throw new Error('[WSClient] opts.url is required');
    if (!opts.apiKey) throw new Error('[WSClient] opts.apiKey is required');

    this.url    = opts.url;
    this.apiKey = opts.apiKey;
    this.nodeId = opts.nodeId || null;

    this._ws               = null;
    this._reconnectDelay   = RECONNECT_BASE_MS;
    this._reconnectTimer   = null;
    this._heartbeatTimer   = null;
    this._closing          = false; // set to true on explicit close()
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Open the connection (idempotent — safe to call while already connected). */
  connect() {
    if (this._closing) return;
    if (this._ws && this._ws.readyState === WebSocket.OPEN) return;
    this._open();
  }

  /**
   * Send a typed message to the cloud.
   * @param {string} type
   * @param {object} [payload]
   */
  send(type, payload = {}) {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) {
      console.warn('[WSClient] send() called while not connected — message dropped:', type);
      return false;
    }
    try {
      this._ws.send(JSON.stringify({ type, payload, node_id: this.nodeId }));
      return true;
    } catch (err) {
      console.error('[WSClient] send() error:', err.message);
      return false;
    }
  }

  /** Gracefully close the connection and stop reconnection attempts. */
  close() {
    this._closing = true;
    this._clearTimers();
    if (this._ws) {
      this._ws.terminate();
      this._ws = null;
    }
    console.log('[WSClient] Closed.');
  }

  /** True if the WebSocket is currently open. */
  get isConnected() {
    return !!(this._ws && this._ws.readyState === WebSocket.OPEN);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _open() {
    if (this._closing) return;

    console.log(`[WSClient] Connecting to ${this.url}…`);

    try {
      this._ws = new WebSocket(this.url, {
        headers: { 'x-api-key': this.apiKey },
      });
    } catch (err) {
      console.error('[WSClient] Failed to create WebSocket:', err.message);
      this._scheduleReconnect();
      return;
    }

    this._ws.on('open', () => this._onOpen());
    this._ws.on('message', (raw) => this._onMessage(raw));
    this._ws.on('pong', () => this._onPong());
    this._ws.on('close', (code, reason) => this._onClose(code, reason));
    this._ws.on('error', (err) => this._onError(err));
  }

  _onOpen() {
    console.log('[WSClient] Connected.');
    this._reconnectDelay = RECONNECT_BASE_MS; // reset backoff on successful connect
    this._startHeartbeat();
    this.emit('connected');
  }

  _onMessage(raw) {
    try {
      const msg = JSON.parse(raw.toString());
      this.emit('message', msg);
    } catch (err) {
      console.warn('[WSClient] Received non-JSON message — ignored.');
    }
  }

  _onPong() {
    // Server acknowledged our ping — connection is healthy
    this._lastPong = Date.now();
  }

  _onClose(code, reason) {
    this._clearTimers();
    this._ws = null;
    const reasonStr = reason ? reason.toString() : 'no reason';
    console.log(`[WSClient] Disconnected (${code} — ${reasonStr}).`);
    this.emit('disconnected', { code, reason: reasonStr });
    if (!this._closing) {
      this._scheduleReconnect();
    }
  }

  _onError(err) {
    console.error('[WSClient] Error:', err.message);
    this.emit('error', err);
    // 'close' event fires after 'error' — reconnect logic is in _onClose
  }

  _startHeartbeat() {
    this._clearHeartbeat();
    this._heartbeatTimer = setInterval(() => {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      try {
        this._ws.ping();
      } catch (err) {
        console.warn('[WSClient] Ping failed:', err.message);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  _scheduleReconnect() {
    if (this._closing) return;
    console.log(`[WSClient] Reconnecting in ${this._reconnectDelay}ms…`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._open();
    }, this._reconnectDelay);
    // Exponential backoff: 1s → 2s → 4s → … → 60s
    this._reconnectDelay = Math.min(this._reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  _clearHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _clearTimers() {
    this._clearHeartbeat();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

module.exports = { WSClient };
