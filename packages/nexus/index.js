const WebSocket = require('ws');
const https = require('https');
const http = require('http');
const { createDashboardServer } = require('./dashboard/server');
const AgentManager = require('./lib/agent-manager');
const { TaskOrchestrator } = require('./lib/task-orchestrator');
const { getPermissionEngine } = require('./lib/permission-engine');
const { ProfileRegistry } = require('./lib/profile-registry');
const { EnterprisePolicyEngine } = require('./lib/enterprise-policy-engine');
const { LocalIntegrationBridge } = require('./lib/local-integration-bridge');
const { EnterpriseActionExecutor } = require('./lib/enterprise-action-executor');
const { buildRuntimeConfigFromToken, writeRuntimeConfig } = require('./lib/runtime-config');

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
      const { TerminalSessionProvider } = require('./lib/providers/terminal-session');
      const { EnvProvider } = require('./lib/providers/env');
      const { NetworkProvider } = require('./lib/providers/network');
      const { LLMProvider } = require('./lib/providers/llm');
      const { AVControlProvider } = require('./lib/providers/av-control');
      const { ClipboardProvider } = require('./lib/providers/clipboard');
      const { WorkspaceEmailProvider } = require('./lib/providers/workspace-email');
      const { WorkspaceMailProvider } = require('./lib/providers/workspace-mail');

      const perms = this.permissions;
      this.providers.fs = new FilesystemProvider(perms.filesystem || {});
      this.providers.shell = new ShellProvider(perms.shell || {});
      this.providers.terminal = new TerminalSessionProvider(perms.shell || {}, {
        defaultCwd: this.filesystemRoot || undefined,
      });
      this.providers.env = new EnvProvider(perms.env || {});
      this.providers.network = new NetworkProvider(perms.network || {});
      this.providers.llm = new LLMProvider(opts.llm || {});
      this.providers.av = new AVControlProvider(perms.av || { subnets: perms.network?.subnets });
      this.providers.clipboard = new ClipboardProvider();
      this.providers.workspaceEmail = new WorkspaceEmailProvider({
        server: this.server,
        apiKey: this.key,
      });
      this.providers.workspaceMail = new WorkspaceMailProvider({
        server: this.server,
        apiKey: this.key,
      });

      const workspaceBacked = this.mode === 'enterprise' || this.type === 'docker';
      if (workspaceBacked) {
        const sharedConfig = { server: this.server, apiKey: this.key };
        const { WorkspaceCalendarProvider } = require('./lib/providers/workspace-calendar');
        const { WorkspaceContactsProvider } = require('./lib/providers/workspace-contacts');
        const { WorkspaceDriveProvider } = require('./lib/providers/workspace-drive');
        const { WorkspaceKnowledgeProvider } = require('./lib/providers/workspace-knowledge');
        const { WorkspaceJiraProvider } = require('./lib/providers/workspace-jira');
        const { WorkspaceEventSubscriptionsProvider } = require('./lib/providers/workspace-event-subscriptions');
        this.providers.mail = new WorkspaceMailProvider(sharedConfig);
        this.providers.calendar = new WorkspaceCalendarProvider(sharedConfig);
        this.providers.contacts = new WorkspaceContactsProvider(sharedConfig);
        this.providers.workspaceDrive = new WorkspaceDriveProvider(sharedConfig);
        this.providers.workspaceKnowledge = new WorkspaceKnowledgeProvider(sharedConfig);
        this.providers.workspaceJira = new WorkspaceJiraProvider(sharedConfig);
        this.providers.workspaceEventSubscriptions = new WorkspaceEventSubscriptionsProvider(sharedConfig);
      }
    }

    this.agentManager = new AgentManager({
      seats: opts.seats || 1,
      primary_agent: opts.primary_agent || opts.agents?.[0],
      routing_rules: opts.routing_rules || [],
      auto_spawn_rules: opts.auto_spawn_rules || [],
      available_pool: opts.available_pool || [],
      allow_create: opts.allow_create || false,
      enterprise_profile: opts.enterprise_profile || null,
      server: opts.server || process.env.VUTLER_SERVER || 'https://app.vutler.ai',
      key: opts.key || process.env.VUTLER_KEY,
    }, this.providers, null); // sniparaClient set after connect()

    this.reconnectInterval = 5000;
    this.recentTasks = [];
    this.logBuffer = [];
    this.commandPollInFlight = false;
    this.taskOrchestrator = new TaskOrchestrator(this.providers, null);
    this.permissionEngine = getPermissionEngine();
    this.profileRegistry = new ProfileRegistry({ server: this.server, apiKey: this.key });
    this.enterprisePolicyEngine = new EnterprisePolicyEngine(this.profileRegistry);
    this.localIntegrationBridge = new LocalIntegrationBridge(this.providers);
    this.enterpriseActionExecutor = new EnterpriseActionExecutor(this.providers);
    this.discoverySnapshot = opts.discovery_snapshot || opts.discoverySnapshot || null;
    this._connectPromise = null;
    this._syncPermissionSnapshot();

    // Offline monitor (enterprise only)
    this.offlineConfig = opts.offline_config || {};
    if (this.mode === 'enterprise' && this.offlineConfig.enabled) {
      const { OfflineMonitor } = require('./lib/offline-monitor');
      this.offlineMonitor = new OfflineMonitor(this, this.offlineConfig);
    }
  }

  async connect() {
    if (this._connectPromise) return this._connectPromise;
    if (this.nodeId && this.heartbeatTimer) return this;

    this._connectPromise = this._connectInternal();
    try {
      return await this._connectPromise;
    } finally {
      this._connectPromise = null;
    }
  }

  async _connectInternal() {
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
          enterprise_profile: this.config.enterprise_profile || null,
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
    this.providers.terminal?.shutdown?.();
    if (this.nodeId) {
      await this._apiCall('DELETE', `/api/v1/nexus/${this.nodeId}`);
    }
    console.log('[Nexus] Disconnected.');
  }

  startDashboardOnly() {
    this._startDashboardServer();
    this.log(`[NEXUS] Setup dashboard available on http://localhost:${this.port}`);
    return this;
  }

  configureFromDeployToken(token, overrides = {}) {
    const nextConfig = buildRuntimeConfigFromToken(token, {
      nodeName: overrides.nodeName || this.name,
      server: overrides.server || this.server,
      permissions: overrides.permissions || undefined,
    });

    writeRuntimeConfig(nextConfig);

    this.config = {
      ...this.config,
      seats: nextConfig.seats || this.config.seats,
      primary_agent: nextConfig.primary_agent || this.config.primary_agent,
      available_pool: nextConfig.available_pool || this.config.available_pool,
      allow_create: nextConfig.allow_create ?? this.config.allow_create,
      routing_rules: nextConfig.routing_rules || this.config.routing_rules,
      auto_spawn_rules: nextConfig.auto_spawn_rules || this.config.auto_spawn_rules,
      offline_config: nextConfig.offline_config || this.config.offline_config,
      deploy_token: nextConfig.deploy_token,
      permissions: nextConfig.permissions || this.config.permissions,
      server: nextConfig.server || this.config.server,
      key: nextConfig.api_key || nextConfig.deploy_token || this.config.key,
    };

    this.key = nextConfig.api_key || nextConfig.deploy_token || null;
    this.deployToken = nextConfig.deploy_token;
    this.server = nextConfig.server || this.server;
    this.name = nextConfig.node_name || this.name;
    this.mode = nextConfig.mode || this.mode;
    this.sniparaInstanceId = nextConfig.snipara_instance_id || this.sniparaInstanceId;
    this.clientName = nextConfig.client_name || this.clientName;
    this.filesystemRoot = nextConfig.filesystem_root || this.filesystemRoot;
    this.permissions = nextConfig.permissions || this.permissions;
    this.offlineConfig = nextConfig.offline_config || this.offlineConfig;

    this._syncPermissionSnapshot();
    this._syncRemoteClients();
    return nextConfig;
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
    if (action === 'enterprise_action') {
      return this._dispatchEnterpriseCatalogAction(command, args);
    }
    if (action === 'enterprise_local_api') {
      return this._dispatchEnterpriseLocalIntegration(command, args);
    }
    if (action === 'enterprise_helper') {
      return this._dispatchEnterpriseHelper(command, args);
    }
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

    if (action === 'discover_local_runtime' && result.status === 'completed') {
      this.discoverySnapshot = result.data?.snapshot || null;
    }

    return result;
  }

  _resolveWorkerProfile(agentId) {
    if (!agentId) return null;
    const worker = this.agentManager?.agents?.get(agentId);
    return worker?.enterpriseProfile || null;
  }

  _resolveExecutionProfile(agentId) {
    return this._resolveWorkerProfile(agentId)
      || this.config.enterprise_profile
      || null;
  }

  async _evaluateEnterpriseRequest(request, args) {
    const enterpriseProfile = this._resolveExecutionProfile(args.agentId || args.agent_id);
    const governance = await this.enterprisePolicyEngine.evaluate(request, enterpriseProfile);
    return {
      governance,
      enterpriseProfile,
    };
  }

  _buildGovernedOutcome(commandId, status, governance, data = null, extraMetadata = {}) {
    return {
      taskId: commandId,
      status,
      data,
      metadata: {
        action: governance.requestType,
        governance,
        ...extraMetadata,
      },
    };
  }

  _isApprovalBypassRequested(args = {}) {
    return args.bypassApproval === true
      || args.bypass_approval === true
      || args.governanceMode === 'full_access'
      || args.governance_mode === 'full_access'
      || args.governanceOverride?.mode === 'full_access';
  }

  async _fetchGovernanceApproval(approvalId) {
    const response = await this._apiCall('GET', `/api/v1/nexus/${this.nodeId}/governance/approvals/${approvalId}`);
    return response?.approval || null;
  }

  async _fetchGovernanceScope(scopeKey) {
    if (!scopeKey) return null;
    const encoded = encodeURIComponent(scopeKey);
    const response = await this._apiCall('GET', `/api/v1/nexus/${this.nodeId}/governance/scopes/resolve?scopeKey=${encoded}`);
    return response?.scope || null;
  }

  async _createGovernanceApproval(request = {}) {
    const response = await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/governance/approvals`, request);
    return response?.approval || null;
  }

  async _createGovernanceAuditEvent(event = {}) {
    await this._apiCall('POST', `/api/v1/nexus/${this.nodeId}/governance/audit`, event).catch(() => {});
  }

  async _markGovernanceApprovalRuntimeStatus(approvalId, status, executionCommandId = null) {
    if (!approvalId) return null;
    const response = await this._apiCall(
      'POST',
      `/api/v1/nexus/${this.nodeId}/governance/approvals/${approvalId}/runtime-status`,
      {
        status,
        executionCommandId,
      }
    ).catch(() => null);
    return response?.approval || null;
  }

  async _resolveGovernanceDecision(command, args, governance) {
    const approvalScopeKey = args.approvalScopeKey || args.approval_scope_key || null;
    if (approvalScopeKey) {
      const scope = await this._fetchGovernanceScope(approvalScopeKey);
      if (scope) {
        return {
          ...governance,
          decision: 'allow',
          originalDecision: governance.decision,
          approvalScopeKey,
          approvalScopeId: scope.id,
          scopeGrantValidated: true,
        };
      }
    }

    const approvalId = args.governanceApprovalId || args.governance_approval_id || null;
    if (approvalId) {
      const approval = await this._fetchGovernanceApproval(approvalId);
      if (!approval) {
        throw new Error(`Governance approval not found: ${approvalId}`);
      }
      if (approval.status !== 'approved' && approval.status !== 'executed') {
        throw new Error(`Governance approval is not approved: ${approvalId}`);
      }
      if (approval.requestType !== governance.requestType) {
        throw new Error(`Governance approval request type mismatch: ${approvalId}`);
      }
      const storedArgs = approval.requestPayload?.args || {};
      if (governance.requestType === 'catalog_action') {
        const requestedActionKey = storedArgs.actionKey || storedArgs.action_key;
        if (requestedActionKey && requestedActionKey !== governance.actionKey) {
          throw new Error(`Governance approval does not match action ${governance.actionKey}`);
        }
      }
      if (governance.requestType === 'local_integration') {
        const requestedIntegrationKey = storedArgs.integrationKey || storedArgs.integration_key;
        const requestedOperation = storedArgs.operation || null;
        if (requestedIntegrationKey && requestedIntegrationKey !== governance.integrationKey) {
          throw new Error(`Governance approval does not match local integration ${governance.integrationKey}`);
        }
        if (requestedOperation && requestedOperation !== governance.operation) {
          throw new Error(`Governance approval does not match local integration operation ${governance.operation}`);
        }
      }
      if (governance.requestType === 'helper_delegation') {
        const requestedHelperProfileKey = storedArgs.helperProfileKey || storedArgs.helper_profile_key;
        if (requestedHelperProfileKey && requestedHelperProfileKey !== governance.helperProfileKey) {
          throw new Error(`Governance approval does not match helper profile ${governance.helperProfileKey}`);
        }
      }
      return {
        ...governance,
        approvalId,
        decision: 'allow',
        originalDecision: governance.decision,
        approvalValidated: true,
      };
    }

    if (governance.decision === 'approval_required' && this._isApprovalBypassRequested(args)) {
      return {
        ...governance,
        decision: 'allow',
        originalDecision: 'approval_required',
        approvalBypassed: true,
      };
    }

    return governance;
  }

  _buildApprovalRequest(command, args, governance, title, summary) {
    return {
      commandId: command.id,
      requestType: governance.requestType,
      title,
      summary,
      profileKey: governance.profileKey,
      agentId: args.agentId || args.agent_id || this.nodeId || 'nexus-node',
      governance: {
        requestType: governance.requestType,
        profileKey: governance.profileKey,
        runtimeAction: command.payload?.action,
        decision: governance.decision,
        originalDecision: governance.originalDecision || null,
        toolClass: governance.toolClass || null,
        actionKey: governance.actionKey || null,
        integrationKey: governance.integrationKey || null,
        helperProfileKey: governance.helperProfileKey || null,
        agentId: args.agentId || args.agent_id || null,
      },
      requestPayload: {
        action: command.payload?.action,
        args,
      },
      scopeKey: args.approvalScopeKey || args.approval_scope_key || null,
      scopeMode: args.approvalScopeMode || args.approval_scope_mode || null,
      scopeExpiresAt: args.approvalScopeExpiresAt || args.approval_scope_expires_at || null,
    };
  }

  async _auditGovernance(command, args, governance, eventType, outcomeStatus, message, extraPayload = {}) {
    await this._createGovernanceAuditEvent({
      commandId: command.id,
      approvalId: governance.approvalId || null,
      agentId: args.agentId || args.agent_id || null,
      profileKey: governance.profileKey || null,
      requestType: governance.requestType,
      eventType,
      decision: governance.decision,
      outcomeStatus,
      message,
      payload: {
        governance,
        args,
        ...extraPayload,
      },
    });
  }

  async _dispatchEnterpriseCatalogAction(command, args = {}) {
    const request = {
      requestType: 'catalog_action',
      actionKey: args.actionKey || args.action_key,
      requestSource: args.requestSource || args.request_source || 'chat',
    };
    const { governance: rawGovernance } = await this._evaluateEnterpriseRequest(request, args);
    const governance = await this._resolveGovernanceDecision(command, args, rawGovernance);

    if (governance.decision === 'deny') {
      await this._auditGovernance(command, args, governance, 'policy_denied', 'denied', `Enterprise policy denied action ${governance.actionKey}`);
      throw new Error(`Enterprise policy denied action ${governance.actionKey}`);
    }
    if (governance.decision === 'dry_run') {
      await this._auditGovernance(command, args, governance, 'policy_dry_run', 'dry_run', `Enterprise policy resolved ${governance.actionKey} to dry_run`);
      return this._buildGovernedOutcome(command.id, 'dry_run', governance, {
        message: `Enterprise policy resolved ${governance.actionKey} to dry_run`,
        execution: args.execution || null,
      });
    }
    if (governance.decision === 'approval_required') {
      const approval = await this._createGovernanceApproval(
        this._buildApprovalRequest(
          command,
          args,
          governance,
          `Approval required: ${governance.actionKey}`,
          `Action ${governance.actionKey} requires user approval before execution.`
        )
      );
      const governedWithApproval = { ...governance, approvalId: approval?.id || null };
      await this._auditGovernance(command, args, governedWithApproval, 'approval_requested', 'pending', `Approval requested for action ${governance.actionKey}`, { approval });
      return this._buildGovernedOutcome(command.id, 'approval_required', governedWithApproval, {
        message: `Enterprise policy requires approval before executing ${governance.actionKey}`,
        approvalId: approval?.id || null,
      });
    }
    if (governance.approvalBypassed) {
      await this._auditGovernance(command, args, governance, 'approval_bypassed', 'allow', `Approval bypassed for action ${governance.actionKey}`);
    } else if (governance.scopeGrantValidated) {
      await this._auditGovernance(command, args, governance, 'scope_validated', 'allow', `Process scope validated for action ${governance.actionKey}`);
    } else if (governance.approvalValidated) {
      await this._auditGovernance(command, args, governance, 'approval_validated', 'allow', `Approved execution resumed for action ${governance.actionKey}`);
    }

    const execution = args.execution || {};
    if (!execution.action) {
      const enterpriseExecution = await this.enterpriseActionExecutor.execute({
        actionKey: governance.actionKey,
        args,
        governance,
        commandId: command.id,
        nodeId: this.nodeId,
      }, {
        onProgress: (progress) => this._reportCommandProgress(command.id, progress),
      });

      if (!enterpriseExecution.handled) {
        await this._auditGovernance(command, args, governance, 'execution_completed', 'completed', `Enterprise action ${governance.actionKey} completed without bound runtime execution`);
        if (governance.approvalId) {
          await this._markGovernanceApprovalRuntimeStatus(governance.approvalId, 'executed', command.id);
        }
        return this._buildGovernedOutcome(command.id, 'completed', governance, {
          message: `Enterprise action ${governance.actionKey} approved with no bound runtime execution`,
        });
      }

      const actionResult = {
        taskId: command.id,
        status: enterpriseExecution.result.status || 'completed',
        data: enterpriseExecution.result.data || {},
        metadata: {
          ...(enterpriseExecution.result.metadata || {}),
          governance,
          action: 'enterprise_action',
          enterpriseActionKey: governance.actionKey,
        },
      };

      if (actionResult.status === 'completed') {
        await this._auditGovernance(command, args, governance, 'execution_completed', 'completed', `Enterprise action ${governance.actionKey} executed successfully`, { result: actionResult });
        if (governance.approvalId) {
          await this._markGovernanceApprovalRuntimeStatus(governance.approvalId, 'executed', command.id);
        }
      } else {
        await this._auditGovernance(command, args, governance, 'execution_failed', actionResult.status, `Enterprise action ${governance.actionKey} execution failed`, { result: actionResult });
      }

      return actionResult;
    }

    const result = await this.taskOrchestrator.execute({
      taskId: command.id,
      action: execution.action,
      params: execution.params || {},
      agentId: args.agentId || args.agent_id || this.nodeId || 'nexus-node',
      timestamp: new Date().toISOString(),
    }, {
      onProgress: (progress) => this._reportCommandProgress(command.id, progress),
    });

    result.metadata = {
      ...(result.metadata || {}),
      governance,
    };
    if (result.status === 'completed') {
      await this._auditGovernance(command, args, governance, 'execution_completed', 'completed', `Enterprise action ${governance.actionKey} executed successfully`, { result });
      if (governance.approvalId) {
        await this._markGovernanceApprovalRuntimeStatus(governance.approvalId, 'executed', command.id);
      }
    } else {
      await this._auditGovernance(command, args, governance, 'execution_failed', result.status, `Enterprise action ${governance.actionKey} execution failed`, { result });
    }
    return result;
  }

  async _dispatchEnterpriseLocalIntegration(command, args = {}) {
    const request = {
      requestType: 'local_integration',
      integrationKey: args.integrationKey || args.integration_key,
      operation: args.operation,
      defaultDecision: args.defaultDecision || args.default_decision,
    };
    const { governance: rawGovernance } = await this._evaluateEnterpriseRequest(request, args);
    const governance = await this._resolveGovernanceDecision(command, args, rawGovernance);

    if (governance.decision === 'deny') {
      await this._auditGovernance(command, args, governance, 'policy_denied', 'denied', `Enterprise policy denied local integration ${governance.integrationKey}`);
      throw new Error(`Enterprise policy denied local integration ${governance.integrationKey}`);
    }
    if (governance.decision === 'dry_run') {
      await this._auditGovernance(command, args, governance, 'policy_dry_run', 'dry_run', `Enterprise policy resolved local integration ${governance.integrationKey} to dry_run`);
      return this._buildGovernedOutcome(command.id, 'dry_run', governance, {
        message: `Enterprise policy resolved local integration ${governance.integrationKey} to dry_run`,
        request: args.request || null,
      });
    }
    if (governance.decision === 'approval_required') {
      const approval = await this._createGovernanceApproval(
        this._buildApprovalRequest(
          command,
          args,
          governance,
          `Approval required: ${governance.integrationKey}`,
          `Local integration ${governance.integrationKey} requires user approval before invocation.`
        )
      );
      const governedWithApproval = { ...governance, approvalId: approval?.id || null };
      await this._auditGovernance(command, args, governedWithApproval, 'approval_requested', 'pending', `Approval requested for local integration ${governance.integrationKey}`, { approval });
      return this._buildGovernedOutcome(command.id, 'approval_required', governedWithApproval, {
        message: `Enterprise policy requires approval before invoking ${governance.integrationKey}`,
        approvalId: approval?.id || null,
      });
    }
    if (governance.approvalBypassed) {
      await this._auditGovernance(command, args, governance, 'approval_bypassed', 'allow', `Approval bypassed for local integration ${governance.integrationKey}`);
    } else if (governance.scopeGrantValidated) {
      await this._auditGovernance(command, args, governance, 'scope_validated', 'allow', `Process scope validated for local integration ${governance.integrationKey}`);
    } else if (governance.approvalValidated) {
      await this._auditGovernance(command, args, governance, 'approval_validated', 'allow', `Approved execution resumed for local integration ${governance.integrationKey}`);
    }

    const response = await this.localIntegrationBridge.invoke(args.request || {});
    await this._auditGovernance(command, args, governance, 'execution_completed', 'completed', `Local integration ${governance.integrationKey} executed successfully`, { response });
    if (governance.approvalId) {
      await this._markGovernanceApprovalRuntimeStatus(governance.approvalId, 'executed', command.id);
    }
    return this._buildGovernedOutcome(command.id, 'completed', governance, {
      integrationKey: governance.integrationKey,
      operation: governance.operation,
      response,
    });
  }

  _findHelperWorker(helperProfileKey, helperAgentId) {
    if (helperAgentId) {
      return this.agentManager?.agents?.get(helperAgentId) || null;
    }

    for (const worker of this.agentManager?.agents?.values?.() || []) {
      if (worker.profileKey === helperProfileKey) {
        return worker;
      }
    }

    return null;
  }

  async _resolveHelperWorker(helperProfileKey, helperAgentId) {
    let worker = this._findHelperWorker(helperProfileKey, helperAgentId);
    if (worker) return worker;

    if (helperAgentId) {
      worker = await this.agentManager.spawnAgent(helperAgentId);
      if (worker?.profileKey && worker.profileKey !== helperProfileKey) {
        throw new Error(`Spawned helper agent profile mismatch: expected ${helperProfileKey}, got ${worker.profileKey}`);
      }
      return worker;
    }

    return null;
  }

  async _dispatchEnterpriseHelper(command, args = {}) {
    const request = {
      requestType: 'helper_delegation',
      helperProfileKey: args.helperProfileKey || args.helper_profile_key,
      reason: args.reason || null,
    };
    const { governance: rawGovernance } = await this._evaluateEnterpriseRequest(request, args);
    const governance = await this._resolveGovernanceDecision(command, args, rawGovernance);

    if (governance.decision === 'deny') {
      await this._auditGovernance(command, args, governance, 'policy_denied', 'denied', `Enterprise policy denied helper delegation to ${governance.helperProfileKey}`);
      throw new Error(`Enterprise policy denied helper delegation to ${governance.helperProfileKey}`);
    }
    if (governance.decision === 'dry_run') {
      await this._auditGovernance(command, args, governance, 'policy_dry_run', 'dry_run', `Enterprise policy resolved helper delegation to ${governance.helperProfileKey} to dry_run`);
      return this._buildGovernedOutcome(command.id, 'dry_run', governance, {
        message: `Enterprise policy resolved helper delegation to ${governance.helperProfileKey} to dry_run`,
      });
    }
    if (governance.decision === 'approval_required') {
      const approval = await this._createGovernanceApproval(
        this._buildApprovalRequest(
          command,
          args,
          governance,
          `Approval required: ${governance.helperProfileKey}`,
          `Helper delegation to ${governance.helperProfileKey} requires user approval before execution.`
        )
      );
      const governedWithApproval = { ...governance, approvalId: approval?.id || null };
      await this._auditGovernance(command, args, governedWithApproval, 'approval_requested', 'pending', `Approval requested for helper delegation to ${governance.helperProfileKey}`, { approval });
      return this._buildGovernedOutcome(command.id, 'approval_required', governedWithApproval, {
        message: `Enterprise policy requires approval before delegating to ${governance.helperProfileKey}`,
        approvalId: approval?.id || null,
      });
    }
    if (governance.approvalBypassed) {
      await this._auditGovernance(command, args, governance, 'approval_bypassed', 'allow', `Approval bypassed for helper delegation to ${governance.helperProfileKey}`);
    } else if (governance.scopeGrantValidated) {
      await this._auditGovernance(command, args, governance, 'scope_validated', 'allow', `Process scope validated for helper delegation to ${governance.helperProfileKey}`);
    } else if (governance.approvalValidated) {
      await this._auditGovernance(command, args, governance, 'approval_validated', 'allow', `Approved execution resumed for helper delegation to ${governance.helperProfileKey}`);
    }

    const helperWorker = await this._resolveHelperWorker(
      governance.helperProfileKey,
      args.helperAgentId || args.helper_agent_id
    );
    if (!helperWorker) {
      throw new Error(`No active helper agent available for profile ${governance.helperProfileKey}`);
    }

    const helperTask = {
      id: command.id,
      title: args.task?.title || args.taskTitle || `Delegated task for ${governance.helperProfileKey}`,
      description: args.task?.description || args.taskDescription || '',
      metadata: args.task?.metadata || {},
    };

    const helperResult = await helperWorker.execute(helperTask);
    if (!helperResult.success) {
      await this._auditGovernance(command, args, governance, 'execution_failed', 'failed', `Helper delegation to ${governance.helperProfileKey} failed`, { helperResult });
      throw new Error(helperResult.error || `Helper ${helperWorker.name} failed`);
    }
    await this._auditGovernance(command, args, governance, 'execution_completed', 'completed', `Helper delegation to ${governance.helperProfileKey} executed successfully`, { helperResult });
    if (governance.approvalId) {
      await this._markGovernanceApprovalRuntimeStatus(governance.approvalId, 'executed', command.id);
    }

    return this._buildGovernedOutcome(command.id, 'completed', governance, {
      helperAgentId: helperWorker.id,
      helperProfileKey: governance.helperProfileKey,
      output: helperResult.output,
      duration_ms: helperResult.duration_ms,
    });
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
    if (this.healthServer) return;
    this.healthServer = createDashboardServer(this);
    this.healthServer.listen(this.port);
  }

  _syncRemoteClients() {
    const syncProviderClient = (provider) => {
      if (!provider) return;
      if (provider.client) {
        provider.client.server = this.server;
        provider.client.apiKey = this.key;
      }
      if ('server' in provider) provider.server = this.server;
      if ('apiKey' in provider) provider.apiKey = this.key;
    };

    Object.values(this.providers || {}).forEach(syncProviderClient);
    this.agentManager.cloudApiUrl = this.server;
    this.agentManager.apiKey = this.key;
    this.agentManager.profileRegistry.server = this.server;
    this.agentManager.profileRegistry.apiKey = this.key;
    this.profileRegistry.server = this.server;
    this.profileRegistry.apiKey = this.key;
  }

  async _apiCall(method, path, body) {
    const url = new URL(path, this.server);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;
    
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
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
