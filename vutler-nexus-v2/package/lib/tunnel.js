/**
 * @vutler/nexus — WebSocket Tunnel Client
 * Connects to wss://<cloud>/ws/agent-tunnel?token=<TOKEN>
 * Handles: welcome, heartbeat, sync, command/command_result, kill
 * Auto-reconnect with exponential backoff (1s → 30s max)
 */
const WebSocket = require('ws');
const { EventEmitter } = require('events');

class NexusTunnel extends EventEmitter {
  constructor(config) {
    super();
    this.cloudUrl = config.cloudUrl || 'app.vutler.ai';
    this.token = config.token;
    this.ws = null;
    this.connected = false;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.heartbeatInterval = null;
    this.shouldReconnect = true;
    this.agentCount = 0;
    this.lastSync = null;
  }

  connect() {
    if (!this.token) throw new Error('No pairing token configured. Run `vutler-nexus init` first.');

    const wsUrl = `wss://${this.cloudUrl}/ws/agent-tunnel?token=${this.token}`;
    console.log(`[nexus] Connecting to ${this.cloudUrl}...`);

    this.ws = new WebSocket(wsUrl, {
      headers: { 'User-Agent': '@vutler/nexus 0.1.0' }
    });

    this.ws.on('open', () => {
      console.log('[nexus] ✅ Connected');
      this.connected = true;
      this.reconnectDelay = 1000;
      this.emit('connected');
      this._startHeartbeat();
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleMessage(msg);
      } catch (e) {
        console.error('[nexus] Bad message:', e.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[nexus] Disconnected (${code})`);
      this.connected = false;
      this._stopHeartbeat();
      this.emit('disconnected', code);
      if (this.shouldReconnect) this._scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[nexus] Error:', err.message);
      this.emit('error', err);
    });
  }

  disconnect() {
    this.shouldReconnect = false;
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    this.connected = false;
    console.log('[nexus] Disconnected gracefully');
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify({ type, ...payload }));
    return true;
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        console.log(`[nexus] Welcome — workspace: ${msg.workspaceId || 'unknown'}`);
        this.emit('welcome', msg);
        break;

      case 'heartbeat':
        this.send('heartbeat_ack', { ts: Date.now() });
        break;

      case 'heartbeat_ack':
        // Server acknowledged our heartbeat
        break;

      case 'sync':
        this.lastSync = new Date().toISOString();
        this.agentCount = msg.agents?.length || this.agentCount;
        this.emit('sync', msg);
        break;

      case 'command':
        console.log(`[nexus] Command received: ${msg.command}`);
        this.emit('command', msg);
        break;

      case 'command_result':
        this.emit('command_result', msg);
        break;

      case 'kill':
        console.log('[nexus] Kill signal received, disconnecting...');
        this.disconnect();
        break;

      default:
        this.emit('message', msg);
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send('heartbeat', { ts: Date.now() });
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  _scheduleReconnect() {
    console.log(`[nexus] Reconnecting in ${this.reconnectDelay / 1000}s...`);
    setTimeout(() => {
      if (this.shouldReconnect) this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  getStatus() {
    return {
      connected: this.connected,
      cloudUrl: this.cloudUrl,
      agentCount: this.agentCount,
      lastSync: this.lastSync
    };
  }
}

module.exports = { NexusTunnel };
