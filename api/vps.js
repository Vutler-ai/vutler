'use strict';

const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const { VPSProviderFactory } = require('../services/vpsProvider');
const { CryptoService } = require('../services/crypto');
const { AgentDeploymentService } = require('../services/agentDeployment');
const { authenticateAgent } = require('../lib/auth');

// Apply authentication to all routes
router.use(authenticateAgent);

// Initialize crypto service
const crypto = new CryptoService();

// ============================================================================
// Provider Info Routes (public-ish, still needs auth)
// ============================================================================

/**
 * GET /providers
 * List all active VPS providers
 */
router.get('/providers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, display_name, api_type, regions, is_active, created_at
      FROM tenant_vutler.vps_providers 
      WHERE is_active = true 
      ORDER BY display_name
    `);
    
    res.json({ 
      success: true, 
      data: result.rows 
    });
  } catch (err) {
    console.error('[VPS API] Error listing providers:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to list providers' 
    });
  }
});

/**
 * GET /flavors/:provider
 * List available flavors/sizes for a provider
 */
router.get('/flavors/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { workspaceId } = req;

    // Get provider config for this workspace
    const configResult = await pool.query(`
      SELECT pc.*, p.name as provider_name
      FROM tenant_vutler.vps_provider_configs pc
      JOIN tenant_vutler.vps_providers p ON p.id = pc.provider_id
      WHERE p.name = $1 AND pc.workspace_id = $2 AND pc.is_active = true
      LIMIT 1
    `, [provider, workspaceId]);

    if (configResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No configuration found for provider ${provider} in your workspace`
      });
    }

    const config = configResult.rows[0];
    
    // Decrypt credentials
    const credentials = crypto.decrypt(config.credentials_encrypted);
    
    // Create provider instance and fetch flavors
    const vpsProvider = VPSProviderFactory.create(provider, credentials);
    await vpsProvider.authenticate();
    const flavors = await vpsProvider.listFlavors();

    res.json({
      success: true,
      data: flavors
    });
  } catch (err) {
    console.error('[VPS API] Error listing flavors:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to list flavors'
    });
  }
});

/**
 * GET /images/:provider
 * List available images for a provider
 */
router.get('/images/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const { workspaceId } = req;

    // Get provider config for this workspace
    const configResult = await pool.query(`
      SELECT pc.*, p.name as provider_name
      FROM tenant_vutler.vps_provider_configs pc
      JOIN tenant_vutler.vps_providers p ON p.id = pc.provider_id
      WHERE p.name = $1 AND pc.workspace_id = $2 AND pc.is_active = true
      LIMIT 1
    `, [provider, workspaceId]);

    if (configResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No configuration found for provider ${provider} in your workspace`
      });
    }

    const config = configResult.rows[0];
    
    // Decrypt credentials
    const credentials = crypto.decrypt(config.credentials_encrypted);
    
    // Create provider instance and fetch images
    const vpsProvider = VPSProviderFactory.create(provider, credentials);
    await vpsProvider.authenticate();
    const images = await vpsProvider.listImages();

    res.json({
      success: true,
      data: images
    });
  } catch (err) {
    console.error('[VPS API] Error listing images:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to list images'
    });
  }
});

// ============================================================================
// Provider Configuration Routes (workspace-scoped)
// ============================================================================

/**
 * POST /config
 * Save provider credentials for workspace
 */
router.post('/config', async (req, res) => {
  try {
    const { provider, credentials, region, defaultFlavor, defaultImage } = req.body;
    const { workspaceId } = req;

    if (!provider || !credentials) {
      return res.status(400).json({
        success: false,
        error: 'Provider and credentials are required'
      });
    }

    // Get provider ID
    const providerResult = await pool.query(`
      SELECT id FROM tenant_vutler.vps_providers 
      WHERE name = $1 AND is_active = true
    `, [provider]);

    if (providerResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Provider ${provider} not found`
      });
    }

    const providerId = providerResult.rows[0].id;

    // Encrypt credentials
    const encryptedCredentials = crypto.encrypt(JSON.stringify(credentials));

    // Check if config already exists for this workspace/provider
    const existingResult = await pool.query(`
      SELECT id FROM tenant_vutler.vps_provider_configs
      WHERE workspace_id = $1 AND provider_id = $2
    `, [workspaceId, providerId]);

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing config
      result = await pool.query(`
        UPDATE tenant_vutler.vps_provider_configs 
        SET credentials_encrypted = $1, region = $2, default_flavor = $3, 
            default_image = $4, updated_at = now()
        WHERE workspace_id = $5 AND provider_id = $6
        RETURNING *
      `, [encryptedCredentials, region, defaultFlavor, defaultImage, workspaceId, providerId]);
    } else {
      // Create new config
      result = await pool.query(`
        INSERT INTO tenant_vutler.vps_provider_configs 
        (workspace_id, provider_id, credentials_encrypted, region, default_flavor, default_image)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [workspaceId, providerId, encryptedCredentials, region, defaultFlavor, defaultImage]);
    }

    // Don't return encrypted credentials in response
    const config = result.rows[0];
    delete config.credentials_encrypted;

    res.json({
      success: true,
      data: config
    });
  } catch (err) {
    console.error('[VPS API] Error saving config:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to save provider configuration'
    });
  }
});

/**
 * GET /config
 * Get workspace provider configurations
 */
router.get('/config', async (req, res) => {
  try {
    const { workspaceId } = req;

    const result = await pool.query(`
      SELECT pc.id, pc.workspace_id, pc.provider_id, pc.region, 
             pc.default_flavor, pc.default_image, pc.is_active, 
             pc.created_at, pc.updated_at,
             p.name as provider_name, p.display_name
      FROM tenant_vutler.vps_provider_configs pc
      JOIN tenant_vutler.vps_providers p ON p.id = pc.provider_id
      WHERE pc.workspace_id = $1 AND pc.is_active = true
      ORDER BY p.display_name
    `, [workspaceId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('[VPS API] Error getting configs:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get provider configurations'
    });
  }
});

/**
 * DELETE /config/:id
 * Remove a provider configuration
 */
router.delete('/config/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { workspaceId } = req;

    const result = await pool.query(`
      UPDATE tenant_vutler.vps_provider_configs
      SET is_active = false, updated_at = now()
      WHERE id = $1 AND workspace_id = $2
      RETURNING *
    `, [id, workspaceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Provider configuration not found'
      });
    }

    res.json({
      success: true,
      data: { id, deleted: true }
    });
  } catch (err) {
    console.error('[VPS API] Error deleting config:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete provider configuration'
    });
  }
});

// ============================================================================
// Instance CRUD Routes
// ============================================================================

/**
 * POST /instances
 * Create a new VPS instance
 */
router.post('/instances', async (req, res) => {
  try {
    const { provider, flavor, image, name, region } = req.body;
    const { workspaceId } = req;

    if (!provider || !flavor || !image || !name) {
      return res.status(400).json({
        success: false,
        error: 'Provider, flavor, image, and name are required'
      });
    }

    // Get provider config for this workspace
    const configResult = await pool.query(`
      SELECT pc.*, p.name as provider_name, p.id as provider_id
      FROM tenant_vutler.vps_provider_configs pc
      JOIN tenant_vutler.vps_providers p ON p.id = pc.provider_id
      WHERE p.name = $1 AND pc.workspace_id = $2 AND pc.is_active = true
      LIMIT 1
    `, [provider, workspaceId]);

    if (configResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: `No configuration found for provider ${provider} in your workspace`
      });
    }

    const config = configResult.rows[0];

    // Create instance record in database first
    const instanceResult = await pool.query(`
      INSERT INTO tenant_vutler.vps_instances 
      (workspace_id, provider_id, name, status, flavor, image, region)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [workspaceId, config.provider_id, name, 'creating', flavor, image, region || config.region]);

    const instance = instanceResult.rows[0];

    try {
      // Decrypt credentials and create provider instance
      const credentials = crypto.decrypt(config.credentials_encrypted);
      const vpsProvider = VPSProviderFactory.create(provider, credentials);
      await vpsProvider.authenticate();

      // Create instance with the provider
      const providerInstance = await vpsProvider.createInstance({
        name,
        flavor,
        image,
        region: region || config.region
      });

      // Update instance with provider-specific details
      const updatedResult = await pool.query(`
        UPDATE tenant_vutler.vps_instances
        SET provider_instance_id = $1, status = $2, ip_address = $3, 
            metadata = $4, updated_at = now()
        WHERE id = $5
        RETURNING *
      `, [
        providerInstance.id, 
        providerInstance.status || 'creating',
        providerInstance.ip_address,
        JSON.stringify(providerInstance.metadata || {}),
        instance.id
      ]);

      res.json({
        success: true,
        data: updatedResult.rows[0]
      });
    } catch (providerErr) {
      // Update instance status to error
      await pool.query(`
        UPDATE tenant_vutler.vps_instances
        SET status = 'error', metadata = $1, updated_at = now()
        WHERE id = $2
      `, [JSON.stringify({ error: providerErr.message }), instance.id]);

      console.error('[VPS API] Provider error creating instance:', providerErr);
      res.status(500).json({
        success: false,
        error: `Failed to create instance: ${providerErr.message}`
      });
    }
  } catch (err) {
    console.error('[VPS API] Error creating instance:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to create instance'
    });
  }
});

/**
 * GET /instances
 * List workspace VPS instances
 */
router.get('/instances', async (req, res) => {
  try {
    const { workspaceId } = req;

    const result = await pool.query(`
      SELECT vi.*, p.name as provider_name, p.display_name as provider_display_name
      FROM tenant_vutler.vps_instances vi
      JOIN tenant_vutler.vps_providers p ON p.id = vi.provider_id
      WHERE vi.workspace_id = $1 AND vi.deleted_at IS NULL
      ORDER BY vi.created_at DESC
    `, [workspaceId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    console.error('[VPS API] Error listing instances:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to list instances'
    });
  }
});

/**
 * GET /instances/:id
 * Get instance details with live status
 */
router.get('/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { workspaceId } = req;

    // Get instance details
    const instanceResult = await pool.query(`
      SELECT vi.*, p.name as provider_name, p.display_name as provider_display_name
      FROM tenant_vutler.vps_instances vi
      JOIN tenant_vutler.vps_providers p ON p.id = vi.provider_id
      WHERE vi.id = $1 AND vi.workspace_id = $2 AND vi.deleted_at IS NULL
    `, [id, workspaceId]);

    if (instanceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found'
      });
    }

    const instance = instanceResult.rows[0];

    try {
      // Get provider config and check live status
      const configResult = await pool.query(`
        SELECT credentials_encrypted FROM tenant_vutler.vps_provider_configs
        WHERE workspace_id = $1 AND provider_id = $2 AND is_active = true
      `, [workspaceId, instance.provider_id]);

      if (configResult.rows.length > 0 && instance.provider_instance_id) {
        const credentials = crypto.decrypt(configResult.rows[0].credentials_encrypted);
        const vpsProvider = VPSProviderFactory.create(instance.provider_name, credentials);
        await vpsProvider.authenticate();
        
        const liveStatus = await vpsProvider.getInstanceStatus(instance.provider_instance_id);
        instance.live_status = liveStatus;

        // Update status in database if different
        if (liveStatus.status && liveStatus.status !== instance.status) {
          await pool.query(`
            UPDATE tenant_vutler.vps_instances
            SET status = $1, updated_at = now()
            WHERE id = $2
          `, [liveStatus.status, instance.id]);
          instance.status = liveStatus.status;
        }
      }
    } catch (providerErr) {
      console.warn('[VPS API] Could not get live status:', providerErr.message);
      instance.live_status = { error: providerErr.message };
    }

    res.json({
      success: true,
      data: instance
    });
  } catch (err) {
    console.error('[VPS API] Error getting instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get instance details'
    });
  }
});

/**
 * POST /instances/:id/start
 * Start a VPS instance
 */
router.post('/instances/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const { workspaceId } = req;

    const result = await _performInstanceAction(id, workspaceId, 'start');
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    console.error('[VPS API] Error starting instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to start instance'
    });
  }
});

/**
 * POST /instances/:id/stop
 * Stop a VPS instance
 */
router.post('/instances/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    const { workspaceId } = req;

    const result = await _performInstanceAction(id, workspaceId, 'stop');
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    console.error('[VPS API] Error stopping instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to stop instance'
    });
  }
});

/**
 * DELETE /instances/:id
 * Delete a VPS instance
 */
router.delete('/instances/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { workspaceId } = req;

    const result = await _performInstanceAction(id, workspaceId, 'delete');
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    console.error('[VPS API] Error deleting instance:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to delete instance'
    });
  }
});

// ============================================================================
// Agent Deployment Routes
// ============================================================================

/**
 * POST /agents/:agentId/deploy
 * Deploy agent to a VPS instance
 */
router.post('/agents/:agentId/deploy', async (req, res) => {
  try {
    const { agentId } = req.params;
    const { vpsInstanceId, deploymentConfig } = req.body;
    const { workspaceId } = req;

    if (!vpsInstanceId) {
      return res.status(400).json({
        success: false,
        error: 'vpsInstanceId is required'
      });
    }

    // Validate agent ownership
    const agentResult = await pool.query(`
      SELECT * FROM tenant_vutler.agents 
      WHERE id = $1 AND workspace_id = $2
    `, [agentId, workspaceId]);

    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }

    // Validate VPS instance ownership
    const instanceResult = await pool.query(`
      SELECT * FROM tenant_vutler.vps_instances 
      WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL
    `, [vpsInstanceId, workspaceId]);

    if (instanceResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'VPS instance not found'
      });
    }

    const vpsInstance = instanceResult.rows[0];
    if (vpsInstance.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: `VPS instance must be active, current status: ${vpsInstance.status}`
      });
    }

    // Deploy agent
    const deploymentService = new AgentDeploymentService(pool, crypto);
    const deployment = await deploymentService.deployAgent(
      agentId, 
      vpsInstanceId, 
      workspaceId, 
      deploymentConfig || {}
    );

    res.json({
      success: true,
      data: {
        deploymentId: deployment.id,
        status: deployment.status,
        agentId,
        vpsInstanceId
      },
      message: 'Agent deployment started successfully'
    });

  } catch (err) {
    console.error('[VPS API] Error deploying agent:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to deploy agent'
    });
  }
});

/**
 * GET /deployments
 * List deployments for workspace
 */
router.get('/deployments', async (req, res) => {
  try {
    const { workspaceId } = req;

    const result = await pool.query(`
      SELECT 
        vd.*,
        vi.name as vps_instance_name,
        vi.status as vps_instance_status,
        vi.ip_address as vps_ip_address,
        a.name as agent_name,
        a.vps_status as agent_vps_status
      FROM tenant_vutler.vps_deployments vd
      JOIN tenant_vutler.vps_instances vi ON vd.vps_instance_id = vi.id
      LEFT JOIN tenant_vutler.agents a ON vd.agent_id = a.id
      WHERE vi.workspace_id = $1
      ORDER BY vd.created_at DESC
    `, [workspaceId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (err) {
    console.error('[VPS API] Error listing deployments:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to list deployments'
    });
  }
});

/**
 * GET /deployments/:deploymentId
 * Get deployment detail
 */
router.get('/deployments/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { workspaceId } = req;

    const result = await pool.query(`
      SELECT 
        vd.*,
        vi.name as vps_instance_name,
        vi.status as vps_instance_status,
        vi.ip_address as vps_ip_address,
        a.name as agent_name,
        a.vps_status as agent_vps_status,
        p.display_name as provider_name
      FROM tenant_vutler.vps_deployments vd
      JOIN tenant_vutler.vps_instances vi ON vd.vps_instance_id = vi.id
      JOIN tenant_vutler.vps_providers p ON vi.provider_id = p.id
      LEFT JOIN tenant_vutler.agents a ON vd.agent_id = a.id
      WHERE vd.id = $1 AND vi.workspace_id = $2
    `, [deploymentId, workspaceId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Deployment not found'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });

  } catch (err) {
    console.error('[VPS API] Error getting deployment:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to get deployment details'
    });
  }
});

/**
 * DELETE /deployments/:deploymentId
 * Undeploy agent
 */
router.delete('/deployments/:deploymentId', async (req, res) => {
  try {
    const { deploymentId } = req.params;
    const { workspaceId } = req;

    // Validate deployment ownership
    const deploymentResult = await pool.query(`
      SELECT vd.*, vi.workspace_id
      FROM tenant_vutler.vps_deployments vd
      JOIN tenant_vutler.vps_instances vi ON vd.vps_instance_id = vi.id
      WHERE vd.id = $1 AND vi.workspace_id = $2
    `, [deploymentId, workspaceId]);

    if (deploymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Deployment not found'
      });
    }

    const deployment = deploymentResult.rows[0];
    if (deployment.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Cannot undeploy: deployment status is ${deployment.status}`
      });
    }

    // Undeploy agent
    const deploymentService = new AgentDeploymentService(pool, crypto);
    await deploymentService.undeployAgent(deploymentId);

    res.json({
      success: true,
      message: 'Agent undeployed successfully'
    });

  } catch (err) {
    console.error('[VPS API] Error undeploying agent:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to undeploy agent'
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Perform an action on a VPS instance
 */
async function _performInstanceAction(instanceId, workspaceId, action) {
  // Get instance details
  const instanceResult = await pool.query(`
    SELECT vi.*, p.name as provider_name
    FROM tenant_vutler.vps_instances vi
    JOIN tenant_vutler.vps_providers p ON p.id = vi.provider_id
    WHERE vi.id = $1 AND vi.workspace_id = $2 AND vi.deleted_at IS NULL
  `, [instanceId, workspaceId]);

  if (instanceResult.rows.length === 0) {
    return {
      success: false,
      error: 'Instance not found'
    };
  }

  const instance = instanceResult.rows[0];

  if (!instance.provider_instance_id) {
    return {
      success: false,
      error: 'Instance has no provider ID (creation may have failed)'
    };
  }

  try {
    // Get provider config
    const configResult = await pool.query(`
      SELECT credentials_encrypted FROM tenant_vutler.vps_provider_configs
      WHERE workspace_id = $1 AND provider_id = $2 AND is_active = true
    `, [workspaceId, instance.provider_id]);

    if (configResult.rows.length === 0) {
      return {
        success: false,
        error: 'No provider configuration found'
      };
    }

    const credentials = crypto.decrypt(configResult.rows[0].credentials_encrypted);
    const vpsProvider = VPSProviderFactory.create(instance.provider_name, credentials);
    await vpsProvider.authenticate();

    let result;
    let newStatus;

    switch (action) {
      case 'start':
        result = await vpsProvider.startInstance(instance.provider_instance_id);
        newStatus = 'starting';
        break;
      case 'stop':
        result = await vpsProvider.stopInstance(instance.provider_instance_id);
        newStatus = 'stopping';
        break;
      case 'delete':
        result = await vpsProvider.deleteInstance(instance.provider_instance_id);
        newStatus = 'deleting';
        break;
      default:
        return {
          success: false,
          error: `Unknown action: ${action}`
        };
    }

    // Update instance status
    if (action === 'delete') {
      await pool.query(`
        UPDATE tenant_vutler.vps_instances
        SET status = $1, deleted_at = now(), updated_at = now()
        WHERE id = $2
      `, [newStatus, instanceId]);
    } else {
      await pool.query(`
        UPDATE tenant_vutler.vps_instances
        SET status = $1, updated_at = now()
        WHERE id = $2
      `, [newStatus, instanceId]);
    }

    return {
      success: true,
      data: {
        action,
        instanceId,
        status: newStatus,
        result
      }
    };
  } catch (err) {
    console.error(`[VPS API] Error performing ${action} on instance:`, err);
    return {
      success: false,
      error: err.message || `Failed to ${action} instance`
    };
  }
}

module.exports = router;