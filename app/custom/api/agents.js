/**
 * Vutler Agent Identity API
 * Extends Rocket.Chat to support AI agent users with API key authentication
 * Now using PostgreSQL (Vaultbrix) instead of MongoDB
 */

const crypto = require('crypto');
const express = require('express');
const { validateCreateAgent, validateAgentIdParam } = require('../lib/validation');
const { ensureCorePermissionsDocument } = require('../lib/core-permissions');
const router = express.Router();

// Generate a secure API key
function generateApiKey() {
  return 'vutler_' + crypto.randomBytes(32).toString('hex');
}

// Validate agent data
function validateAgentData(data) {
  const errors = [];
  
  if (!data.name || typeof data.name !== 'string') {
    errors.push('name is required and must be a string');
  }
  
  if (!data.email || typeof data.email !== 'string') {
    errors.push('email is required and must be a string');
  }
  
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (data.email && !emailRegex.test(data.email)) {
    errors.push('email must be a valid email address');
  }
  
  return errors;
}

/**
 * POST /api/v1/agents
 * Create a new agent with API key
 */
router.post('/agents', validateCreateAgent, async (req, res) => {
  try {
    const { name, email, avatar, description } = req.body;
    const pg = req.app.locals.pg;
    
    if (!pg) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
    
    // Check if email already exists
    const existingUser = await pg.query(
      'SELECT id FROM tenant_vutler.agents WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'An agent with this email already exists'
      });
    }
    
    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Create agent user
    const agentId = crypto.randomBytes(16).toString('hex');
    const username = email.split('@')[0] + '_' + Date.now();
    const now = new Date();
    
    const result = await pg.query(
      `INSERT INTO tenant_vutler.agents 
       (id, name, username, email, type, status, active, roles, avatar, bio, api_key, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
       RETURNING *`,
      [agentId, name, username, email, 'agent', 'online', true, ['agent'], avatar || null, description || '', apiKeyHash, now, now]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Failed to create agent');
    }
    
    const agent = result.rows[0];
    
    // Return agent info with API key (only shown once)
    res.status(201).json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        avatar: agent.avatar,
        description: agent.bio,
        apiKey: apiKey, // Plain key returned only on creation
        createdAt: agent.created_at
      }
    });
    
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/agents
 * List all agents
 */
router.get('/agents', async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    
    if (!pg) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
    
    // Get API key from header
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }
    
    // Verify API key
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const authAgent = await pg.query(
      'SELECT id FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2',
      ['agent', apiKeyHash]
    );
    
    if (authAgent.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    // Fetch all agents
    const agentsResult = await pg.query(
      'SELECT id, name, email, avatar, bio, status, created_at FROM tenant_vutler.agents WHERE type = $1',
      ['agent']
    );
    
    // Format response
    const formattedAgents = agentsResult.rows.map(agent => ({
      id: agent.id,
      name: agent.name,
      email: agent.email,
      avatar: agent.avatar,
      description: agent.bio,
      status: agent.status,
      createdAt: agent.created_at
    }));
    
    res.json({
      success: true,
      agents: formattedAgents,
      count: formattedAgents.length
    });
    
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/agents/:id
 * Get agent details by ID
 */
router.get('/agents/:id', validateAgentIdParam, async (req, res) => {
  try {
    const { id } = req.params;
    const pg = req.app.locals.pg;
    
    if (!pg) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
    
    // Get API key from header
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }
    
    // Verify API key
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const authAgent = await pg.query(
      'SELECT id FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2',
      ['agent', apiKeyHash]
    );
    
    if (authAgent.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    // Fetch agent
    const agentResult = await pg.query(
      'SELECT id, name, email, avatar, bio, status, created_at, updated_at FROM tenant_vutler.agents WHERE id = $1 AND type = $2',
      [id, 'agent']
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    const agent = agentResult.rows[0];
    
    // Format response
    res.json({
      success: true,
      agent: {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        avatar: agent.avatar,
        description: agent.bio,
        status: agent.status,
        createdAt: agent.created_at,
        updatedAt: agent.updated_at
      }
    });
    
  } catch (error) {
    console.error('Error fetching agent:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/agents/:id/rotate-key
 * Rotate API key for an agent (security-sensitive endpoint)
 */
router.post('/agents/:id/rotate-key', validateAgentIdParam, async (req, res) => {
  try {
    const { id: agentId } = req.params;
    const pg = req.app.locals.pg;
    
    if (!pg) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
    
    // Get current API key from header
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }
    
    // Verify API key belongs to this agent
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const agentResult = await pg.query(
      'SELECT id FROM tenant_vutler.agents WHERE id = $1 AND type = $2 AND api_key = $3 AND active = $4',
      [agentId, 'agent', apiKeyHash, true]
    );
    
    if (agentResult.rows.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden - can only rotate your own API key'
      });
    }
    
    // Generate new API key
    const newApiKey = generateApiKey();
    const newApiKeyHash = crypto.createHash('sha256').update(newApiKey).digest('hex');
    
    // Update in database
    const updateResult = await pg.query(
      'UPDATE tenant_vutler.agents SET api_key = $1, updated_at = $2 WHERE id = $3',
      [newApiKeyHash, new Date(), agentId]
    );
    
    if (updateResult.rowCount === 0) {
      throw new Error('Failed to rotate API key');
    }
    
    console.log(`🔐 API key rotated for agent ${agentId}`);
    
    res.json({
      success: true,
      message: 'API key rotated successfully',
      apiKey: newApiKey, // Return new key only once
      warning: 'Store this key securely. It will not be shown again.'
    });
    
  } catch (error) {
    console.error('Error rotating API key:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rotate API key',
      message: error.message
    });
  }
});

/**
 * PATCH /api/v1/agents/:id
 * Update agent basic information
 */
router.patch('/agents/:id', validateAgentIdParam, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, avatar } = req.body;
    const pg = req.app.locals.pg;
    
    if (!pg) {
      return res.status(503).json({
        success: false,
        error: 'Database not available'
      });
    }
    
    // Get API key from header
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'API key required'
      });
    }
    
    // Verify API key
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    const authAgentResult = await pg.query(
      'SELECT id, roles FROM tenant_vutler.agents WHERE type = $1 AND api_key = $2',
      ['agent', apiKeyHash]
    );
    
    if (authAgentResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }
    
    const authAgent = authAgentResult.rows[0];
    
    // Only allow updating own agent unless admin
    const isAdmin = authAgent.roles && authAgent.roles.includes('admin');
    if (authAgent.id !== id && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden - can only update your own agent'
      });
    }
    
    // Build update fields
    const updates = [];
    const values = [];
    let paramIdx = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`bio = $${paramIdx++}`);
      values.push(description);
    }
    if (avatar !== undefined) {
      updates.push(`avatar = $${paramIdx++}`);
      values.push(avatar);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }
    
    updates.push(`updated_at = $${paramIdx++}`);
    values.push(new Date());
    values.push(id);
    values.push('agent');
    
    // Update agent
    const updateResult = await pg.query(
      `UPDATE tenant_vutler.agents SET ${updates.join(', ')} WHERE id = $${paramIdx++} AND type = $${paramIdx++}`,
      values
    );
    
    if (updateResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Agent updated successfully'
    });
    
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update agent',
      message: error.message
    });
  }
});

module.exports = router;
