/**
 * Workspace Provisioning API
 * S8.3 — Create new workspaces with default configuration
 */

const express = require('express');
const router = express.Router();
const { transactionWithWorkspace, auditLog } = require('../services/pg');
const { requireAdmin } = require('../lib/auth');
const crypto = require('crypto');
const s3Storage = require('../services/s3Storage');
const { PLANS, VALID_PLAN_IDS, getPlan, getPlanLimits } = require('./packages/core/middleware/featureGate');

// ============================================================================
// POST /api/v1/workspaces — Create new workspace
// ============================================================================
router.post('/workspaces', requireAdmin, async (req, res) => {
  try {
    const {
      name,
      admin_email,
      admin_username,
      plan = 'free',
      rc_workspace_id,  // Optional: if provisioning from RC Cloud
      initial_config = {}
    } = req.body;

    if (!name || !admin_email || !admin_username) {
      return res.status(400).json({
        success: false,
        error: 'name, admin_email, and admin_username are required'
      });
    }

    // Generate workspace ID
    const workspaceId = rc_workspace_id || `ws_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    // Validate plan
    if (!VALID_PLAN_IDS.includes(plan)) {
      return res.status(400).json({
        success: false,
        error: `Plan must be one of: ${VALID_PLAN_IDS.join(', ')}`
      });
    }

    const result = await transactionWithWorkspace(workspaceId, async (client) => {
      // 1. Create workspace settings
      await client.query(`
        INSERT INTO workspace_settings (workspace_id, key, value)
        VALUES 
          ($1, 'billing_plan', $2),
          ($1, 'workspace_name', $3),
          ($1, 'admin_email', $4),
          ($1, 'admin_username', $5),
          ($1, 'created_at', $6),
          ($1, 'config', $7)
      `, [
        workspaceId,
        JSON.stringify({ plan, created_at: new Date().toISOString() }),
        JSON.stringify({ name }),
        JSON.stringify({ email: admin_email }),
        JSON.stringify({ username: admin_username }),
        JSON.stringify({ created_at: new Date().toISOString() }),
        JSON.stringify(initial_config)
      ]);

      // 2. Create default LLM provider (Anthropic free tier)
      const { rows: providerRows } = await client.query(`
        INSERT INTO workspace_llm_providers (
          workspace_id, provider, auth_type, plan_type, 
          monthly_token_limit, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        workspaceId,
        'anthropic',
        'api_key',
        'managed',  // Managed by Vutler (vs byokey)
        getPlanLimits(plan).tokens_month,
        true
      ]);

      const providerId = providerRows[0].id;

      // 3. Create welcome agent if requested
      if (initial_config.create_welcome_agent !== false) {
        const welcomeAgentId = `agent_${Date.now()}_welcome`;
        
        await client.query(`
          INSERT INTO agents (
            id, workspace_id, display_name, role, personality,
            system_prompt, llm_provider, llm_model, status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          welcomeAgentId,
          workspaceId,
          '🤖 Welcome Assistant',
          'assistant',
          'Friendly and helpful onboarding assistant',
          `You are the Welcome Assistant for ${name}. Help users get started with Vutler by explaining features, answering questions, and guiding them through setup. Be warm, friendly, and concise.`,
          'anthropic',
          'claude-haiku-4-5-20251001',
          'active'
        ]);

        // Add agent model assignment
        await client.query(`
          INSERT INTO agent_model_assignments (
            agent_id, provider_id, model, task_profile, workspace_id
          ) VALUES ($1, $2, $3, $4, $5)
        `, [
          welcomeAgentId,
          providerId,
          'claude-haiku-4-5-20251001',
          'general',
          workspaceId
        ]);
      }

      // 4. Create default templates if requested
      if (initial_config.create_default_templates !== false) {
        const templates = [
          {
            name: 'Customer Support Agent',
            description: 'Friendly customer service assistant',
            config_json: {
              role: 'customer_support',
              personality: 'Professional, empathetic, solution-focused',
              system_prompt: 'You are a customer support specialist. Help users resolve issues quickly and professionally.',
              llm_model: 'claude-haiku-4-5-20251001'
            },
            category: 'support',
            icon: '🎧'
          },
          {
            name: 'Sales Assistant',
            description: 'Knowledgeable sales representative',
            config_json: {
              role: 'sales',
              personality: 'Enthusiastic, knowledgeable, persuasive but not pushy',
              system_prompt: 'You are a sales assistant. Help prospects understand product value and guide them toward purchase decisions.',
              llm_model: 'claude-haiku-4-5-20251001'
            },
            category: 'sales',
            icon: '💼'
          }
        ];

        for (const template of templates) {
          await client.query(`
            INSERT INTO templates (
              name, description, config_json, category, icon, workspace_id
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `, [
            template.name,
            template.description,
            JSON.stringify(template.config_json),
            template.category,
            template.icon,
            workspaceId
          ]);
        }
      }

      return {
        workspace_id: workspaceId,
        name,
        plan,
        admin_email,
        admin_username,
        provider_id: providerId
      };
    });

    // Log workspace creation
    await auditLog(null, 'workspace.created', {
      workspace_id: workspaceId,
      name,
      plan,
      admin_email,
      admin_username,
      initial_config
    }, workspaceId);

    // Auto-provision S3 bucket for VDrive
    try {
      await s3Storage.createBucket(workspaceId);
      console.log(`[Provisioning] S3 bucket created for workspace ${workspaceId}`);
    } catch (s3Err) {
      console.warn(`[Provisioning] S3 bucket creation warning: ${s3Err.message}`);
    }

    res.status(201).json({
      success: true,
      workspace: result,
      message: `Workspace '${name}' created successfully`,
      next_steps: [
        'Configure LLM provider credentials',
        'Invite team members',
        'Create your first agent',
        'Set up integrations'
      ]
    });

  } catch (error) {
    console.error('[Provisioning] Error creating workspace:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// GET /api/v1/workspaces/:id — Get workspace details
// ============================================================================
router.get('/workspaces/:id', requireAdmin, async (req, res) => {
  try {
    const { id: workspaceId } = req.params;
    const { queryWithWorkspace } = require('../services/pg');

    // Get workspace settings
    const { rows: settingsRows } = await queryWithWorkspace(workspaceId, `
      SELECT key, value FROM workspace_settings 
      WHERE workspace_id = $1
    `, [workspaceId]);

    if (settingsRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found'
      });
    }

    // Convert settings to object
    const settings = {};
    settingsRows.forEach(row => {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    });

    // Get workspace stats
    const { rows: statsRows } = await queryWithWorkspace(workspaceId, `
      SELECT 
        (SELECT COUNT(*) FROM agents WHERE workspace_id = $1 AND status != 'inactive') as agent_count,
        (SELECT COUNT(*) FROM templates WHERE workspace_id = $1 AND is_active = true) as template_count,
        (SELECT COUNT(*) FROM workspace_llm_providers WHERE workspace_id = $1 AND is_active = true) as provider_count
    `, [workspaceId]);

    const stats = statsRows[0] || { agent_count: 0, template_count: 0, provider_count: 0 };

    // Get quota status
    const { checkWorkspaceLimits } = require('../services/pg');
    const plan = settings.billing_plan?.plan || 'free';
    const quotaStatus = await checkWorkspaceLimits(workspaceId, plan);

    res.json({
      success: true,
      workspace: {
        id: workspaceId,
        name: settings.workspace_name?.name,
        plan,
        admin_email: settings.admin_email?.email,
        admin_username: settings.admin_username?.username,
        created_at: settings.created_at?.created_at,
        config: settings.config || {},
        stats: {
          agents: parseInt(stats.agent_count),
          templates: parseInt(stats.template_count),
          providers: parseInt(stats.provider_count)
        },
        quota: quotaStatus
      }
    });

  } catch (error) {
    console.error('[Provisioning] Error fetching workspace:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// PUT /api/v1/workspaces/:id — Update workspace
// ============================================================================
router.put('/workspaces/:id', requireAdmin, async (req, res) => {
  try {
    const { id: workspaceId } = req.params;
    const { name, plan, config } = req.body;
    const { queryWithWorkspace } = require('../services/pg');

    const updates = [];
    const auditDetails = { workspace_id: workspaceId };

    if (name) {
      await queryWithWorkspace(workspaceId, `
        INSERT INTO workspace_settings (workspace_id, key, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [workspaceId, 'workspace_name', JSON.stringify({ name })]);
      updates.push('name');
      auditDetails.name = name;
    }

    if (plan) {
      if (!VALID_PLAN_IDS.includes(plan)) {
        return res.status(400).json({
          success: false,
          error: `Plan must be one of: ${VALID_PLAN_IDS.join(', ')}`
        });
      }

      await queryWithWorkspace(workspaceId, `
        INSERT INTO workspace_settings (workspace_id, key, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [workspaceId, 'billing_plan', JSON.stringify({ plan, updated_at: new Date().toISOString() })]);
      
      updates.push('plan');
      auditDetails.plan = plan;
    }

    if (config) {
      await queryWithWorkspace(workspaceId, `
        INSERT INTO workspace_settings (workspace_id, key, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (workspace_id, key)
        DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `, [workspaceId, 'config', JSON.stringify(config)]);
      
      updates.push('config');
      auditDetails.config_keys = Object.keys(config);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    // Log workspace update
    await auditLog(null, 'workspace.updated', auditDetails, workspaceId);

    res.json({
      success: true,
      message: `Workspace updated successfully`,
      updated_fields: updates,
      workspace_id: workspaceId
    });

  } catch (error) {
    console.error('[Provisioning] Error updating workspace:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;