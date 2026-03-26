/**
 * Task Router Sync API - Webhook endpoint for Snipara
 * POST /api/v1/task-router/sync
 * Receives webhooks from Snipara swarm when tasks are created/completed
 */
'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../lib/postgres');
const SCHEMA = 'tenant_vutler';

/**
 * Webhook endpoint for Snipara task sync
 * POST /sync
 * 
 * Expected payload:
 * {
 *   event: 'task_created' | 'task_completed' | 'task_updated',
 *   task: {
 *     swarm_task_id: string,
 *     title: string,
 *     description: string,
 *     priority: string,
 *     status: string,
 *     metadata: {
 *       vutler_task_id?: string,
 *       workspace_id: string
 *     }
 *   }
 * }
 */
router.post('/sync', async (req, res) => {
  try {
    const { event, task } = req.body;
    
    if (!event || !task) {
      return res.status(400).json({ success: false, error: 'event and task are required' });
    }

    console.log('[TaskSync] Received webhook:', event, task.swarm_task_id);

    const { swarm_task_id, title, description, priority, status, metadata } = task;
    const workspace_id = metadata?.workspace_id;

    if (!workspace_id) {
      console.warn('[TaskSync] Missing workspace_id in metadata');
      return res.status(400).json({ success: false, error: 'workspace_id required in metadata' });
    }

    // Check if this is an update to an existing Vutler task
    const existing = await pool.query(
      `SELECT * FROM ${SCHEMA}.tasks WHERE swarm_task_id = $1`,
      [swarm_task_id]
    );

    if (event === 'task_created' && existing.rows.length === 0) {
      // Create new task in Vutler from Snipara swarm
      const result = await pool.query(
        `INSERT INTO ${SCHEMA}.tasks (
          title, description, priority, status, source, workspace_id, 
          swarm_task_id, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING *`,
        [
          title,
          description || null,
          priority || 'P2',
          'todo', // Map Snipara status to Vutler status
          'snipara_swarm',
          workspace_id,
          swarm_task_id,
          JSON.stringify(metadata || {})
        ]
      );

      console.log('[TaskSync] Created task from swarm:', result.rows[0].id);

      // Route to matching Nexus node based on agent_id / capabilities
      try {
        const nodeMatch = await pool.query(`
          SELECT id, name, mode, snipara_instance_id, role
          FROM ${SCHEMA}.nexus_nodes
          WHERE workspace_id = $1
            AND status = 'online'
            AND (
              snipara_instance_id = $2  -- matches agent_id from Snipara
              OR role = $3              -- matches task role/capability
              OR client_name = $4       -- matches client routing
            )
          ORDER BY last_heartbeat DESC
          LIMIT 1
        `, [workspace_id, task.agent_id || '', task.role || '', task.client_name || '']);

        if (nodeMatch.rows[0]) {
          console.log(`[TASK-SYNC] Routed to Nexus node: ${nodeMatch.rows[0].name} (${nodeMatch.rows[0].mode})`);
        }
      } catch (e) {
        // Routing is best-effort — task stays in DB for any node to pick up
      }

      return res.json({ success: true, data: { task: result.rows[0], action: 'created' } });
    }

    if (event === 'task_completed' && existing.rows.length > 0) {
      // Mark task as completed
      const result = await pool.query(
        `UPDATE ${SCHEMA}.tasks 
         SET status = 'done', resolved_at = NOW(), updated_at = NOW()
         WHERE swarm_task_id = $1
         RETURNING *`,
        [swarm_task_id]
      );

      console.log('[TaskSync] Completed task from swarm:', result.rows[0].id);

      // Also try to sync completion to Snipara if the task originated from a Nexus node
      try {
        const swarmCoordinator = require('../services/swarmCoordinator');
        const coord = swarmCoordinator.getSwarmCoordinator?.() || swarmCoordinator;
        if (coord?.completeTask && result.rows[0].swarm_task_id) {
          await coord.completeTask(result.rows[0].swarm_task_id, result.rows[0].agent_id || 'nexus', result.rows[0].output || '');
        }
      } catch (_) {}

      return res.json({ success: true, data: { task: result.rows[0], action: 'completed' } });
    }

    if (event === 'task_updated' && existing.rows.length > 0) {
      // Update task fields
      const updates = [];
      const params = [swarm_task_id];
      let idx = 2;

      if (title) { updates.push(`title = $${idx++}`); params.push(title); }
      if (description !== undefined) { updates.push(`description = $${idx++}`); params.push(description); }
      if (priority) { updates.push(`priority = $${idx++}`); params.push(priority); }
      if (status) { 
        const vutlerStatus = status === 'completed' ? 'done' : status === 'in_progress' ? 'in_progress' : 'todo';
        updates.push(`status = $${idx++}`); 
        params.push(vutlerStatus); 
      }

      if (updates.length > 0) {
        updates.push(`updated_at = NOW()`);
        const result = await pool.query(
          `UPDATE ${SCHEMA}.tasks SET ${updates.join(', ')} WHERE swarm_task_id = $1 RETURNING *`,
          params
        );

        console.log('[TaskSync] Updated task from swarm:', result.rows[0].id);
        return res.json({ success: true, data: { task: result.rows[0], action: 'updated' } });
      }
    }

    // Already exists or nothing to do
    res.json({ success: true, data: { action: 'ignored', reason: 'already exists or no action needed' } });

  } catch (err) {
    console.error('[TaskSync] Webhook error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
