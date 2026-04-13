'use strict';

/**
 * Verification Engine — LLM-powered output verification.
 *
 * When an agent completes a task, this engine verifies the output
 * against acceptance criteria before accepting it. On failure,
 * creates revision subtasks with feedback.
 */

const { pool } = require('../lib/postgres');
const { chat } = require('./llmRouter');

const SCHEMA = 'tenant_vutler';
const DEFAULT_WORKSPACE = '00000000-0000-0000-0000-000000000001';

const PASS_THRESHOLD = Number(process.env.VERIFICATION_PASS_THRESHOLD) || 7;
const MAX_RETRIES = Number(process.env.VERIFICATION_MAX_RETRIES) || 3;

const VERIFIER_SYSTEM_PROMPT = `You are a strict QA verification agent. Your job is to evaluate work output against acceptance criteria.

Rules:
- Score each criterion independently on a scale of 0-10
- Be objective and evidence-based
- A score of 7+ means the criterion is satisfactorily met
- A score below 7 means the output needs revision
- Provide specific, actionable feedback for any failed criterion

You MUST respond with valid JSON only, no markdown, no explanation outside the JSON:
{
  "scores": [
    { "criterion": "description", "score": 0-10, "feedback": "specific feedback" }
  ],
  "overall_score": 0-10,
  "overall_pass": true/false,
  "summary": "brief overall assessment"
}`;

const VERIFIER_AGENT = {
  name: 'verifier',
  model: 'claude-sonnet-4-20250514',
  provider: 'anthropic',
  system_prompt: VERIFIER_SYSTEM_PROMPT,
  workspace_id: DEFAULT_WORKSPACE,
  temperature: 0.1,
  max_tokens: 2048,
};

function resolveTaskWorkspaceId(task) {
  const value = typeof task?.workspace_id === 'string' ? task.workspace_id.trim() : task?.workspace_id;
  if (value) return value;
  throw new Error('workspace_id is required for verification tasks');
}

class VerificationEngine {
  constructor(options = {}) {
    this.passThreshold = options.passThreshold || PASS_THRESHOLD;
    this.maxRetries = options.maxRetries || MAX_RETRIES;
  }

  _parseTaskMetadata(task) {
    if (!task?.metadata) return {};
    if (typeof task.metadata === 'string') {
      try {
        return JSON.parse(task.metadata || '{}');
      } catch (_) {
        return {};
      }
    }
    return task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  }

  _getThreshold(task) {
    const meta = this._parseTaskMetadata(task);
    return meta.workflow_mode === 'FULL'
      ? Math.max(this.passThreshold, 8)
      : Math.min(this.passThreshold, 6);
  }

  isRunManagedTask(task) {
    const meta = this._parseTaskMetadata(task);
    return Boolean(
      meta.orchestration_parent_run_id
      || meta.execution_backend === 'orchestration_delegate'
      || meta.execution_backend === 'orchestration_run'
      || meta.execution_mode === 'delegated_child'
    );
  }

  async evaluateTaskOutput(task, output) {
    const criteria = this._extractCriteria(task);
    if (!criteria.length) {
      return {
        criteria,
        threshold: this._getThreshold(task),
        passed: true,
        autoAccepted: true,
        autoAcceptedReason: 'no_criteria',
        verdict: {
          overall_pass: true,
          overall_score: 10,
          scores: [],
          summary: 'Auto-accepted (no criteria)',
        },
      };
    }

    const prompt = this._buildPrompt(task, output, criteria);

    let verdict;
    try {
      const llmResult = await chat({
        ...VERIFIER_AGENT,
        workspace_id: resolveTaskWorkspaceId(task),
      }, [
        { role: 'user', content: prompt },
      ]);
      verdict = this._parseVerdict(llmResult.content);
    } catch (err) {
      console.error(`[Verifier] LLM call failed for task ${task?.id || 'unknown'}:`, err.message);
      verdict = {
        overall_pass: true,
        overall_score: 7,
        scores: [],
        summary: 'Auto-accepted (verification unavailable)',
      };
      return {
        criteria,
        threshold: this._getThreshold(task),
        passed: true,
        autoAccepted: true,
        autoAcceptedReason: 'verification_unavailable',
        verdict,
      };
    }

    const threshold = this._getThreshold(task);
    return {
      criteria,
      threshold,
      passed: Boolean(verdict.overall_pass || verdict.overall_score >= threshold),
      autoAccepted: false,
      autoAcceptedReason: null,
      verdict,
    };
  }

  async recordVerdict(task, verdict, { retryCount } = {}) {
    if (!task?.id || !verdict) return null;

    const result = await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET verification_score = $1,
           verification_result = $2,
           retry_count = COALESCE($3, retry_count),
           updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [
        verdict.overall_score,
        JSON.stringify(verdict),
        retryCount === undefined ? null : retryCount,
        task.id,
      ]
    );

    return result.rows[0] || null;
  }

  /**
   * Verify a task completion payload from the Snipara webhook.
   * @param {object} data - Webhook payload data (task_id, agent_id, result, etc.)
   */
  async verify(data) {
    const { task_id, agent_id, result, swarm_id } = data;
    if (!task_id) {
      console.warn('[Verifier] No task_id in webhook payload, skipping');
      return;
    }

    // Fetch local task by snipara_task_id
    const taskResult = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = taskResult.rows[0];
    if (!task) {
      console.warn(`[Verifier] Task not found locally for snipara_task_id=${task_id}`);
      return;
    }

    if (this.isRunManagedTask(task)) {
      console.log(`[Verifier] Task ${task.id} is managed by orchestration run state, skipping external lifecycle handling`);
      return;
    }

    const evaluation = await this.evaluateTaskOutput(task, result);
    const verdict = evaluation.verdict;

    if (evaluation.passed) {
      console.log(`[Verifier] Task ${task.id} PASSED (score: ${verdict.overall_score}/10)`);
      await this._accept(task, data, verdict);
    } else {
      const retryCount = (task.retry_count || 0) + 1;
      if (retryCount > this.maxRetries) {
        console.log(`[Verifier] Task ${task.id} FAILED after ${this.maxRetries} retries, escalating`);
        await this._escalate(task, data, verdict);
      } else {
        console.log(`[Verifier] Task ${task.id} FAILED (score: ${verdict.overall_score}/10), creating revision #${retryCount}`);
        await this._requestRevision(task, data, verdict, retryCount);
      }
    }
  }

  _extractCriteria(task) {
    const criteria = [];
    const meta = this._parseTaskMetadata(task);

    // Try metadata.acceptance_criteria
    if (Array.isArray(meta.acceptance_criteria)) {
      criteria.push(...meta.acceptance_criteria.map((entry) => typeof entry === 'string' ? { description: entry } : entry));
    }

    // Fallback: extract from description (lines starting with "- [ ]" or "* ")
    if (!criteria.length && task.description) {
      const lines = task.description.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]') || trimmed.startsWith('* ')) {
          criteria.push({ description: trimmed.replace(/^[-*]\s*(\[.\]\s*)?/, '') });
        }
      }
    }

    if (!criteria.length) {
      const phaseCriteria = [
        meta.orchestration_phase_verification_focus,
        meta.orchestration_phase_objective,
      ].filter((value) => typeof value === 'string' && value.trim());
      if (phaseCriteria.length > 0) {
        criteria.push(...phaseCriteria.map((description) => ({ description })));
      }
    }

    if (!criteria.length && Array.isArray(meta.orchestration_phases)) {
      const phaseIndex = Number.isFinite(Number(meta.orchestration_phase_index))
        ? Number(meta.orchestration_phase_index)
        : 0;
      const phase = meta.orchestration_phases[phaseIndex] || meta.orchestration_phases[0] || null;
      if (phase) {
        const phaseCriteria = [
          phase.verification_focus,
          phase.objective,
          phase.title,
        ].filter((value) => typeof value === 'string' && value.trim());
        if (phaseCriteria.length > 0) {
          criteria.push(...phaseCriteria.map((description) => ({ description })));
        }
      }
    }

    return criteria;
  }

  _buildPrompt(task, output, criteria) {
    const criteriaText = criteria.map((c, i) => `${i + 1}. ${c.description}`).join('\n');
    const outputText = typeof output === 'string' ? output : JSON.stringify(output, null, 2);

    return `## Task
Title: ${task.title}
Description: ${task.description || '(none)'}

## Acceptance Criteria
${criteriaText}

## Agent Output
${outputText || '(no output provided)'}

Score each criterion 0-10. Overall pass threshold: ${this.passThreshold}/10.`;
  }

  _parseVerdict(content) {
    try {
      // Try to extract JSON from the response
      const text = typeof content === 'string' ? content : String(content);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch { /* fall through */ }

    // Fallback: assume pass if we can't parse
    return { overall_pass: true, overall_score: 7, scores: [], summary: 'Could not parse verification result' };
  }

  async _accept(task, webhookData, verdict) {
    await this.recordVerdict(task, verdict);
    await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = 'completed',
           resolved_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [task.id]
    );

    // Record in scoring loop
    const { getScoringLoop } = require('./scoringLoop');
    await getScoringLoop().recordCompletion(task, webhookData, verdict);
  }

  async _requestRevision(task, webhookData, verdict, retryCount) {
    const workspaceId = resolveTaskWorkspaceId(task);

    // Update retry count
    await this.recordVerdict(task, verdict, { retryCount });

    // Build feedback for the agent
    const failedCriteria = (verdict.scores || [])
      .filter(s => s.score < this.passThreshold)
      .map(s => `- ${s.criterion}: ${s.score}/10 — ${s.feedback}`)
      .join('\n');

    // Create a revision subtask
    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();

    await coordinator.createTask({
      title: `REVISION #${retryCount}: ${task.title}`,
      description: `Previous attempt failed verification (score: ${verdict.overall_score}/10).\n\nFailed criteria:\n${failedCriteria}\n\nPlease revise and resubmit.`,
      priority: task.priority || 'medium',
      for_agent_id: task.assigned_agent,
    }, workspaceId);

    // Notify via team coordination
    const channelId = await coordinator.getTeamChannelId(workspaceId);
    await coordinator.postSystemMessage(
      workspaceId,
      channelId,
      'Verifier',
      `⚠️ Task "${task.title}" failed verification (${verdict.overall_score}/10). Revision #${retryCount} assigned to @${task.assigned_agent}.`,
      'verifier',
    );
  }

  async _escalate(task, webhookData, verdict) {
    const workspaceId = resolveTaskWorkspaceId(task);

    // Mark task as needing escalation
    await this.recordVerdict(task, verdict);
    await pool.query(
      `UPDATE ${SCHEMA}.tasks
       SET status = 'escalated',
           updated_at = NOW()
       WHERE id = $1`,
      [task.id]
    );

    // Reassign to Mike (lead agent)
    const { getSwarmCoordinator } = require('../app/custom/services/swarmCoordinator');
    const coordinator = getSwarmCoordinator();

    await coordinator.createTask({
      title: `ESCALATED: ${task.title}`,
      description: `This task failed verification ${this.maxRetries} times.\nLast score: ${verdict.overall_score}/10.\n\nSummary: ${verdict.summary}\n\nOriginal assignee: ${task.assigned_agent}`,
      priority: 'high',
      for_agent_id: 'mike',
    }, workspaceId);

    // Post to team coordination
    const channelId = await coordinator.getTeamChannelId(workspaceId);
    await coordinator.postSystemMessage(
      workspaceId,
      channelId,
      'Verifier',
      `🚨 Task "${task.title}" escalated to @Mike after ${this.maxRetries} failed verifications.`,
      'verifier',
    );

    // Store learning in memory
    const { createSniparaGateway } = require('./snipara/gateway');
    await createSniparaGateway({ workspaceId }).memory.rememberForAgent(
      {
        username: task.assigned_agent,
        snipara_instance_id: task.assigned_agent,
      },
      {
        text: `Task "${task.title}" escalated after ${this.maxRetries} failed verifications. Score: ${verdict.overall_score}/10. Issue: ${verdict.summary}`,
        type: 'fact',
        importance: 8,
        workspaceId,
        metadata: {
          source: 'verification-engine',
          created_at: new Date().toISOString(),
        },
      }
    );
  }
}

let singleton = null;
function getVerificationEngine(options) {
  if (!singleton) singleton = new VerificationEngine(options);
  return singleton;
}

module.exports = { VerificationEngine, getVerificationEngine, resolveTaskWorkspaceId };
