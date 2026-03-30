'use strict';

const path = require('path');

/**
 * @typedef {import('./handlers/LLMPromptHandler').SkillContext} SkillContext
 * @typedef {import('./handlers/LLMPromptHandler').SkillResult}  SkillResult
 */

/**
 * @typedef {Object} ResolvedSkill
 * @property {object} handler - The handler instance that will execute the skill
 * @property {object} config  - The merged config for this skill (manifest + override)
 */

/**
 * @typedef {Object} OverrideCacheEntry
 * @property {object} config    - Override configuration
 * @property {number} expiresAt - Unix timestamp (ms) when this entry expires
 */

/** TTL for workspace-level overrides in milliseconds (60 s) */
const OVERRIDE_TTL_MS = 60_000;

/**
 * Central registry for all skill handlers.
 *
 * Responsibilities:
 *  - Register handler instances per type ('llm_prompt', 'nexus_provider', etc.)
 *  - Load and expose the skill-handlers.json manifest
 *  - Resolve the correct handler + merged config for any skill key
 *  - Apply workspace-level config overrides with a short TTL cache
 *  - Execute skills and wrap results in a standard SkillResult envelope
 *  - Generate tool definitions for use in LLM tool-calling (function schemas)
 *
 * Use `getSkillRegistry()` to obtain the singleton.
 */
class SkillRegistry {
  constructor() {
    /** @type {Map<string, object>} type → handler instance */
    this._handlers = new Map();

    /** @type {Record<string, object>} loaded from skill-handlers.json */
    this._manifest = {};

    /** @type {Record<string, object>} loaded from agent-skills.json (metadata) */
    this._skillMeta = {};

    /** @type {Map<string, OverrideCacheEntry>} workspaceId:skillKey → override config */
    this._overrideCache = new Map();

    /** @type {boolean} */
    this._loaded = false;
  }

  // ─── Registration ───────────────────────────────────────────────────────────

  /**
   * Register a handler for a given skill type.
   * @param {string} type    - e.g. 'llm_prompt', 'nexus_provider', 'integration', 'composite'
   * @param {object} handler - Handler instance implementing canExecute() and execute()
   */
  register(type, handler) {
    if (!type || typeof type !== 'string') throw new TypeError('register: type must be a non-empty string');
    if (!handler || typeof handler.execute !== 'function') {
      throw new TypeError(`register: handler for type "${type}" must implement execute(context)`);
    }
    this._handlers.set(type, handler);
    console.log(`[SkillRegistry] Registered handler for type "${type}"`);
  }

  // ─── Manifest loading ───────────────────────────────────────────────────────

  /**
   * Load the skill-handlers manifest and the skill metadata catalogue.
   * Safe to call multiple times — loads only once.
   */
  load() {
    if (this._loaded) return;

    const handlersPath = path.resolve(__dirname, '../../seeds/skill-handlers.json');
    const metaPath     = path.resolve(__dirname, '../../seeds/agent-skills.json');

    try {
      this._manifest  = require(handlersPath);
      console.log(`[SkillRegistry] Loaded manifest: ${Object.keys(this._manifest).length} skills`);
    } catch (err) {
      console.error('[SkillRegistry] Failed to load skill-handlers.json:', err.message);
    }

    try {
      this._skillMeta = require(metaPath);
    } catch (err) {
      console.warn('[SkillRegistry] Failed to load agent-skills.json (metadata only):', err.message);
    }

    this._loaded = true;
  }

  // ─── Resolution ─────────────────────────────────────────────────────────────

  /**
   * Resolve the handler and merged config for a skill.
   *
   * Priority:
   *  1. Workspace-level override (cache, TTL 60 s)
   *  2. Global manifest entry
   *
   * @param {string} skillKey
   * @param {string} workspaceId
   * @returns {ResolvedSkill|null}
   */
  resolve(skillKey, workspaceId) {
    // 1. Check workspace override cache
    const cacheKey  = `${workspaceId}:${skillKey}`;
    const cached    = this._overrideCache.get(cacheKey);

    if (cached) {
      if (Date.now() < cached.expiresAt) {
        const baseConfig = this._manifest[skillKey] || {};
        const mergedConfig = { ...baseConfig, ...cached.config };
        const handler = this._handlers.get(mergedConfig.type);
        if (handler) return { handler, config: mergedConfig };
      } else {
        this._overrideCache.delete(cacheKey);
      }
    }

    // 2. Global manifest
    const config = this._manifest[skillKey];
    if (!config) return null;

    const handler = this._handlers.get(config.type);
    if (!handler) {
      console.warn(`[SkillRegistry] No handler registered for type "${config.type}" (skill: "${skillKey}")`);
      return null;
    }

    return { handler, config };
  }

  /**
   * Store a workspace-level config override with TTL.
   * @param {string} workspaceId
   * @param {string} skillKey
   * @param {object} overrideConfig
   */
  setOverride(workspaceId, skillKey, overrideConfig) {
    const cacheKey = `${workspaceId}:${skillKey}`;
    this._overrideCache.set(cacheKey, {
      config:    overrideConfig,
      expiresAt: Date.now() + OVERRIDE_TTL_MS,
    });
  }

  /**
   * Invalidate a workspace-level override.
   * @param {string} workspaceId
   * @param {string} skillKey
   */
  clearOverride(workspaceId, skillKey) {
    this._overrideCache.delete(`${workspaceId}:${skillKey}`);
  }

  // ─── Execution ──────────────────────────────────────────────────────────────

  /**
   * Execute a skill for a given context.
   *
   * @param {string}       skillKey
   * @param {SkillContext} context
   * @returns {Promise<SkillResult>}
   */
  async execute(skillKey, context) {
    const startMs    = Date.now();
    const workspaceId = context.workspaceId || 'unknown';

    const resolved = this.resolve(skillKey, workspaceId);

    if (!resolved) {
      return {
        success: false,
        error:   `SkillRegistry: unknown skill "${skillKey}"`,
      };
    }

    const { handler, config } = resolved;

    // Enrich context with resolved data
    const enrichedContext = {
      ...context,
      skillKey,
      config,
      skillMeta: this._skillMeta[skillKey] || {},
    };

    // Optionally gate on canExecute
    if (typeof handler.canExecute === 'function') {
      let canRun;
      try {
        canRun = await handler.canExecute(enrichedContext);
      } catch (err) {
        canRun = false;
        console.warn(`[SkillRegistry] canExecute threw for "${skillKey}":`, err.message);
      }

      if (!canRun) {
        // Try fallback handler if configured
        if (config.fallback_type) {
          const fallbackHandler = this._handlers.get(config.fallback_type);
          if (fallbackHandler) {
            console.log(`[SkillRegistry] Primary handler unavailable for "${skillKey}", using fallback "${config.fallback_type}"`);
            const fallbackConfig  = { ...config, type: config.fallback_type };
            const fallbackContext = { ...enrichedContext, config: fallbackConfig };
            return this._runHandler(fallbackHandler, skillKey, fallbackContext, startMs, 'fallback');
          }
        }

        return {
          success: false,
          error:   `Skill "${skillKey}" handler cannot execute in current context and no fallback is available`,
        };
      }
    }

    return this._runHandler(handler, skillKey, enrichedContext, startMs, 'primary');
  }

  /**
   * @private
   */
  async _runHandler(handler, skillKey, context, startMs, mode) {
    let result;
    try {
      result = await handler.execute(context);
    } catch (err) {
      result = { success: false, error: `Handler threw an uncaught error for "${skillKey}": ${err.message}` };
    }

    const durationMs = Date.now() - startMs;

    // Log execution (non-blocking)
    this._logExecution(skillKey, context, result, durationMs, mode).catch(() => {});

    return {
      ...result,
      meta: {
        ...(result.meta || {}),
        execution_mode: mode,
        duration_ms:    durationMs,
      },
    };
  }

  /**
   * Lightweight execution log — extend this to write to DB or emit events.
   * @private
   */
  async _logExecution(skillKey, context, result, durationMs, mode) {
    const status = result.success ? 'success' : 'error';
    console.log(
      `[SkillRegistry] skill="${skillKey}" workspace="${context.workspaceId}" ` +
      `mode=${mode} status=${status} duration=${durationMs}ms`
    );
    // TODO: INSERT INTO tenant_vutler.skill_executions (...) when table is ready
  }

  // ─── Tool definitions ────────────────────────────────────────────────────────

  /**
   * Return OpenAI-compatible function tool definitions for a list of skill keys.
   * Used to inject agent skills into LLM tool-calling.
   *
   * @param {string[]} skillKeys
   * @returns {object[]} Array of tool definition objects
   */
  getSkillTools(skillKeys) {
    if (!Array.isArray(skillKeys)) return [];

    return skillKeys
      .map(key => {
        const config   = this._manifest[key];
        const meta     = this._skillMeta[key];
        if (!config || !meta) return null;

        return {
          type: 'function',
          function: {
            name:        `skill_${key}`,
            description: meta.description || `Execute the ${meta.name || key} skill`,
            parameters:  config.params_schema || { type: 'object', properties: {}, required: [] },
          },
        };
      })
      .filter(Boolean);
  }

  // ─── Introspection ───────────────────────────────────────────────────────────

  /**
   * List all registered skill keys.
   * @returns {string[]}
   */
  listSkills() {
    return Object.keys(this._manifest);
  }

  /**
   * Return the raw manifest entry for a skill key.
   * @param {string} skillKey
   * @returns {object|null}
   */
  getSkillConfig(skillKey) {
    return this._manifest[skillKey] || null;
  }

  /**
   * Return the metadata (name, description, category, icon) for a skill key.
   * @param {string} skillKey
   * @returns {object|null}
   */
  getSkillMeta(skillKey) {
    return this._skillMeta[skillKey] || null;
  }
}

module.exports = { SkillRegistry };
