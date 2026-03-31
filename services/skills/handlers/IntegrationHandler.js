'use strict';

const pool = require('../../../lib/vaultbrix');
const { LLMPromptHandler } = require('./LLMPromptHandler');
const { isGoogleConnected } = require('../../google/tokenManager');
const { hasAgentIntegrationAccess } = require('../../agentIntegrationService');

const SCHEMA = 'tenant_vutler';
const LEGACY_PROVIDER_MAP = {
  calendar: 'google_calendar',
  drive: 'workspace_drive',
};
const CONNECTION_PROVIDER_ALIASES = {
  email: 'google',
  google_calendar: 'google',
  google_drive: 'google',
  workspace_drive: 'workspace',
};
const ADAPTERS = {
  email: require('../adapters/GmailAdapter').GmailAdapter,
  google_calendar: require('../adapters/GoogleCalendarAdapter').GoogleCalendarAdapter,
  google_drive: require('../adapters/GoogleDriveAdapter').GoogleDriveAdapter,
  workspace_drive: require('../adapters/WorkspaceDriveAdapter').WorkspaceDriveAdapter,
  project_management: require('../adapters/ProjectManagementAdapter').ProjectManagementAdapter,
};

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
    const requestedProvider = config.integration_provider;
    const integrationProvider = this._resolveIntegrationProvider(skillKey, requestedProvider);
    const startedAt = Date.now();

    if (!integrationProvider) {
      return {
        success: false,
        error: `IntegrationHandler: no integration_provider defined for skill "${skillKey}"`,
      };
    }

    const isConnected = await this._isIntegrationConnected(workspaceId, integrationProvider, context.agentId);

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
      await this._logExecution({
        workspaceId,
        integrationProvider,
        skillKey,
        status: fallbackResult.success ? 'fallback' : 'error',
        durationMs: Date.now() - startedAt,
        payload: {
          fallback: true,
          agentId: context.agentId || null,
          chatActionRunId: context.chatActionRunId || null,
          requestedProvider: requestedProvider || null,
        },
        errorMessage: fallbackResult.success ? null : fallbackResult.error || null,
      });

      return {
        ...fallbackResult,
        meta: {
          ...(fallbackResult.meta || {}),
          handler: 'integration_fallback_llm',
          integration_provider: integrationProvider,
          requested_provider: requestedProvider,
          fallback_reason: `Integration "${integrationProvider}" not connected for workspace "${workspaceId}"`,
        },
      };
    }

    // Integration is connected — delegate to the adapter.
    const adapterResult = await this._executeAdapter(context, integrationProvider);
    await this._logExecution({
      workspaceId,
      integrationProvider,
      skillKey,
      status: adapterResult.success ? 'success' : 'error',
      durationMs: Date.now() - startedAt,
      payload: {
        fallback: false,
        agentId: context.agentId || null,
        params: context.params || {},
        chatActionRunId: context.chatActionRunId || null,
        requestedProvider: requestedProvider || null,
      },
      errorMessage: adapterResult.success ? null : adapterResult.error || null,
    });
    return adapterResult;
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
  async _isIntegrationConnected(workspaceId, integrationProvider, agentId) {
    if (!workspaceId || !integrationProvider) return false;
    if (integrationProvider === 'workspace_drive') return true;
    if (integrationProvider === 'project_management') return true;

    const provider = CONNECTION_PROVIDER_ALIASES[integrationProvider] || integrationProvider;

    if (provider === 'google') {
      const connected = await isGoogleConnected(workspaceId);
      if (!connected) return false;
      return hasAgentIntegrationAccess(workspaceId, agentId, provider).catch(() => false);
    }

    const result = await pool.query(
      `SELECT 1
       FROM ${SCHEMA}.workspace_integrations
       WHERE workspace_id = $1
         AND provider = $2
         AND connected = TRUE
       LIMIT 1`,
      [workspaceId, provider]
    );
    if (result.rows.length === 0) return false;
    return hasAgentIntegrationAccess(workspaceId, agentId, provider).catch(() => false);
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
      const result = await adapter.execute(context);
      return {
        success: result?.success !== false,
        data: result?.data !== undefined ? result.data : result,
        error: result?.success === false ? result.error : undefined,
        meta: {
          handler: 'integration',
          integration_provider: integrationProvider,
          skillKey: context.skillKey,
        },
      };
    } catch (err) {
      return {
        success: false,
        error:   `Integration adapter "${integrationProvider}" threw an error: ${err.message}`,
      };
    }
  }

  async _logExecution({ workspaceId, integrationProvider, skillKey, status, durationMs, payload, errorMessage }) {
    try {
      await pool.query(
        `INSERT INTO ${SCHEMA}.workspace_integration_logs
          (workspace_id, provider, action, status, duration_ms, error_message, payload, chat_action_run_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NOW())`,
        [
          workspaceId,
          CONNECTION_PROVIDER_ALIASES[integrationProvider] || integrationProvider,
          skillKey,
          status,
          durationMs || null,
          errorMessage || null,
          JSON.stringify(payload || {}),
          payload?.chatActionRunId || null,
        ]
      );
    } catch (_) {}
  }

  _resolveIntegrationProvider(_skillKey, integrationProvider) {
    if (!integrationProvider) return integrationProvider;
    return LEGACY_PROVIDER_MAP[integrationProvider] || integrationProvider;
  }
}

module.exports = { IntegrationHandler };
