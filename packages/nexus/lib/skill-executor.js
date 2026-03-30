'use strict';

/**
 * Local Skill Executor for Nexus nodes.
 * Maps skill keys to local provider calls without a WebSocket round-trip.
 */
class LocalSkillExecutor {
  constructor(providers) {
    this.providers = providers; // { fs, shell, network, documents, llm, ... }
    this._manifest = null;
  }

  _loadManifest() {
    if (!this._manifest) {
      try {
        this._manifest = require('../../../seeds/skill-handlers.json');
      } catch {
        this._manifest = {};
      }
    }
    return this._manifest;
  }

  async execute(skillKey, params) {
    const manifest = this._loadManifest();
    const config = manifest[skillKey];
    if (!config) return { success: false, error: `Unknown skill: ${skillKey}` };

    if (config.type === 'nexus_provider') {
      return this._executeNexusProvider(config, params);
    } else if (config.type === 'llm_prompt') {
      return this._executeLLMPrompt(config, params);
    } else {
      return { success: false, error: `Skill type "${config.type}" not supported locally` };
    }
  }

  async _executeNexusProvider(config, params) {
    const provider = this.providers[config.provider];
    if (!provider) return { success: false, error: `Provider "${config.provider}" not available` };

    // Execute each listed method and aggregate results
    const results = {};
    for (const method of config.methods || []) {
      if (typeof provider[method] !== 'function') {
        results[method] = { error: `Method "${method}" not found on provider` };
        continue;
      }
      try {
        results[method] = await provider[method](params);
      } catch (e) {
        results[method] = { error: e.message };
      }
    }
    return { success: true, data: results };
  }

  async _executeLLMPrompt(config, params) {
    // Use local LLM provider if available (e.g. Ollama)
    const llm = this.providers.llm;
    if (!llm) return { success: false, error: 'LLM provider not available locally' };

    const systemPrompt = `You are an expert at "${params.skill_key}". ${config.prompt_template || ''}\nRespond in JSON if possible.`;
    const userMessage = typeof params === 'string' ? params : JSON.stringify(params);

    try {
      const response = await llm.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ], { model: config.model_preference });
      return { success: true, data: response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

let _instance = null;

/**
 * Return a singleton LocalSkillExecutor.
 * Passing a new `providers` object forces re-instantiation.
 */
function getLocalSkillExecutor(providers) {
  if (!_instance || providers) _instance = new LocalSkillExecutor(providers);
  return _instance;
}

module.exports = { LocalSkillExecutor, getLocalSkillExecutor };
