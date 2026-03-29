const https = require('https');
const http = require('http');
const { createDashboardServer } = require('./dashboard/server');
const AgentManager = require('./lib/agent-manager');
const { WSClient } = require('./lib/ws-client');
const { TaskOrchestrator } = require('./lib/task-orchestrator');
const logger = require('./lib/logger');
const { UnknownError } = require('./lib/errors');

class NexusNode {
  constructor(opts = {}) {
    this.key = opts.key || process.env.VUTLER_KEY;
    this.server = opts.server || process.env.VUTLER_SERVER || 'https://app.vutler.ai';
    this.name = opts.name || process.env.NODE_NAME || require('os').hostname();
    this.type = opts.type || 'local';
    this.port = opts.port || 3100;
    this.mode = opts.mode || 'standard';
    this.sniparaInstanceId = opts.snipara_instance_id || null;
    this.clientName = opts.client_name || null;
    this.filesystemRoot = opts.filesystem_root || null;
    this.role = opts.role || 'general';
    this.deployToken = opts.deploy_token || null;
    this.nodeId = null;
    this.ws = null;

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

    this.agentManager = new AgentManager({
      seats: opts.seats || 1,
      primary_agent: opts.primary_agent || opts.agents?.[0],
      routing_rules: opts.routing_rules || [],
      auto_spawn_rules: opts.auto_spawn_rules || [],
      available_pool: opts.available_pool || [],
      allow_create: opts.allow_create || false,
      server: opts.server || process.env.VUTLER_SERVER || 'https://app.vutler.ai',
      key: opts.key || process.env.VUTLER_KEY,
    }, this.providers, null); // sniparaClient set after connect()

    this.reconnectInterval = 5000;
    this.recentTasks = [];
    this.logBuffer = [];
    this.wsClient = null;
    this.orchestrator = null; // initialised after connect() so wsClient is ready

    // Offline monitor (enterprise only)
    this.offlineConfig = opts.offline_config || {};
    if (this.mode === 'enterprise' && this.offlineConfig.enabled) {
      const { OfflineMonitor } = require('./lib/offline-monitor');
      this.offlineMonitor = new OfflineMonitor(this, this.offlineConfig);
    }
  }

  async connect() {
    // 1. Register node via REST API
    console.log(`[Nexus] Connecting to ${this.server}...`);
    const regResult = await this._apiCall('POST', '/api/v1/nexus/register', {
      name: this.name,
      type: this.type,
      host: require('os').hostname(),
      port: this.port,
      mode: this.mode,
      deploy_token: this.deployToken,
      snipara_instance_id: this.sniparaInstanceId,
      client_name: this.clientName,
      role: this.role,
    });

    if (regResult.success && regResult.nodeId) {
      this.nodeId = regResult.nodeId;
      this.workspaceId = regResult.workspaceId;
      console.log(`[Nexus] Registered as node ${this.nodeId} (workspace ${this.workspaceId})`);
      // Initialize Snipara client for memory operations
      const { SniparaClient } = require('./lib/snipara-client');
      this.snipara = new SniparaClient(this.server, this.nodeId, this.key);
      // Wire AgentManager with nodeId and sniparaClient
      this.agentManager.nodeId = this.nodeId;
      this.agentManager.sniparaClient = this.snipara;
      // Fetch and load agent configs from cloud
      try {
        const configRes = await this._apiCall('GET', `/api/v1/nexus/${this.nodeId}/agent-configs`);
        if (configRes?.agents) {
          await this.agentManager.loadAgents(configRes.agents);
        }
      } catch (e) {
        console.log('[Nexus] Could not load agent configs from cloud, using local config');
      }
    } else {
      console.error('[Nexus] Registration failed:', regResult.error || 'unknown');
      throw new Error('Registration failed');
    }

    if (this.offlineMonitor) this.offlineMonitor.start();

    // 2. Initialise task orchestrator (needs wsClient for progress updates)
    //    wsClient is set during _startWSClient() below, so we pass `this` and
    //    TaskOrchestrator reads this.wsClient lazily via the send calls.
    this.orchestrator = new TaskOrchestrator(this.providers, null);

    // 3. Start WebSocket connection (replaces heartbeat + task poll).
    //    Falls back to HTTP polling if the server does not yet support /ws/nexus.
    this._startWSClient();
    // Wire the orchestrator's wsClient once the WSClient instance is created
    this.orchestrator.wsClient = this.wsClient;

    // 3. Start local dashboard server
    this._startDashboardServer();

    // Graceful shutdown
    const shutdown = () => {
      console.log('[Nexus] Shutting down…');
      this.disconnect().finally(() => process.exit(0));
    };
    process.once('SIGINT',  shutdown);
    process.once('SIGTERM', shutdown);

    console.log(`[Nexus] Node "${this.name}" online. Listening on port ${this.port}`);
    return this;
  }

  async disconnect() {
    if (this.wsClient)    this.wsClient.close();
    if (this.healthServer) this.healthServer.close();
    if (this.offlineMonitor) this.offlineMonitor.stop();
    // Legacy timers (kept for safety — no-ops if WS path is used)
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer)      clearInterval(this.pollTimer);
    if (this.nodeId) {
      await this._apiCall('DELETE', `/api/v1/nexus/${this.nodeId}`);
    }
    console.log('[Nexus] Disconnected.');
  }

  /**
   * Start the WSClient and wire incoming messages to the task executor.
   * Falls back to HTTP polling when the WS endpoint is not yet available
   * (HTTP 404 / 101 upgrade failure), so existing deployments keep working.
   */
  _startWSClient() {
    const wsUrl = this.server.replace(/^http/, 'ws') + '/ws/nexus';

    this.wsClient = new WSClient({
      url:    wsUrl,
      apiKey: this.key,
      nodeId: this.nodeId,
    });

    this.wsClient.on('connected', () => {
      // Announce presence and push current status
      this.wsClient.send('nexus.register', {
        node_id: this.nodeId,
        name:    this.name,
        type:    this.type,
        mode:    this.mode,
        agents:  this.agentManager.getStatus(),
        seats:   this.agentManager.seatsInfo,
      });
      // Stop fallback polling if it was running
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
      }
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
      if (this.offlineMonitor) this.offlineMonitor.onCloudContact();
    });

    this.wsClient.on('message', async (msg) => {
      if (this.offlineMonitor) this.offlineMonitor.onCloudContact();

      switch (msg.type) {
        case 'nexus.task': {
          if (!msg.payload) break;
          const result = await this.orchestrator.execute(msg.payload);
          this.wsClient.send('task.result', result);
          // Mirror to legacy HTTP status endpoint for backwards compat
          if (result.taskId) {
            const status = result.status === 'completed' ? 'completed' : 'failed';
            const data   = result.status === 'completed'
              ? { output: JSON.stringify(result.data) }
              : { error: result.error };
            await this._updateTaskStatus(result.taskId, status, data);
          }
          break;
        }

        case 'nexus.ping':
          this.wsClient.send('nexus.pong', {
            status: 'online',
            agents: this.agentManager.getStatus(),
            memory: process.memoryUsage(),
            uptime: process.uptime(),
          });
          break;

        default:
          this.log(`[Nexus] Unknown WS message type: ${msg.type}`);
      }
    });

    this.wsClient.on('error', (err) => {
      // If the server doesn't support /ws/nexus yet, fall back silently to polling
      const isUpgradeFailure = err.message?.includes('Unexpected server response') ||
                               err.message?.includes('404') ||
                               err.message?.includes('ECONNREFUSED');
      if (isUpgradeFailure && !this.pollTimer) {
        console.warn('[Nexus] WS endpoint unavailable — falling back to HTTP polling');
        this._startHeartbeatHTTP();
        this._startTaskPollHTTP();
      }
    });

    this.wsClient.connect();
  }

  /** Legacy HTTP heartbeat — used only when /ws/nexus is not available. */
  _startHeartbeatHTTP() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/connect`, {
          status: 'online',
          agents: this.agentManager.getStatus(),
          seats:  this.agentManager.seatsInfo,
          memory: process.memoryUsage(),
          uptime: process.uptime(),
        });
        if (this.offlineMonitor) this.offlineMonitor.onCloudContact();
      } catch (e) {
        console.warn('[Nexus] HTTP heartbeat failed:', e.message);
      }
    }, 30000);
  }

  /** Legacy HTTP task poll — used only when /ws/nexus is not available. */
  _startTaskPollHTTP() {
    if (this.pollTimer) return;
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
    this.log(`[NEXUS] Executing task: ${task.title} (${task.id})`);

    // Track in recentTasks
    const tracked = { ...task, status: 'in_progress', startedAt: new Date().toISOString() };
    this.recentTasks.push(tracked);
    if (this.recentTasks.length > 20) this.recentTasks.shift();

    // Mark as in_progress
    await this._updateTaskStatus(task.id, 'in_progress');

    try {
      const route = this.agentManager.routeTask(task);

      // Handle auto-spawn
      if (route && route.needsSpawn) {
        this.log(`[NEXUS] Auto-spawning agent ${route.agentId} for task`);
        const worker = await this.agentManager.spawnAgent(route.agentId);
        const result = await worker.execute(task);
        tracked.status = result.success ? 'completed' : 'failed';
        tracked.completedAt = new Date().toISOString();
        if (result.success) {
          const outputStr = typeof result.output === 'object' ? JSON.stringify(result.output) : String(result.output || '');
          await this._updateTaskStatus(task.id, 'completed', { output: outputStr });
          this.log(`[NEXUS] Task completed: ${task.title} by ${worker.name}`);
        } else {
          await this._updateTaskStatus(task.id, 'failed', { error: result.error });
          this.log(`[NEXUS] Task failed: ${task.title} - ${result.error}`);
        }
        return;
      }

      if (!route) {
        this.log(`[NEXUS] No agent available for task: ${task.title}`);
        tracked.status = 'failed';
        tracked.completedAt = new Date().toISOString();
        await this._updateTaskStatus(task.id, 'failed', { error: 'No agent available' });
        return;
      }

      this.log(`[NEXUS] Routing to agent: ${route.name}`);
      const result = await route.execute(task);

      tracked.status = result.success ? 'completed' : 'failed';
      tracked.completedAt = new Date().toISOString();
      if (result.success) {
        const outputStr = typeof result.output === 'object' ? JSON.stringify(result.output) : String(result.output || '');
        this.log(`[NEXUS] Task completed: ${task.title} by ${route.name}`);
        await this._updateTaskStatus(task.id, 'completed', { output: outputStr });
      } else {
        this.log(`[NEXUS] Task failed: ${task.title} - ${result.error}`);
        await this._updateTaskStatus(task.id, 'failed', { error: result.error });
      }
    } catch (rawError) {
      // Wrap unexpected errors so the stack is always in the log
      const err = rawError.isNexus ? rawError : new UnknownError(rawError);
      const structured = logger.logError(err, { taskId: task.id, taskTitle: task.title });

      tracked.status = 'failed';
      tracked.completedAt = new Date().toISOString();
      // Nexus never crashes — failed task gets a structured error back to cloud
      await this._updateTaskStatus(task.id, 'failed', { error: structured });
    }
  }

  log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    logger.info(message);
    this.logBuffer.push(line);
    if (this.logBuffer.length > 100) this.logBuffer.shift();
  }

  async _updateTaskStatus(taskId, status, data = {}) {
    if (this.offlineMonitor?.isOffline) {
      await this.offlineMonitor.enqueue(taskId, 'status_update', { status, ...data });
      return;
    }
    try {
      await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/tasks/${taskId}/status`, {
        status,
        ...data
      });
    } catch (e) {
      console.error(`[NEXUS] Failed to update task ${taskId} status:`, e.message);
    }
  }

  _startDashboardServer() {
    this.healthServer = createDashboardServer(this);
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
