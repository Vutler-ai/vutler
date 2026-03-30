'use strict';

const { LLMPromptHandler } = require('./LLMPromptHandler');

/**
 * @typedef {import('./LLMPromptHandler').SkillContext} SkillContext
 * @typedef {import('./LLMPromptHandler').SkillResult}  SkillResult
 */

/**
 * Handler for skills that require a third-party integration (CRM, calendar,
 * helpdesk, accounting, etc.).
 *
 * Execution flow:
 *  1. Check whether the required integration is connected for the workspace.
 *  2. If connected → dispatch to the appropriate adapter.
 *     (Adapters are stubs for now; they return a standard "not yet implemented"
 *      response so the plumbing is in place for future development.)
 *  3. If not connected → fall back to LLMPromptHandler so the agent can still
 *     produce a useful advisory/draft response.
 */
class IntegrationHandler {
  constructor() {
    this._llmFallback = new LLMPromptHandler();
  }

  /**
   * An integration skill can always execute — in the worst case it falls back
   * to LLM. Return true unconditionally; the fallback logic lives in execute().
   * @param {SkillContext} _context
   * @returns {Promise<boolean>}
   */
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
      // Transparent fallback — enrich the context with a hint so the LLM
      // knows it is operating in advisory mode (no live data).
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

    // Integration is connected — delegate to the adapter.
    return this._executeAdapter(context, integrationProvider);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Check whether the workspace has the given integration connected.
   * Currently queries the in-memory stub; replace with a DB lookup
   * against tenant_vutler.workspace_integrations when the table exists.
   *
   * @param {string} workspaceId
   * @param {string} integrationProvider
   * @returns {Promise<boolean>}
   */
  async _isIntegrationConnected(workspaceId, integrationProvider) {
    // TODO: Replace with DB query:
    //   SELECT 1 FROM tenant_vutler.workspace_integrations
    //   WHERE workspace_id = $1 AND provider = $2 AND status = 'connected'
    //
    // Returning false for now so all execution routes through the LLM fallback
    // until adapters are implemented.
    return false;
  }

  /**
   * Dispatch the skill to its integration adapter.
   * Each provider maps to an adapter module that will be implemented separately.
   *
   * @param {SkillContext} context
   * @param {string}       integrationProvider
   * @returns {Promise<SkillResult>}
   */
  async _executeAdapter(context, integrationProvider) {
    // Adapter registry — populated as adapters are built.
    const ADAPTERS = {
      // 'crm':            require('../adapters/CrmAdapter'),
      // 'email':          require('../adapters/EmailAdapter'),
      // 'social_media':   require('../adapters/SocialMediaAdapter'),
      // 'calendar':       require('../adapters/CalendarAdapter'),
      // 'helpdesk':       require('../adapters/HelpdeskAdapter'),
      // 'accounting':     require('../adapters/AccountingAdapter'),
      // 'project_management': require('../adapters/ProjectManagementAdapter'),
      // 'hris':           require('../adapters/HrisAdapter'),
      // 'erp':            require('../adapters/ErpAdapter'),
      // 'monitoring':     require('../adapters/MonitoringAdapter'),
      // 'event_platform': require('../adapters/EventPlatformAdapter'),
      // 'healthcare':     require('../adapters/HealthcareAdapter'),
      // 'consent_platform': require('../adapters/ConsentPlatformAdapter'),
      // 'workflow':       require('../adapters/WorkflowAdapter'),
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
      const data    = await adapter.execute(context);
      return {
        success: true,
        data,
        meta: {
          handler:              'integration',
          integration_provider: integrationProvider,
          skillKey:             context.skillKey,
        },
      };
    } catch (err) {
      return {
        success: false,
        error:   `Integration adapter "${integrationProvider}" threw an error: ${err.message}`,
      };
    }
  }
}

module.exports = { IntegrationHandler };
