'use strict';

/**
 * Scoring Loop — Records task performance into Snipara memory.
 *
 * After each verified task, stores a performance record that the
 * Smart Dispatcher uses for future routing decisions.
 * Creates a virtuous cycle: verify → score → remember → route better.
 */

const { pool } = require('../lib/postgres');
const { createSniparaGateway } = require('./snipara/gateway');

const SCHEMA = 'tenant_vutler';

class ScoringLoop {
  /**
   * Record a completed and verified task.
   * @param {object} task - Local PG task row
   * @param {object} webhookData - Original webhook payload data
   * @param {object} verdict - Verification result { overall_score, scores, summary }
   */
  async recordCompletion(task, webhookData, verdict) {
    const agentId = task.assigned_agent || webhookData.agent_id || 'unknown';
    const score = verdict.overall_score || 0;
    const passed = verdict.overall_pass !== false;
    const retryCount = task.retry_count || 0;
    const workspaceId = task.workspace_id || webhookData.workspace_id || null;
    const gateway = createSniparaGateway({ workspaceId });

    // 1. Store performance record in Snipara memory (global scope)
    try {
      await gateway.memory.remember({
        text: `Agent "${agentId}" completed task "${task.title}": score ${score}/10, ${passed ? 'PASSED' : 'FAILED'}, retries: ${retryCount}`,
        type: 'fact',
        importance: 7,
        scope: 'project',
        category: 'agent-performance',
        metadata: {
          source: 'scoring-loop',
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      console.warn(`[ScoringLoop] Failed to store performance record:`, err.message);
    }

    // 2. Store in agent-specific scope (for memory relevance scoring)
    try {
      await gateway.memory.rememberForAgent(
        {
          username: agentId,
          snipara_instance_id: agentId,
        },
        {
          text: `Completed: "${task.title}" (score: ${score}/10, ${passed ? 'passed' : 'failed'})`,
          type: 'fact',
          importance: 6,
          workspaceId,
          metadata: {
            source: 'scoring-loop',
            created_at: new Date().toISOString(),
          },
        }
      );
    } catch (err) {
      console.warn(`[ScoringLoop] Failed to store agent-specific record:`, err.message);
    }

    // 3. Update local DB
    try {
      await pool.query(
        `UPDATE ${SCHEMA}.tasks
         SET verification_score = $1,
             verification_result = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [score, JSON.stringify(verdict), task.id]
      );
    } catch (err) {
      console.warn(`[ScoringLoop] Failed to update DB:`, err.message);
    }

    console.log(`[ScoringLoop] Recorded: ${agentId} → "${task.title}" (${score}/10, ${passed ? 'PASS' : 'FAIL'})`);
  }

  /**
   * Record an htask completion from the Snipara webhook.
   * Used for htask events where we don't run full verification.
   * @param {object} data - Webhook payload data
   */
  async recordHtaskCompletion(data) {
    const { task_id, owner, level, evidence_provided } = data;

    // Find local task
    const result = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE snipara_task_id = $1 OR swarm_task_id = $1 LIMIT 1`,
      [task_id]
    );
    const task = result.rows[0];

    const agentId = owner || task?.assigned_agent || 'unknown';
    const title = task?.title || `htask ${task_id}`;
    const hasEvidence = Array.isArray(evidence_provided) && evidence_provided.length > 0;
    const workspaceId = task?.workspace_id || data.workspace_id || null;
    const gateway = createSniparaGateway({ workspaceId });

    try {
      if (task?.id) {
        await pool.query(
          `UPDATE ${SCHEMA}.tasks
           SET status = 'completed',
               metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
               updated_at = NOW(),
               resolved_at = COALESCE(resolved_at, NOW())
           WHERE id = $2`,
          [
            JSON.stringify({
              execution_backend: 'snipara',
              execution_mode: 'hierarchical_htask',
              sync_mode: 'primary',
              sync_status: 'synced',
              snipara_task_kind: 'htask',
              ...(level ? { snipara_hierarchy_level: level } : {}),
              ...(Array.isArray(evidence_provided) ? { snipara_last_evidence: evidence_provided } : {}),
            }),
            task.id,
          ]
        );
      }

      await gateway.memory.rememberForAgent(
        {
          username: agentId,
          snipara_instance_id: agentId,
        },
        {
          text: `Completed htask (${level}): "${title}" ${hasEvidence ? 'with evidence' : 'without evidence'}`,
          type: 'fact',
          importance: 5,
          workspaceId,
          metadata: {
            source: 'scoring-loop',
            created_at: new Date().toISOString(),
          },
        }
      );
    } catch (err) {
      console.warn(`[ScoringLoop] Failed to store htask record:`, err.message);
    }

    console.log(`[ScoringLoop] Htask recorded: ${agentId} → ${level} "${title}"`);
  }
}

let singleton = null;
function getScoringLoop() {
  if (!singleton) singleton = new ScoringLoop();
  return singleton;
}

module.exports = { ScoringLoop, getScoringLoop };
