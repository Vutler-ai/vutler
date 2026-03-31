const AgentWorker = require('./agent-worker');
const { ProfileRegistry } = require('./profile-registry');
const { ProfileValidator } = require('./profile-validator');

class AgentManager {
  constructor(config, providers, sniparaClient) {
    this.agents = new Map();           // agentId → AgentWorker
    this.maxSeats = config.seats || 1;
    this.primaryAgent = config.primary_agent;
    this.routingRules = config.routing_rules || [];
    this.autoSpawnRules = config.auto_spawn_rules || [];
    this.availablePool = config.available_pool || [];
    this.allowCreate = config.allow_create || false;
    this.enterpriseProfile = config.enterprise_profile || null;
    this.providers = providers;
    this.sniparaClient = sniparaClient;
    this.cloudApiUrl = config.server;
    this.nodeId = null;
    this.apiKey = config.key;
    this.profileRegistry = new ProfileRegistry({ server: this.cloudApiUrl, apiKey: this.apiKey });
    this.profileValidator = new ProfileValidator(this.profileRegistry);
  }

  async _validateProfileConfig(agentConfig) {
    const result = await this.profileValidator.validate(agentConfig, this.enterpriseProfile);
    if (!result.valid) {
      throw new Error(result.reason || 'Invalid enterprise profile configuration');
    }

    return {
      ...agentConfig,
      enterprise_profile: result.enterpriseProfile || agentConfig.enterprise_profile || this.enterpriseProfile || null,
      profile_key: result.enterpriseProfile?.profile_key || agentConfig.profile_key,
      profile_version: result.enterpriseProfile?.profile_version || agentConfig.profile_version,
    };
  }

  async loadAgents(agentConfigs) {
    for (const cfg of agentConfigs) {
      if (this.agents.size >= this.maxSeats) {
        console.log(`[AgentManager] Seats full (${this.maxSeats}), skipping ${cfg.name}`);
        break;
      }
      let validatedConfig;
      try {
        validatedConfig = await this._validateProfileConfig(cfg);
      } catch (error) {
        console.warn(`[AgentManager] Skipping agent ${cfg.name || cfg.id}: ${error.message}`);
        continue;
      }
      const worker = new AgentWorker(validatedConfig, this.providers, this.sniparaClient);
      this.agents.set(validatedConfig.id, worker);
      console.log(`[AgentManager] Loaded agent: ${validatedConfig.name} (${validatedConfig.id})`);
    }
  }

  routeTask(task) {
    // 1. Check routing rules (pattern match on description/title)
    for (const rule of this.routingRules) {
      try {
        if ((task.description || task.title || '').match(new RegExp(rule.pattern, 'i'))) {
          const agent = this.agents.get(rule.agent_id);
          if (agent && agent.status !== 'busy') return agent;
        }
      } catch (e) { /* invalid regex, skip */ }
    }
    // 2. Check auto-spawn rules (enterprise: spawn if needed + seats available)
    for (const rule of this.autoSpawnRules) {
      if ((task.description || task.title || '').match(new RegExp(rule.trigger, 'i'))) {
        if (!this.agents.has(rule.spawn) && this.agents.size < this.maxSeats) {
          // Return null to signal "needs spawn" — caller handles async spawn
          return { needsSpawn: true, agentId: rule.spawn };
        }
        const agent = this.agents.get(rule.spawn);
        if (agent) return agent;
      }
    }
    // 3. Fallback to primary agent
    return this.agents.get(this.primaryAgent) || this.agents.values().next().value;
  }

  async spawnAgent(agentId) {
    if (this.agents.size >= this.maxSeats) throw new Error('No seats available');
    // Fetch config from cloud
    const response = await fetch(`${this.cloudApiUrl}/api/v1/nexus/${this.nodeId}/agent-configs/${agentId}`, {
      headers: { 'X-API-Key': this.apiKey }
    });
    if (!response.ok) throw new Error(`Failed to fetch agent config: ${response.status}`);
    const payload = await response.json();
    const config = await this._validateProfileConfig(payload?.agent || payload);
    const worker = new AgentWorker(config, this.providers, this.sniparaClient);
    this.agents.set(agentId, worker);
    console.log(`[AgentManager] Spawned agent: ${config.name} (${agentId})`);
    return worker;
  }

  async createAgent(definition) {
    if (!this.allowCreate) throw new Error('Agent creation not allowed on this node');
    if (this.agents.size >= this.maxSeats) throw new Error('No seats available');
    // POST to cloud to create the agent
    const response = await fetch(`${this.cloudApiUrl}/api/v1/nexus/${this.nodeId}/agents/create`, {
      method: 'POST',
      headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(definition)
    });
    if (!response.ok) throw new Error(`Failed to create agent: ${response.status}`);
    const payload = await response.json();
    const agent = await this._validateProfileConfig(payload?.agent || payload);
    const worker = new AgentWorker(agent, this.providers, this.sniparaClient);
    this.agents.set(agent.id, worker);
    console.log(`[AgentManager] Created new agent: ${agent.name} (${agent.id})`);
    return worker;
  }

  stopAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Agent not found');
    agent.status = 'stopped';
    this.agents.delete(agentId);
    console.log(`[AgentManager] Stopped agent: ${agent.name}`);
  }

  getStatus() {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      status: a.status,
      model: a.model,
      tasksCompleted: a.tasksCompleted,
      enterprise_profile: a.enterpriseProfile || undefined,
      profile_key: a.profileKey || undefined,
      profile_version: a.profileVersion || undefined,
    }));
  }

  get seatsInfo() {
    return { max: this.maxSeats, used: this.agents.size, available: this.maxSeats - this.agents.size };
  }
}

module.exports = AgentManager;
