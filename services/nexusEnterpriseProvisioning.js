const {
  getProfile,
  listCapabilities,
  getActiveMatrix,
  getLocalIntegrationRegistry,
  getHelperRules,
} = require('./nexusEnterpriseRegistry');

function assert(condition, message, statusCode = 400) {
  if (!condition) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : [];
}

function riskPostureForLevel(level) {
  if (level === 1) return 'administrative';
  if (level === 2) return 'operational';
  return 'technical_privileged';
}

function classifyCapability(levelConfig, riskClass) {
  if ((levelConfig.denied_capability_risk_classes || []).includes(riskClass)) return 'denied';
  if ((levelConfig.restricted_capability_risk_classes || []).includes(riskClass)) return 'restricted';
  if ((levelConfig.allowed_capability_risk_classes || []).includes(riskClass)) return 'allowed';
  return 'restricted';
}

async function validateProfileSelection(input = {}) {
  const profileKey = typeof input.profileKey === 'string' ? input.profileKey.trim() : '';
  assert(profileKey, 'profileKey is required');

  const profile = await getProfile(profileKey, input.profileVersion);
  assert(profile, `Unknown profile: ${profileKey}`, 404);

  const [capabilities, matrix, localIntegrationRegistry, helperRules] = await Promise.all([
    listCapabilities(),
    getActiveMatrix(),
    getLocalIntegrationRegistry(profile.key, input.profileVersion),
    getHelperRules(profile.key, input.profileVersion),
  ]);

  assert(matrix, 'No active agent level matrix found', 500);

  const level = Number(profile.definition?.agent_level || profile.agent_level || 0);
  const levelConfig = matrix.definition?.levels?.[String(level)];
  assert(levelConfig, `Unsupported agent level for profile ${profile.key}`, 500);

  const capabilityMap = new Map(capabilities.map((record) => [record.key, record]));
  const requiredCapabilities = normalizeArray(profile.definition?.required_capabilities);
  const optionalCapabilities = normalizeArray(profile.definition?.optional_capabilities);
  const selectedCapabilities = normalizeArray(input.selectedCapabilities);
  const effectiveCapabilities = selectedCapabilities.length > 0
    ? Array.from(new Set([...requiredCapabilities, ...selectedCapabilities]))
    : requiredCapabilities;

  const capabilityResults = effectiveCapabilities.map((capabilityKey) => {
    const capability = capabilityMap.get(capabilityKey);
    assert(capability, `Unknown capability: ${capabilityKey}`);
    const riskClass = capability.definition?.risk_class || capability.risk_class;
    const classification = classifyCapability(levelConfig, riskClass);
    return {
      capabilityKey,
      riskClass,
      classification,
      required: requiredCapabilities.includes(capabilityKey),
      optional: optionalCapabilities.includes(capabilityKey),
    };
  });

  const deniedCapabilities = capabilityResults.filter((item) => item.classification === 'denied');
  if (deniedCapabilities.length > 0) {
    assert(false, `Profile level ${level} cannot use capability ${deniedCapabilities[0].capabilityKey}`);
  }

  const integrationMap = new Map(
    (localIntegrationRegistry?.definition?.integrations || []).map((integration) => [integration.integration_key, integration])
  );
  const selectedLocalIntegrations = normalizeArray(input.selectedLocalIntegrations);
  const integrationResults = selectedLocalIntegrations.map((integrationKey) => {
    const integration = integrationMap.get(integrationKey);
    assert(integration, `Unknown local integration for profile ${profile.key}: ${integrationKey}`);
    const requiredLevel = Number(integration.required_level || 0);
    assert(level >= requiredLevel, `Profile level ${level} cannot use local integration ${integrationKey}`);
    return {
      integrationKey,
      requiredLevel,
      toolClass: integration.tool_class || null,
      classification: level === requiredLevel ? 'allowed' : 'allowed',
    };
  });

  const helperMap = new Map(
    (helperRules?.definition?.allowed_helpers || []).map((helper) => [helper.profile_key, helper])
  );
  const selectedHelperProfiles = normalizeArray(input.selectedHelperProfiles);
  const helperResults = selectedHelperProfiles.map((helperProfileKey) => {
    const helper = helperMap.get(helperProfileKey);
    assert(helper, `Helper profile ${helperProfileKey} is not allowed for profile ${profile.key}`);
    return {
      profileKey: helperProfileKey,
      mode: helper.mode || 'restricted',
      seatMode: helper.seat_mode || 'consumes_seat',
      classification: helper.mode === 'restricted' ? 'restricted' : 'allowed',
    };
  });

  const warnings = [];
  const restrictedCapabilities = capabilityResults.filter((item) => item.classification === 'restricted');
  if (restrictedCapabilities.length > 0) {
    warnings.push(`Restricted capabilities selected: ${restrictedCapabilities.map((item) => item.capabilityKey).join(', ')}`);
  }
  const restrictedHelpers = helperResults.filter((item) => item.classification === 'restricted');
  if (restrictedHelpers.length > 0) {
    warnings.push(`Helper profiles require stricter governance: ${restrictedHelpers.map((item) => item.profileKey).join(', ')}`);
  }
  if (level >= 3) {
    warnings.push('This profile defaults to stricter approvals and audit requirements.');
  }

  const startActive = input.startActive !== false;
  const seatImpact = {
    principalAgent: startActive ? 1 : 0,
    registeredHelpers: 0,
    localIntegrations: 0,
    totalImmediate: startActive ? 1 : 0,
  };

  return {
    profileKey: profile.key,
    profileVersion: profile.version,
    profileName: profile.name || profile.definition?.name || profile.key,
    category: profile.category || profile.definition?.category || 'general',
    agentLevel: level,
    riskPosture: riskPostureForLevel(level),
    deploymentMode: input.deploymentMode || 'fixed',
    canProceed: true,
    seatImpact,
    capabilities: capabilityResults,
    localIntegrations: integrationResults,
    helperProfiles: helperResults,
    warnings,
    summary: {
      requiredCapabilities,
      optionalCapabilities,
      selectedCapabilities: capabilityResults.map((item) => item.capabilityKey),
      selectedLocalIntegrations,
      selectedHelperProfiles,
    },
  };
}

module.exports = {
  validateProfileSelection,
};
