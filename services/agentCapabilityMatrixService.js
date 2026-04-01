'use strict';

const pool = require('../lib/vaultbrix');
const { hasSniparaCapability } = require('../packages/core/middleware/featureGate');
const { getWorkspacePlanId } = require('./workspacePlanService');
const {
  resolveWorkspaceCapabilityAvailability,
  isProviderAvailable,
} = require('./runtimeCapabilityAvailability');
const { resolveAgentEmailProvisioning } = require('./agentProvisioningService');
const { resolveAgentAccessPolicy, getAgentConfigSections } = require('./agentAccessPolicyService');
const { normalizeAgentTypes, isSandboxEligibleAgentType } = require('./agentTypeProfiles');
const { resolveMemoryMode } = require('./memory/modeResolver');
const { listConnectedSocialPlatforms } = require('./agentIntegrationService');

function buildCapabilityState({
  workspaceAvailable,
  agentAllowed,
  provisioned,
  reason,
  scope = null,
} = {}) {
  return {
    workspace_available: Boolean(workspaceAvailable),
    agent_allowed: Boolean(agentAllowed),
    provisioned: Boolean(provisioned),
    effective: Boolean(workspaceAvailable && agentAllowed && provisioned),
    reason: reason || null,
    scope,
  };
}

function firstReason(...reasons) {
  return reasons.find((reason) => typeof reason === 'string' && reason.trim()) || null;
}

async function resolveAgentCapabilityMatrix({ workspaceId, agent, db = pool } = {}) {
  if (!workspaceId || !agent?.id) {
    throw new Error('Capability matrix requires a workspace and agent.');
  }

  const availability = await resolveWorkspaceCapabilityAvailability({ workspaceId, db }).catch(() => ({
    planId: 'free',
    providerStates: {},
    availableProviders: [],
    unavailableProviders: [],
  }));
  const accessPolicy = await resolveAgentAccessPolicy({
    workspaceId,
    agentId: agent.id,
    agent,
    db,
  });
  const { provisioning: configProvisioning } = getAgentConfigSections(agent);
  const emailProvisioning = await resolveAgentEmailProvisioning({
    workspaceId,
    agentId: agent.id,
    agent,
    db,
  }).catch(() => ({
    provisioned: false,
    email: null,
    source: 'none',
  }));
  const memoryMode = await resolveMemoryMode({ db, workspaceId, agent }).catch(() => ({
    mode: 'disabled',
    read: false,
    write: false,
    inject: false,
    source: 'none',
  }));
  const planId = availability.planId || await getWorkspacePlanId(db, workspaceId).catch(() => 'free');
  const types = normalizeAgentTypes(agent.type);
  const connectedSocialPlatforms = await listConnectedSocialPlatforms(workspaceId, db).catch(() => []);
  const socialScopePlatforms = Array.isArray(accessPolicy.social?.platforms) && accessPolicy.social.platforms.length > 0
    ? accessPolicy.social.platforms
    : connectedSocialPlatforms;
  const sandboxEligible = isSandboxEligibleAgentType(types);

  const emailWorkspaceAvailable = isProviderAvailable(availability, 'email');
  const socialWorkspaceAvailable = isProviderAvailable(availability, 'social_media');
  const driveWorkspaceAvailable = isProviderAvailable(availability, 'workspace_drive');
  const calendarWorkspaceAvailable = isProviderAvailable(availability, 'vutler_calendar') || isProviderAvailable(availability, 'google');
  const tasksWorkspaceAvailable = isProviderAvailable(availability, 'project_management');
  const sandboxWorkspaceAvailable = isProviderAvailable(availability, 'sandbox');
  const memoryWorkspaceAvailable = hasSniparaCapability(planId, 'memory');

  const capabilities = {
    email: buildCapabilityState({
      workspaceAvailable: emailWorkspaceAvailable,
      agentAllowed: accessPolicy.email.allowed,
      provisioned: emailProvisioning.provisioned,
      reason: firstReason(
        !emailWorkspaceAvailable ? availability.providerStates?.email?.reason : null,
        accessPolicy.email.allowed ? null : 'Email access is disabled for this agent.',
        emailProvisioning.provisioned ? null : 'Email is not provisioned for this agent.'
      ),
      scope: emailProvisioning.email ? { address: emailProvisioning.email } : null,
    }),
    social: buildCapabilityState({
      workspaceAvailable: socialWorkspaceAvailable,
      agentAllowed: accessPolicy.social.allowed,
      provisioned: socialScopePlatforms.length > 0,
      reason: firstReason(
        !socialWorkspaceAvailable ? availability.providerStates?.social_media?.reason : null,
        accessPolicy.social.allowed ? null : 'Social publishing is disabled for this agent.',
        socialScopePlatforms.length > 0 ? null : 'No social account is connected for this workspace.'
      ),
      scope: socialScopePlatforms.length > 0 ? { platforms: socialScopePlatforms } : null,
    }),
    drive: buildCapabilityState({
      workspaceAvailable: driveWorkspaceAvailable,
      agentAllowed: accessPolicy.drive.allowed,
      provisioned: true,
      reason: firstReason(
        !driveWorkspaceAvailable ? availability.providerStates?.workspace_drive?.reason : null,
        accessPolicy.drive.allowed ? null : 'Drive access is disabled for this agent.'
      ),
      scope: configProvisioning?.drive?.root ? { root: configProvisioning.drive.root } : null,
    }),
    calendar: buildCapabilityState({
      workspaceAvailable: calendarWorkspaceAvailable,
      agentAllowed: accessPolicy.calendar.allowed,
      provisioned: true,
      reason: firstReason(
        !calendarWorkspaceAvailable
          ? (availability.providerStates?.vutler_calendar?.reason || availability.providerStates?.google?.reason)
          : null,
        accessPolicy.calendar.allowed ? null : 'Calendar access is disabled for this agent.'
      ),
      scope: null,
    }),
    tasks: buildCapabilityState({
      workspaceAvailable: tasksWorkspaceAvailable,
      agentAllowed: accessPolicy.tasks.allowed,
      provisioned: true,
      reason: firstReason(
        !tasksWorkspaceAvailable ? availability.providerStates?.project_management?.reason : null,
        accessPolicy.tasks.allowed ? null : 'Task access is disabled for this agent.'
      ),
      scope: null,
    }),
    memory: buildCapabilityState({
      workspaceAvailable: memoryWorkspaceAvailable,
      agentAllowed: accessPolicy.memory.allowed,
      provisioned: memoryMode.mode !== 'disabled',
      reason: firstReason(
        !memoryWorkspaceAvailable ? 'Persistent memory is not enabled in the current workspace plan.' : null,
        accessPolicy.memory.allowed ? null : 'Memory access is disabled for this agent.',
        memoryMode.mode !== 'disabled' ? null : 'Memory mode is disabled for this agent.'
      ),
      scope: { mode: memoryMode.mode, source: memoryMode.source },
    }),
    sandbox: buildCapabilityState({
      workspaceAvailable: sandboxWorkspaceAvailable,
      agentAllowed: accessPolicy.sandbox.allowed,
      provisioned: sandboxEligible,
      reason: firstReason(
        !sandboxWorkspaceAvailable ? availability.providerStates?.sandbox?.reason : null,
        accessPolicy.sandbox.allowed ? null : 'Sandbox access is disabled for this agent.',
        sandboxEligible ? null : 'Sandbox is reserved for technical, security, QA, and devops agent types.'
      ),
      scope: { eligible_types: Array.from(require('./agentTypeProfiles').SANDBOX_ELIGIBLE_AGENT_TYPES) },
    }),
  };

  const warnings = [];
  if (capabilities.email.agent_allowed && !capabilities.email.provisioned) {
    warnings.push({ key: 'email_not_provisioned', message: 'Email is allowed but not provisioned for this agent.' });
  }
  if (capabilities.social.agent_allowed && !capabilities.social.provisioned) {
    warnings.push({ key: 'social_not_connected', message: 'Social posting is allowed but no connected account is available.' });
  }
  if (accessPolicy.sandbox.allowed && !sandboxEligible) {
    warnings.push({ key: 'sandbox_ineligible_type', message: 'Sandbox access is enabled on a non-eligible agent type.' });
  }

  return {
    agent_id: agent.id,
    agent_types: types,
    capabilities,
    warnings,
    metadata: {
      plan_id: planId,
      available_runtime_providers: availability.availableProviders || [],
      unavailable_runtime_providers: availability.unavailableProviders || [],
    },
  };
}

module.exports = {
  resolveAgentCapabilityMatrix,
};
