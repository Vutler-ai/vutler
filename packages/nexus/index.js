const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const { createDashboardServer } = require('./dashboard/server');
const AgentManager = require('./lib/agent-manager');
const { TaskOrchestrator } = require('./lib/task-orchestrator');
const { getPermissionEngine } = require('./lib/permission-engine');

class NexusNode {
  constructor(opts = {}) {
    this.config = opts;
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
    this.agents = [];
    this.permissions = opts.permissions || {};

    // Load providers
    this.providers = {};
    if (opts.providers !== false) {
      const { FilesystemProvider } = require('./lib/providers/filesystem');
      const { ShellProvider } = require('./lib/providers/shell');
      const { EnvProvider } = require('./lib/providers/env');
      const { NetworkProvider } = require('./lib/providers/network');
      const { LLMProvider } = require('./lib/providers/llm');
      const { AVControlProvider } = require('./lib/providers/av-control');
      const { ClipboardProvider } = require('./lib/providers/clipboard');

      const perms = this.permissions;
      this.providers.fs = new FilesystemProvider(perms.filesystem || {});
      this.providers.shell = new ShellProvider(perms.shell || {});
      this.providers.env = new EnvProvider(perms.env || {});
      this.providers.network = new NetworkProvider(perms.network || {});
      this.providers.llm = new LLMProvider(opts.llm || {});
      this.providers.av = new AVControlProvider(perms.av || { subnets: perms.network?.subnets });
      this.providers.clipboard = new ClipboardProvider();

      const workspaceBacked = this.mode === 'enterprise' || this.type === 'docker';
      if (workspaceBacked) {
        const sharedConfig = { server: this.server, apiKey: this.key };
        const { WorkspaceMailProvider } = require('./lib/providers/workspace-mail');
        const { WorkspaceCalendarProvider } = require('./lib/providers/workspace-calendar');
        const { WorkspaceContactsProvider } = require('./lib/providers/workspace-contacts');
        this.providers.mail = new WorkspaceMailProvider(sharedConfig);
        this.providers.calendar = new WorkspaceCalendarProvider(sharedConfig);
        this.providers.contacts = new WorkspaceContactsProvider(sharedConfig);
      }
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
    this.commandPollInFlight = false;
    this.taskOrchestrator = new TaskOrchestrator(this.providers, null);
    this.permissionEngine = getPermissionEngine();
    this._syncPermissionSnapshot();

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
      filesystem_root: this.filesystemRoot,
      role: this.role,
      permissions: this.permissions,
      seats: this.config.seats,
      max_seats: this.config.seats,
      primary_agent: this.config.primary_agent,
      available_pool: this.config.available_pool,
      allow_create: this.config.allow_create,
      routing_rules: this.config.routing_rules,
      auto_spawn_rules: this.config.auto_spawn_rules,
      offline_config: this.offlineConfig,
      llm: this.config.llm,
      config: {
        mode: this.mode,
        node_name: this.name,
        client_name: this.clientName,
        filesystem_root: this.filesystemRoot,
        role: this.role,
        snipara_instance_id: this.sniparaInstanceId,
        permissions: this.permissions,
        seats: this.config.seats,
        max_seats: this.config.seats,
        primary_agent: this.config.primary_agent,
        available_pool: this.config.available_pool,
        allow_create: this.config.allow_create,
        routing_rules: this.config.routing_rules,
        auto_spawn_rules: this.config.auto_spawn_rules,
        offline_config: this.offlineConfig,
      },
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
          this.agents = this.agentManager.getStatus();
        }
      } catch (e) {
        console.log('[Nexus] Could not load agent configs from cloud, using local config');
      }
    } else {
      console.error('[Nexus] Registration failed:', regResult.error || 'unknown');
      throw new Error('Registration failed');
    }

    if (this.offlineMonitor) this.offlineMonitor.start();

    // 2. Start heartbeat
    this._startHeartbeat();
    
    // 3. Start polling for tasks
    this._startTaskPoll();

    // 4. Start polling for live node commands
    this._startCommandPoll();

    // 5. Start local dashboard server
    this._startDashboardServer();
    
    console.log(`[Nexus] Node "${this.name}" online. Listening on port ${this.port}`);
    return this;
  }

  async disconnect() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.commandTimer) clearInterval(this.commandTimer);
    if (this.healthServer) this.healthServer.close();
    if (this.offlineMonitor) this.offlineMonitor.stop();
    if (this.nodeId) {
      await this._apiCall('DELETE', `/api/v1/nexus/${this.nodeId}`);
    }
    console.log('[Nexus] Disconnected.');
  }

  _startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      try {
        this.agents = this.agentManager.getStatus();
        await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/connect`, {
          status: 'online',
          agents: this.agents,
          seats: this.agentManager.seatsInfo,
          memory: process.memoryUsage(),
          uptime: process.uptime(),
          mode: this.mode,
          client_name: this.clientName,
          filesystem_root: this.filesystemRoot,
        });
        if (this.offlineMonitor) this.offlineMonitor.onCloudContact();
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

  _startCommandPoll() {
    this.commandTimer = setInterval(async () => {
      if (this.commandPollInFlight) return;
      this.commandPollInFlight = true;
      try {
        const response = await this._apiCall('GET', `/api/v1/nexus/${this.nodeId}/commands?claim=1&limit=5`);
        const commands = response?.commands || [];
        for (const command of commands) {
          await this._executeCommand(command);
        }
      } catch (e) {
        // silent — will retry on next cycle
      } finally {
        this.commandPollInFlight = false;
      }
    }, this.config?.commandPollInterval || 2000);
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
    } catch (error) {
      tracked.status = 'failed';
      tracked.completedAt = new Date().toISOString();
      await this._updateTaskStatus(task.id, 'failed', { error: error.message });
      this.log(`[NEXUS] Task failed: ${task.title} — ${error.message}`);
    }
  }

  async _executeCommand(command) {
    const label = `${command.type} (${command.id})`;
    this.log(`[NEXUS] Executing command: ${label}`);

    try {
      await this._reportCommandProgress(command.id, {
        stage: 'claimed',
        message: `Executing ${command.type}`,
        elapsedMs: 0,
      });
      let result;
      if (command.type === 'spawn_agent') {
        const agentId = command.payload?.agentId;
        if (!agentId) throw new Error('agentId is required');
        const worker = await this.agentManager.spawnAgent(agentId);
        this.agents = this.agentManager.getStatus();
        result = {
          agent: {
            id: worker.id,
            name: worker.name,
            model: worker.model,
            status: worker.status,
            tasksCompleted: worker.tasksCompleted,
          },
          seats: this.agentManager.seatsInfo,
        };
      } else if (command.type === 'stop_agent') {
        const agentId = command.payload?.agentId;
        if (!agentId) throw new Error('agentId is required');
        this.agentManager.stopAgent(agentId);
        this.agents = this.agentManager.getStatus();
        result = {
          agentId,
          seats: this.agentManager.seatsInfo,
        };
      } else if (command.type === 'dispatch_action') {
        result = await this._dispatchNodeAction(command);
      } else {
        throw new Error(`Unsupported command type: ${command.type}`);
      }

      await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/commands/${command.id}/result`, {
        status: 'completed',
        result,
      });
      this.log(`[NEXUS] Command completed: ${label}`);
    } catch (error) {
      await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/commands/${command.id}/result`, {
        status: 'failed',
        error: error.message,
        result: error.result || null,
      }).catch(() => {});
      this.log(`[NEXUS] Command failed: ${label} — ${error.message}`);
    }
  }

  async _dispatchNodeAction(command) {
    const action = command.payload?.action;
    const args = command.payload?.args || {};
    const result = await this.taskOrchestrator.execute({
      taskId: command.id,
      action,
      params: args,
      agentId: this.nodeId || 'nexus-node',
      timestamp: new Date().toISOString(),
    }, {
      onProgress: (progress) => this._reportCommandProgress(command.id, progress),
    });

    if (result.status === 'error') {
      const error = new Error(
        typeof result.error === 'string'
          ? result.error
          : result.error?.message || 'Dispatch action failed'
      );
      error.result = result;
      throw error;
    }

    return result;
  }

  _syncPermissionSnapshot() {
    const perms = this.permissions || {};
    if (Array.isArray(perms.allowedFolders) || Array.isArray(perms.allowedActions)) {
      this.permissionEngine.replace({
        allowedFolders: perms.allowedFolders || [],
        allowedActions: perms.allowedActions || [],
      });
    }
  }

  async _reportCommandProgress(commandId, progress) {
    try {
      await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/commands/${commandId}/progress`, {
        progress,
      });
    } catch (_) {
      // Non-fatal; the final command result remains authoritative.
    }
  }

  log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
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
