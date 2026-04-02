'use strict';

const MAX_PHASES = 3;
const MAX_CONTEXT_CHARS = 1200;

function parseJsonLike(value) {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return {};
    }
  }
  return value && typeof value === 'object' ? value : {};
}

function cleanText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();
}

function truncate(value, maxLength) {
  const text = cleanText(value);
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function normalizePhaseTitle(value, fallback) {
  const title = truncate(String(value || '').replace(/^[\-\*\d\.\)\s]+/, ''), 90);
  return title || fallback;
}

function normalizePhase(entry, index, fallbackAgent = null) {
  if (!entry) return null;

  if (typeof entry === 'string') {
    const objective = truncate(entry, 260);
    if (!objective) return null;
    return {
      index,
      key: `phase_${index + 1}`,
      title: normalizePhaseTitle(objective, `Phase ${index + 1}`),
      objective,
      agent_username: fallbackAgent || null,
      agent_id: null,
      execution_overlay: null,
      verification_focus: null,
    };
  }

  if (typeof entry !== 'object') return null;

  const title = normalizePhaseTitle(entry.title || entry.label || entry.objective, `Phase ${index + 1}`);
  const objective = truncate(entry.objective || entry.instructions || entry.description || entry.title || title, 260);
  if (!objective) return null;

  return {
    index,
    key: cleanText(entry.key) || `phase_${index + 1}`,
    title,
    objective,
    agent_username: cleanText(entry.agent_username || entry.agent || entry.assignee) || fallbackAgent || null,
    agent_id: cleanText(entry.agent_id || entry.agentId) || null,
    execution_overlay: entry.execution_overlay && typeof entry.execution_overlay === 'object'
      ? {
          skillKeys: Array.isArray(entry.execution_overlay.skillKeys) ? entry.execution_overlay.skillKeys : [],
          integrationProviders: Array.isArray(entry.execution_overlay.integrationProviders) ? entry.execution_overlay.integrationProviders : [],
          toolCapabilities: Array.isArray(entry.execution_overlay.toolCapabilities) ? entry.execution_overlay.toolCapabilities : [],
        }
      : null,
    verification_focus: truncate(entry.verification_focus || entry.check || '', 180) || null,
  };
}

function extractMetadataPhases(metadata, fallbackAgent) {
  const rawPhases = metadata?.orchestration_phases || metadata?.plan?.phases || metadata?.phases;
  if (!Array.isArray(rawPhases) || rawPhases.length === 0) return [];
  return rawPhases
    .slice(0, MAX_PHASES)
    .map((entry, index) => normalizePhase(entry, index, fallbackAgent))
    .filter(Boolean);
}

function extractChecklistPhases(description, fallbackAgent) {
  const lines = String(description || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletLike = lines
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+[\.\)]\s+/, '').trim())
    .filter((line) => line.length >= 12);

  if (bulletLike.length < 2) return [];

  return bulletLike
    .slice(0, MAX_PHASES)
    .map((line, index) => normalizePhase(line, index, fallbackAgent))
    .filter(Boolean);
}

function buildFallbackPhase(rootTask, fallbackAgent) {
  const description = truncate(rootTask?.description || rootTask?.title || 'Complete the task.', 260);
  return normalizePhase({
    title: rootTask?.title || 'Execute delegated task',
    objective: description,
  }, 0, fallbackAgent);
}

function approvalRequired(metadata = {}) {
  if (metadata.approval_required === true || metadata.require_approval === true) return true;
  if (metadata.governance?.approval_required === true) return true;
  const approvalMode = String(metadata.approval_mode || metadata.approvalMode || '').trim().toLowerCase();
  return approvalMode === 'required' || approvalMode === 'manual' || approvalMode === 'human';
}

function buildRunPlan({
  run = {},
  rootTask = {},
  workspaceContext = '',
  snipara = {},
  suggestedPhases = [],
} = {}) {
  const metadata = parseJsonLike(rootTask.metadata);
  const requestedAgent = cleanText(
    run.requested_agent_username || rootTask.assigned_agent || rootTask.assignee || snipara.agent_username
  ) || null;
  const phases = Array.isArray(suggestedPhases)
    ? suggestedPhases
      .slice(0, MAX_PHASES)
      .map((entry, index) => normalizePhase(entry, index, requestedAgent))
      .filter(Boolean)
    : [];
  const metadataPhases = extractMetadataPhases(metadata, requestedAgent);
  const checklistPhases = phases.length > 0
    ? phases
    : metadataPhases.length > 0
      ? metadataPhases
      : extractChecklistPhases(rootTask.description, requestedAgent);
  const delegatePhases = checklistPhases.length > 0 ? checklistPhases : [buildFallbackPhase(rootTask, requestedAgent)].filter(Boolean);
  const contextExcerpt = truncate(workspaceContext, MAX_CONTEXT_CHARS) || null;
  const goal = cleanText(rootTask.title) || 'Autonomous execution';
  const strategy = delegatePhases.length > 1
    ? 'multi_phase_sequential'
    : 'single_delegate_verify_finalize';

  return {
    goal,
    summary: delegatePhases.length > 1
      ? `Execute ${delegatePhases.length} sequential phases for "${goal}".`
      : `Execute, verify, and finalize "${goal}".`,
    strategy,
    phase_count: delegatePhases.length,
    phases: delegatePhases,
    controls: {
      verification: true,
      approval: approvalRequired(metadata),
      finalize: true,
    },
    delegation: {
      primary_agent_username: requestedAgent,
      display_agent_username: cleanText(run.display_agent_username || requestedAgent) || null,
      escalation_agent_username: 'mike',
    },
    snipara: {
      enabled: Boolean(snipara?.configured || snipara?.swarmId || snipara?.rootTaskId),
      configured: Boolean(snipara?.configured),
      swarm_id: snipara?.swarmId || null,
      project_id: snipara?.projectId || null,
      root_task_id: snipara?.rootTaskId || null,
    },
    workspace_context_excerpt: contextExcerpt,
    generated_at: new Date().toISOString(),
  };
}

function resolvePlanPhase(planLike, index = 0) {
  const plan = parseJsonLike(planLike);
  const phases = Array.isArray(plan.phases) ? plan.phases : [];
  const normalizedIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
  const phase = phases[normalizedIndex];
  if (!phase) return null;
  return {
    ...phase,
    index: Number.isFinite(Number(phase.index)) ? Number(phase.index) : normalizedIndex,
  };
}

function resolveNextPlanPhase(planLike, currentIndex = 0) {
  return resolvePlanPhase(planLike, Number(currentIndex) + 1);
}

function getPlanPhaseCount(planLike) {
  const plan = parseJsonLike(planLike);
  return Array.isArray(plan.phases) ? plan.phases.length : 0;
}

module.exports = {
  buildRunPlan,
  getPlanPhaseCount,
  parseJsonLike,
  resolveNextPlanPhase,
  resolvePlanPhase,
};
