'use strict';

const { LLMPromptHandler } = require('./LLMPromptHandler');
const { isGoogleConnected, agentHasGoogleAccess } = require('../../google/tokenManager');

/**
 * @typedef {import('./LLMPromptHandler').SkillContext} SkillContext
 * @typedef {import('./LLMPromptHandler').SkillResult}  SkillResult
 */

/**
 * Maps skill-level integration_provider names to the DB provider name.
 * Skills use semantic names (calendar, email, drive) but tokens are stored
 * under a single 'google' provider row.
 */
const PROVIDER_MAP = {
  calendar: 'google',
  email:    'google',
  drive:    'google',
};

/**
 * Handler for skills that require a third-party integration (CRM, calendar,
 * helpdesk, accounting, etc.).
 *
 * Execution flow:
 *  1. Check whether the required integration is connected for the workspace.
 *  2. Verify the agent has been granted access to this integration.
 *  3. If connected + authorized → dispatch to the appropriate adapter.
 *  4. If not connected → fall back to LLMPromptHandler so the agent can still
 *     produce a useful advisory/draft response.
 */
class IntegrationHandler {
  constructor() {
    this._llmFallback = new LLMPromptHandler();
  }

  async canExecute(_context) {
    return true;
  }

  /**
   * @param {SkillContext} context
   * @returns {Promise<SkillResult>}
   */
  async execute(context) {
    const { skillKey, workspaceId, config } = context;
    const integrationProvider = config.integration_provider;

    if (!integrationProvider) {
      return {
        success: false,
        error: `IntegrationHandler: no integration_provider defined for skill "${skillKey}"`,
      };
    }

    const isConnected = await this._isIntegrationConnected(workspaceId, integrationProvider);

    if (!isConnected) {
      const fallbackContext = {
        ...context,
        params: {
          ...context.params,
          _integration_unavailable: true,
          _integration_provider:   integrationProvider,
        },
      };

      const fallbackResult = await this._llmFallback.execute(fallbackContext);

      return {
        ...fallbackResult,
        meta: {
          ...(fallbackResult.meta || {}),
          handler:            'integration_fallback_llm',
          integration_provider: integrationProvider,
          fallback_reason:    `Integration "${integrationProvider}" not connected for workspace "${workspaceId}"`,
        },
      };
    }

    // Check per-agent access
    const agentId = context.agentId;
    if (agentId) {
      const dbProvider = PROVIDER_MAP[integrationProvider] || integrationProvider;
      const hasAccess = await this._checkAgentAccess(workspaceId, agentId, dbProvider);
      if (!hasAccess) {
        return {
          success: false,
          error: `Agent does not have access to the "${integrationProvider}" integration. Grant access in Settings > Integrations > Agents.`,
          meta: {
            handler: 'integration',
            integration_provider: integrationProvider,
            reason: 'agent_access_denied',
          },
        };
      }
    }

    return this._executeAdapter(context, integrationProvider);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Check whether the workspace has the given integration connected.
   */
  async _isIntegrationConnected(workspaceId, integrationProvider) {
    const dbProvider = PROVIDER_MAP[integrationProvider];

    if (dbProvider === 'google') {
      return isGoogleConnected(workspaceId);
    }

    // For unmapped providers, not yet implemented
    return false;
  }

  /**
   * Check per-agent access to a specific integration provider.
   */
  async _checkAgentAccess(workspaceId, agentId, dbProvider) {
    if (dbProvider === 'google') {
      return agentHasGoogleAccess(workspaceId, agentId);
    }
    return false;
  }

  /**
   * Dispatch the skill to its integration adapter.
   */
  async _executeAdapter(context, integrationProvider) {
    const ADAPTERS = {
      'calendar': require('../adapters/CalendarAdapter').CalendarAdapter,
      'email':    require('../adapters/GmailAdapter').GmailAdapter,
      'drive':    require('../adapters/DriveAdapter').DriveAdapter,
    };

    const AdapterClass = ADAPTERS[integrationProvider];

    if (!AdapterClass) {
      return {
        success: false,
        data:    null,
        error:   `Integration adapter for "${integrationProvider}" is not yet implemented. ` +
                 `Skill "${context.skillKey}" requires this integration to be built.`,
        meta: {
          handler:              'integration',
          integration_provider: integrationProvider,
          adapter_status:       'not_implemented',
        },
      };
    }

    try {
      const adapter = new AdapterClass();
      const result  = await adapter.execute(context);
      return {
        ...result,
        meta: {
          ...(result.meta || {}),
          handler:              'integration',
          integration_provider: integrationProvider,
          skillKey:             context.skillKey,
        },
      };
    } catch (err) {
      return {
        success: false,
        error:   `Integration adapter "${integrationProvider}" threw an error: ${err.message}`,
        meta: {
          handler:              'integration',
          integration_provider: integrationProvider,
          error_type:           err.constructor.name,
        },
      };
    }
  }
}

module.exports = { IntegrationHandler };
