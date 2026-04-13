'use strict';

const os = require('os');
const pool = require('../../lib/vaultbrix');
const { updateChatActionRun } = require('../chatActionRuns');
const { insertChatMessage } = require('../chatMessages');
const { getSwarmCoordinator } = require('../swarmCoordinator');
const { getVerificationEngine } = require('../verificationEngine');
const { publishTaskEvent } = require('../workspaceRealtime');
const { resolveOrchestrationCapabilities } = require('../orchestrationCapabilityResolver');
const {
  buildOverlaySuggestionMessages,
  filterExecutionOverlay,
  isOverlayEmpty,
} = require('../executionOverlayService');
const {
  DEFAULT_LEASE_MS,
  TERMINAL_RUN_STATUSES,
  appendRunEvent,
  claimRunnableRuns,
  createRunStep,
  getCurrentRunStep,
  getRunById,
  heartbeatRunLease,
  listRunEvents,
  listRunSteps,
  parseJsonLike,
  updateRun,
  updateRunStep,
} = require('./runStore');
const { dispatchOrchestratedAction } = require('./actionRouter');
const {
  buildRunPlan,
  getPlanPhaseCount,
  resolveNextPlanPhase,
  resolvePlanPhase,
} = require('./runPlanner');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';
const POLL_INTERVAL_MS = Number(process.env.RUN_ENGINE_POLL_INTERVAL_MS) || 5_000;
const RESUME_DELAY_MS = Number(process.env.RUN_ENGINE_RESUME_DELAY_MS) || 5_000;
const LEASE_MS = Number(process.env.RUN_ENGINE_LEASE_MS) || DEFAULT_LEASE_MS;
const CLAIM_BATCH_SIZE = Number(process.env.RUN_ENGINE_BATCH_SIZE) || 3;
const WORKER_ID = `${os.hostname()}:${process.pid}:run-engine`;
const ACTIVE_TASK_STATUSES = new Set(['pending', 'in_progress', 'open']);
const FAILED_TASK_STATUSES = new Set(['failed', 'cancelled', 'stalled', 'blocked', 'timed_out', 'timeout']);

function normalizeWorkspaceId(workspaceId) {
  const value = typeof workspaceId === 'string' ? workspaceId.trim() : workspaceId;
  if (value) return value;
  throw new Error('workspaceId is required for run engine operations');
}

function buildWakeAt(delayMs) {
  return new Date(Date.now() + delayMs);
}

function humanizeAgentName(agentRef) {
  const clean = String(agentRef || '').trim();
  if (!clean) return 'Jarvis';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function findAgentRecord(agentRef, agents = []) {
  const normalized = String(agentRef || '').trim().toLowerCase();
  if (!normalized) return null;
  return agents.find((agent) => {
    return String(agent?.id || '').trim().toLowerCase() === normalized
      || String(agent?.username || '').trim().toLowerCase() === normalized
      || String(agent?.name || '').trim().toLowerCase() === normalized;
  }) || null;
}

function isTerminalStepStatus(status) {
  return ['completed', 'failed', 'cancelled', 'skipped'].includes(String(status || '').toLowerCase());
}

function extractTaskResult(task) {
  const metadata = parseJsonLike(task?.metadata);
  if (typeof metadata.result === 'string' && metadata.result.trim()) return metadata.result.trim();
  if (typeof metadata.output === 'string' && metadata.output.trim()) return metadata.output.trim();
  if (typeof metadata.last_output === 'string' && metadata.last_output.trim()) return metadata.last_output.trim();
  if (typeof task?.result === 'string' && task.result.trim()) return task.result.trim();
  return '';
}

function extractTaskError(task) {
  const metadata = parseJsonLike(task?.metadata);
  if (typeof metadata.error === 'string' && metadata.error.trim()) return metadata.error.trim();
  return `Task ${task?.id || 'unknown'} ended with status ${task?.status || 'failed'}.`;
}

function extractToolResultText(action = {}, result = {}) {
  const outputJson = result?.output_json && typeof result.output_json === 'object'
    ? result.output_json
    : null;
  if (typeof result?.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim();
  }

  switch (String(action?.key || '').trim()) {
    case 'sandbox_code_exec': {
      const stdout = String(outputJson?.stdout || '').trim();
      const stderr = String(outputJson?.stderr || '').trim();
      if (stdout) return stdout;
      if (stderr) return `Sandbox stderr:\n${stderr}`;
      return `Sandbox execution finished with status ${outputJson?.status || 'completed'}.`;
    }

    case 'memory_recall':
      return String(outputJson?.text || 'No relevant memories found.').trim();

    case 'memory_remember':
      return 'Memory stored successfully.';

    case 'social_post':
      if (outputJson?.task_id) return `Social publication queued as task ${outputJson.task_id}.`;
      if (outputJson?.post_id) return `Social publication finished. Post ID: ${outputJson.post_id}.`;
      return 'Social publication completed.';

    default:
      if (outputJson?.message) return String(outputJson.message).trim();
      if (outputJson?.text) return String(outputJson.text).trim();
      try {
        return outputJson ? JSON.stringify(outputJson) : 'Tool action completed.';
      } catch (_) {
        return 'Tool action completed.';
      }
  }
}

function buildToolActionSummary(actions = [], results = []) {
  const normalizedResults = Array.isArray(results) ? results : [];
  if (normalizedResults.length === 0) return 'Tool action completed.';

  if (normalizedResults.length === 1) {
    return extractToolResultText(actions[0] || {}, normalizedResults[0] || {});
  }

  return normalizedResults.map((result, index) => {
    const action = actions[index] || {};
    const actionLabel = String(action.key || action.executor || `action_${index + 1}`).trim();
    const text = extractToolResultText(action, result);
    return `- ${actionLabel}: ${text}`;
  }).join('\n');
}

function shouldRequireManualVerificationReview(rootTask, evaluation = {}) {
  if (evaluation?.autoAccepted !== true) return false;
  const metadata = parseJsonLike(rootTask?.metadata);
  return metadata.verification_auto_accept_allowed !== true;
}

function buildVerificationReviewSummary(evaluation = {}) {
  const reason = String(evaluation?.autoAcceptedReason || '').trim().toLowerCase();
  if (reason === 'verification_unavailable') {
    return 'Human verification required because the verifier was unavailable.';
  }
  if (reason === 'no_criteria') {
    return 'Human verification required because no acceptance criteria were available.';
  }
  return 'Human verification required because the automated verdict was not grounded enough.';
}

function extractTaskBlocker(task) {
  const metadata = parseJsonLike(task?.metadata);
  const blockerType = String(metadata.snipara_blocker_type || metadata.blocker_type || '').trim();
  const blockerReason = String(metadata.snipara_blocker_reason || metadata.blocker_reason || '').trim();
  const lastEvent = String(metadata.snipara_last_event || '').trim().toLowerCase();
  const combined = `${blockerType} ${blockerReason} ${lastEvent}`.toLowerCase();
  const approval = /(approval|approv|signoff|sign-off|human|manual|decision)/.test(combined);
  const remediation = /(rework|quality|qa|validation|fix|revise|repair|review)/.test(combined);
  const dependency = /(dependency|external|waiting|context|input|missing|blocked|reviewer|owner)/.test(combined);
  return {
    blockerType: blockerType || null,
    blockerReason: blockerReason || null,
    lastEvent: lastEvent || null,
    message: blockerReason || blockerType || extractTaskError(task),
    action: approval ? 'approval' : remediation ? 'remediate' : dependency ? 'blocked' : 'blocked',
    metadata,
  };
}

function extractTaskSignal(task) {
  const metadata = parseJsonLike(task?.metadata);
  return {
    metadata,
    lastEvent: String(metadata.snipara_last_event || '').trim().toLowerCase(),
    resolution: String(metadata.snipara_resolution || '').trim() || null,
    blockerType: String(metadata.snipara_blocker_type || metadata.blocker_type || '').trim() || null,
    blockerReason: String(metadata.snipara_blocker_reason || metadata.blocker_reason || '').trim() || null,
    closedWithWaiver: metadata.snipara_closed_with_waiver === undefined
      ? null
      : Boolean(metadata.snipara_closed_with_waiver),
    autoClosedParent: String(metadata.snipara_auto_closed_parent || '').trim() || null,
  };
}

function isUnblockedSignal(signal) {
  return String(signal?.lastEvent || '').endsWith('.unblocked');
}

function isClosureReadySignal(signal) {
  const lastEvent = String(signal?.lastEvent || '');
  return lastEvent.endsWith('.closure_ready') || lastEvent.endsWith('.closed');
}

function nextSequenceNo(steps = []) {
  return steps.reduce((max, step) => Math.max(max, Number(step?.sequence_no) || 0), 0) + 1;
}

function uniqueStrings(values = []) {
  return Array.from(new Set(
    values
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .map((value) => String(value).trim())
  ));
}

function buildDelegatedTaskTitle(run, rootTask, step = null) {
  const prefix = String(run?.id || '').slice(0, 8) || 'run';
  const input = parseJsonLike(step?.input_json);
  const phaseTitle = String(input.plan_phase_title || '').trim();
  const phaseIndex = Number.isFinite(Number(input.plan_phase_index)) ? Number(input.plan_phase_index) + 1 : null;
  const phaseCount = Number.isFinite(Number(input.plan_phase_count)) ? Number(input.plan_phase_count) : null;
  if (phaseTitle) {
    if (phaseCount && phaseCount > 1) {
      const phaseLabel = phaseIndex ? `${phaseIndex}/${phaseCount}` : `Phase ?/${phaseCount}`;
      return `[Run ${prefix}] ${phaseLabel}: ${phaseTitle}`;
    }
    return `[Run ${prefix}] ${phaseTitle}`;
  }
  return `[Run ${prefix}] ${rootTask?.title || 'Autonomous execution'}`;
}

function extractPhaseOverlayTelemetry(phase = null) {
  const executionOverlay = phase?.execution_overlay && typeof phase.execution_overlay === 'object'
    ? phase.execution_overlay
    : {};
  const blockedOverlay = phase?.execution_overlay_blocked && typeof phase.execution_overlay_blocked === 'object'
    ? phase.execution_overlay_blocked
    : {};
  const suggestions = Array.isArray(phase?.execution_overlay_suggestions)
    ? phase.execution_overlay_suggestions.filter((value) => typeof value === 'string' && value.trim())
    : [];
  const insights = phase?.execution_overlay_insights && typeof phase.execution_overlay_insights === 'object'
    ? phase.execution_overlay_insights
    : null;

  return {
    applied: {
      skills: Array.isArray(executionOverlay.skillKeys) ? executionOverlay.skillKeys : [],
      providers: Array.isArray(executionOverlay.integrationProviders) ? executionOverlay.integrationProviders : [],
      toolCapabilities: Array.isArray(executionOverlay.toolCapabilities) ? executionOverlay.toolCapabilities : [],
    },
    blocked: {
      providers: Array.isArray(blockedOverlay.providers) ? blockedOverlay.providers : [],
      skills: Array.isArray(blockedOverlay.skills) ? blockedOverlay.skills : [],
      toolCapabilities: Array.isArray(blockedOverlay.toolCapabilities) ? blockedOverlay.toolCapabilities : [],
    },
    suggestions,
    insights: insights ? {
      recommendationSummary: typeof insights.recommendation_summary === 'string' ? insights.recommendation_summary : null,
      recurringBlockers: Array.isArray(insights.recurring_blockers) ? insights.recurring_blockers : [],
      primaryBlocker: insights.primary_blocker && typeof insights.primary_blocker === 'object' ? insights.primary_blocker : null,
      escalationRecommended: insights.escalation_recommended === true,
      lookbackDays: Number.isFinite(Number(insights.lookback_days)) ? Number(insights.lookback_days) : null,
    } : null,
  };
}

function buildPhaseOverlayMetadataPatch(phase = null) {
  const telemetry = extractPhaseOverlayTelemetry(phase);
  return {
    orchestration_overlay_skills: telemetry.applied.skills,
    orchestration_overlay_providers: telemetry.applied.providers,
    orchestration_overlay_tool_capabilities: telemetry.applied.toolCapabilities,
    orchestration_blocked_overlay_providers: telemetry.blocked.providers,
    orchestration_blocked_overlay_skills: telemetry.blocked.skills,
    orchestration_blocked_overlay_tool_capabilities: telemetry.blocked.toolCapabilities,
    orchestration_autonomy_suggestions: telemetry.suggestions,
    orchestration_autonomy_insights: telemetry.insights?.recurringBlockers || [],
    orchestration_autonomy_recommendation_summary: telemetry.insights?.recommendationSummary || null,
    orchestration_autonomy_recurring_blocker: telemetry.insights?.primaryBlocker?.label || null,
    orchestration_autonomy_escalation_recommended: telemetry.insights?.escalationRecommended === true,
    orchestration_autonomy_limited: telemetry.blocked.providers.length > 0
      || telemetry.blocked.skills.length > 0
      || telemetry.blocked.toolCapabilities.length > 0,
  };
}

function hasOverlayTelemetry(phase = null) {
  const telemetry = extractPhaseOverlayTelemetry(phase);
  return telemetry.applied.skills.length > 0
    || telemetry.applied.providers.length > 0
    || telemetry.applied.toolCapabilities.length > 0
    || telemetry.blocked.providers.length > 0
    || telemetry.blocked.skills.length > 0
    || telemetry.blocked.toolCapabilities.length > 0
    || Boolean(telemetry.insights?.recommendationSummary);
}

function hasAutonomyRecommendation(phase = null) {
  const telemetry = extractPhaseOverlayTelemetry(phase);
  return Boolean(telemetry.insights?.recommendationSummary);
}

function hasBlockedOverlayEntries(filteredOverlay = null) {
  return Boolean(
    Array.isArray(filteredOverlay?.blocked?.providers) && filteredOverlay.blocked.providers.length > 0
    || Array.isArray(filteredOverlay?.blocked?.skills) && filteredOverlay.blocked.skills.length > 0
    || Array.isArray(filteredOverlay?.blocked?.toolCapabilities) && filteredOverlay.blocked.toolCapabilities.length > 0
  );
}

function formatVerificationFeedback(verdict, threshold) {
  const failed = Array.isArray(verdict?.scores)
    ? verdict.scores.filter((item) => Number(item?.score) < threshold)
    : [];

  if (failed.length === 0) {
    return String(verdict?.summary || '').trim();
  }

  return failed
    .map((item) => `- ${item.criterion}: ${item.score}/10${item.feedback ? ` - ${item.feedback}` : ''}`)
    .join('\n');
}

function requiresApproval(rootTask) {
  const metadata = parseJsonLike(rootTask?.metadata);
  if (metadata.approval_required === true || metadata.require_approval === true) return true;
  if (metadata.governance?.approval_required === true) return true;
  const approvalMode = String(metadata.approval_mode || metadata.approvalMode || '').trim().toLowerCase();
  return approvalMode === 'required' || approvalMode === 'manual' || approvalMode === 'human';
}

function approvalModeOf(rootTask) {
  const metadata = parseJsonLike(rootTask?.metadata);
  const approvalMode = String(metadata.approval_mode || metadata.approvalMode || '').trim().toLowerCase();
  if (approvalMode === 'required' || approvalMode === 'human') return 'manual';
  return approvalMode || 'manual';
}

function buildDelegatedTaskDescription(run, rootTask, step = null) {
  const plan = parseJsonLike(run?.plan_json);
  const input = parseJsonLike(step?.input_json);
  const summary = String(run?.summary || '').trim();
  const taskDescription = String(rootTask?.description || '').trim();
  const planGoal = String(plan.goal || rootTask?.title || '').trim();
  const phaseTitle = String(input.plan_phase_title || '').trim();
  const phaseObjective = String(input.phase_objective || '').trim();
  const verificationFocus = String(input.phase_verification_focus || '').trim();
  const phaseIndex = Number.isFinite(Number(input.plan_phase_index)) ? Number(input.plan_phase_index) + 1 : null;
  const phaseCount = Number.isFinite(Number(input.plan_phase_count)) ? Number(input.plan_phase_count) : null;
  const workspaceContext = String(
    input.workspace_context_excerpt
    || plan.workspace_context_excerpt
    || parseJsonLike(run?.context_json).workspace_context_excerpt
    || ''
  ).trim();
  const feedback = String(input.verification_feedback || '').trim();
  const previousOutput = String(input.previous_output || '').trim();
  const revisionLabel = Number.isFinite(Number(input.retry_count)) && Number(input.retry_count) > 0
    ? `Revision attempt #${Number(input.retry_count)}.`
    : '';
  const escalationLabel = input.escalation === true
    ? 'This step is an escalation handoff after repeated verification failures. Take ownership and fix the underlying issue.'
    : '';

  return [
    `You are executing a delegated step for orchestration run ${run?.id || 'unknown'}.`,
    '',
    `Root task: ${rootTask?.title || 'Untitled task'}`,
    taskDescription || '(no description provided)',
    '',
    summary ? `Run summary: ${summary}` : '',
    planGoal ? `Goal: ${planGoal}` : '',
    phaseTitle ? `Current phase${phaseIndex ? ` (${phaseIndex}${phaseCount ? `/${phaseCount}` : ''})` : ''}: ${phaseTitle}` : '',
    phaseObjective ? `Phase objective: ${phaseObjective}` : '',
    verificationFocus ? `Definition of done: ${verificationFocus}` : '',
    revisionLabel,
    escalationLabel,
    workspaceContext ? `Workspace context:\n${workspaceContext}` : '',
    feedback ? `Verification feedback:\n${feedback}` : '',
    previousOutput ? `Previous output to revise:\n${previousOutput}` : '',
    '',
    'Deliver the concrete output needed to complete the root task.',
    'If blocked, state the blocker clearly and what is needed to continue.',
  ].filter(Boolean).join('\n');
}

function buildReleaseLeasePatch(extra = {}) {
  return {
    lockToken: null,
    lockedBy: null,
    lockedAt: null,
    leaseExpiresAt: null,
    ...extra,
  };
}

async function loadTask(taskId) {
  if (!taskId) return null;
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.tasks
      WHERE id = $1
      LIMIT 1`,
    [taskId]
  );
  return result.rows[0] || null;
}

async function findDelegatedTask(workspaceId, runId, stepId) {
  if (!runId || !stepId) return null;
  const result = await pool.query(
    `SELECT *
       FROM ${SCHEMA}.tasks
      WHERE workspace_id = $1
        AND metadata ->> 'orchestration_parent_run_id' = $2
        AND metadata ->> 'orchestration_parent_step_id' = $3
      ORDER BY created_at DESC
      LIMIT 1`,
    [normalizeWorkspaceId(workspaceId), String(runId), String(stepId)]
  );
  return result.rows[0] || null;
}

async function updateTaskRecord(taskId, { status, output, metadata } = {}) {
  if (!taskId) throw new Error('updateTaskRecord requires taskId.');

  const mergedMeta = { ...(metadata || {}) };
  if (output !== undefined && output !== null) {
    mergedMeta.result = typeof output === 'string' ? output : JSON.stringify(output);
  }

  const sets = ['updated_at = NOW()'];
  const values = [];
  let idx = 1;

  if (status !== undefined) {
    sets.unshift(`status = $${idx}`);
    values.push(status);
    idx += 1;
  }

  if (Object.keys(mergedMeta).length > 0) {
    sets.push(`metadata = COALESCE(metadata, '{}'::jsonb) || $${idx}::jsonb`);
    values.push(JSON.stringify(mergedMeta));
    idx += 1;
  }

  if (status === 'completed' || status === 'failed') {
    sets.push('resolved_at = NOW()');
    sets.push('locked_at = NULL');
    sets.push('locked_by = NULL');
  }

  values.push(taskId);
  const result = await pool.query(
    `UPDATE ${SCHEMA}.tasks
        SET ${sets.join(', ')}
      WHERE id = $${idx}
      RETURNING *`,
    values
  );
  const taskRow = result.rows?.[0] || null;
  if (taskRow) {
    publishTaskEvent(taskRow, {
      type: 'task.updated',
      origin: 'run-engine',
      reason: status || 'task_metadata_updated',
    });
  }
  return taskRow;
}

async function postTaskChatResult(task, content, senderId, senderName) {
  const metadata = parseJsonLike(task?.metadata);
  if (metadata.origin !== 'chat' || !metadata.origin_chat_channel_id || !content) return false;

  await insertChatMessage(pool, null, SCHEMA, {
    channel_id: metadata.origin_chat_channel_id,
    sender_id: senderId,
    sender_name: senderName,
    content,
    message_type: 'text',
    workspace_id: normalizeWorkspaceId(task.workspace_id),
    processed_at: new Date(),
    processing_state: 'processed',
    reply_to_message_id: metadata.origin_chat_message_id || null,
  });

  return true;
}

class OrchestrationRunEngine {
  constructor(options = {}) {
    this.pollIntervalMs = options.pollIntervalMs || POLL_INTERVAL_MS;
    this.resumeDelayMs = options.resumeDelayMs || RESUME_DELAY_MS;
    this.leaseMs = options.leaseMs || LEASE_MS;
    this.claimBatchSize = options.claimBatchSize || CLAIM_BATCH_SIZE;
    this.workerId = options.workerId || WORKER_ID;
    this.wsConnections = options.wsConnections || null;
    this._running = false;
    this._timer = null;
    this._consecutiveErrors = 0;
    this._polling = false;
    this._immediatePollScheduled = false;
  }

  bindWsConnections(wsConnections = null) {
    this.wsConnections = wsConnections || null;
  }

  start() {
    if (this._running) return;
    this._running = true;
    console.log(`[RunEngine] Started (interval: ${this.pollIntervalMs}ms, lease: ${this.leaseMs}ms) as ${this.workerId}`);

    const tick = async () => {
      if (!this._running) return;
      await this.pollOnce();
      this._timer = setTimeout(tick, this.pollIntervalMs);
    };

    this._timer = setTimeout(tick, 2_000);
  }

  stop() {
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    console.log('[RunEngine] Stopped');
  }

  async wakeRun(runId, reason = 'manual') {
    const run = await getRunById(pool, runId);
    if (!run || TERMINAL_RUN_STATUSES.has(run.status)) return null;

    const awakened = await updateRun(pool, runId, {
      nextWakeAt: new Date(),
      lastProgressAt: new Date(),
    });

    await appendRunEvent(pool, {
      runId,
      stepId: awakened?.current_step_id || null,
      eventType: 'run.wake_requested',
      actor: 'run-engine',
      payload: { reason },
    });

    return awakened;
  }

  async approveRun(runId, {
    approved = true,
    note = null,
    actor = 'human',
  } = {}) {
    const run = await getRunById(pool, runId);
    if (!run) throw new Error('Run not found.');

    const step = await getCurrentRunStep(pool, runId);
    if (!step || step.step_type !== 'approval_gate' || run.status !== 'awaiting_approval') {
      throw new Error('Run is not currently awaiting approval.');
    }

    const now = new Date();
    const rootTask = await loadTask(run.root_task_id);
    const input = parseJsonLike(step.input_json);
    const childTask = input.delegated_task_id ? await loadTask(input.delegated_task_id) : null;

    if (approved === false) {
      await updateRunStep(pool, step.id, {
        status: 'failed',
        completedAt: now,
        error: {
          message: 'Approval rejected.',
          note: note || null,
          actor,
        },
      });

      await appendRunEvent(pool, {
        runId,
        stepId: step.id,
        eventType: 'approval.rejected',
        actor,
        payload: {
          note: note || null,
        },
      });

      if (rootTask) {
        await updateTaskRecord(rootTask.id, {
          metadata: {
            orchestration_status: 'blocked',
            orchestration_run_id: runId,
            orchestration_step_id: step.id,
            approval_rejected: true,
            approval_rejected_note: note || null,
            approval_rejected_at: now.toISOString(),
            orchestration_proactive: true,
          },
        });
      }

      const blockedRun = await updateRun(pool, runId, buildReleaseLeasePatch({
        status: 'blocked',
        currentStepId: step.id,
        nextWakeAt: null,
        lastProgressAt: now,
        error: {
          message: 'Approval rejected.',
          note: note || null,
          actor,
        },
      }));
      return { run: blockedRun, stepStatus: 'failed', approved: false };
    }

    await updateRunStep(pool, step.id, {
      status: 'completed',
      completedAt: now,
      output: {
        approved: true,
        note: note || null,
        actor,
      },
    });

    await appendRunEvent(pool, {
      runId,
      stepId: step.id,
      eventType: 'approval.approved',
      actor,
      payload: {
        note: note || null,
      },
    });

    const steps = await listRunSteps(pool, runId);
    const approvedToolAction = String(input.resume_to || '').trim() === 'execute_actions' || input.tool_action === true;
    const nextStep = approvedToolAction
      ? await this.ensureToolExecutionStep(run, steps, rootTask)
      : await this.ensureFinalizeStep(run, steps, childTask, 'success');
    const resumedRun = await updateRun(pool, runId, {
      status: 'running',
      currentStepId: nextStep.id,
      nextWakeAt: new Date(),
      lastProgressAt: now,
    });

    if (rootTask) {
      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: 'running',
          orchestration_run_id: runId,
          orchestration_step_id: nextStep.id,
          approval_granted: true,
          approval_granted_note: note || null,
          approval_granted_at: now.toISOString(),
          pending_approval: null,
          orchestration_proactive: true,
        },
      });
    }

    this.requestImmediatePoll();
    return { run: resumedRun, stepStatus: 'completed', approved: true };
  }

  async resumeRun(runId, {
    actor = 'human',
    note = null,
  } = {}) {
    const run = await getRunById(pool, runId);
    if (!run) throw new Error('Run not found.');
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      throw new Error('Run is already terminal.');
    }

    const currentStep = await getCurrentRunStep(pool, runId);
    if (!currentStep) {
      throw new Error('Run has no current step.');
    }

    if (run.status === 'awaiting_approval' && currentStep.step_type === 'approval_gate') {
      throw new Error('Run is awaiting approval. Use the approval endpoint instead.');
    }

    const now = new Date();
    if (['failed', 'cancelled', 'completed', 'skipped'].includes(String(currentStep.status || '').toLowerCase())) {
      const stepPatch = {
        completedAt: null,
        error: null,
      };
      if (currentStep.step_type === 'approval_gate') {
        stepPatch.status = 'awaiting_approval';
      } else {
        stepPatch.status = 'queued';
        stepPatch.wait = null;
      }
      await updateRunStep(pool, currentStep.id, stepPatch);
    }

    const resumedRun = await updateRun(pool, runId, buildReleaseLeasePatch({
      status: currentStep.step_type === 'plan' ? 'planning' : 'running',
      currentStepId: currentStep.id,
      nextWakeAt: now,
      lastProgressAt: now,
      error: null,
    }));

    await appendRunEvent(pool, {
      runId,
      stepId: currentStep.id,
      eventType: 'run.resumed',
      actor,
      payload: {
        note: note || null,
        previous_status: run.status,
      },
    });

    const rootTask = await loadTask(run.root_task_id).catch(() => null);
    if (rootTask) {
      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: resumedRun?.status || 'running',
          orchestration_run_id: runId,
          orchestration_step_id: currentStep.id,
          orchestration_resume_requested_at: now.toISOString(),
          orchestration_resume_note: note || null,
          approval_rejected: false,
          pending_approval: currentStep.step_type === 'approval_gate'
            ? mergeJsonObjects(parseJsonLike(rootTask.metadata).pending_approval, {
                run_id: runId,
                step_id: currentStep.id,
              })
            : parseJsonLike(rootTask.metadata).pending_approval || null,
          orchestration_proactive: true,
        },
      });
    }

    this.requestImmediatePoll();
    return { run: resumedRun, resumed: true };
  }

  async cancelRun(runId, {
    actor = 'human',
    note = null,
  } = {}) {
    const run = await getRunById(pool, runId);
    if (!run) throw new Error('Run not found.');
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      throw new Error('Run is already terminal.');
    }

    const currentStep = await getCurrentRunStep(pool, runId).catch(() => null);
    const now = new Date();

    if (currentStep && !isTerminalStepStatus(currentStep.status)) {
      await updateRunStep(pool, currentStep.id, {
        status: 'cancelled',
        completedAt: now,
        error: {
          message: 'Run cancelled.',
          note: note || null,
          actor,
        },
      });
    }

    const cancelledRun = await updateRun(pool, runId, buildReleaseLeasePatch({
      status: 'cancelled',
      currentStepId: currentStep?.id || run.current_step_id || null,
      nextWakeAt: null,
      lastProgressAt: now,
      cancelledAt: now,
      completedAt: now,
      error: {
        message: 'Run cancelled.',
        note: note || null,
        actor,
      },
    }));

    await appendRunEvent(pool, {
      runId,
      stepId: currentStep?.id || null,
      eventType: 'run.cancelled',
      actor,
      payload: {
        note: note || null,
      },
    });

    const rootTask = await loadTask(run.root_task_id).catch(() => null);
    if (rootTask) {
      await updateTaskRecord(rootTask.id, {
        status: 'cancelled',
        metadata: {
          orchestration_status: 'cancelled',
          orchestration_run_id: runId,
          orchestration_step_id: currentStep?.id || null,
          orchestration_cancelled_at: now.toISOString(),
          orchestration_cancelled_note: note || null,
          pending_approval: null,
          orchestration_proactive: true,
        },
      });
      const chatActionRunId = parseJsonLike(rootTask.metadata).chat_action_run_id || null;
      if (chatActionRunId) {
        await updateChatActionRun(pool, SCHEMA, chatActionRunId, {
          status: 'cancelled',
          executed_by: run.display_agent_id || run.requested_agent_id || null,
          output_json: null,
          error_json: {
            error: 'Run cancelled.',
            note: note || null,
            orchestration_run_id: runId,
            root_task_id: rootTask.id,
          },
        }).catch(() => {});
      }
    }

    return { run: cancelledRun, cancelled: true };
  }

  requestImmediatePoll() {
    if (this._immediatePollScheduled) return;
    this._immediatePollScheduled = true;

    setTimeout(() => {
      this._immediatePollScheduled = false;
      this.pollOnce().catch((err) => {
        console.error('[RunEngine] Immediate poll error:', err.message);
      });
    }, 0);
  }

  async pollOnce() {
    if (this._polling) return false;
    this._polling = true;
    try {
      const runs = await claimRunnableRuns(pool, this.workerId, {
        limit: this.claimBatchSize,
        leaseMs: this.leaseMs,
      });

      if (runs.length > 0) {
        console.log(`[RunEngine] Claimed ${runs.length} orchestration run(s) as ${this.workerId}`);
      }

      for (const run of runs) {
        try {
          await this.processClaimedRun(run);
        } catch (err) {
          await this.handleRunError(run, err);
        }
      }

      this._consecutiveErrors = 0;
    } catch (err) {
      this._consecutiveErrors += 1;
      if (this._consecutiveErrors <= 10) {
        console.error('[RunEngine] Poll error:', err.message, err.stack?.split('\n')[1]?.trim());
      }
    } finally {
      this._polling = false;
    }
    return true;
  }

  async processClaimedRun(claimedRun) {
    const run = await getRunById(pool, claimedRun.id) || claimedRun;
    if (!run || TERMINAL_RUN_STATUSES.has(run.status)) return;

    const currentStep = await getCurrentRunStep(pool, run.id);
    if (!currentStep) {
      throw new Error(`Run ${run.id} has no current step.`);
    }

    const steps = await listRunSteps(pool, run.id);
    await heartbeatRunLease(pool, run.id, {
      lockToken: run.lock_token,
      workerId: this.workerId,
      leaseMs: this.leaseMs,
    });

    if (currentStep.step_type === 'plan') {
      await this.processPlanStep(run, currentStep, steps);
      return;
    }

    if (currentStep.step_type === 'delegate_task') {
      await this.processDelegateStep(run, currentStep, steps);
      return;
    }

    if (currentStep.step_type === 'verify') {
      await this.processVerifyStep(run, currentStep, steps);
      return;
    }

    if (currentStep.step_type === 'approval_gate') {
      await this.processApprovalGateStep(run, currentStep, steps);
      return;
    }

    if (currentStep.step_type === 'execute_actions') {
      await this.processExecuteActionsStep(run, currentStep, steps);
      return;
    }

    if (currentStep.step_type === 'finalize') {
      await this.processFinalizeStep(run, currentStep, steps);
      return;
    }

    throw new Error(`Unsupported orchestration step type: ${currentStep.step_type}`);
  }

  async processPlanStep(run, step, steps) {
    const now = new Date();
    const rootTask = await loadTask(run.root_task_id);
    if (!rootTask) {
      throw new Error(`Root task ${run.root_task_id || 'unknown'} not found for run ${run.id}.`);
    }

    if (step.status !== 'running') {
      await updateRunStep(pool, step.id, {
        status: 'running',
        startedAt: step.started_at || now,
      });
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'step.started',
        actor: 'run-engine',
        payload: { step_type: 'plan' },
      });
    }

    const coordinator = getSwarmCoordinator();
    const rootMetadata = parseJsonLike(rootTask.metadata);
    if (String(parseJsonLike(run.plan_json).strategy || '').trim() === 'tool_actions') {
      await this.processToolPlanStep(run, step, steps, rootTask);
      return;
    }
    let workspaceContext = '';
    if (typeof coordinator.recallWorkspaceContext === 'function') {
      workspaceContext = await coordinator.recallWorkspaceContext(
        `${rootTask.title || ''}\n${rootTask.description || ''}`.trim(),
        run.workspace_id
      ).catch(() => '');
    }

    const {
      suggestedPhases,
      availableAgents,
    } = await this.buildSuggestedPlanPhases(run, rootTask, workspaceContext, coordinator);

    let sniparaConfig = null;
    let sniparaSwarmId = null;
    if (typeof coordinator.getSniparaRuntimeConfig === 'function') {
      const runtimeConfig = await coordinator.getSniparaRuntimeConfig(run.workspace_id).catch(() => null);
      sniparaConfig = runtimeConfig?.config || null;
      sniparaSwarmId = runtimeConfig?.swarmId || null;
    }

    let plan = buildRunPlan({
      run,
      rootTask,
      workspaceContext,
      snipara: {
        configured: Boolean(sniparaConfig?.configured),
        swarmId: sniparaSwarmId || rootTask.snipara_task_id || rootTask.swarm_task_id || null,
        projectId: sniparaConfig?.projectId || null,
        rootTaskId: rootTask.snipara_task_id || rootTask.swarm_task_id || rootMetadata.snipara_hierarchy_root_id || null,
      },
      suggestedPhases,
    });
    plan = await this.enrichPlanWithExecutionOverlays(run, rootTask, plan, availableAgents);
    plan.planning_source = suggestedPhases.length > 0 ? 'swarm_llm_decomposition' : 'heuristic';
    const firstPhase = resolvePlanPhase(plan, 0);
    const phaseCount = getPlanPhaseCount(plan);
    const delegatedAgents = Array.isArray(plan.phases)
      ? plan.phases
        .map((phase) => ({
          agentRef: phase?.agent_username || null,
          reason: phase?.title || phase?.objective || null,
          domain: phase?.key || null,
        }))
        .filter((entry) => entry.agentRef || entry.reason)
      : [];
    const firstPhaseAgent = findAgentRecord(firstPhase?.agent_id || firstPhase?.agent_username, availableAgents);
    const runContext = mergeJsonObjects(run.context_json, {
      workspace_context_excerpt: plan.workspace_context_excerpt,
      snipara: plan.snipara,
      plan_phase_count: phaseCount,
      delegated_agents: delegatedAgents,
      planning_source: plan.planning_source,
    });

    await updateRun(pool, run.id, {
      summary: plan.summary || run.summary,
      plan,
      context: runContext,
    });

    if (typeof coordinator.updateSharedContext === 'function') {
      const phaseSummary = Array.isArray(plan.phases)
        ? plan.phases.map((phase) => phase.title).filter(Boolean).join(' -> ')
        : '';
      await coordinator.updateSharedContext(
        [
          `Orchestration run ${run.id} planned.`,
          `Goal: ${plan.goal}`,
          `Strategy: ${plan.strategy}`,
          phaseSummary ? `Phases: ${phaseSummary}` : '',
        ].filter(Boolean).join('\n'),
        run.workspace_id
      ).catch(() => {});
    }

    if (hasOverlayTelemetry(firstPhase)) {
      const overlayTelemetry = extractPhaseOverlayTelemetry(firstPhase);
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'overlay.resolved',
        actor: 'run-engine',
        payload: {
          phase_index: firstPhase?.index || 0,
          phase_title: firstPhase?.title || rootTask.title || null,
          applied_overlay: overlayTelemetry.applied,
          blocked_overlay: overlayTelemetry.blocked,
          suggestions: overlayTelemetry.suggestions,
          insights: overlayTelemetry.insights?.recurringBlockers || [],
          recommendation_summary: overlayTelemetry.insights?.recommendationSummary || null,
          escalation_recommended: overlayTelemetry.insights?.escalationRecommended === true,
        },
      });
      if (hasAutonomyRecommendation(firstPhase)) {
        await appendRunEvent(pool, {
          runId: run.id,
          stepId: step.id,
          eventType: 'autonomy.recommendation',
          actor: 'run-engine',
          payload: {
            phase_index: firstPhase?.index || 0,
            phase_title: firstPhase?.title || rootTask.title || null,
            summary: overlayTelemetry.insights?.recommendationSummary || null,
            recurring_blockers: overlayTelemetry.insights?.recurringBlockers || [],
            escalation_recommended: overlayTelemetry.insights?.escalationRecommended === true,
          },
        });
      }
    }

    let delegateStep = steps.find((entry) => entry.step_type === 'delegate_task');
    if (!delegateStep) {
      delegateStep = await createRunStep(pool, {
        runId: run.id,
        parentStepId: step.id,
        sequenceNo: nextSequenceNo(steps),
        stepType: 'delegate_task',
        title: phaseCount > 1 && firstPhase?.title
          ? `Phase 1: ${firstPhase.title}`
          : 'Delegate execution task',
        status: 'queued',
        executor: 'task',
        selectedAgentId: firstPhaseAgent?.id || run.requested_agent_id || null,
        selectedAgentUsername: firstPhaseAgent?.username || firstPhase?.agent_username || run.requested_agent_username || rootTask.assigned_agent || null,
        input: {
          root_task_id: rootTask.id,
          root_task_title: rootTask.title || '',
          strategy: plan.strategy,
          plan_phase_index: firstPhase?.index || 0,
          plan_phase_key: firstPhase?.key || 'phase_1',
          plan_phase_title: firstPhase?.title || rootTask.title || 'Execute task',
          plan_phase_count: phaseCount || 1,
          phase_objective: firstPhase?.objective || rootTask.description || rootTask.title || '',
          phase_verification_focus: firstPhase?.verification_focus || null,
          workspace_context_excerpt: plan.workspace_context_excerpt || null,
          snipara_swarm_id: plan.snipara?.swarm_id || null,
          snipara_root_task_id: plan.snipara?.root_task_id || null,
          execution_overlay: firstPhase?.execution_overlay || null,
          execution_overlay_blocked: firstPhase?.execution_overlay_blocked || null,
          execution_overlay_suggestions: firstPhase?.execution_overlay_suggestions || [],
          execution_overlay_insights: firstPhase?.execution_overlay_insights || null,
          proactive: true,
        },
      });
      steps.push(delegateStep);
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: delegateStep.id,
        eventType: 'step.queued',
        actor: 'run-engine',
        payload: {
          sequence_no: delegateStep.sequence_no,
          step_type: 'delegate_task',
          title: delegateStep.title,
        },
      });
    } else {
      const existingInput = parseJsonLike(delegateStep.input_json);
      await updateRunStep(pool, delegateStep.id, {
        title: phaseCount > 1 && firstPhase?.title
          ? `Phase 1: ${firstPhase.title}`
          : delegateStep.title,
        selectedAgentId: delegateStep.selected_agent_id || firstPhaseAgent?.id || run.requested_agent_id || null,
        selectedAgentUsername: delegateStep.selected_agent_username || firstPhaseAgent?.username || firstPhase?.agent_username || run.requested_agent_username || rootTask.assigned_agent || null,
        input: {
          ...existingInput,
          strategy: existingInput.strategy || plan.strategy,
          plan_phase_index: existingInput.plan_phase_index ?? (firstPhase?.index || 0),
          plan_phase_key: existingInput.plan_phase_key || firstPhase?.key || 'phase_1',
          plan_phase_title: existingInput.plan_phase_title || firstPhase?.title || rootTask.title || 'Execute task',
          plan_phase_count: existingInput.plan_phase_count || phaseCount || 1,
          phase_objective: existingInput.phase_objective || firstPhase?.objective || rootTask.description || rootTask.title || '',
          phase_verification_focus: existingInput.phase_verification_focus || firstPhase?.verification_focus || null,
          workspace_context_excerpt: existingInput.workspace_context_excerpt || plan.workspace_context_excerpt || null,
          snipara_swarm_id: existingInput.snipara_swarm_id || plan.snipara?.swarm_id || null,
          snipara_root_task_id: existingInput.snipara_root_task_id || plan.snipara?.root_task_id || null,
          execution_overlay: existingInput.execution_overlay || firstPhase?.execution_overlay || null,
          execution_overlay_blocked: existingInput.execution_overlay_blocked || firstPhase?.execution_overlay_blocked || null,
          execution_overlay_suggestions: existingInput.execution_overlay_suggestions || firstPhase?.execution_overlay_suggestions || [],
          execution_overlay_insights: existingInput.execution_overlay_insights || firstPhase?.execution_overlay_insights || null,
          proactive: true,
        },
      });
    }

    const refreshedSteps = await listRunSteps(pool, run.id);
    const activeDelegateStep = refreshedSteps.find((entry) => entry.id === delegateStep.id) || delegateStep;
    const childTask = await this.ensureDelegatedChildTask(run, rootTask, activeDelegateStep);
    const wakeAt = buildWakeAt(this.resumeDelayMs);

    await updateRunStep(pool, activeDelegateStep.id, {
      status: 'waiting',
      startedAt: activeDelegateStep.started_at || now,
      selectedAgentId: activeDelegateStep.selected_agent_id || firstPhaseAgent?.id || run.requested_agent_id || null,
      selectedAgentUsername: activeDelegateStep.selected_agent_username || firstPhaseAgent?.username || firstPhase?.agent_username || run.requested_agent_username || rootTask.assigned_agent || null,
      spawnedTaskId: childTask.id,
      wait: {
        kind: 'task_completion',
        task_id: childTask.id,
        proactive: true,
        next_check_after_ms: this.resumeDelayMs,
      },
    });

    if (step.status !== 'completed') {
      await updateRunStep(pool, step.id, {
        status: 'completed',
        completedAt: now,
        output: {
          strategy: 'single_delegate',
          delegated_task_id: childTask.id,
          proactive: true,
        },
      });
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'step.completed',
        actor: 'run-engine',
        payload: {
          step_type: 'plan',
          delegated_task_id: childTask.id,
        },
      });
    }

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_status: 'waiting_on_tasks',
        orchestration_run_id: run.id,
        orchestration_step_id: activeDelegateStep.id,
        delegated_task_id: childTask.id,
        orchestration_next_wake_at: wakeAt.toISOString(),
        orchestration_phase_index: firstPhase?.index || 0,
        orchestration_phase_title: firstPhase?.title || rootTask.title || null,
        orchestration_phase_count: phaseCount || 1,
        orchestration_plan_strategy: plan.strategy,
        orchestration_planning_source: plan.planning_source,
        orchestration_delegated_agents: delegatedAgents,
        orchestration_snipara_swarm_id: plan.snipara?.swarm_id || null,
        orchestration_snipara_root_task_id: plan.snipara?.root_task_id || null,
        ...buildPhaseOverlayMetadataPatch(firstPhase),
        orchestration_proactive: true,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: activeDelegateStep.id,
      eventType: 'run.waiting_on_tasks',
      actor: 'run-engine',
      payload: {
        spawned_task_id: childTask.id,
        next_wake_at: wakeAt.toISOString(),
        plan_strategy: plan.strategy,
        planning_source: plan.planning_source,
        phase_index: firstPhase?.index || 0,
        phase_title: firstPhase?.title || null,
        proactive: true,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'waiting_on_tasks',
      currentStepId: activeDelegateStep.id,
      nextWakeAt: wakeAt,
      lastProgressAt: now,
    }));
  }

  getToolGovernedDecision(run) {
    const context = parseJsonLike(run?.context_json);
    const decision = context.governed_decision && typeof context.governed_decision === 'object'
      ? context.governed_decision
      : null;
    if (!decision || !Array.isArray(decision.actions) || decision.actions.length === 0) return null;
    return decision;
  }

  buildToolExecutionDecision(run) {
    const decision = this.getToolGovernedDecision(run);
    if (!decision) return null;
    return {
      ...decision,
      actions: decision.actions.map((action) => ({
        ...action,
        mode: 'sync',
        approval: 'none',
      })),
      metadata: {
        ...(decision.metadata || {}),
        execution_mode: 'sync',
      },
    };
  }

  async ensureToolExecutionStep(run, steps, rootTask) {
    const rootMetadata = parseJsonLike(rootTask?.metadata);
    const context = parseJsonLike(run?.context_json);
    const existing = steps.find((entry) => {
      if (entry.step_type !== 'execute_actions') return false;
      const input = parseJsonLike(entry.input_json);
      return input.tool_action === true && !isTerminalStepStatus(entry.status);
    });
    if (existing) return existing;

    const executeStep = await createRunStep(pool, {
      runId: run.id,
      sequenceNo: nextSequenceNo(steps),
      stepType: 'execute_actions',
      title: 'Execute deferred tool actions',
      status: 'queued',
      executor: 'orchestrator',
      selectedAgentId: run.requested_agent_id || null,
      selectedAgentUsername: run.requested_agent_username || null,
      input: {
        tool_action: true,
        chat_action_run_id: context.chat_action_run_id || rootMetadata.chat_action_run_id || null,
        tool_name: context.tool_name || rootMetadata.orchestration_tool_name || null,
        tool_adapter: context.tool_adapter || rootMetadata.orchestration_tool_adapter || null,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: executeStep.id,
      eventType: 'step.queued',
      actor: 'run-engine',
      payload: {
        sequence_no: executeStep.sequence_no,
        step_type: 'execute_actions',
        title: executeStep.title,
      },
    });

    return executeStep;
  }

  async processToolPlanStep(run, step, steps, rootTask) {
    const now = new Date();
    const rootMetadata = parseJsonLike(rootTask?.metadata);
    const decision = this.getToolGovernedDecision(run);
    if (!decision) {
      throw new Error(`Run ${run.id} is missing a governed tool decision.`);
    }

    const approvalRequired = String(decision?.metadata?.execution_mode || '').trim() === 'approval_required'
      || decision.actions.some((action) => String(action?.approval || '').trim() === 'required');
    const toolName = rootMetadata.orchestration_tool_name || parseJsonLike(run.context_json).tool_name || 'tool action';

    if (step.status !== 'completed') {
      await updateRunStep(pool, step.id, {
        status: 'completed',
        startedAt: step.started_at || now,
        completedAt: now,
        output: {
          strategy: 'tool_actions',
          approval_required: approvalRequired,
          tool_name: toolName,
        },
      });
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'step.completed',
        actor: 'run-engine',
        payload: {
          step_type: 'plan',
          strategy: 'tool_actions',
          tool_name: toolName,
          approval_required: approvalRequired,
        },
      });
    }

    if (approvalRequired) {
      const approvalStep = await this.ensureApprovalGateStep(
        run,
        steps,
        null,
        { overall_score: null, summary: `${toolName} requires approval before execution.` },
        rootTask,
        {
          toolAction: true,
          resumeTo: 'execute_actions',
          chatActionRunId: rootMetadata.chat_action_run_id || null,
        }
      );
      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: 'awaiting_approval',
          orchestration_run_id: run.id,
          orchestration_step_id: approvalStep.id,
          approval_required: true,
          approval_mode: approvalStep.approval_mode || 'manual',
          pending_approval: {
            run_id: run.id,
            step_id: approvalStep.id,
            summary: `${toolName} requires approval before execution.`,
            blocker_type: 'approval_required',
          },
          orchestration_proactive: true,
        },
      });
      await this.postApprovalRequest(rootTask, run, approvalStep, {
        summary: `${toolName} requires approval before execution.`,
      }).catch((err) => {
        console.warn('[RunEngine] Failed to post tool approval request:', err.message);
      });
      await updateRun(pool, run.id, buildReleaseLeasePatch({
        status: 'awaiting_approval',
        currentStepId: approvalStep.id,
        nextWakeAt: null,
        lastProgressAt: now,
      }));
      return;
    }

    const executeStep = await this.ensureToolExecutionStep(run, steps, rootTask);
    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_status: 'running',
        orchestration_run_id: run.id,
        orchestration_step_id: executeStep.id,
        pending_approval: null,
        orchestration_proactive: true,
      },
    });
    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'running',
      currentStepId: executeStep.id,
      nextWakeAt: now,
      lastProgressAt: now,
    }));
    this.requestImmediatePoll();
  }

  async processExecuteActionsStep(run, step, steps) {
    const now = new Date();
    const rootTask = await loadTask(run.root_task_id);
    if (!rootTask) {
      throw new Error(`Root task ${run.root_task_id || 'unknown'} not found for run ${run.id}.`);
    }

    if (step.status !== 'running') {
      await updateRunStep(pool, step.id, {
        status: 'running',
        startedAt: step.started_at || now,
      });
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'step.started',
        actor: 'run-engine',
        payload: { step_type: 'execute_actions' },
      });
    }

    const rootMetadata = parseJsonLike(rootTask.metadata);
    const context = parseJsonLike(run.context_json);
    const decision = this.buildToolExecutionDecision(run);
    if (!decision) {
      throw new Error(`Run ${run.id} is missing an executable tool decision.`);
    }

    const coordinator = getSwarmCoordinator();
    const availableAgents = typeof coordinator.loadAgentDirectory === 'function'
      ? await coordinator.loadAgentDirectory(run.workspace_id).catch(() => [])
      : [];
    const executionAgent = findAgentRecord(run.requested_agent_id || run.requested_agent_username, availableAgents)
      || {
        id: run.requested_agent_id || null,
        username: run.requested_agent_username || null,
        workspace_id: run.workspace_id,
      };
    const chatActionContext = context.chat_action_context && typeof context.chat_action_context === 'object'
      ? {
          ...context.chat_action_context,
          workspaceId: context.chat_action_context.workspaceId || run.workspace_id,
          messageId: context.chat_action_context.messageId || rootMetadata.origin_chat_message_id || null,
          channelId: context.chat_action_context.channelId || rootMetadata.origin_chat_channel_id || null,
          requestedAgentId: context.chat_action_context.requestedAgentId || run.requested_agent_id || null,
          displayAgentId: context.chat_action_context.displayAgentId || run.display_agent_id || run.requested_agent_id || null,
          orchestratedBy: context.chat_action_context.orchestratedBy || run.orchestrated_by || 'jarvis',
        }
      : null;

    const actionResults = [];
    for (const action of decision.actions) {
      const result = await dispatchOrchestratedAction(action, {
        db: pool,
        wsConnections: this.wsConnections || null,
        workspaceId: run.workspace_id,
        selectedAgentId: run.requested_agent_id || null,
        agent: executionAgent,
        chatActionContext,
        chatActionRunId: context.chat_action_run_id || rootMetadata.chat_action_run_id || null,
        model: context.model || null,
        provider: context.provider || null,
        nexusNodeId: context.nexus_node_id || null,
        latestUserMessage: context.latest_user_message || '',
        originTaskId: context.origin_task_id || null,
      });
      actionResults.push(result);
      if (result?.success === false || result?.status === 'awaiting_approval' || result?.status === 'timeout') {
        break;
      }
    }

    const success = actionResults.length > 0
      && actionResults.every((result) => result?.success !== false && result?.status === 'completed');
    const resultText = buildToolActionSummary(decision.actions, actionResults);
    const finalizeStep = await this.ensureFinalizeStep(run, steps, null, success ? 'success' : 'failure', {
      toolAction: true,
      toolResultText: resultText,
      toolActionResults: actionResults,
      chatActionRunId: context.chat_action_run_id || rootMetadata.chat_action_run_id || null,
      toolName: context.tool_name || rootMetadata.orchestration_tool_name || null,
    });

    await updateRunStep(pool, step.id, success ? {
      status: 'completed',
      completedAt: now,
      output: {
        result: resultText,
        action_results: actionResults,
      },
    } : {
      status: 'failed',
      completedAt: now,
      error: {
        message: resultText,
        action_results: actionResults,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: step.id,
      eventType: success ? 'tool_actions.completed' : 'tool_actions.failed',
      actor: 'run-engine',
      payload: {
        tool_name: context.tool_name || rootMetadata.orchestration_tool_name || null,
        chat_action_run_id: context.chat_action_run_id || rootMetadata.chat_action_run_id || null,
      },
    });

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_status: success ? 'running' : 'failed',
        orchestration_run_id: run.id,
        orchestration_step_id: finalizeStep.id,
        pending_approval: null,
        chat_action_run_id: context.chat_action_run_id || rootMetadata.chat_action_run_id || null,
        orchestration_proactive: true,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'running',
      currentStepId: finalizeStep.id,
      nextWakeAt: now,
      lastProgressAt: now,
      error: success ? null : { message: resultText },
    }));
    this.requestImmediatePoll();
  }

  async buildSuggestedPlanPhases(run, rootTask, workspaceContext, coordinator) {
    const planningCoordinator = coordinator || getSwarmCoordinator();
    let availableAgents = [];
    if (typeof planningCoordinator.loadAgentDirectory === 'function') {
      availableAgents = await planningCoordinator.loadAgentDirectory(run.workspace_id).catch(() => []);
    }

    if (typeof planningCoordinator.decomposeWithLLM !== 'function') {
      return { suggestedPhases: [], availableAgents };
    }

    const preferredAgentId = run.requested_agent_id
      || run.requested_agent_username
      || rootTask.assigned_agent
      || rootTask.assignee
      || null;
    const planningInput = [
      rootTask.title || '',
      rootTask.description || '',
      workspaceContext ? `Workspace context:\n${workspaceContext}` : '',
    ].filter(Boolean).join('\n\n');

    const subtasks = await planningCoordinator.decomposeWithLLM(
      planningInput,
      availableAgents,
      run.workspace_id,
      { preferredAgentId }
    ).catch(() => []);

    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      return { suggestedPhases: [], availableAgents };
    }

    const suggestedPhases = subtasks.slice(0, 3).map((subtask, index) => {
      const resolvedAgent = typeof planningCoordinator.resolveAgentForSubtask === 'function'
        ? planningCoordinator.resolveAgentForSubtask(subtask, availableAgents, preferredAgentId)
        : String(subtask?.agent || preferredAgentId || '').trim() || null;
      const resolvedAgentRecord = findAgentRecord(resolvedAgent, availableAgents);
      return {
        key: `phase_${index + 1}`,
        title: subtask?.title || `Phase ${index + 1}`,
        objective: subtask?.description || subtask?.title || rootTask.description || rootTask.title || '',
        agent_id: resolvedAgentRecord?.id || null,
        agent_username: resolvedAgentRecord?.username || resolvedAgent || null,
        verification_focus: subtask?.verification_focus || subtask?.success_criteria || null,
      };
    }).filter((entry) => entry.title || entry.objective);

    return { suggestedPhases, availableAgents };
  }

  async enrichPlanWithExecutionOverlays(run, rootTask, plan, availableAgents = []) {
    const parsedPlan = parseJsonLike(plan);
    const phases = Array.isArray(parsedPlan.phases) ? parsedPlan.phases : [];
    if (phases.length === 0) return parsedPlan;

    const nextPhases = [];
    for (const phase of phases) {
      nextPhases.push(await this.enrichPlanPhaseWithExecutionOverlay(run, rootTask, phase, availableAgents));
    }

    return {
      ...parsedPlan,
      phases: nextPhases,
    };
  }

  async enrichPlanPhaseWithExecutionOverlay(run, rootTask, phase, availableAgents = []) {
    const selectedAgent = findAgentRecord(
      phase?.agent_id || phase?.agent_username || run.requested_agent_id || run.requested_agent_username,
      availableAgents
    );
    const desiredOverlay = await this.resolveDesiredExecutionOverlayForPhase(
      run,
      rootTask,
      phase,
      availableAgents,
      selectedAgent
    );

    const nextPhase = {
      ...phase,
      ...(selectedAgent?.id ? { agent_id: selectedAgent.id } : {}),
      ...(selectedAgent?.username ? { agent_username: selectedAgent.username } : {}),
    };

    if (isOverlayEmpty(desiredOverlay)) {
      delete nextPhase.execution_overlay;
      return nextPhase;
    }

    const filteredOverlay = await filterExecutionOverlay({
      workspaceId: run.workspace_id,
      agent: selectedAgent || {
        id: run.requested_agent_id || null,
        username: phase?.agent_username || run.requested_agent_username || null,
      },
      overlay: desiredOverlay,
      db: pool,
    }).catch(() => desiredOverlay);

    if (isOverlayEmpty(filteredOverlay) && !hasBlockedOverlayEntries(filteredOverlay)) {
      delete nextPhase.execution_overlay;
      delete nextPhase.execution_overlay_blocked;
      delete nextPhase.execution_overlay_suggestions;
      delete nextPhase.execution_overlay_insights;
      return nextPhase;
    }

    nextPhase.execution_overlay = isOverlayEmpty(filteredOverlay)
      ? null
      : {
          skillKeys: filteredOverlay.skillKeys || [],
          integrationProviders: filteredOverlay.integrationProviders || [],
          toolCapabilities: filteredOverlay.toolCapabilities || [],
        };
    nextPhase.execution_overlay_blocked = {
      providers: Array.isArray(filteredOverlay.blocked?.providers) ? filteredOverlay.blocked.providers : [],
      skills: Array.isArray(filteredOverlay.blocked?.skills) ? filteredOverlay.blocked.skills : [],
      toolCapabilities: Array.isArray(filteredOverlay.blocked?.toolCapabilities) ? filteredOverlay.blocked.toolCapabilities : [],
    };
    nextPhase.execution_overlay_suggestions = buildOverlaySuggestionMessages(filteredOverlay);
    nextPhase.execution_overlay_insights = filteredOverlay.insights || null;
    return nextPhase;
  }

  async resolveDesiredExecutionOverlayForPhase(run, rootTask, phase, availableAgents = [], selectedAgent = null) {
    const existingOverlay = phase?.execution_overlay && typeof phase.execution_overlay === 'object'
      ? phase.execution_overlay
      : {};
    const phaseText = [
      rootTask?.title || '',
      phase?.title || '',
      phase?.objective || '',
    ].filter(Boolean).join('\n\n');

    if (!phaseText.trim()) {
      return {
        skillKeys: Array.isArray(existingOverlay.skillKeys) ? existingOverlay.skillKeys : [],
        integrationProviders: Array.isArray(existingOverlay.integrationProviders) ? existingOverlay.integrationProviders : [],
        toolCapabilities: Array.isArray(existingOverlay.toolCapabilities) ? existingOverlay.toolCapabilities : [],
      };
    }

    const resolved = await resolveOrchestrationCapabilities({
      workspaceId: run.workspace_id,
      messageText: phaseText,
      history: [],
      requestedAgent: selectedAgent || {
        id: run.requested_agent_id || null,
        username: phase?.agent_username || run.requested_agent_username || null,
      },
      availableAgents,
      db: pool,
    }).catch(() => null);

    return {
      skillKeys: uniqueStrings([
        ...(Array.isArray(existingOverlay.skillKeys) ? existingOverlay.skillKeys : []),
        ...(Array.isArray(resolved?.overlaySkillKeys) ? resolved.overlaySkillKeys : []),
      ]),
      integrationProviders: uniqueStrings([
        ...(Array.isArray(existingOverlay.integrationProviders) ? existingOverlay.integrationProviders : []),
        ...(Array.isArray(resolved?.overlayProviders) ? resolved.overlayProviders : []),
      ]),
      toolCapabilities: uniqueStrings([
        ...(Array.isArray(existingOverlay.toolCapabilities) ? existingOverlay.toolCapabilities : []),
        ...(Array.isArray(resolved?.overlayToolCapabilities) ? resolved.overlayToolCapabilities : []),
      ]),
    };
  }

  async processDelegateStep(run, step, steps) {
    const now = new Date();
    const rootTask = await loadTask(run.root_task_id);
    if (!rootTask) {
      throw new Error(`Root task ${run.root_task_id || 'unknown'} not found for run ${run.id}.`);
    }

    const childTask = await this.ensureDelegatedChildTask(run, rootTask, step);
    if (!childTask) {
      throw new Error(`Delegated child task missing for run ${run.id}, step ${step.id}.`);
    }

    const taskSignal = extractTaskSignal(childTask);

    if (ACTIVE_TASK_STATUSES.has(String(childTask.status || '').toLowerCase())) {
      const wakeAt = buildWakeAt(this.resumeDelayMs);

      if (run.status === 'blocked' || step.status === 'blocked' || isUnblockedSignal(taskSignal)) {
        await appendRunEvent(pool, {
          runId: run.id,
          stepId: step.id,
          eventType: 'delegate.task_resumed',
          actor: 'run-engine',
          payload: {
            delegated_task_id: childTask.id,
            child_task_status: childTask.status,
            resolution: taskSignal.resolution,
            blocker_type: taskSignal.blockerType,
            blocker_reason: taskSignal.blockerReason,
            last_event: taskSignal.lastEvent || null,
          },
        });
      }

      await updateRunStep(pool, step.id, {
        status: 'waiting',
        startedAt: step.started_at || now,
        spawnedTaskId: childTask.id,
        completedAt: null,
        error: null,
        wait: {
          kind: 'task_completion',
          task_id: childTask.id,
          proactive: true,
          next_check_after_ms: this.resumeDelayMs,
        },
      });

      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: 'waiting_on_tasks',
          orchestration_run_id: run.id,
          orchestration_step_id: step.id,
          delegated_task_id: childTask.id,
          orchestration_next_wake_at: wakeAt.toISOString(),
          orchestration_blocker_type: null,
          orchestration_blocker_reason: null,
          orchestration_last_resolution: taskSignal.resolution,
          pending_approval: null,
          orchestration_proactive: true,
        },
      });

      await updateRun(pool, run.id, buildReleaseLeasePatch({
        status: 'waiting_on_tasks',
        currentStepId: step.id,
        nextWakeAt: wakeAt,
        lastProgressAt: now,
        error: null,
      }));
      return;
    }

    if (String(childTask.status || '').toLowerCase() === 'completed') {
      if (isClosureReadySignal(taskSignal)) {
        await appendRunEvent(pool, {
          runId: run.id,
          stepId: step.id,
          eventType: 'delegate.task_closure_ready',
          actor: 'run-engine',
          payload: {
            delegated_task_id: childTask.id,
            child_task_status: childTask.status,
            closed_with_waiver: taskSignal.closedWithWaiver,
            auto_closed_parent: taskSignal.autoClosedParent,
            resolution: taskSignal.resolution,
            last_event: taskSignal.lastEvent || null,
          },
        });

        await updateTaskRecord(rootTask.id, {
          metadata: {
            orchestration_closure_ready: true,
            orchestration_closed_with_waiver: taskSignal.closedWithWaiver,
            orchestration_auto_closed_parent: taskSignal.autoClosedParent,
            orchestration_last_resolution: taskSignal.resolution,
            delegated_task_id: childTask.id,
            orchestration_proactive: true,
          },
        });
      }

      await updateRunStep(pool, step.id, {
        status: 'completed',
        completedAt: now,
        spawnedTaskId: childTask.id,
        error: null,
        wait: null,
        output: {
          delegated_task_id: childTask.id,
          child_task_status: childTask.status,
        },
      });

      const verifyStep = await this.ensureVerifyStep(run, steps, childTask, step);
      await updateRun(pool, run.id, {
        status: 'running',
        currentStepId: verifyStep.id,
        nextWakeAt: null,
        lastProgressAt: now,
        error: null,
      });
      await this.processVerifyStep(run, verifyStep, [...steps, verifyStep], {
        rootTask,
        childTask,
        delegateStep: step,
      });
      return;
    }

    if (String(childTask.status || '').toLowerCase() === 'blocked') {
      await this.handleBlockedDelegate(run, step, steps, rootTask, childTask);
      return;
    }

    if (FAILED_TASK_STATUSES.has(String(childTask.status || '').toLowerCase())) {
      await this.handleDelegateFailure(run, step, steps, rootTask, childTask);
      return;
    }

    const wakeAt = buildWakeAt(this.resumeDelayMs);
    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'waiting_on_tasks',
      currentStepId: step.id,
      nextWakeAt: wakeAt,
      lastProgressAt: now,
    }));
  }

  async processVerifyStep(run, step, steps, context = {}) {
    const now = new Date();
    const rootTask = context.rootTask || await loadTask(run.root_task_id);
    if (!rootTask) {
      throw new Error(`Root task ${run.root_task_id || 'unknown'} not found for run ${run.id}.`);
    }

    const childTask = context.childTask || await this.loadTaskForStep(step, steps);
    if (!childTask) {
      throw new Error(`Verify step ${step.id} is missing delegated task context.`);
    }
    const delegateStep = context.delegateStep || this.resolveDelegateStepForVerifyStep(step, steps);

    if (step.status !== 'running') {
      await updateRunStep(pool, step.id, {
        status: 'running',
        startedAt: step.started_at || now,
      });
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'step.started',
        actor: 'run-engine',
        payload: { step_type: 'verify' },
      });
    }

    const verifier = getVerificationEngine();
    const evaluation = await verifier.evaluateTaskOutput(rootTask, extractTaskResult(childTask));
    await verifier.recordVerdict(childTask, evaluation.verdict, {
      retryCount: Number(step.retry_count) || Number(childTask.retry_count) || 0,
    }).catch(() => {});

    await updateRunStep(pool, step.id, {
      output: {
        delegated_task_id: childTask.id,
        verification: evaluation.verdict,
        verification_threshold: evaluation.threshold,
        passed: evaluation.passed,
      },
    });

    await updateTaskRecord(rootTask.id, {
      metadata: {
        last_verification_score: evaluation.verdict?.overall_score ?? null,
        last_verification_pass: evaluation.passed,
        last_verification_summary: evaluation.verdict?.summary || null,
        last_verified_task_id: childTask.id,
        orchestration_status: 'running',
        orchestration_step_id: step.id,
        orchestration_proactive: true,
      },
    });

    if (shouldRequireManualVerificationReview(rootTask, evaluation)) {
      const reviewSummary = buildVerificationReviewSummary(evaluation);
      await updateRunStep(pool, step.id, {
        status: 'completed',
        completedAt: now,
        output: {
          delegated_task_id: childTask.id,
          verification: evaluation.verdict,
          verification_threshold: evaluation.threshold,
          passed: true,
          auto_accepted: true,
          auto_accepted_reason: evaluation.autoAcceptedReason || null,
          manual_review_required: true,
        },
      });

      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'verify.manual_review_required',
        actor: 'run-engine',
        payload: {
          delegated_task_id: childTask.id,
          auto_accepted_reason: evaluation.autoAcceptedReason || null,
        },
      });

      const approvalStep = await this.ensureApprovalGateStep(run, steps, childTask, {
        overall_score: evaluation.verdict?.overall_score ?? null,
        summary: reviewSummary,
      }, rootTask);
      const awaitingRun = await updateRun(pool, run.id, buildReleaseLeasePatch({
        status: 'awaiting_approval',
        currentStepId: approvalStep.id,
        nextWakeAt: null,
        lastProgressAt: now,
      }));

      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: 'awaiting_approval',
          orchestration_run_id: run.id,
          orchestration_step_id: approvalStep.id,
          delegated_task_id: childTask.id,
          approval_required: true,
          approval_mode: approvalModeOf(rootTask),
          verification_auto_accepted: true,
          verification_auto_accepted_reason: evaluation.autoAcceptedReason || null,
          pending_approval: {
            run_id: run.id,
            step_id: approvalStep.id,
            delegated_task_id: childTask.id,
            verification_score: evaluation.verdict?.overall_score ?? null,
            summary: reviewSummary,
            blocker_type: 'verification_review',
          },
          orchestration_proactive: true,
        },
      });

      await this.postApprovalRequest(rootTask, run, approvalStep, {
        summary: reviewSummary,
      }).catch((err) => {
        console.warn('[RunEngine] Failed to post verification review request:', err.message);
      });
      return awaitingRun;
    }

    if (evaluation.passed) {
      await updateRunStep(pool, step.id, {
        status: 'completed',
        completedAt: now,
        output: {
          delegated_task_id: childTask.id,
          verification: evaluation.verdict,
          verification_threshold: evaluation.threshold,
          passed: true,
        },
      });

      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'verify.passed',
        actor: 'run-engine',
        payload: {
          delegated_task_id: childTask.id,
          overall_score: evaluation.verdict?.overall_score ?? null,
        },
      });

      const nextPlannedStep = await this.maybeQueueNextPlannedPhase(run, rootTask, steps, delegateStep, childTask);
      if (nextPlannedStep) {
        return nextPlannedStep;
      }

      if (requiresApproval(rootTask)) {
        const approvalStep = await this.ensureApprovalGateStep(run, steps, childTask, evaluation.verdict, rootTask);
        const awaitingRun = await updateRun(pool, run.id, buildReleaseLeasePatch({
          status: 'awaiting_approval',
          currentStepId: approvalStep.id,
          nextWakeAt: null,
          lastProgressAt: now,
        }));

        await updateTaskRecord(rootTask.id, {
          metadata: {
            orchestration_status: 'awaiting_approval',
            orchestration_run_id: run.id,
            orchestration_step_id: approvalStep.id,
            delegated_task_id: childTask.id,
            approval_required: true,
            approval_mode: approvalModeOf(rootTask),
            pending_approval: {
              run_id: run.id,
              step_id: approvalStep.id,
              delegated_task_id: childTask.id,
              verification_score: evaluation.verdict?.overall_score ?? null,
              summary: evaluation.verdict?.summary || null,
            },
            orchestration_proactive: true,
          },
        });

        await this.postApprovalRequest(rootTask, run, approvalStep, evaluation.verdict).catch((err) => {
          console.warn('[RunEngine] Failed to post approval request:', err.message);
        });
        return awaitingRun;
      }

      const finalizeStep = await this.ensureFinalizeStep(run, steps, childTask, 'success');
      await updateRun(pool, run.id, {
        status: 'running',
        currentStepId: finalizeStep.id,
        nextWakeAt: null,
        lastProgressAt: now,
      });
      await this.processFinalizeStep(run, finalizeStep, [...steps, finalizeStep], {
        rootTask,
        childTask,
        outcome: 'success',
      });
      return;
    }

    const nextRetryCount = (Number(step.retry_count) || 0) + 1;
    await updateRunStep(pool, step.id, {
      status: 'failed',
      retryCount: nextRetryCount,
      completedAt: now,
      error: {
        delegated_task_id: childTask.id,
        verification: evaluation.verdict,
        verification_threshold: evaluation.threshold,
        feedback: formatVerificationFeedback(evaluation.verdict, evaluation.threshold),
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: step.id,
      eventType: 'verify.failed',
      actor: 'run-engine',
      payload: {
        delegated_task_id: childTask.id,
        overall_score: evaluation.verdict?.overall_score ?? null,
        retry_count: nextRetryCount,
      },
    });

    if (nextRetryCount > verifier.maxRetries) {
      await this.queueFollowUpDelegateStep(run, rootTask, steps, {
        title: `Escalation review: ${rootTask.title || 'Autonomous task'}`,
        selectedAgentUsername: 'mike',
        selectedAgentId: null,
        retryCount: nextRetryCount,
        previousTask: childTask,
        sourceStep: delegateStep,
        verdict: evaluation.verdict,
        threshold: evaluation.threshold,
        escalation: true,
      });
      return;
    }

    await this.queueFollowUpDelegateStep(run, rootTask, steps, {
      title: `Revision #${nextRetryCount}: ${rootTask.title || 'Autonomous task'}`,
      selectedAgentUsername: run.requested_agent_username || rootTask.assigned_agent || rootTask.assignee || null,
      selectedAgentId: run.requested_agent_id || null,
      retryCount: nextRetryCount,
      previousTask: childTask,
      sourceStep: delegateStep,
      verdict: evaluation.verdict,
      threshold: evaluation.threshold,
      escalation: false,
    });
  }

  async processApprovalGateStep(run, step) {
    const now = new Date();
    if (step.status !== 'awaiting_approval') {
      await updateRunStep(pool, step.id, {
        status: 'awaiting_approval',
        startedAt: step.started_at || now,
      });
    }

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'awaiting_approval',
      currentStepId: step.id,
      nextWakeAt: null,
      lastProgressAt: now,
    }));
  }

  async handleBlockedDelegate(run, step, steps, rootTask, childTask) {
    const now = new Date();
    const blocker = extractTaskBlocker(childTask);
    const nextRetryCount = (Number(step.retry_count) || 0) + 1;

    await updateRunStep(pool, step.id, {
      status: 'blocked',
      retryCount: nextRetryCount,
      completedAt: null,
      spawnedTaskId: childTask.id,
      wait: {
        kind: 'blocked',
        task_id: childTask.id,
        blocker_type: blocker.blockerType,
        blocker_reason: blocker.blockerReason,
      },
      error: {
        delegated_task_id: childTask.id,
        child_task_status: childTask.status,
        blocker_type: blocker.blockerType,
        blocker_reason: blocker.blockerReason,
        message: blocker.message,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: step.id,
      eventType: 'delegate.task_blocked',
      actor: 'run-engine',
      payload: {
        delegated_task_id: childTask.id,
        child_task_status: childTask.status,
        blocker_type: blocker.blockerType,
        blocker_reason: blocker.blockerReason,
        action: blocker.action,
      },
    });

    if (blocker.action === 'approval') {
      const approvalStep = await this.ensureApprovalGateStep(run, steps, childTask, {
        overall_score: null,
        summary: blocker.message,
      }, rootTask);
      const awaitingRun = await updateRun(pool, run.id, buildReleaseLeasePatch({
        status: 'awaiting_approval',
        currentStepId: approvalStep.id,
        nextWakeAt: null,
        lastProgressAt: now,
      }));

      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: 'awaiting_approval',
          orchestration_run_id: run.id,
          orchestration_step_id: approvalStep.id,
          delegated_task_id: childTask.id,
          approval_required: true,
          approval_mode: approvalModeOf(rootTask),
          orchestration_blocker_type: blocker.blockerType,
          orchestration_blocker_reason: blocker.blockerReason,
          pending_approval: {
            run_id: run.id,
            step_id: approvalStep.id,
            delegated_task_id: childTask.id,
            summary: blocker.message,
            blocker_type: blocker.blockerType,
            blocker_reason: blocker.blockerReason,
          },
          orchestration_proactive: true,
        },
      });

      await this.postApprovalRequest(rootTask, run, approvalStep, {
        summary: blocker.message,
      }).catch((err) => {
        console.warn('[RunEngine] Failed to post approval request for blocked task:', err.message);
      });

      return awaitingRun;
    }

    if (blocker.action === 'remediate') {
      await this.queueFollowUpDelegateStep(run, rootTask, steps, {
        title: `Remediation: ${rootTask.title || 'Autonomous task'}`,
        selectedAgentUsername: run.requested_agent_username || rootTask.assigned_agent || rootTask.assignee || null,
        selectedAgentId: run.requested_agent_id || null,
        retryCount: nextRetryCount,
        previousTask: childTask,
        sourceStep: step,
        verdict: {
          overall_score: 0,
          summary: blocker.message,
          scores: [],
        },
        threshold: getVerificationEngine().passThreshold,
        escalation: false,
      });
      return;
    }

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_status: 'blocked',
        orchestration_run_id: run.id,
        orchestration_step_id: step.id,
        delegated_task_id: childTask.id,
        orchestration_blocker_type: blocker.blockerType,
        orchestration_blocker_reason: blocker.blockerReason,
        pending_approval: null,
        orchestration_proactive: true,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'blocked',
      currentStepId: step.id,
      nextWakeAt: null,
      lastProgressAt: now,
      error: {
        message: blocker.message,
        blocker_type: blocker.blockerType,
        blocker_reason: blocker.blockerReason,
        delegated_task_id: childTask.id,
      },
    }));
  }

  async handleDelegateFailure(run, step, steps, rootTask, childTask) {
    const now = new Date();
    const message = extractTaskError(childTask);
    const nextRetryCount = (Number(step.retry_count) || 0) + 1;

    await updateRunStep(pool, step.id, {
      status: 'failed',
      retryCount: nextRetryCount,
      completedAt: now,
      spawnedTaskId: childTask.id,
      error: {
        delegated_task_id: childTask.id,
        child_task_status: childTask.status,
        message,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: step.id,
      eventType: 'delegate.task_failed',
      actor: 'run-engine',
      payload: {
        delegated_task_id: childTask.id,
        child_task_status: childTask.status,
        retry_count: nextRetryCount,
        message,
      },
    });

    const verifier = getVerificationEngine();
    if (nextRetryCount > verifier.maxRetries) {
      await this.queueFollowUpDelegateStep(run, rootTask, steps, {
        title: `Escalation review: ${rootTask.title || 'Autonomous task'}`,
        selectedAgentUsername: 'mike',
        selectedAgentId: null,
        retryCount: nextRetryCount,
        previousTask: childTask,
        sourceStep: step,
        verdict: {
          overall_score: 0,
          summary: message,
          scores: [],
        },
        threshold: verifier.passThreshold,
        escalation: true,
      });
      return;
    }

    await this.queueFollowUpDelegateStep(run, rootTask, steps, {
      title: `Revision #${nextRetryCount}: ${rootTask.title || 'Autonomous task'}`,
      selectedAgentUsername: run.requested_agent_username || rootTask.assigned_agent || rootTask.assignee || null,
      selectedAgentId: run.requested_agent_id || null,
      retryCount: nextRetryCount,
      previousTask: childTask,
      sourceStep: step,
      verdict: {
        overall_score: 0,
        summary: message,
        scores: [],
      },
      threshold: verifier.passThreshold,
      escalation: false,
    });
  }

  async processFinalizeStep(run, step, steps, context = {}) {
    const now = new Date();
    const rootTask = context.rootTask || await loadTask(run.root_task_id);
    if (!rootTask) {
      throw new Error(`Root task ${run.root_task_id || 'unknown'} not found for run ${run.id}.`);
    }

    const finalizeInput = parseJsonLike(step?.input_json);
    const toolAction = finalizeInput.tool_action === true;
    const childTask = context.childTask || await this.loadFinalizeChildTask(run, step, steps);
    const outcome = context.outcome || (toolAction ? finalizeInput.outcome : this.resolveFinalizeOutcome(childTask, step));
    const toolResultText = toolAction
      ? String(finalizeInput.tool_result_text || '').trim()
      : '';
    const toolActionResults = Array.isArray(finalizeInput.tool_action_results)
      ? finalizeInput.tool_action_results
      : [];
    const chatActionRunId = finalizeInput.chat_action_run_id || parseJsonLike(rootTask.metadata).chat_action_run_id || null;

    if (step.status !== 'running' && step.status !== 'completed' && step.status !== 'failed') {
      await updateRunStep(pool, step.id, {
        status: 'running',
        startedAt: step.started_at || now,
      });
    }

    if (outcome === 'success') {
      const resultText = toolAction
        ? (toolResultText || run.summary || 'Completed.')
        : (extractTaskResult(childTask) || run.summary || 'Completed.');
      await updateTaskRecord(rootTask.id, {
        status: 'completed',
        output: resultText,
        metadata: {
          orchestration_status: 'completed',
          orchestration_run_id: run.id,
          orchestration_step_id: step.id,
          orchestration_completed_at: now.toISOString(),
          delegated_task_id: childTask?.id || null,
          delegated_task_status: childTask?.status || null,
          chat_action_run_id: chatActionRunId,
          pending_approval: null,
          escalation_active: false,
          orchestration_proactive: true,
        },
      });

      const coordinator = getSwarmCoordinator();
      if (typeof coordinator.rememberLearning === 'function') {
        await coordinator.rememberLearning(rootTask.title, resultText, run.workspace_id).catch(() => {});
      }
      if (typeof coordinator.updateSharedContext === 'function') {
        await coordinator.updateSharedContext(
          `Orchestration run ${run.id} completed for "${rootTask.title || 'task'}".`,
          run.workspace_id
        ).catch(() => {});
      }

      await this.postRootTaskChatResult(rootTask, resultText, run).catch((err) => {
        console.warn('[RunEngine] Failed to post completion in chat:', err.message);
      });
      if (chatActionRunId) {
        await updateChatActionRun(pool, SCHEMA, chatActionRunId, {
          status: 'success',
          executed_by: run.display_agent_id || run.requested_agent_id || null,
          output_json: {
            result: resultText,
            orchestration_run_id: run.id,
            orchestration_step_id: step.id,
            root_task_id: rootTask.id,
            tool_action_results: toolActionResults,
          },
        }).catch(() => {});
      }

      await updateRunStep(pool, step.id, {
        status: 'completed',
        startedAt: step.started_at || now,
        completedAt: now,
        output: {
          result: resultText,
          delegated_task_id: childTask?.id || null,
          delegated_task_status: childTask?.status || null,
          tool_action_results: toolActionResults,
          proactive: true,
        },
      });

      await appendRunEvent(pool, {
        runId: run.id,
        stepId: step.id,
        eventType: 'run.completed',
        actor: 'run-engine',
        payload: {
          delegated_task_id: childTask?.id || null,
          delegated_task_status: childTask?.status || null,
        },
      });

      await updateRun(pool, run.id, buildReleaseLeasePatch({
        status: 'completed',
        currentStepId: step.id,
        nextWakeAt: null,
        lastProgressAt: now,
        completedAt: now,
        result: {
          result: resultText,
          delegated_task_id: childTask?.id || null,
          delegated_task_status: childTask?.status || null,
        },
      }));
      return;
    }

    const message = toolAction
      ? (toolResultText || 'Tool action execution failed.')
      : extractTaskError(childTask);
    await updateTaskRecord(rootTask.id, {
      status: 'failed',
      metadata: {
        error: message,
        orchestration_status: 'failed',
        orchestration_run_id: run.id,
        orchestration_step_id: step.id,
        orchestration_failed_at: now.toISOString(),
        delegated_task_id: childTask?.id || null,
        delegated_task_status: childTask?.status || null,
        chat_action_run_id: chatActionRunId,
        pending_approval: null,
        orchestration_proactive: true,
      },
    });

    const coordinator = getSwarmCoordinator();
    if (typeof coordinator.updateSharedContext === 'function') {
      await coordinator.updateSharedContext(
        `Orchestration run ${run.id} failed for "${rootTask.title || 'task'}": ${message}`,
        run.workspace_id
      ).catch(() => {});
    }

    await this.postRootTaskFailure(rootTask, message).catch((err) => {
      console.warn('[RunEngine] Failed to post failure in chat:', err.message);
    });
    if (chatActionRunId) {
      await updateChatActionRun(pool, SCHEMA, chatActionRunId, {
        status: 'error',
        executed_by: run.display_agent_id || run.requested_agent_id || null,
        output_json: null,
        error_json: {
          error: message,
          orchestration_run_id: run.id,
          orchestration_step_id: step.id,
          root_task_id: rootTask.id,
          tool_action_results: toolActionResults,
        },
      }).catch(() => {});
    }

    await updateRunStep(pool, step.id, {
      status: 'failed',
      startedAt: step.started_at || now,
      completedAt: now,
      error: {
        message,
        delegated_task_id: childTask?.id || null,
        delegated_task_status: childTask?.status || null,
        proactive: true,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: step.id,
      eventType: 'run.failed',
      actor: 'run-engine',
      payload: {
        message,
        delegated_task_id: childTask?.id || null,
        delegated_task_status: childTask?.status || null,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'failed',
      currentStepId: step.id,
      nextWakeAt: null,
      lastProgressAt: now,
      error: {
        message,
        delegated_task_id: childTask?.id || null,
        delegated_task_status: childTask?.status || null,
      },
    }));
  }

  async ensureDelegatedChildTask(run, rootTask, step) {
    if (step.spawned_task_id) {
      const loaded = await loadTask(step.spawned_task_id);
      if (loaded) return loaded;
    }

    const existing = await findDelegatedTask(run.workspace_id, run.id, step.id);
    if (existing) {
      return existing;
    }

    const coordinator = getSwarmCoordinator();
    const input = parseJsonLike(step?.input_json);
    const selectedAgentUsername = step.selected_agent_username || run.requested_agent_username || rootTask.assigned_agent || rootTask.assignee || null;
    const selectedAgentId = step.selected_agent_id || run.requested_agent_id || null;
    const executionOverlay = input.execution_overlay && typeof input.execution_overlay === 'object'
      ? input.execution_overlay
      : null;
    const blockedOverlay = input.execution_overlay_blocked && typeof input.execution_overlay_blocked === 'object'
      ? input.execution_overlay_blocked
      : null;
    const overlaySuggestions = Array.isArray(input.execution_overlay_suggestions)
      ? input.execution_overlay_suggestions.filter((value) => typeof value === 'string' && value.trim())
      : [];
    const overlayInsights = input.execution_overlay_insights && typeof input.execution_overlay_insights === 'object'
      ? input.execution_overlay_insights
      : null;
    const childTask = await coordinator.createTask({
      title: buildDelegatedTaskTitle(run, rootTask, step),
      description: buildDelegatedTaskDescription(run, rootTask, step),
      priority: rootTask.priority || 'medium',
      assigned_agent: selectedAgentUsername,
      for_agent_id: selectedAgentId || selectedAgentUsername,
      parent_id: rootTask.id,
      metadata: {
        workflow_mode: 'LITE',
        origin: 'orchestration_run',
        execution_backend: 'orchestration_delegate',
        execution_mode: 'delegated_child',
        autonomous: false,
        orchestration_parent_run_id: run.id,
        orchestration_parent_step_id: step.id,
        orchestration_root_task_id: rootTask.id,
        orchestration_requested_agent_id: run.requested_agent_id || null,
        orchestration_requested_agent_username: run.requested_agent_username || null,
        orchestration_display_agent_id: run.display_agent_id || null,
        orchestration_display_agent_username: run.display_agent_username || null,
        orchestration_plan_phase_index: Number.isFinite(Number(input.plan_phase_index)) ? Number(input.plan_phase_index) : null,
        orchestration_plan_phase_title: input.plan_phase_title || null,
        orchestration_plan_phase_count: input.plan_phase_count || null,
        orchestration_phase_objective: input.phase_objective || null,
        orchestration_snipara_swarm_id: input.snipara_swarm_id || null,
        orchestration_snipara_root_task_id: input.snipara_root_task_id || null,
        ...(executionOverlay ? {
          execution_overlay: executionOverlay,
          orchestration_overlay_skills: Array.isArray(executionOverlay.skillKeys) ? executionOverlay.skillKeys : [],
          orchestration_overlay_providers: Array.isArray(executionOverlay.integrationProviders) ? executionOverlay.integrationProviders : [],
          orchestration_overlay_tool_capabilities: Array.isArray(executionOverlay.toolCapabilities) ? executionOverlay.toolCapabilities : [],
        } : {}),
        ...(blockedOverlay ? {
          orchestration_blocked_overlay_providers: Array.isArray(blockedOverlay.providers) ? blockedOverlay.providers : [],
          orchestration_blocked_overlay_skills: Array.isArray(blockedOverlay.skills) ? blockedOverlay.skills : [],
          orchestration_blocked_overlay_tool_capabilities: Array.isArray(blockedOverlay.toolCapabilities) ? blockedOverlay.toolCapabilities : [],
          orchestration_autonomy_suggestions: overlaySuggestions,
          orchestration_autonomy_insights: Array.isArray(overlayInsights?.recurring_blockers) ? overlayInsights.recurring_blockers : [],
          orchestration_autonomy_recommendation_summary: typeof overlayInsights?.recommendation_summary === 'string'
            ? overlayInsights.recommendation_summary
            : null,
          orchestration_autonomy_recurring_blocker: typeof overlayInsights?.primary_blocker?.label === 'string'
            ? overlayInsights.primary_blocker.label
            : null,
          orchestration_autonomy_escalation_recommended: overlayInsights?.escalation_recommended === true,
          orchestration_autonomy_limited: (
            (Array.isArray(blockedOverlay.providers) && blockedOverlay.providers.length > 0)
            || (Array.isArray(blockedOverlay.skills) && blockedOverlay.skills.length > 0)
            || (Array.isArray(blockedOverlay.toolCapabilities) && blockedOverlay.toolCapabilities.length > 0)
          ),
        } : {}),
        verification_required: true,
        orchestration_proactive: true,
      },
    }, run.workspace_id);

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: step.id,
      eventType: 'delegate.task_created',
      actor: 'run-engine',
      payload: {
        delegated_task_id: childTask?.id || null,
        delegated_task_agent: selectedAgentUsername || selectedAgentId || null,
        proactive: true,
      },
    });

    return childTask;
  }

  resolvePlanPhaseForStep(run, step) {
    const input = parseJsonLike(step?.input_json);
    const phaseIndex = Number.isFinite(Number(input.plan_phase_index)) ? Number(input.plan_phase_index) : 0;
    const phase = resolvePlanPhase(run?.plan_json, phaseIndex);
    if (phase) return phase;
    if (!input.plan_phase_title && !input.phase_objective) return null;
    return {
      index: phaseIndex,
      key: input.plan_phase_key || `phase_${phaseIndex + 1}`,
      title: input.plan_phase_title || `Phase ${phaseIndex + 1}`,
      objective: input.phase_objective || '',
      agent_username: input.selected_agent_username || step?.selected_agent_username || null,
      verification_focus: input.phase_verification_focus || null,
    };
  }

  resolveDelegateStepForVerifyStep(step, steps = []) {
    const input = parseJsonLike(step?.input_json);
    const delegateStepId = input.delegate_step_id || null;
    const delegatedTaskId = input.delegated_task_id || null;
    return steps.find((entry) => String(entry.id || '') === String(delegateStepId || ''))
      || [...steps].reverse().find((entry) => {
        if (entry.step_type !== 'delegate_task') return false;
        return String(entry.spawned_task_id || '') === String(delegatedTaskId || '');
      })
      || null;
  }

  async maybeQueueNextPlannedPhase(run, rootTask, steps, delegateStep, previousTask) {
    const currentPhase = this.resolvePlanPhaseForStep(run, delegateStep);
    const nextPhase = resolveNextPlanPhase(run?.plan_json, currentPhase?.index || 0);
    if (!nextPhase) return null;

    return this.queuePlannedPhaseStep(run, rootTask, steps, {
      phase: nextPhase,
      previousTask,
      previousStep: delegateStep,
    });
  }

  async queuePlannedPhaseStep(run, rootTask, steps, {
    phase,
    previousTask = null,
    previousStep = null,
  } = {}) {
    if (!phase) return null;

    const now = new Date();
    const phaseCount = getPlanPhaseCount(run?.plan_json) || 1;
    const delegateStep = await createRunStep(pool, {
      runId: run.id,
      parentStepId: previousStep?.id || null,
      sequenceNo: nextSequenceNo(steps),
      stepType: 'delegate_task',
      title: `Phase ${Number(phase.index) + 1}: ${phase.title || 'Execute task'}`,
      status: 'queued',
      executor: 'task',
      selectedAgentId: phase.agent_id || run.requested_agent_id || null,
      selectedAgentUsername: phase.agent_username || run.requested_agent_username || rootTask.assigned_agent || null,
      input: {
        root_task_id: rootTask.id,
        root_task_title: rootTask.title || '',
        previous_task_id: previousTask?.id || null,
        previous_output: extractTaskResult(previousTask),
        strategy: parseJsonLike(run.plan_json).strategy || 'multi_phase_sequential',
        plan_phase_index: phase.index,
        plan_phase_key: phase.key || `phase_${Number(phase.index) + 1}`,
        plan_phase_title: phase.title || `Phase ${Number(phase.index) + 1}`,
        plan_phase_count: phaseCount,
        phase_objective: phase.objective || rootTask.description || '',
        phase_verification_focus: phase.verification_focus || null,
        workspace_context_excerpt: parseJsonLike(run.context_json).workspace_context_excerpt || null,
        snipara_swarm_id: parseJsonLike(run.context_json).snipara?.swarm_id || null,
        snipara_root_task_id: parseJsonLike(run.context_json).snipara?.root_task_id || null,
        execution_overlay: phase.execution_overlay || null,
        execution_overlay_blocked: phase.execution_overlay_blocked || null,
        execution_overlay_suggestions: phase.execution_overlay_suggestions || [],
        execution_overlay_insights: phase.execution_overlay_insights || null,
        proactive: true,
      },
    });
    steps.push(delegateStep);

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: delegateStep.id,
      eventType: 'delegate.phase_queued',
      actor: 'run-engine',
      payload: {
        phase_index: phase.index,
        phase_title: phase.title || null,
        selected_agent_username: delegateStep.selected_agent_username || null,
      },
    });

    if (hasOverlayTelemetry(phase)) {
      const overlayTelemetry = extractPhaseOverlayTelemetry(phase);
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: delegateStep.id,
        eventType: 'overlay.resolved',
        actor: 'run-engine',
        payload: {
          phase_index: phase.index,
          phase_title: phase.title || null,
          applied_overlay: overlayTelemetry.applied,
          blocked_overlay: overlayTelemetry.blocked,
          suggestions: overlayTelemetry.suggestions,
          insights: overlayTelemetry.insights?.recurringBlockers || [],
          recommendation_summary: overlayTelemetry.insights?.recommendationSummary || null,
          escalation_recommended: overlayTelemetry.insights?.escalationRecommended === true,
        },
      });
      if (hasAutonomyRecommendation(phase)) {
        await appendRunEvent(pool, {
          runId: run.id,
          stepId: delegateStep.id,
          eventType: 'autonomy.recommendation',
          actor: 'run-engine',
          payload: {
            phase_index: phase.index,
            phase_title: phase.title || null,
            summary: overlayTelemetry.insights?.recommendationSummary || null,
            recurring_blockers: overlayTelemetry.insights?.recurringBlockers || [],
            escalation_recommended: overlayTelemetry.insights?.escalationRecommended === true,
          },
        });
      }
    }

    const childTask = await this.ensureDelegatedChildTask(run, rootTask, delegateStep);
    const wakeAt = buildWakeAt(this.resumeDelayMs);

    await updateRunStep(pool, delegateStep.id, {
      status: 'waiting',
      startedAt: now,
      spawnedTaskId: childTask.id,
      wait: {
        kind: 'task_completion',
        task_id: childTask.id,
        proactive: true,
        next_check_after_ms: this.resumeDelayMs,
      },
    });

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_status: 'waiting_on_tasks',
        orchestration_run_id: run.id,
        orchestration_step_id: delegateStep.id,
        delegated_task_id: childTask.id,
        orchestration_next_wake_at: wakeAt.toISOString(),
        orchestration_phase_index: phase.index,
        orchestration_phase_title: phase.title || null,
        orchestration_phase_count: phaseCount,
        ...buildPhaseOverlayMetadataPatch(phase),
        orchestration_proactive: true,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'waiting_on_tasks',
      currentStepId: delegateStep.id,
      nextWakeAt: wakeAt,
      lastProgressAt: now,
    }));

    return delegateStep;
  }

  async queueFollowUpDelegateStep(run, rootTask, steps, {
    title,
    selectedAgentUsername,
    selectedAgentId,
    retryCount,
    previousTask,
    sourceStep = null,
    verdict,
    threshold,
    escalation = false,
  } = {}) {
    const now = new Date();
    const phase = this.resolvePlanPhaseForStep(run, sourceStep);
    const phaseCount = getPlanPhaseCount(run?.plan_json) || (phase ? Number(phase.index) + 1 : 1);
    const delegateStep = await createRunStep(pool, {
      runId: run.id,
      sequenceNo: nextSequenceNo(steps),
      stepType: 'delegate_task',
      title: title || 'Delegate remediation task',
      status: 'queued',
      executor: 'task',
      selectedAgentId: selectedAgentId || null,
      selectedAgentUsername: selectedAgentUsername || run.requested_agent_username || rootTask.assigned_agent || null,
      retryCount: retryCount || 0,
      input: {
        root_task_id: rootTask.id,
        root_task_title: rootTask.title || '',
        previous_task_id: previousTask?.id || null,
        previous_output: extractTaskResult(previousTask),
        verification_feedback: formatVerificationFeedback(verdict, threshold),
        verification_summary: verdict?.summary || null,
        retry_count: retryCount || 0,
        plan_phase_index: phase?.index || 0,
        plan_phase_key: phase?.key || 'phase_1',
        plan_phase_title: phase?.title || rootTask.title || 'Execute task',
        plan_phase_count: phaseCount,
        phase_objective: phase?.objective || rootTask.description || rootTask.title || '',
        phase_verification_focus: phase?.verification_focus || null,
        workspace_context_excerpt: parseJsonLike(run.context_json).workspace_context_excerpt || null,
        snipara_swarm_id: parseJsonLike(run.context_json).snipara?.swarm_id || null,
        snipara_root_task_id: parseJsonLike(run.context_json).snipara?.root_task_id || null,
        execution_overlay: phase?.execution_overlay || parseJsonLike(sourceStep?.input_json).execution_overlay || null,
        execution_overlay_blocked: phase?.execution_overlay_blocked || parseJsonLike(sourceStep?.input_json).execution_overlay_blocked || null,
        execution_overlay_suggestions: phase?.execution_overlay_suggestions || parseJsonLike(sourceStep?.input_json).execution_overlay_suggestions || [],
        execution_overlay_insights: phase?.execution_overlay_insights || parseJsonLike(sourceStep?.input_json).execution_overlay_insights || null,
        escalation,
        proactive: true,
      },
    });
    steps.push(delegateStep);

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: delegateStep.id,
      eventType: escalation ? 'delegate.escalation_queued' : 'delegate.revision_queued',
      actor: 'run-engine',
      payload: {
        delegated_task_id: previousTask?.id || null,
        selected_agent_username: delegateStep.selected_agent_username || null,
        retry_count: retryCount || 0,
        escalation,
      },
    });

    if (hasOverlayTelemetry(phase) || parseJsonLike(sourceStep?.input_json).execution_overlay) {
      const overlayPhase = phase || {
        execution_overlay: parseJsonLike(sourceStep?.input_json).execution_overlay || null,
        execution_overlay_blocked: parseJsonLike(sourceStep?.input_json).execution_overlay_blocked || null,
        execution_overlay_suggestions: parseJsonLike(sourceStep?.input_json).execution_overlay_suggestions || [],
        execution_overlay_insights: parseJsonLike(sourceStep?.input_json).execution_overlay_insights || null,
        index: phase?.index || 0,
        title: phase?.title || rootTask.title || null,
      };
      const overlayTelemetry = extractPhaseOverlayTelemetry(overlayPhase);
      await appendRunEvent(pool, {
        runId: run.id,
        stepId: delegateStep.id,
        eventType: 'overlay.resolved',
        actor: 'run-engine',
        payload: {
          phase_index: overlayPhase.index || 0,
          phase_title: overlayPhase.title || null,
          applied_overlay: overlayTelemetry.applied,
          blocked_overlay: overlayTelemetry.blocked,
          suggestions: overlayTelemetry.suggestions,
          insights: overlayTelemetry.insights?.recurringBlockers || [],
          recommendation_summary: overlayTelemetry.insights?.recommendationSummary || null,
          escalation_recommended: overlayTelemetry.insights?.escalationRecommended === true,
          retry_count: retryCount || 0,
          escalation,
        },
      });
      if (hasAutonomyRecommendation(overlayPhase)) {
        await appendRunEvent(pool, {
          runId: run.id,
          stepId: delegateStep.id,
          eventType: 'autonomy.recommendation',
          actor: 'run-engine',
          payload: {
            phase_index: overlayPhase.index || 0,
            phase_title: overlayPhase.title || null,
            summary: overlayTelemetry.insights?.recommendationSummary || null,
            recurring_blockers: overlayTelemetry.insights?.recurringBlockers || [],
            escalation_recommended: overlayTelemetry.insights?.escalationRecommended === true,
            retry_count: retryCount || 0,
            escalation,
          },
        });
      }
    }

    const childTask = await this.ensureDelegatedChildTask(run, rootTask, delegateStep);
    const wakeAt = buildWakeAt(this.resumeDelayMs);

    await updateRunStep(pool, delegateStep.id, {
      status: 'waiting',
      startedAt: now,
      spawnedTaskId: childTask.id,
      wait: {
        kind: 'task_completion',
        task_id: childTask.id,
        proactive: true,
        next_check_after_ms: this.resumeDelayMs,
      },
    });

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_status: 'waiting_on_tasks',
        orchestration_run_id: run.id,
        orchestration_step_id: delegateStep.id,
        delegated_task_id: childTask.id,
        orchestration_next_wake_at: wakeAt.toISOString(),
        last_verification_score: verdict?.overall_score ?? null,
        last_verification_summary: verdict?.summary || null,
        orchestration_phase_index: phase?.index || 0,
        orchestration_phase_title: phase?.title || rootTask.title || null,
        orchestration_phase_count: phaseCount,
        escalation_active: escalation,
        escalation_agent: escalation ? (delegateStep.selected_agent_username || 'mike') : null,
        ...buildPhaseOverlayMetadataPatch(phase || {
          execution_overlay: parseJsonLike(sourceStep?.input_json).execution_overlay || null,
          execution_overlay_blocked: parseJsonLike(sourceStep?.input_json).execution_overlay_blocked || null,
          execution_overlay_suggestions: parseJsonLike(sourceStep?.input_json).execution_overlay_suggestions || [],
          execution_overlay_insights: parseJsonLike(sourceStep?.input_json).execution_overlay_insights || null,
        }),
        orchestration_proactive: true,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'waiting_on_tasks',
      currentStepId: delegateStep.id,
      nextWakeAt: wakeAt,
      lastProgressAt: now,
    }));

    return delegateStep;
  }

  async ensureVerifyStep(run, steps, childTask, delegateStep) {
    const existing = steps.find((entry) => {
      if (entry.step_type !== 'verify') return false;
      const input = parseJsonLike(entry.input_json);
      return String(input.delegated_task_id || '') === String(childTask?.id || '')
        && !isTerminalStepStatus(entry.status);
    });
    if (existing) return existing;

    const verifyStep = await createRunStep(pool, {
      runId: run.id,
      parentStepId: delegateStep?.id || null,
      sequenceNo: nextSequenceNo(steps),
      stepType: 'verify',
      title: 'Verify delegated result',
      status: 'queued',
      executor: 'verifier',
      selectedAgentUsername: 'verifier',
      retryCount: Number(delegateStep?.retry_count) || 0,
      input: {
        delegated_task_id: childTask?.id || null,
        delegate_step_id: delegateStep?.id || null,
        retry_count: Number(delegateStep?.retry_count) || 0,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: verifyStep.id,
      eventType: 'step.queued',
      actor: 'run-engine',
      payload: {
        sequence_no: verifyStep.sequence_no,
        step_type: 'verify',
        title: verifyStep.title,
      },
    });

    return verifyStep;
  }

  async ensureApprovalGateStep(run, steps, childTask, verdict, rootTask, options = {}) {
    const existing = steps.find((entry) => {
      if (entry.step_type !== 'approval_gate') return false;
      const input = parseJsonLike(entry.input_json);
      return String(input.delegated_task_id || '') === String(childTask?.id || '')
        && Boolean(input.tool_action) === Boolean(options.toolAction === true)
        && !isTerminalStepStatus(entry.status);
    });
    if (existing) return existing;

    const approvalStep = await createRunStep(pool, {
      runId: run.id,
      sequenceNo: nextSequenceNo(steps),
      stepType: 'approval_gate',
      title: 'Human approval required',
      status: 'awaiting_approval',
      executor: 'human',
      selectedAgentId: run.display_agent_id || run.requested_agent_id || null,
      selectedAgentUsername: run.display_agent_username || run.requested_agent_username || null,
      approvalMode: approvalModeOf(rootTask),
      input: {
        delegated_task_id: childTask?.id || null,
        verification_score: verdict?.overall_score ?? null,
        verification_summary: verdict?.summary || null,
        approval_required: true,
        tool_action: options.toolAction === true,
        resume_to: options.resumeTo || null,
        chat_action_run_id: options.chatActionRunId || null,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: approvalStep.id,
      eventType: 'run.awaiting_approval',
      actor: 'run-engine',
      payload: {
        delegated_task_id: childTask?.id || null,
        approval_mode: approvalStep.approval_mode || 'manual',
        verification_score: verdict?.overall_score ?? null,
      },
    });

    return approvalStep;
  }

  async ensureFinalizeStep(run, steps, childTask, outcome, options = {}) {
    const existing = steps.find((entry) => {
      if (entry.step_type !== 'finalize') return false;
      const input = parseJsonLike(entry.input_json);
      if (options.toolAction === true) {
        return input.tool_action === true && !isTerminalStepStatus(entry.status);
      }
      return String(input.delegated_task_id || '') === String(childTask?.id || '')
        && !isTerminalStepStatus(entry.status);
    });
    if (existing) return existing;

    const finalizeStep = await createRunStep(pool, {
      runId: run.id,
      sequenceNo: nextSequenceNo(steps),
      stepType: 'finalize',
      title: outcome === 'success' ? 'Finalize successful run' : 'Finalize failed run',
      status: 'queued',
      executor: 'orchestrator',
      selectedAgentId: run.display_agent_id || run.requested_agent_id || null,
      selectedAgentUsername: run.display_agent_username || run.requested_agent_username || null,
      input: {
        outcome,
        delegated_task_id: childTask?.id || null,
        tool_action: options.toolAction === true,
        tool_result_text: options.toolResultText || null,
        tool_action_results: options.toolActionResults || null,
        chat_action_run_id: options.chatActionRunId || null,
        tool_name: options.toolName || null,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: finalizeStep.id,
      eventType: 'step.queued',
      actor: 'run-engine',
      payload: {
        sequence_no: finalizeStep.sequence_no,
        step_type: 'finalize',
        title: finalizeStep.title,
      },
    });

    return finalizeStep;
  }

  resolveFinalizeOutcome(childTask, step) {
    if (childTask && String(childTask.status || '').toLowerCase() === 'completed') return 'success';
    const input = parseJsonLike(step?.input_json);
    if (input.outcome === 'success' || input.outcome === 'failure') return input.outcome;
    return 'failure';
  }

  async loadTaskForStep(step, steps = []) {
    const input = parseJsonLike(step?.input_json);
    const delegatedTaskId = input.delegated_task_id || input.spawned_task_id || null;
    if (delegatedTaskId) {
      return loadTask(delegatedTaskId);
    }

    const relatedDelegate = [...steps].reverse().find((entry) => {
      if (entry.step_type !== 'delegate_task') return false;
      return String(entry.id || '') === String(input.delegate_step_id || '')
        || String(entry.parent_step_id || '') === String(step?.parent_step_id || '');
    });

    if (relatedDelegate?.spawned_task_id) {
      return loadTask(relatedDelegate.spawned_task_id);
    }

    return null;
  }

  async loadFinalizeChildTask(run, step, steps) {
    const loaded = await this.loadTaskForStep(step, steps);
    if (loaded) return loaded;
    const delegateStep = [...steps].reverse().find((entry) => entry.step_type === 'delegate_task' && entry.spawned_task_id);
    if (!delegateStep?.spawned_task_id) return null;
    return loadTask(delegateStep.spawned_task_id);
  }

  async postApprovalRequest(rootTask, run, approvalStep, verdict) {
    const metadata = parseJsonLike(rootTask?.metadata);
    const content = [
      `Approval required for "${rootTask.title || 'task'}".`,
      verdict?.summary ? `Verification summary: ${verdict.summary}` : '',
      `Run ID: ${run.id}`,
      `Step ID: ${approvalStep.id}`,
    ].filter(Boolean).join('\n');

    const posted = await postTaskChatResult(rootTask, content, 'jarvis', 'Jarvis');
    if (!posted) return false;

    await updateTaskRecord(rootTask.id, {
      metadata: {
        approval_request_posted: true,
        approval_request_posted_at: new Date().toISOString(),
      },
    });
    return true;
  }

  async postRootTaskChatResult(rootTask, content, run) {
    const metadata = parseJsonLike(rootTask?.metadata);
    if (metadata.orchestration_chat_result_posted === true) return;

    const senderId = run.display_agent_id || run.display_agent_username || run.requested_agent_id || run.requested_agent_username || 'jarvis';
    const senderName = humanizeAgentName(run.display_agent_username || run.requested_agent_username);
    const posted = await postTaskChatResult(rootTask, content, String(senderId), senderName);
    if (!posted) return;

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_chat_result_posted: true,
        orchestration_chat_result_posted_at: new Date().toISOString(),
      },
    });
  }

  async postRootTaskFailure(rootTask, message) {
    const metadata = parseJsonLike(rootTask?.metadata);
    if (metadata.orchestration_chat_failure_posted === true) return;

    const posted = await postTaskChatResult(rootTask, `La tache "${rootTask.title}" a echoue: ${message}`, 'jarvis', 'Jarvis');
    if (!posted) return;

    await updateTaskRecord(rootTask.id, {
      metadata: {
        orchestration_chat_failure_posted: true,
        orchestration_chat_failure_posted_at: new Date().toISOString(),
      },
    });
  }

  async handleRunError(run, err) {
    const now = new Date();
    const message = String(err?.message || err || 'Unknown orchestration error');
    console.error(`[RunEngine] Failed run ${run.id}:`, message);

    const currentStep = await getCurrentRunStep(pool, run.id).catch(() => null);
    const rootTask = run.root_task_id ? await loadTask(run.root_task_id).catch(() => null) : null;

    if (currentStep && !isTerminalStepStatus(currentStep.status)) {
      await updateRunStep(pool, currentStep.id, {
        status: 'failed',
        completedAt: now,
        error: { message },
      }).catch(() => {});
    }

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: currentStep?.id || null,
      eventType: 'run.error',
      actor: 'run-engine',
      payload: { message },
    }).catch(() => {});

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'failed',
      currentStepId: currentStep?.id || run.current_step_id || null,
      nextWakeAt: null,
      lastProgressAt: now,
      error: { message },
    })).catch(() => {});

    if (rootTask && String(rootTask.status || '').toLowerCase() !== 'completed') {
      await updateTaskRecord(rootTask.id, {
        status: 'failed',
        metadata: {
          error: message,
          orchestration_status: 'failed',
          orchestration_run_id: run.id,
          orchestration_step_id: currentStep?.id || null,
          orchestration_failed_at: now.toISOString(),
          orchestration_proactive: true,
        },
      }).catch(() => {});

      const chatActionRunId = parseJsonLike(rootTask.metadata).chat_action_run_id || null;
      if (chatActionRunId) {
        await updateChatActionRun(pool, SCHEMA, chatActionRunId, {
          status: 'error',
          executed_by: run.display_agent_id || run.requested_agent_id || null,
          output_json: null,
          error_json: {
            error: message,
            orchestration_run_id: run.id,
            root_task_id: rootTask.id,
          },
        }).catch(() => {});
      }

      await this.postRootTaskFailure(rootTask, message).catch(() => {});
    }
  }
}

function mergeJsonObjects(base, patch) {
  return {
    ...(parseJsonLike(base) || {}),
    ...(patch || {}),
  };
}

let singleton = null;

function getRunEngine(options) {
  if (!singleton) singleton = new OrchestrationRunEngine(options);
  if (options && Object.prototype.hasOwnProperty.call(options, 'wsConnections')) {
    singleton.bindWsConnections(options.wsConnections || null);
  }
  return singleton;
}

module.exports = {
  OrchestrationRunEngine,
  getRunEngine,
  normalizeWorkspaceId,
};
