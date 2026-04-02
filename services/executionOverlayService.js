'use strict';

const pool = require('../lib/vaultbrix');
const { resolveAgentCapabilityMatrix } = require('./agentCapabilityMatrixService');
const {
  inferProviderForSkill,
  isProviderAvailable,
  resolveWorkspaceCapabilityAvailability,
} = require('./runtimeCapabilityAvailability');
const { SOCIAL_PROVIDERS } = require('./agentIntegrationService');

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map((value) => String(value).trim())
  ));
}

function capabilityKeyForProvider(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'email') return 'email';
  if (normalized === 'project_management') return 'tasks';
  if (normalized === 'workspace_drive') return 'drive';
  if (normalized === 'vutler_calendar' || normalized === 'google') return 'calendar';
  if (normalized === 'social_media' || SOCIAL_PROVIDERS.has(normalized)) return 'social';
  if (normalized === 'sandbox') return 'sandbox';
  return null;
}

function capabilityKeyForToolCapability(toolCapability) {
  const normalized = String(toolCapability || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'code_execution') return 'sandbox';
  return null;
}

function getCapabilityState(matrix, capabilityKey) {
  if (!capabilityKey) return null;
  return matrix?.capabilities?.[capabilityKey] || null;
}

function isOverlayEmpty(overlay = {}) {
  return uniqueStrings(overlay.skillKeys).length === 0
    && uniqueStrings(overlay.integrationProviders).length === 0
    && uniqueStrings(overlay.toolCapabilities).length === 0;
}

function buildOverlaySuggestionMessages(overlay = {}) {
  const blocked = overlay?.blocked || {};
  const capabilitySuggestions = {
    email: 'Provision email for this agent or route the step to an email-enabled agent.',
    social: 'Connect a social account and allow social access for this agent to enable autonomous publishing.',
    drive: 'Allow shared drive access for this agent to let the run write files autonomously.',
    calendar: 'Connect calendar access and allow it for this agent to enable autonomous scheduling.',
    tasks: 'Allow task access for this agent to enable autonomous task operations.',
    sandbox: 'Use a technical agent type and enable sandbox to allow proactive code execution.',
    memory: 'Enable persistent memory for this agent to let the run recall prior context autonomously.',
  };

  const suggestions = [];
  const seenCapabilities = new Set();
  const allBlocked = [
    ...(Array.isArray(blocked.providers) ? blocked.providers : []),
    ...(Array.isArray(blocked.skills) ? blocked.skills : []),
    ...(Array.isArray(blocked.toolCapabilities) ? blocked.toolCapabilities : []),
  ];

  for (const entry of allBlocked) {
    const capability = String(entry?.capability || '').trim().toLowerCase();
    if (capability && capabilitySuggestions[capability] && !seenCapabilities.has(capability)) {
      seenCapabilities.add(capability);
      suggestions.push(capabilitySuggestions[capability]);
      continue;
    }

    const reason = String(entry?.reason || '').trim();
    if (reason) suggestions.push(reason);
  }

  return uniqueStrings(suggestions);
}

async function resolveRuntimeAvailability({ workspaceId, db = pool } = {}) {
  if (!workspaceId) {
    return {
      planId: 'free',
      providerStates: {},
      availableProviders: [],
      unavailableProviders: [],
    };
  }

  return resolveWorkspaceCapabilityAvailability({ workspaceId, db }).catch(() => ({
    planId: 'free',
    providerStates: {},
    availableProviders: [],
    unavailableProviders: [],
  }));
}

async function filterExecutionOverlay({
  workspaceId,
  agent,
  overlay = {},
  db = pool,
  capabilityMatrix = null,
  runtimeAvailability = null,
} = {}) {
  const desiredOverlay = {
    skillKeys: uniqueStrings(overlay.skillKeys),
    integrationProviders: uniqueStrings(overlay.integrationProviders),
    toolCapabilities: uniqueStrings(overlay.toolCapabilities),
  };

  if (isOverlayEmpty(desiredOverlay)) {
    return {
      skillKeys: [],
      integrationProviders: [],
      toolCapabilities: [],
      blocked: {
        providers: [],
        skills: [],
        toolCapabilities: [],
      },
      capabilityMatrix: capabilityMatrix || null,
    };
  }

  const runtime = runtimeAvailability || await resolveRuntimeAvailability({ workspaceId, db });
  const matrix = capabilityMatrix || (
    workspaceId && agent?.id
      ? await resolveAgentCapabilityMatrix({ workspaceId, agent, db }).catch(() => null)
      : null
  );

  const allowedProviders = [];
  const blockedProviders = [];
  for (const provider of desiredOverlay.integrationProviders) {
    const capabilityKey = capabilityKeyForProvider(provider);
    const capabilityState = getCapabilityState(matrix, capabilityKey);
    if (capabilityState) {
      if (capabilityState.effective) {
        allowedProviders.push(provider);
      } else {
        blockedProviders.push({
          key: provider,
          capability: capabilityKey,
          reason: capabilityState.reason || `Provider ${provider} is not effective for this agent.`,
        });
      }
      continue;
    }

    if (isProviderAvailable(runtime, provider)) {
      allowedProviders.push(provider);
    } else {
      blockedProviders.push({
        key: provider,
        capability: null,
        reason: runtime?.providerStates?.[provider]?.reason || `Provider ${provider} is not available for this workspace run.`,
      });
    }
  }

  const allowedToolCapabilities = [];
  const blockedToolCapabilities = [];
  for (const toolCapability of desiredOverlay.toolCapabilities) {
    const capabilityKey = capabilityKeyForToolCapability(toolCapability);
    const capabilityState = getCapabilityState(matrix, capabilityKey);
    if (capabilityState) {
      if (capabilityState.effective) {
        allowedToolCapabilities.push(toolCapability);
      } else {
        blockedToolCapabilities.push({
          key: toolCapability,
          capability: capabilityKey,
          reason: capabilityState.reason || `Tool capability ${toolCapability} is not effective for this agent.`,
        });
      }
      continue;
    }

    allowedToolCapabilities.push(toolCapability);
  }

  const allowedSkills = [];
  const blockedSkills = [];
  for (const skillKey of desiredOverlay.skillKeys) {
    const provider = inferProviderForSkill(skillKey);
    const capabilityKey = capabilityKeyForProvider(provider);
    const capabilityState = getCapabilityState(matrix, capabilityKey);

    if (capabilityState) {
      if (capabilityState.effective) {
        allowedSkills.push(skillKey);
      } else {
        blockedSkills.push({
          key: skillKey,
          provider: provider || null,
          capability: capabilityKey,
          reason: capabilityState.reason || `Skill ${skillKey} is not effective for this agent.`,
        });
      }
      continue;
    }

    if (provider && !isProviderAvailable(runtime, provider)) {
      blockedSkills.push({
        key: skillKey,
        provider,
        capability: null,
        reason: runtime?.providerStates?.[provider]?.reason || `Skill ${skillKey} is not available for this workspace run.`,
      });
      continue;
    }

    allowedSkills.push(skillKey);
  }

  return {
    skillKeys: allowedSkills,
    integrationProviders: allowedProviders,
    toolCapabilities: allowedToolCapabilities,
    blocked: {
      providers: blockedProviders,
      skills: blockedSkills,
      toolCapabilities: blockedToolCapabilities,
    },
    capabilityMatrix: matrix,
  };
}

module.exports = {
  buildOverlaySuggestionMessages,
  capabilityKeyForProvider,
  capabilityKeyForToolCapability,
  filterExecutionOverlay,
  isOverlayEmpty,
};
