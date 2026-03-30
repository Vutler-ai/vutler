'use strict';

/**
 * Skills Execution Engine — public entry point.
 *
 * Instantiates the SkillRegistry singleton, registers all four handler types,
 * and loads the skill-handlers manifest.
 *
 * Usage:
 *   const { getSkillRegistry } = require('./services/skills');
 *   const registry = getSkillRegistry();
 *   const result   = await registry.execute('lead_scoring', { workspaceId, params });
 */

const { SkillRegistry }        = require('./SkillRegistry');
const { LLMPromptHandler }     = require('./handlers/LLMPromptHandler');
const { NexusProviderHandler } = require('./handlers/NexusProviderHandler');
const { IntegrationHandler }   = require('./handlers/IntegrationHandler');
const { CompositeHandler }     = require('./handlers/CompositeHandler');

/** @type {SkillRegistry|null} */
let _registry = null;

/**
 * Return (and lazily create) the SkillRegistry singleton.
 *
 * Thread-safe for single-threaded Node.js. The registry is initialised once
 * and reused for the lifetime of the process.
 *
 * @param {object} [options]
 * @param {Map<string, object>} [options.wsConnections] - Active WebSocket connections
 *        keyed by workspaceId. Pass the same Map used by the Nexus WebSocket server
 *        so NexusProviderHandler can dispatch to remote nodes.
 *
 * @returns {SkillRegistry}
 */
function getSkillRegistry(options = {}) {
  if (_registry) return _registry;

  const registry = new SkillRegistry();

  // ── Register handlers ──────────────────────────────────────────────────────

  // 1. LLM Prompt — covers ~80% of skills (analysis, advisory, content generation)
  registry.register('llm_prompt', new LLMPromptHandler());

  // 2. Nexus Provider — local/remote node capabilities (network, fs, system)
  registry.register('nexus_provider', new NexusProviderHandler(options.wsConnections));

  // 3. Integration — third-party API integrations (CRM, calendar, helpdesk…)
  registry.register('integration', new IntegrationHandler());

  // 4. Composite — multi-step skill pipelines
  //    Uses a lazy getter to avoid the circular dependency:
  //    CompositeHandler needs registry.execute(), which isn't finalised yet.
  registry.register('composite', new CompositeHandler(() => _registry));

  // ── Load manifest ──────────────────────────────────────────────────────────
  registry.load();

  _registry = registry;

  console.log('[Skills] SkillRegistry initialised — handlers: llm_prompt, nexus_provider, integration, composite');

  return _registry;
}

/**
 * Replace the wsConnections Map on the NexusProviderHandler after init.
 * Call this once the WebSocket server is ready, if you didn't pass the map
 * at initialisation time.
 *
 * @param {Map<string, object>} wsConnections
 */
function setNexusWsConnections(wsConnections) {
  if (!_registry) {
    console.warn('[Skills] setNexusWsConnections called before registry init — connections will be set at init time');
    return;
  }
  const nexusHandler = _registry._handlers.get('nexus_provider');
  if (nexusHandler) {
    nexusHandler._wsConnections = wsConnections;
    console.log('[Skills] NexusProviderHandler wsConnections updated');
  }
}

module.exports = { getSkillRegistry, setNexusWsConnections };
