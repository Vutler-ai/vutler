'use strict';

/**
 * @typedef {import('./LLMPromptHandler').SkillContext} SkillContext
 * @typedef {import('./LLMPromptHandler').SkillResult}  SkillResult
 */

/**
 * Handler for skills that map to local Nexus node capabilities.
 *
 * Two execution paths:
 *  1. Local   — context.nexusNode is populated; call the provider method directly
 *               via the nexusNode's in-process provider registry.
 *  2. Cloud   — no local node available; dispatch the request over WebSocket
 *               to a registered Nexus node for the workspace.
 *
 * Requires a connected Nexus node (`requires_nexus: true` in the manifest).
 * Falls back to the LLMPromptHandler when no Nexus node is reachable.
 */
class NexusProviderHandler {
  /**
   * @param {object} [wsConnections] - Map of workspaceId → active WebSocket connection
   *                                   Injected by the registry after Nexus init.
   */
  constructor(wsConnections) {
    /** @type {Map<string, object>} */
    this._wsConnections = wsConnections || new Map();
  }

  /**
   * Determine whether a Nexus node is available for this workspace.
   * @param {SkillContext} context
   * @returns {Promise<boolean>}
   */
  async canExecute(context) {
    const { workspaceId, nexusNode } = context;

    // Direct in-process node (e.g. running inside the Nexus agent)
    if (nexusNode) return true;

    // WebSocket-connected remote node
    const ws = this._wsConnections.get(workspaceId);
    if (ws && ws.readyState === 1 /* OPEN */) return true;

    return false;
  }

  /**
   * Execute the skill via a Nexus provider.
   * @param {SkillContext} context
   * @returns {Promise<SkillResult>}
   */
  async execute(context) {
    const { skillKey, params, config, workspaceId, nexusNode } = context;

    const provider = config.provider;
    const methods  = config.methods || [];

    if (!provider) {
      return { success: false, error: `NexusProviderHandler: no provider defined for skill "${skillKey}"` };
    }

    // ── Path 1: in-process local node ────────────────────────────────────────
    if (nexusNode) {
      return this._executeLocal(skillKey, nexusNode, provider, methods, params);
    }

    // ── Path 2: remote WebSocket dispatch ────────────────────────────────────
    const ws = this._wsConnections.get(workspaceId);
    if (ws && ws.readyState === 1) {
      return this._executeRemote(ws, skillKey, provider, methods, params);
    }

    return {
      success: false,
      error:   `NexusProviderHandler: no reachable Nexus node for workspace "${workspaceId}" (skill: "${skillKey}")`,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Call a Nexus provider method directly on the in-process node.
   * @param {string}   skillKey
   * @param {object}   nexusNode  - The in-process nexus node instance
   * @param {string}   provider
   * @param {string[]} methods
   * @param {object}   params
   * @returns {Promise<SkillResult>}
   */
  async _executeLocal(skillKey, nexusNode, provider, methods, params) {
    try {
      const providerInstance = nexusNode.providers?.[provider];
      if (!providerInstance) {
        return { success: false, error: `Local Nexus node has no provider "${provider}"` };
      }

      // Use the first method listed as the primary entry point
      const methodName = methods[0];
      if (!methodName || typeof providerInstance[methodName] !== 'function') {
        return {
          success: false,
          error:   `Provider "${provider}" does not expose method "${methodName}"`,
        };
      }

      const data = await providerInstance[methodName](params);
      return {
        success: true,
        data,
        meta: { handler: 'nexus_local', skillKey, provider, method: methodName },
      };
    } catch (err) {
      return { success: false, error: `Nexus local execution error: ${err.message}` };
    }
  }

  /**
   * Dispatch the skill execution over WebSocket to a remote Nexus node.
   * Uses a request/response pattern keyed by a unique requestId.
   * @param {object}   ws
   * @param {string}   skillKey
   * @param {string}   provider
   * @param {string[]} methods
   * @param {object}   params
   * @returns {Promise<SkillResult>}
   */
  _executeRemote(ws, skillKey, provider, methods, params) {
    return new Promise((resolve) => {
      const requestId = `skill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timeout   = 30_000; // 30 s

      const timer = setTimeout(() => {
        ws.off?.('message', onMessage);
        resolve({ success: false, error: `Nexus remote execution timed out for skill "${skillKey}"` });
      }, timeout);

      /**
       * Listen for the response matching our requestId.
       * @param {Buffer|string} raw
       */
      function onMessage(raw) {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

        if (msg.requestId !== requestId) return;

        clearTimeout(timer);
        ws.off?.('message', onMessage);

        if (msg.error) {
          resolve({ success: false, error: msg.error });
        } else {
          resolve({
            success: true,
            data:    msg.result,
            meta:    { handler: 'nexus_remote', skillKey, provider, method: methods[0] },
          });
        }
      }

      ws.on?.('message', onMessage);

      ws.send(JSON.stringify({
        type:      'skill_execute',
        requestId,
        skillKey,
        provider,
        methods,
        params,
      }));
    });
  }
}

module.exports = { NexusProviderHandler };
