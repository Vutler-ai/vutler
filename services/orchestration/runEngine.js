'use strict';

const os = require('os');
const pool = require('../../lib/vaultbrix');
const { insertChatMessage } = require('../chatMessages');
const { getSwarmCoordinator } = require('../swarmCoordinator');
const { getVerificationEngine } = require('../verificationEngine');
const {
  DEFAULT_LEASE_MS,
  TERMINAL_RUN_STATUSES,
  appendRunEvent,
  claimRunnableRuns,
  createRunStep,
  getCurrentRunStep,
  getRunById,
  heartbeatRunLease,
  listRunSteps,
  parseJsonLike,
  updateRun,
  updateRunStep,
} = require('./runStore');

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
  return workspaceId || DEFAULT_WORKSPACE;
}

function buildWakeAt(delayMs) {
  return new Date(Date.now() + delayMs);
}

function humanizeAgentName(agentRef) {
  const clean = String(agentRef || '').trim();
  if (!clean) return 'Jarvis';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
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

function nextSequenceNo(steps = []) {
  return steps.reduce((max, step) => Math.max(max, Number(step?.sequence_no) || 0), 0) + 1;
}

function buildDelegatedTaskTitle(run, rootTask) {
  const prefix = String(run?.id || '').slice(0, 8) || 'run';
  return `[Run ${prefix}] ${rootTask?.title || 'Autonomous execution'}`;
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
    revisionLabel,
    escalationLabel,
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
  await pool.query(
    `UPDATE ${SCHEMA}.tasks
        SET ${sets.join(', ')}
      WHERE id = $${idx}`,
    values
  );
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
    this._running = false;
    this._timer = null;
    this._consecutiveErrors = 0;
    this._polling = false;
    this._immediatePollScheduled = false;
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
    const finalizeStep = await this.ensureFinalizeStep(run, steps, childTask, 'success');
    const resumedRun = await updateRun(pool, runId, {
      status: 'running',
      currentStepId: finalizeStep.id,
      nextWakeAt: new Date(),
      lastProgressAt: now,
    });

    if (rootTask) {
      await updateTaskRecord(rootTask.id, {
        metadata: {
          orchestration_status: 'running',
          orchestration_run_id: runId,
          orchestration_step_id: finalizeStep.id,
          approval_granted: true,
          approval_granted_note: note || null,
          approval_granted_at: now.toISOString(),
          orchestration_proactive: true,
        },
      });
    }

    this.requestImmediatePoll();
    return { run: resumedRun, stepStatus: 'completed', approved: true };
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

    let delegateStep = steps.find((entry) => entry.step_type === 'delegate_task');
    if (!delegateStep) {
      delegateStep = await createRunStep(pool, {
        runId: run.id,
        parentStepId: step.id,
        sequenceNo: nextSequenceNo(steps),
        stepType: 'delegate_task',
        title: 'Delegate execution task',
        status: 'queued',
        executor: 'task',
        selectedAgentId: run.requested_agent_id || null,
        selectedAgentUsername: run.requested_agent_username || rootTask.assigned_agent || null,
        input: {
          root_task_id: rootTask.id,
          root_task_title: rootTask.title || '',
          strategy: 'single_delegate',
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
    }

    const childTask = await this.ensureDelegatedChildTask(run, rootTask, delegateStep);
    const wakeAt = buildWakeAt(this.resumeDelayMs);

    await updateRunStep(pool, delegateStep.id, {
      status: 'waiting',
      startedAt: delegateStep.started_at || now,
      selectedAgentId: run.requested_agent_id || null,
      selectedAgentUsername: run.requested_agent_username || rootTask.assigned_agent || null,
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
        orchestration_step_id: delegateStep.id,
        delegated_task_id: childTask.id,
        orchestration_next_wake_at: wakeAt.toISOString(),
        orchestration_proactive: true,
      },
    });

    await appendRunEvent(pool, {
      runId: run.id,
      stepId: delegateStep.id,
      eventType: 'run.waiting_on_tasks',
      actor: 'run-engine',
      payload: {
        spawned_task_id: childTask.id,
        next_wake_at: wakeAt.toISOString(),
        proactive: true,
      },
    });

    await updateRun(pool, run.id, buildReleaseLeasePatch({
      status: 'waiting_on_tasks',
      currentStepId: delegateStep.id,
      nextWakeAt: wakeAt,
      lastProgressAt: now,
    }));
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

    if (ACTIVE_TASK_STATUSES.has(String(childTask.status || '').toLowerCase())) {
      const wakeAt = buildWakeAt(this.resumeDelayMs);

      await updateRunStep(pool, step.id, {
        status: 'waiting',
        startedAt: step.started_at || now,
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
          orchestration_step_id: step.id,
          delegated_task_id: childTask.id,
          orchestration_next_wake_at: wakeAt.toISOString(),
          orchestration_proactive: true,
        },
      });

      await updateRun(pool, run.id, buildReleaseLeasePatch({
        status: 'waiting_on_tasks',
        currentStepId: step.id,
        nextWakeAt: wakeAt,
        lastProgressAt: now,
      }));
      return;
    }

    if (String(childTask.status || '').toLowerCase() === 'completed') {
      await updateRunStep(pool, step.id, {
        status: 'completed',
        completedAt: now,
        spawnedTaskId: childTask.id,
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
      });
      await this.processVerifyStep(run, verifyStep, [...steps, verifyStep], {
        rootTask,
        childTask,
        delegateStep: step,
      });
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

    const childTask = context.childTask || await this.loadFinalizeChildTask(run, step, steps);
    const outcome = context.outcome || this.resolveFinalizeOutcome(childTask, step);

    if (step.status !== 'running' && step.status !== 'completed' && step.status !== 'failed') {
      await updateRunStep(pool, step.id, {
        status: 'running',
        startedAt: step.started_at || now,
      });
    }

    if (outcome === 'success') {
      const resultText = extractTaskResult(childTask) || run.summary || 'Completed.';
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
          pending_approval: null,
          escalation_active: false,
          orchestration_proactive: true,
        },
      });

      await this.postRootTaskChatResult(rootTask, resultText, run).catch((err) => {
        console.warn('[RunEngine] Failed to post completion in chat:', err.message);
      });

      await updateRunStep(pool, step.id, {
        status: 'completed',
        startedAt: step.started_at || now,
        completedAt: now,
        output: {
          result: resultText,
          delegated_task_id: childTask?.id || null,
          delegated_task_status: childTask?.status || null,
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

    const message = extractTaskError(childTask);
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
        pending_approval: null,
        orchestration_proactive: true,
      },
    });

    await this.postRootTaskFailure(rootTask, message).catch((err) => {
      console.warn('[RunEngine] Failed to post failure in chat:', err.message);
    });

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
    const selectedAgentUsername = step.selected_agent_username || run.requested_agent_username || rootTask.assigned_agent || rootTask.assignee || null;
    const selectedAgentId = step.selected_agent_id || run.requested_agent_id || null;
    const childTask = await coordinator.createTask({
      title: buildDelegatedTaskTitle(run, rootTask),
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

  async queueFollowUpDelegateStep(run, rootTask, steps, {
    title,
    selectedAgentUsername,
    selectedAgentId,
    retryCount,
    previousTask,
    verdict,
    threshold,
    escalation = false,
  } = {}) {
    const now = new Date();
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
        escalation_active: escalation,
        escalation_agent: escalation ? (delegateStep.selected_agent_username || 'mike') : null,
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

  async ensureApprovalGateStep(run, steps, childTask, verdict, rootTask) {
    const existing = steps.find((entry) => {
      if (entry.step_type !== 'approval_gate') return false;
      const input = parseJsonLike(entry.input_json);
      return String(input.delegated_task_id || '') === String(childTask?.id || '')
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

  async ensureFinalizeStep(run, steps, childTask, outcome) {
    const existing = steps.find((entry) => {
      if (entry.step_type !== 'finalize') return false;
      const input = parseJsonLike(entry.input_json);
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

      await this.postRootTaskFailure(rootTask, message).catch(() => {});
    }
  }
}

let singleton = null;

function getRunEngine(options) {
  if (!singleton) singleton = new OrchestrationRunEngine(options);
  return singleton;
}

module.exports = {
  OrchestrationRunEngine,
  getRunEngine,
};
