'use strict';

const pool = require('../lib/vaultbrix');
const { resolveAgentCapabilityMatrix } = require('./agentCapabilityMatrixService');
const {
  inferProviderForSkill,
  isProviderAvailable,
  resolveWorkspaceCapabilityAvailability,
} = require('./runtimeCapabilityAvailability');
const { SOCIAL_PROVIDERS } = require('./agentIntegrationService');

const SCHEMA = 'tenant_vutler';
const RECURRING_BLOCKER_LOOKBACK_DAYS = 14;
const RECURRING_BLOCKER_THRESHOLD = 3;
const RECURRING_BLOCKER_RUN_LIMIT = 250;
const CAPABILITY_SUGGESTIONS = {
  email: 'Provision email for this agent or route the step to an email-enabled agent.',
  social: 'Connect a social account and allow social access for this agent to enable autonomous publishing.',
  drive: 'Allow shared drive access for this agent to let the run write files autonomously.',
  calendar: 'Connect calendar access and allow it for this agent to enable autonomous scheduling.',
  tasks: 'Allow task access for this agent to enable autonomous task operations.',
  sandbox: 'Use a technical agent type and enable sandbox to allow proactive code execution.',
  memory: 'Enable persistent memory for this agent to let the run recall prior context autonomously.',
};

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

function humanizeToken(value, fallback = 'Capability') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  return raw
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeBlockedEntry(entry, fallbackKind = 'provider') {
  if (!entry || typeof entry !== 'object') return null;
  const key = String(entry.key || entry.provider || entry.capability || '').trim();
  if (!key) return null;
  return {
    kind: fallbackKind,
    key,
    capability: String(entry.capability || '').trim() || null,
    provider: String(entry.provider || '').trim() || null,
    reason: String(entry.reason || '').trim() || null,
  };
}

function flattenBlockedOverlayEntries(blocked = {}) {
  const providers = Array.isArray(blocked.providers) ? blocked.providers : [];
  const skills = Array.isArray(blocked.skills) ? blocked.skills : [];
  const toolCapabilities = Array.isArray(blocked.toolCapabilities) ? blocked.toolCapabilities : [];

  return [
    ...providers.map((entry) => normalizeBlockedEntry(entry, 'provider')),
    ...skills.map((entry) => normalizeBlockedEntry(entry, 'skill')),
    ...toolCapabilities.map((entry) => normalizeBlockedEntry(entry, 'tool_capability')),
  ].filter(Boolean);
}

function blockerCountKey(entry) {
  return `${entry.kind}:${String(entry.key || '').trim().toLowerCase()}`;
}

function recommendationForEntry(entry) {
  const capability = String(entry?.capability || '').trim().toLowerCase();
  if (capability && CAPABILITY_SUGGESTIONS[capability]) {
    return CAPABILITY_SUGGESTIONS[capability];
  }
  return String(entry?.reason || '').trim() || `Resolve ${humanizeToken(entry?.key)} so the run can keep executing autonomously.`;
}

async function buildBlockedOverlayInsights({
  workspaceId,
  agent = null,
  blocked = {},
  db = pool,
  lookbackDays = RECURRING_BLOCKER_LOOKBACK_DAYS,
  recurringThreshold = RECURRING_BLOCKER_THRESHOLD,
  runLimit = RECURRING_BLOCKER_RUN_LIMIT,
} = {}) {
  const currentEntries = flattenBlockedOverlayEntries(blocked);
  if (!workspaceId || currentEntries.length === 0 || !db || typeof db.query !== 'function') {
    return null;
  }

  try {
    const recentRunsResult = await db.query(
      `SELECT id::text AS id,
              requested_agent_id::text AS requested_agent_id,
              requested_agent_username,
              display_agent_id::text AS display_agent_id,
              display_agent_username
         FROM ${SCHEMA}.orchestration_runs
        WHERE workspace_id = $1
          AND created_at >= NOW() - ($2 * INTERVAL '1 day')
        ORDER BY created_at DESC
        LIMIT $3`,
      [workspaceId, lookbackDays, runLimit]
    );

    const recentRuns = recentRunsResult.rows || [];
    const runIds = recentRuns.map((row) => row.id).filter(Boolean);
    if (runIds.length === 0) {
      return null;
    }

    const agentId = String(agent?.id || '').trim() || null;
    const agentUsername = String(agent?.username || agent?.name || '').trim().toLowerCase() || null;
    const scopedRunIds = new Set(
      recentRuns
        .filter((row) => {
          const requestedId = String(row.requested_agent_id || '').trim();
          const displayId = String(row.display_agent_id || '').trim();
          const requestedUsername = String(row.requested_agent_username || '').trim().toLowerCase();
          const displayUsername = String(row.display_agent_username || '').trim().toLowerCase();
          if (agentId && (requestedId === agentId || displayId === agentId)) return true;
          if (agentUsername && (requestedUsername === agentUsername || displayUsername === agentUsername)) return true;
          return false;
        })
        .map((row) => row.id)
    );

    const recentEventsResult = await db.query(
      `SELECT run_id::text AS run_id,
              payload
         FROM ${SCHEMA}.orchestration_run_events
        WHERE run_id::text = ANY($1::text[])
          AND event_type = 'overlay.resolved'
        ORDER BY created_at DESC`,
      [runIds]
    );

    const workspaceCounts = new Map();
    const agentCounts = new Map();
    for (const row of recentEventsResult.rows || []) {
      const payload = row?.payload && typeof row.payload === 'object'
        ? row.payload
        : {};
      const blockedOverlay = payload.blocked_overlay && typeof payload.blocked_overlay === 'object'
        ? payload.blocked_overlay
        : {};
      const entries = flattenBlockedOverlayEntries(blockedOverlay);
      for (const entry of entries) {
        const key = blockerCountKey(entry);
        workspaceCounts.set(key, (workspaceCounts.get(key) || 0) + 1);
        if (scopedRunIds.has(String(row.run_id || ''))) {
          agentCounts.set(key, (agentCounts.get(key) || 0) + 1);
        }
      }
    }

    const blockers = currentEntries.map((entry) => {
      const key = blockerCountKey(entry);
      const workspaceCount = workspaceCounts.get(key) || 0;
      const agentCount = agentCounts.get(key) || 0;
      const recurring = workspaceCount >= recurringThreshold || agentCount >= Math.max(2, recurringThreshold - 1);
      const label = humanizeToken(entry.key || entry.capability || entry.provider);
      const recommendation = recommendationForEntry(entry);
      const summary = recurring
        ? `${label} has blocked ${workspaceCount} autonomous run${workspaceCount === 1 ? '' : 's'} in the last ${lookbackDays} days${agentCount > 0 ? ` (${agentCount} on this agent)` : ''}. ${recommendation}`
        : null;

      return {
        kind: entry.kind,
        key: entry.key,
        capability: entry.capability,
        provider: entry.provider,
        reason: entry.reason,
        label,
        workspace_count: workspaceCount,
        agent_count: agentCount,
        recurring,
        recommendation,
        summary,
      };
    });

    const recurringBlockers = blockers
      .filter((entry) => entry.recurring)
      .sort((left, right) => {
        if (right.agent_count !== left.agent_count) return right.agent_count - left.agent_count;
        return right.workspace_count - left.workspace_count;
      });
    const primaryBlocker = recurringBlockers[0] || null;

    return {
      lookback_days: lookbackDays,
      recurring_threshold: recurringThreshold,
      blockers,
      recurring_blockers: recurringBlockers,
      primary_blocker: primaryBlocker,
      recommendation_summary: primaryBlocker?.summary || null,
      escalation_recommended: recurringBlockers.length > 0,
    };
  } catch (_) {
    return null;
  }
}

function buildOverlaySuggestionMessages(overlay = {}) {
  const blocked = overlay?.blocked || {};
  const suggestions = [];
  const seenCapabilities = new Set();
  const allBlocked = [
    ...(Array.isArray(blocked.providers) ? blocked.providers : []),
    ...(Array.isArray(blocked.skills) ? blocked.skills : []),
    ...(Array.isArray(blocked.toolCapabilities) ? blocked.toolCapabilities : []),
  ];

  for (const entry of allBlocked) {
    const capability = String(entry?.capability || '').trim().toLowerCase();
    if (capability && CAPABILITY_SUGGESTIONS[capability] && !seenCapabilities.has(capability)) {
      seenCapabilities.add(capability);
      suggestions.push(CAPABILITY_SUGGESTIONS[capability]);
      continue;
    }

    const reason = String(entry?.reason || '').trim();
    if (reason) suggestions.push(reason);
  }

  const recurringBlockers = Array.isArray(overlay?.insights?.recurring_blockers)
    ? overlay.insights.recurring_blockers
    : [];
  for (const insight of recurringBlockers.slice(0, 2)) {
    const summary = String(insight?.summary || '').trim();
    const recommendation = String(insight?.recommendation || '').trim();
    if (summary) suggestions.push(summary);
    else if (recommendation) suggestions.push(recommendation);
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

  const blockedInsights = await buildBlockedOverlayInsights({
    workspaceId,
    agent,
    blocked: {
      providers: blockedProviders,
      skills: blockedSkills,
      toolCapabilities: blockedToolCapabilities,
    },
    db,
  });

  return {
    skillKeys: allowedSkills,
    integrationProviders: allowedProviders,
    toolCapabilities: allowedToolCapabilities,
    blocked: {
      providers: blockedProviders,
      skills: blockedSkills,
      toolCapabilities: blockedToolCapabilities,
    },
    insights: blockedInsights,
    capabilityMatrix: matrix,
  };
}

module.exports = {
  buildOverlaySuggestionMessages,
  buildBlockedOverlayInsights,
  capabilityKeyForProvider,
  capabilityKeyForToolCapability,
  filterExecutionOverlay,
  flattenBlockedOverlayEntries,
  isOverlayEmpty,
};
