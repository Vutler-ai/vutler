function normalizeArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function classifyCapability(levelConfig, riskClass) {
  if ((levelConfig.denied_capability_risk_classes || []).includes(riskClass)) return 'denied';
  if ((levelConfig.restricted_capability_risk_classes || []).includes(riskClass)) return 'restricted';
  if ((levelConfig.allowed_capability_risk_classes || []).includes(riskClass)) return 'allowed';
  return 'restricted';
}

class ProfileValidator {
  constructor(profileRegistry) {
    this.profileRegistry = profileRegistry;
  }

  async validate(agentConfig, nodeEnterpriseProfile = null) {
    const enterpriseProfile = agentConfig?.enterprise_profile || nodeEnterpriseProfile || null;
    const profileKey = enterpriseProfile?.profile_key || enterpriseProfile?.profileKey || agentConfig?.profile_key || null;

    if (!profileKey) {
      return { valid: true, legacy: true, enterpriseProfile: null };
    }

    const profileVersion = enterpriseProfile?.profile_version || enterpriseProfile?.profileVersion || agentConfig?.profile_version || undefined;
    const [profile, matrix, capabilities, localIntegrations, helperRules] = await Promise.all([
      this.profileRegistry.getProfile(profileKey, profileVersion),
      this.profileRegistry.getMatrix(),
      this.profileRegistry.listCapabilities(),
      this.profileRegistry.getLocalIntegrations(profileKey, profileVersion),
      this.profileRegistry.getHelperRules(profileKey, profileVersion),
    ]);

    if (!profile) return { valid: false, reason: `Unknown enterprise profile: ${profileKey}` };
    if (!matrix) return { valid: false, reason: 'Missing enterprise level matrix' };

    const level = Number(profile.definition?.agent_level || profile.agent_level || 0);
    const levelConfig = matrix.definition?.levels?.[String(level)];
    if (!levelConfig) return { valid: false, reason: `Unsupported agent level for profile: ${profileKey}` };

    const requiredCapabilities = normalizeArray(profile.definition?.required_capabilities);
    const selectedCapabilities = normalizeArray(enterpriseProfile?.selected_capabilities || enterpriseProfile?.selectedCapabilities);
    const effectiveCapabilities = selectedCapabilities.length > 0
      ? Array.from(new Set([...requiredCapabilities, ...selectedCapabilities]))
      : requiredCapabilities;
    const capabilityMap = new Map(
      capabilities.map((capability) => [capability.key, capability])
    );

    for (const capabilityKey of effectiveCapabilities) {
      const capability = capabilityMap.get(capabilityKey);
      if (!capability) {
        return { valid: false, reason: `Unknown capability: ${capabilityKey}` };
      }
      const riskClass = capability.definition?.risk_class || capability.risk_class;
      const classification = classifyCapability(levelConfig, riskClass);
      if (classification === 'denied') {
        return { valid: false, reason: `Capability denied for profile level: ${capabilityKey}` };
      }
    }

    const integrationMap = new Map(
      (localIntegrations?.definition?.integrations || []).map((integration) => [integration.integration_key, integration])
    );
    for (const integrationKey of normalizeArray(enterpriseProfile?.selected_local_integrations || enterpriseProfile?.selectedLocalIntegrations)) {
      const integration = integrationMap.get(integrationKey);
      if (!integration) return { valid: false, reason: `Unknown local integration: ${integrationKey}` };
      if (level < Number(integration.required_level || 0)) {
        return { valid: false, reason: `Local integration not allowed for profile level: ${integrationKey}` };
      }
    }

    const helperMap = new Map(
      (helperRules?.definition?.allowed_helpers || []).map((helper) => [helper.profile_key, helper])
    );
    for (const helperProfileKey of normalizeArray(enterpriseProfile?.selected_helper_profiles || enterpriseProfile?.selectedHelperProfiles)) {
      if (!helperMap.has(helperProfileKey)) {
        return { valid: false, reason: `Helper profile not allowed: ${helperProfileKey}` };
      }
    }

    return {
      valid: true,
      legacy: false,
      enterpriseProfile: {
        ...enterpriseProfile,
        profile_key: profileKey,
        profile_version: profileVersion || profile.version,
      },
    };
  }
}

module.exports = { ProfileValidator };
