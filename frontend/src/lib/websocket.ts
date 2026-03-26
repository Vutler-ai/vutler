/**
 * Chat Pro WebSocket Client — Sprint 1, Story 1.3
 * Auto-reconnecting WebSocket for real-time chat
 */

type EventHandler = (data: any) => void;

export class ChatWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private _connected = false;
  private _destroyed = false;
  private joinedChannels: Set<string> = new Set();

  constructor(token: string) {
    this.token = token;
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${wsProto}//${window.location.host}/ws/chat?token=${encodeURIComponent(token)}`;
  }

  get connected() { return this._connected; }

  connect(): void {
    if (this._destroyed) return;
    try {
      this.ws = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      console.log('[WS] Connected');
      this._connected = true;
      this.reconnectDelay = 1000;
      this.emit('_connected', {});
      
      // Rejoin channels
      for (const ch of this.joinedChannels) {
        this.send('channel:join', { channelId: ch });
      }

      // Keepalive ping every 25s
      this.pingInterval = setInterval(() => {
        this.send('ping', {});
      }, 25000);
    };

    this.ws.onmessage = (event) => {
      try {
        const { type, data } = JSON.parse(event.data);
        this.emit(type, data);
      } catch {}
    };

    this.ws.onclose = () => {
      console.log('[WS] Disconnected');
      this._connected = false;
      this.cleanup();
      this.emit('_disconnected', {});
      if (!this._destroyed) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after this
    };
  }

  private cleanup() {
    if (this.pingInterval) { clearInterval(this.pingInterval); this.pingInterval = null; }
  }

  private scheduleReconnect() {
    if (this._destroyed || this.reconnectTimer) return;
    console.log(`[WS] Reconnecting in ${this.reconnectDelay}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  send(type: string, data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, data }));
    }
  }

  joinChannel(channelId: string): void {
    this.joinedChannels.add(channelId);
    this.send('channel:join', { channelId });
  }

  leaveChannel(channelId: string): void {
    this.joinedChannels.delete(channelId);
    this.send('channel:leave', { channelId });
  }

  sendTyping(channelId: string): void {
    this.send('typing', { channelId });
  }

  on(type: string, handler: EventHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => { this.handlers.get(type)?.delete(handler); };
  }

  private emit(type: string, data: any): void {
    this.handlers.get(type)?.forEach(h => {
      try { h(data); } catch (e) { console.error('[WS] Handler error:', e); }
    });
  }

  destroy(): void {
    this._destroyed = true;
    this.cleanup();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.joinedChannels.clear();
  }
}
