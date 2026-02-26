/**
 * Vutler Agents API
 * CRUD operations for AI agents (bots)
 * Migrated from app/custom/api/agents.js with full REST support
 */

const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const router = express.Router();

// MongoDB connection
let mongoClient = null;

/**
 * Initialize MongoDB connection
 */
async function getMongoDb() {
  if (!mongoClient) {
    const mongoUrl = process.env.MONGO_URL || 'mongodb://vutler-mongo:27017';
    mongoClient = new MongoClient(mongoUrl, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    console.log('✅ MongoDB connected for agents');
  }
  return mongoClient.db('rocketchat');
}

/**
 * Generate a secure API key
 */
function generateApiKey() {
  return 'vutler_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * GET /api/v1/agents
 * List all agents
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '100');
    const skip = parseInt(req.query.skip || '0');
    const status = req.query.status; // optional filter
    
    const db = await getMongoDb();
    
    const query = { type: 'bot' };
    if (status) {
      query.status = status;
    }
    
    const agents = await db.collection('users')
      .find(query)
      .project({
        _id: 1,
        name: 1,
        username: 1,
        emails: 1,
        status: 1,
        type: 1,
        avatar: 1,
        bio: 1,
        createdAt: 1,
        _updatedAt: 1,
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    res.json({
      success: true,
      agents: agents.map(agent => ({
        id: agent._id,
        name: agent.name || agent.username,
        username: agent.username,
        email: agent.emails?.[0]?.address || null,
        status: agent.status || 'offline',
        type: agent.type,
        avatar: agent.avatar || null,
        description: agent.bio || '',
        createdAt: agent.createdAt,
        updatedAt: agent._updatedAt,
      })),
      count: agents.length,
      skip,
      limit,
    });
    
  } catch (error) {
    console.error('❌ Error listing agents:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list agents',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/agents/:id
 * Get a specific agent by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getMongoDb();
    
    const agent = await db.collection('users').findOne({
      _id: id,
      type: 'bot'
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
        id
      });
    }
    
    res.json({
      success: true,
      agent: {
        id: agent._id,
        name: agent.name || agent.username,
        username: agent.username,
        email: agent.emails?.[0]?.address || null,
        status: agent.status || 'offline',
        type: agent.type,
        avatar: agent.avatar || null,
        description: agent.bio || '',
        createdAt: agent.createdAt,
        updatedAt: agent._updatedAt,
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch agent',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/agents
 * Create a new agent
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, username, avatar, description, status } = req.body;
    
    // Validation
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'name is required and must be a string'
      });
    }
    
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Valid email is required'
      });
    }
    
    const db = await getMongoDb();
    
    // Check if email already exists
    const existingUser = await db.collection('users').findOne({
      'emails.address': email
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An agent with this email already exists',
        email
      });
    }
    
    // Generate username if not provided
    const generatedUsername = username || 
      email.split('@')[0] + '_' + Date.now();
    
    // Check if username exists
    const existingUsername = await db.collection('users').findOne({
      username: generatedUsername
    });
    
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        error: 'Username already exists',
        username: generatedUsername
      });
    }
    
    // Generate API key
    const apiKey = generateApiKey();
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    // Create agent document
    const agent = {
      _id: crypto.randomBytes(16).toString('hex'),
      name,
      username: generatedUsername,
      emails: [{
        address: email,
        verified: true
      }],
      type: 'bot',
      status: status || 'offline',
      active: true,
      roles: ['bot'],
      avatar: avatar || null,
      bio: description || '',
      apiKey: apiKeyHash,
      createdAt: new Date(),
      _updatedAt: new Date(),
      services: {
        vutler: {
          apiKey: apiKeyHash,
          createdAt: new Date()
        }
      }
    };
    
    const result = await db.collection('users').insertOne(agent);
    
    if (!result.insertedId) {
      throw new Error('Failed to create agent');
    }
    
    console.log(`✅ Created agent: ${agent.username} (${agent._id})`);
    
    res.status(201).json({
      success: true,
      agent: {
        id: agent._id,
        name: agent.name,
        username: agent.username,
        email: agent.emails[0].address,
        status: agent.status,
        type: agent.type,
        avatar: agent.avatar,
        description: agent.bio,
        apiKey: apiKey, // Only returned on creation
        createdAt: agent.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create agent',
      message: error.message
    });
  }
});

/**
 * PUT /api/v1/agents/:id
 * Update an agent
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status, avatar, description } = req.body;
    
    // Validation: at least one field must be provided
    if (!name && !status && !avatar && description === undefined) {
      return res.status(400).json({
        success: false,
        error: 'At least one field (name, status, avatar, description) must be provided'
      });
    }
    
    const db = await getMongoDb();
    
    // Check if agent exists
    const existingAgent = await db.collection('users').findOne({
      _id: id,
      type: 'bot'
    });
    
    if (!existingAgent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
        id
      });
    }
    
    // Build update object
    const updateFields = {
      _updatedAt: new Date()
    };
    
    if (name) updateFields.name = name;
    if (status) updateFields.status = status;
    if (avatar !== undefined) updateFields.avatar = avatar;
    if (description !== undefined) updateFields.bio = description;
    
    // Update in database
    const result = await db.collection('users').updateOne(
      { _id: id, type: 'bot' },
      { $set: updateFields }
    );
    
    if (result.modifiedCount === 0) {
      console.warn(`⚠️  No changes made to agent ${id}`);
    }
    
    // Fetch updated agent
    const updatedAgent = await db.collection('users').findOne({
      _id: id,
      type: 'bot'
    });
    
    console.log(`✅ Updated agent: ${updatedAgent.username} (${id})`);
    
    res.json({
      success: true,
      agent: {
        id: updatedAgent._id,
        name: updatedAgent.name,
        username: updatedAgent.username,
        email: updatedAgent.emails?.[0]?.address || null,
        status: updatedAgent.status,
        type: updatedAgent.type,
        avatar: updatedAgent.avatar,
        description: updatedAgent.bio,
        updatedAt: updatedAgent._updatedAt,
      }
    });
    
  } catch (error) {
    console.error('❌ Error updating agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update agent',
      message: error.message
    });
  }
});

/**
 * DELETE /api/v1/agents/:id
 * Delete an agent (soft delete by setting active: false)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const hardDelete = req.query.hard === 'true'; // ?hard=true for actual deletion
    
    const db = await getMongoDb();
    
    // Check if agent exists
    const agent = await db.collection('users').findOne({
      _id: id,
      type: 'bot'
    });
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
        id
      });
    }
    
    if (hardDelete) {
      // Hard delete: actually remove from database
      const result = await db.collection('users').deleteOne({
        _id: id,
        type: 'bot'
      });
      
      console.log(`🗑️  Hard deleted agent: ${agent.username} (${id})`);
      
      res.json({
        success: true,
        message: 'Agent permanently deleted',
        id,
        deleted: result.deletedCount > 0
      });
    } else {
      // Soft delete: set active to false
      const result = await db.collection('users').updateOne(
        { _id: id, type: 'bot' },
        {
          $set: {
            active: false,
            status: 'offline',
            _updatedAt: new Date()
          }
        }
      );
      
      console.log(`🔒 Soft deleted agent: ${agent.username} (${id})`);
      
      res.json({
        success: true,
        message: 'Agent deactivated (soft delete)',
        id,
        deactivated: result.modifiedCount > 0
      });
    }
    
  } catch (error) {
    console.error('❌ Error deleting agent:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete agent',
      message: error.message
    });
  }
});

/**
 * Graceful shutdown
 */
async function closeConnection() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    console.log('✅ Agents MongoDB connection closed');
  }
}

process.on('SIGTERM', closeConnection);
process.on('SIGINT', closeConnection);

module.exports = router;
