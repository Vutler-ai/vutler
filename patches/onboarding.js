/**
 * Vutler Onboarding API - S9.5
 * Single endpoint that handles complete user onboarding flow
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../lib/auth');
const { pool: pgPool } = require('../services/pg');
const snipara = require('../services/snipara');

/**
 * POST /api/v1/onboarding/complete
 * Complete onboarding flow: workspace → Snipara → agent → channel → LLM config
 */
router.post('/complete', requireAuth, async (req, res) => {
  const {
    template_id,
    workspace_name,
    llm_provider,
    llm_model,
    channel_name,
    agent_name,
    agent_description
  } = req.body;

  const pg = pgPool();
  let transaction;

  try {
    // Validate required fields
    if (!template_id || !workspace_name || !llm_provider || !llm_model) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: template_id, workspace_name, llm_provider, llm_model'
      });
    }

    // Start transaction
    transaction = await pg.begin();

    const db = req.app.locals.db;
    const results = {};

    // Step 1: Create/get workspace (for multi-tenant future)
    const workspaceId = workspace_name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    results.workspace = {
      id: workspaceId,
      name: workspace_name
    };

    // Step 2: Provision Snipara project
    console.log(`[Onboarding] Provisioning Snipara project for workspace: ${workspaceId}`);
    try {
      const sniparaProject = await snipara.provisionProject(workspaceId, {
        name: workspace_name,
        description: `Auto-provisioned workspace for ${workspace_name}`
      });
      
      // Store Snipara settings in workspace_settings
      await pg.query(
        `INSERT INTO workspace_settings (workspace_id, key, value, created_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (workspace_id, key) 
         DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [workspaceId, 'snipara_project_id', sniparaProject.id]
      );

      if (sniparaProject.api_key) {
        await pg.query(
          `INSERT INTO workspace_settings (workspace_id, key, value, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (workspace_id, key) 
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
          [workspaceId, 'snipara_api_key', sniparaProject.api_key]
        );
      }

      results.snipara = {
        project_id: sniparaProject.id,
        status: sniparaProject.status || 'provisioned'
      };
    } catch (err) {
      console.warn(`[Onboarding] Snipara provisioning failed: ${err.message}`);
      results.snipara = {
        status: 'failed',
        error: err.message
      };
    }

    // Step 3: Get template
    const template = await db.collection('templates').findOne({ _id: template_id });
    if (!template) {
      throw new Error(`Template not found: ${template_id}`);
    }

    // Step 4: Create agent from template
    const agentId = `agent_${workspaceId}_${Date.now()}`;
    const agentData = {
      _id: agentId,
      name: agent_name || template.name || 'Assistant',
      username: agentId,
      email: `${agentId}@${workspaceId}.vutler.ai`,
      description: agent_description || template.description || '',
      bio: template.system_prompt || `You are ${agent_name || template.name}. Be helpful and concise.`,
      type: 'agent',
      status: 'online',
      workspace_id: workspaceId,
      template_id: template_id,
      _createdAt: new Date(),
      _updatedAt: new Date(),
      roles: ['agent']
    };

    await db.collection('users').insertOne(agentData);
    results.agent = {
      id: agentId,
      name: agentData.name,
      email: agentData.email
    };

    // Step 5: Assign to default channel (if specified)
    if (channel_name) {
      // For MVP, use a default channel ID - in production you'd lookup the actual channel
      const channelId = `channel_${workspaceId}_${channel_name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      
      await pg.query(
        `INSERT INTO agent_rc_channels (agent_id, rc_channel_id, rc_channel_name, workspace_id, is_active)
         VALUES ($1, $2, $3, $4, TRUE)`,
        [agentId, channelId, channel_name, workspaceId]
      );

      results.channel_assignment = {
        channel_id: channelId,
        channel_name: channel_name
      };
    }

    // Step 6: Set LLM configuration
    // First, ensure provider exists
    await pg.query(
      `INSERT INTO workspace_llm_providers (workspace_id, provider, is_active, created_at)
       VALUES ($1, $2, TRUE, NOW())
       ON CONFLICT (workspace_id, provider) 
       DO UPDATE SET is_active = TRUE, updated_at = NOW()`,
      [workspaceId, llm_provider]
    );

    // Set default LLM config for the agent
    await pg.query(
      `INSERT INTO agent_llm_configs (agent_id, provider, model, is_default, created_at)
       VALUES ($1, $2, $3, TRUE, NOW())
       ON CONFLICT (agent_id, provider) 
       DO UPDATE SET model = EXCLUDED.model, is_default = TRUE, updated_at = NOW()`,
      [agentId, llm_provider, llm_model]
    );

    // Also set model assignment for 'general' task profile
    await pg.query(
      `INSERT INTO agent_model_assignments (agent_id, provider_id, model, task_profile, priority, created_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (agent_id, task_profile)
       DO UPDATE SET provider_id = EXCLUDED.provider_id, model = EXCLUDED.model, 
                     priority = EXCLUDED.priority, updated_at = NOW()`,
      [agentId, llm_provider, llm_model, 'general']
    );

    results.llm_config = {
      provider: llm_provider,
      model: llm_model,
      task_profile: 'general'
    };

    // Commit transaction
    await transaction.commit();

    // Reload runtime to pick up new agent assignments
    if (req.app.locals.runtime) {
      try {
        await req.app.locals.runtime.reload();
        console.log(`[Onboarding] Runtime reloaded for new agent: ${agentId}`);
      } catch (err) {
        console.warn(`[Onboarding] Runtime reload failed: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      data: {
        workspace_id: workspaceId,
        agent_id: agentId,
        ...results
      }
    });

  } catch (error) {
    console.error('Onboarding error:', error);
    
    if (transaction) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('Transaction rollback failed:', rollbackError);
      }
    }

    res.status(500).json({
      success: false,
      error: error.message,
      details: error.stack
    });
  }
});

module.exports = router;