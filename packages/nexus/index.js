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
    const regResult = await this._apiCall('POST', '/api/v1/nexus/register', {
      name: this.name, type: this.type, host: require('os').hostname(), port: this.port
    });

    if (regResult.success && regResult.nodeId) {
      this.nodeId = regResult.nodeId;
      this.workspaceId = regResult.workspaceId;
      console.log(`[Nexus] Registered as node ${this.nodeId} (workspace ${this.workspaceId})`);
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
        const response = await this._apiCall('GET', `/api/v1/nexus/${this.nodeId}/tasks`);
        const tasks = response?.tasks || [];
        for (const task of tasks) {
          await this._executeTask(task);
        }
      } catch (e) {
        // silent — will retry next poll
      }
    }, this.config?.taskPollInterval || 10000);
  }

  async _executeTask(task) {
    console.log(`[NEXUS] Executing task: ${task.title} (${task.id})`);

    // Mark as in_progress
    await this._updateTaskStatus(task.id, 'in_progress');

    try {
      let output;

      // Route to appropriate provider based on task description/metadata
      if (task.metadata?.provider === 'shell' || task.description?.startsWith('shell:')) {
        const cmd = task.metadata?.command || task.description.replace('shell:', '').trim();
        output = await this.providers.shell?.exec(cmd);
      } else if (task.metadata?.provider === 'filesystem') {
        output = await this.providers.filesystem?.read(task.metadata.path);
      } else if (task.metadata?.provider === 'llm') {
        output = await this.providers.llm?.ask(task.description);
      } else {
        // Default: use LLM provider to interpret and execute
        if (this.providers.llm) {
          output = await this.providers.llm.ask(`Execute this task: ${task.title}\n${task.description || ''}`);
        } else {
          output = `Task received but no LLM provider configured. Task: ${task.title}`;
        }
      }

      const outputStr = typeof output === 'object' ? JSON.stringify(output) : String(output || '')
      await this._updateTaskStatus(task.id, 'completed', { output: outputStr });
      console.log(`[NEXUS] Task completed: ${task.title}`);
    } catch (error) {
      await this._updateTaskStatus(task.id, 'failed', { error: error.message });
      console.error(`[NEXUS] Task failed: ${task.title}`, error.message);
    }
  }

  async _updateTaskStatus(taskId, status, data = {}) {
    try {
      await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/tasks/${taskId}/status`, {
        status,
        ...data
      });
    } catch (e) {
      console.error(`[NEXUS] Failed to update task ${taskId} status:`, e.message);
    }
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
