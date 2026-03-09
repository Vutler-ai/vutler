const WebSocket = require('ws');
const https = require('https');
const http = require('http');

class NexusNode {
  constructor(opts = {}) {
    this.key = opts.key || process.env.VUTLER_KEY;
    this.server = opts.server || process.env.VUTLER_SERVER || 'https://app.vutler.ai';
    this.name = opts.name || process.env.NODE_NAME || require('os').hostname();
    this.type = opts.type || 'local';
    this.port = opts.port || 3100;
    this.nodeId = null;
    this.ws = null;
    this.agents = [];

    // Load providers
    this.providers = {};
    if (opts.providers !== false) {
      const { FilesystemProvider } = require('./lib/providers/filesystem');
      const { ShellProvider } = require('./lib/providers/shell');
      const { EnvProvider } = require('./lib/providers/env');
      const { NetworkProvider } = require('./lib/providers/network');
      const { LLMProvider } = require('./lib/providers/llm');
      const { AVControlProvider } = require('./lib/providers/av-control');
      
      const perms = opts.permissions || {};
      this.providers.fs = new FilesystemProvider(perms.filesystem || {});
      this.providers.shell = new ShellProvider(perms.shell || {});
      this.providers.env = new EnvProvider(perms.env || {});
      this.providers.network = new NetworkProvider(perms.network || {});
      this.providers.llm = new LLMProvider(opts.llm || {});
      this.providers.av = new AVControlProvider(perms.av || { subnets: perms.network?.subnets });
    }
    this.reconnectInterval = 5000;
  }

  async connect() {
    // 1. Register node via REST API
    console.log(`[Nexus] Connecting to ${this.server}...`);
    const regResult = await this._apiCall('POST', '/api/v1/nexus', {
      name: this.name, type: this.type, host: require('os').hostname(), port: this.port
    });
    
    if (regResult.success && regResult.data) {
      this.nodeId = regResult.data.id;
      console.log(`[Nexus] Registered as node ${this.nodeId}`);
    } else {
      console.error('[Nexus] Registration failed:', regResult.error || 'unknown');
      throw new Error('Registration failed');
    }

    // 2. Start heartbeat
    this._startHeartbeat();
    
    // 3. Start polling for tasks
    this._startTaskPoll();
    
    // 4. Start local HTTP server for health checks
    this._startHealthServer();
    
    console.log(`[Nexus] Node "${this.name}" online. Listening on port ${this.port}`);
    return this;
  }

  async disconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.healthServer) this.healthServer.close();
    if (this.nodeId) {
      await this._apiCall('DELETE', `/api/v1/nexus/${this.nodeId}`);
    }
    console.log('[Nexus] Disconnected.');
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/connect`, {
          status: 'online',
          agents: this.agents.map(a => a.name),
          memory: process.memoryUsage(),
          uptime: process.uptime()
        });
      } catch (e) {
        console.warn('[Nexus] Heartbeat failed:', e.message);
      }
    }, 30000); // every 30s
  }

  _startTaskPoll() {
    this.pollTimer = setInterval(async () => {
      try {
        // Poll for pending tasks assigned to this node
        const tasks = await this._apiCall('GET', `/api/v1/nexus/${this.nodeId}/health`);
        // Process tasks if any
      } catch (e) {
        // silent
      }
    }, 10000); // every 10s
  }

  _startHealthServer() {
    this.healthServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({
          status: 'online',
          nodeId: this.nodeId,
          name: this.name,
          agents: this.agents.length,
          uptime: process.uptime(),
          memory: process.memoryUsage()
        }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    this.healthServer.listen(this.port);
  }

  async _apiCall(method, path, body) {
    const url = new URL(path, this.server);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method,
        headers: {
          'Authorization': 'Bearer ' + this.key,
          'Content-Type': 'application/json',
          'X-Nexus-Node': this.nodeId || 'registering'
        }
      };
      
      const req = lib.request(opts, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { resolve({ success: false, raw: data }); }
        });
      });
      
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

module.exports = { NexusNode };
