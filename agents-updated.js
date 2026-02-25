/**
 * Vutler Agents API
 * S8.3 — Multi-tenant with workspace isolation and quota enforcement
 */

const express = require('express');
const router = express.Router();
const { queryWithWorkspace, auditLog } = require('../services/pg');
const { requireWorkspaceAdmin, requireWorkspace } = require('../lib/auth');
const { checkAgentQuotaWithPlan } = require('../lib/quotaMiddleware');

// ============================================================================
// GET /api/v1/agents — List all agents for workspace
// ============================================================================
router.get('/agents', requireWorkspace, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    
    const result = await queryWithWorkspace(workspaceId, `
      SELECT 
        id, 
        workspace_id,
        display_name as name, 
        email_address as email, 
        status, 
        llm_model as model, 
        personality, 
        role as use_case, 
        system_prompt, 
        created_at, 
        updated_at,
        avatar_url,
        drive_quota_mb,
        drive_used_mb
      FROM agents
      WHERE workspace_id = $1
      ORDER BY created_at DESC
    `, [workspaceId]);
    
    res.json({
      success: true,
      agents: result.rows,
      total: result.rows.length,
      workspace_id: workspaceId
    });
  } catch (error) {
    console.error('[Agents API] Error fetching agents:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/v1/agents/:id — Get single agent (workspace-isolated)
// ============================================================================
router.get('/agents/:id', requireWorkspace, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;
    
    const result = await queryWithWorkspace(workspaceId,
      'SELECT * FROM agents WHERE id = $1 AND workspace_id = $2',
      [id, workspaceId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Agent not found or access denied',
        workspace_id: workspaceId 
      });
    }
    
    res.json({
      success: true,
      agent: result.rows[0]
    });
  } catch (error) {
    console.error('[Agents API] Error fetching agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// POST /api/v1/agents — Create new agent (with quota check)
// ============================================================================
router.post('/agents', requireWorkspaceAdmin, checkAgentQuotaWithPlan, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const {
      display_name,
      email_address,
      role = 'assistant',
      personality,
      system_prompt,
      llm_provider = 'anthropic',
      llm_model = 'claude-haiku-4-5-20251001'
    } = req.body;

    if (!display_name) {
      return res.status(400).json({
        success: false,
        error: 'display_name is required'
      });
    }

    // Generate unique agent ID
    const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const result = await queryWithWorkspace(workspaceId, `
      INSERT INTO agents (
        id, workspace_id, display_name, email_address, role, 
        personality, system_prompt, llm_provider, llm_model, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      agentId, workspaceId, display_name, email_address, role,
      personality, system_prompt, llm_provider, llm_model, 'inactive'
    ]);

    const agent = result.rows[0];

    // Log agent creation
    await auditLog(agentId, 'agent.created', {
      workspace_id: workspaceId,
      display_name,
      role,
      llm_model
    }, workspaceId);

    res.status(201).json({
      success: true,
      agent,
      message: 'Agent created successfully'
    });

  } catch (error) {
    console.error('[Agents API] Error creating agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PUT /api/v1/agents/:id — Update agent (workspace-isolated)
// ============================================================================
router.put('/agents/:id', requireWorkspaceAdmin, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated via API
    delete updates.id;
    delete updates.workspace_id;
    delete updates.created_at;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    // Build dynamic UPDATE query
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 3}`)
      .join(', ');
    
    const values = [id, workspaceId, ...Object.values(updates)];

    const result = await queryWithWorkspace(workspaceId, `
      UPDATE agents 
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found or access denied'
      });
    }

    const agent = result.rows[0];

    // Log agent update
    await auditLog(id, 'agent.updated', {
      workspace_id: workspaceId,
      updates: Object.keys(updates)
    }, workspaceId);

    res.json({
      success: true,
      agent,
      message: 'Agent updated successfully'
    });

  } catch (error) {
    console.error('[Agents API] Error updating agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// DELETE /api/v1/agents/:id — Delete agent (workspace-isolated) 
// ============================================================================
router.delete('/agents/:id', requireWorkspaceAdmin, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { id } = req.params;

    // Soft delete - set status to inactive
    const result = await queryWithWorkspace(workspaceId, `
      UPDATE agents 
      SET status = 'inactive', updated_at = NOW()
      WHERE id = $1 AND workspace_id = $2
      RETURNING display_name
    `, [id, workspaceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found or access denied'
      });
    }

    const agentName = result.rows[0].display_name;

    // Log agent deletion
    await auditLog(id, 'agent.deleted', {
      workspace_id: workspaceId,
      agent_name: agentName
    }, workspaceId);

    res.json({
      success: true,
      message: `Agent '${agentName}' deactivated successfully`,
      id
    });

  } catch (error) {
    console.error('[Agents API] Error deleting agent:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/v1/agents/quota — Get workspace agent quota status
// ============================================================================
router.get('/agents/quota', requireWorkspace, async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const { checkWorkspaceLimits } = require('../services/pg');
    
    // Get workspace plan
    const { queryWithWorkspace } = require('../services/pg');
    const { rows: planRows } = await queryWithWorkspace(
      workspaceId,
      'SELECT value FROM workspace_settings WHERE workspace_id = $1 AND key = $2',
      [workspaceId, 'billing_plan']
    );
    
    const plan = planRows[0]?.value?.plan || 'free';
    const quotaStatus = await checkWorkspaceLimits(workspaceId, plan);
    
    res.json({
      success: true,
      quota: {
        agents: {
          used: quotaStatus.usage.agents,
          limit: quotaStatus.limits.maxAgents,
          percentage: quotaStatus.percentages.agents,
          allowed: quotaStatus.allowed.agents
        },
        plan,
        workspace_id: workspaceId
      }
    });

  } catch (error) {
    console.error('[Agents API] Error fetching quota:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;