'use strict';

function normalizeArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function matchesRule(match = {}, candidate = {}) {
  return Object.entries(match).every(([key, expected]) => {
    if (expected === undefined || expected === null) return true;
    return candidate[key] === expected;
  });
}

class EnterprisePolicyEngine {
  constructor(profileRegistry) {
    this.profileRegistry = profileRegistry;
  }

  async evaluate(request = {}, enterpriseProfile = null) {
    const profileKey = enterpriseProfile?.profile_key || enterpriseProfile?.profileKey || null;
    if (!profileKey) {
      return {
        governed: false,
        decision: 'allow',
        profileKey: null,
        profileVersion: null,
      };
    }

    const profileVersion = enterpriseProfile?.profile_version || enterpriseProfile?.profileVersion || undefined;
    const [profile, actionCatalog, policyBundle, localIntegrationRegistry, helperRules] = await Promise.all([
      this.profileRegistry.getProfile(profileKey, profileVersion),
      this.profileRegistry.getActionCatalog(profileKey, profileVersion),
      this.profileRegistry.getPolicyBundle(profileKey, profileVersion),
      this.profileRegistry.getLocalIntegrations(profileKey, profileVersion),
      this.profileRegistry.getHelperRules(profileKey, profileVersion),
    ]);

    if (!profile) {
      throw new Error(`Unknown enterprise profile: ${profileKey}`);
    }

    const context = {
      profile,
      actionCatalog,
      policyBundle,
      localIntegrationRegistry,
      helperRules,
      enterpriseProfile,
      request,
    };

    switch (request.requestType) {
      case 'catalog_action':
        return this._evaluateCatalogAction(context);
      case 'local_integration':
        return this._evaluateLocalIntegration(context);
      case 'helper_delegation':
        return this._evaluateHelperDelegation(context);
      default:
        throw new Error(`Unsupported enterprise request type: ${request.requestType}`);
    }
  }

  _evaluateCatalogAction(context) {
    const actionKey = context.request.actionKey || context.request.action_key;
    const actions = context.actionCatalog?.definition?.actions || [];
    const action = actions.find((item) => item.action_key === actionKey);
    if (!action) {
      throw new Error(`Enterprise action not found in catalog: ${actionKey}`);
    }

    const requestSource = context.request.requestSource || context.request.request_source || 'chat';
    const allowedSources = normalizeArray(action.allowed_request_sources);
    if (allowedSources.length > 0 && !allowedSources.includes(requestSource)) {
      throw new Error(`Request source ${requestSource} is not allowed for action ${actionKey}`);
    }

    const decision = this._resolveDecision({
      policyBundle: context.policyBundle,
      fallbackDecision: action.default_mode || 'deny',
      candidate: {
        tool_class: action.tool_class,
        risk_level: action.risk_level,
        action_key: action.action_key,
        request_source: requestSource,
      },
    });

    return {
      governed: true,
      requestType: 'catalog_action',
      decision,
      profileKey: context.profile.key,
      profileVersion: context.profile.version,
      requestSource,
      toolClass: action.tool_class,
      riskLevel: action.risk_level,
      actionKey: action.action_key,
      action,
    };
  }

  _evaluateLocalIntegration(context) {
    const integrationKey = context.request.integrationKey || context.request.integration_key;
    const operation = context.request.operation || null;
    const selectedIntegrations = normalizeArray(
      context.enterpriseProfile?.selected_local_integrations || context.enterpriseProfile?.selectedLocalIntegrations
    );
    if (selectedIntegrations.length > 0 && !selectedIntegrations.includes(integrationKey)) {
      throw new Error(`Local integration is not enabled for this node: ${integrationKey}`);
    }

    const integrations = context.localIntegrationRegistry?.definition?.integrations || [];
    const integration = integrations.find((item) => item.integration_key === integrationKey);
    if (!integration) {
      throw new Error(`Unknown local integration: ${integrationKey}`);
    }

    if (operation && Array.isArray(integration.operations) && integration.operations.length > 0 && !integration.operations.includes(operation)) {
      throw new Error(`Operation ${operation} is not allowed for local integration ${integrationKey}`);
    }

    const decision = this._resolveDecision({
      policyBundle: context.policyBundle,
      fallbackDecision: context.request.defaultDecision || context.request.default_decision || 'dry_run',
      candidate: {
        tool_class: integration.tool_class,
        integration_key: integration.integration_key,
        operation,
      },
    });

    return {
      governed: true,
      requestType: 'local_integration',
      decision,
      profileKey: context.profile.key,
      profileVersion: context.profile.version,
      toolClass: integration.tool_class,
      integrationKey: integration.integration_key,
      operation,
      integration,
    };
  }

  _evaluateHelperDelegation(context) {
    const helperProfileKey = context.request.helperProfileKey || context.request.helper_profile_key;
    const reason = context.request.reason || null;
    const selectedHelpers = normalizeArray(
      context.enterpriseProfile?.selected_helper_profiles || context.enterpriseProfile?.selectedHelperProfiles
    );
    if (selectedHelpers.length > 0 && !selectedHelpers.includes(helperProfileKey)) {
      throw new Error(`Helper profile is not enabled for this node: ${helperProfileKey}`);
    }

    const helpers = context.helperRules?.definition?.allowed_helpers || [];
    const helper = helpers.find((item) => item.profile_key === helperProfileKey);
    if (!helper) {
      throw new Error(`Helper profile not allowed: ${helperProfileKey}`);
    }

    const allowedReasons = normalizeArray(helper.allowed_reasons);
    if (reason && allowedReasons.length > 0 && !allowedReasons.includes(reason)) {
      throw new Error(`Reason ${reason} is not allowed for helper profile ${helperProfileKey}`);
    }

    const fallbackDecision = helper.mode === 'restricted' ? 'approval_required' : 'allow';

    return {
      governed: true,
      requestType: 'helper_delegation',
      decision: this._resolveDecision({
        policyBundle: context.policyBundle,
        fallbackDecision,
        candidate: {
          tool_class: 'helper_agent',
          helper_profile_key: helper.profile_key,
          helper_mode: helper.mode || 'restricted',
        },
      }),
      profileKey: context.profile.key,
      profileVersion: context.profile.version,
      helperProfileKey: helper.profile_key,
      helper,
      seatMode: helper.seat_mode || 'consumes_seat',
      reason,
      toolClass: 'helper_agent',
    };
  }

  _resolveDecision({ policyBundle, fallbackDecision, candidate }) {
    const rules = policyBundle?.definition?.default_rules || [];
    const matchedRule = rules.find((rule) => matchesRule(rule.match || {}, candidate));
    return matchedRule?.decision || fallbackDecision || 'deny';
  }
}

module.exports = { EnterprisePolicyEngine };
