/**
 * Vutler Chat API - Channels & Direct Messages
 * PostgreSQL-based chat system with channels and direct messaging
 */

const express = require('express');
const vaultbrixPool = require('../lib/vaultbrix');

const router = express.Router();

// Helper function to get database connection
async function getPg() {
  return vaultbrixPool;
}

/**
 * GET /api/v1/chat/channels
 * List channels for workspace
 */
router.get('/channels', async (req, res) => {
  try {
    const { type } = req.query;
    const workspaceId = '00000000-0000-0000-0000-000000000001'; // Default workspace
    
    const pg = await getPg();
    let query = `
      SELECT id, name, description, type, members, created_by, created_at, updated_at
      FROM tenant_vutler.chat_channels 
      WHERE workspace_id = $1
    `;
    const params = [workspaceId];
    
    if (type) {
      query += ` AND type = $2`;
      params.push(type);
    }
    
    query += ` ORDER BY updated_at DESC`;
    
    const result = await pg.query(query, params);
    
    res.json({
      success: true,
      channels: result.rows.map(channel => ({
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        members: channel.members || [],
        created_by: channel.created_by,
        created_at: channel.created_at,
        updated_at: channel.updated_at
      })),
      count: result.rows.length
    });
    
  } catch (error) {
    console.error('❌ Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/chat/channels
 * Create a new channel
 */
router.post('/channels', async (req, res) => {
  try {
    const { name, description, type = 'channel', members = [] } = req.body;
    const createdBy = req.user?.id || 'anonymous'; // TODO: Get from auth middleware
    const workspaceId = '00000000-0000-0000-0000-000000000001';
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Channel name is required'
      });
    }
    
    const pg = await getPg();
    const result = await pg.query(`
      INSERT INTO tenant_vutler.chat_channels 
      (name, description, type, members, created_by, workspace_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, description, type, members, created_by, created_at, updated_at
    `, [name, description, type, members, createdBy, workspaceId]);
    
    const channel = result.rows[0];
    
    res.json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        members: channel.members || [],
        created_by: channel.created_by,
        created_at: channel.created_at,
        updated_at: channel.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating channel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create channel',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/chat/channels/:id/messages
 * Get messages for a channel
 */
router.get('/channels/:id/messages', async (req, res) => {
  try {
    const { id: channelId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const pg = await getPg();
    
    // First verify channel exists
    const channelResult = await pg.query(
      'SELECT id, name, type FROM tenant_vutler.chat_channels WHERE id = $1',
      [channelId]
    );
    
    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }
    
    // Get messages
    const messagesResult = await pg.query(`
      SELECT id, sender_id, sender_name, content, created_at
      FROM tenant_vutler.chat_messages 
      WHERE channel_id = $1 
      ORDER BY created_at DESC 
      LIMIT $2 OFFSET $3
    `, [channelId, limit, offset]);
    
    const channel = channelResult.rows[0];
    
    res.json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type
      },
      messages: messagesResult.rows.map(msg => ({
        id: msg.id,
        sender_id: msg.sender_id,
        sender_name: msg.sender_name,
        content: msg.content,
        created_at: msg.created_at
      })).reverse(), // Show oldest first
      count: messagesResult.rows.length,
      limit,
      offset
    });
    
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/chat/channels/:id/messages
 * Send a message to a channel
 */
router.post('/channels/:id/messages', async (req, res) => {
  try {
    const { id: channelId } = req.params;
    const { content, sender_id, sender_name } = req.body;
    const workspaceId = '00000000-0000-0000-0000-000000000001';
    
    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Message content is required'
      });
    }
    
    const pg = await getPg();
    
    // Verify channel exists
    const channelResult = await pg.query(
      'SELECT id FROM tenant_vutler.chat_channels WHERE id = $1',
      [channelId]
    );
    
    if (channelResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found'
      });
    }
    
    // Insert message
    const messageResult = await pg.query(`
      INSERT INTO tenant_vutler.chat_messages 
      (channel_id, sender_id, sender_name, content, workspace_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, sender_id, sender_name, content, created_at
    `, [channelId, sender_id, sender_name, content, workspaceId]);
    
    const message = messageResult.rows[0];
    
    res.json({
      success: true,
      message: {
        id: message.id,
        channel_id: channelId,
        sender_id: message.sender_id,
        sender_name: message.sender_name,
        content: message.content,
        created_at: message.created_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/chat/channels/direct
 * Create or get a direct message channel between users
 */
router.post('/channels/direct', async (req, res) => {
  try {
    const { user1, user2, user1_name, user2_name } = req.body;
    const workspaceId = '00000000-0000-0000-0000-000000000001';
    
    if (!user1 || !user2) {
      return res.status(400).json({
        success: false,
        error: 'user1 and user2 are required'
      });
    }
    
    const pg = await getPg();
    
    // Check if DM channel already exists between these users
    const existingChannel = await pg.query(`
      SELECT id, name, description, members, created_at, updated_at
      FROM tenant_vutler.chat_channels 
      WHERE type = 'direct' 
      AND workspace_id = $1
      AND (
        (members @> ARRAY[$2] AND members @> ARRAY[$3]) OR
        (members @> ARRAY[$3] AND members @> ARRAY[$2])
      )
      LIMIT 1
    `, [workspaceId, user1, user2]);
    
    if (existingChannel.rows.length > 0) {
      const channel = existingChannel.rows[0];
      return res.json({
        success: true,
        channel: {
          id: channel.id,
          name: channel.name,
          description: channel.description,
          type: 'direct',
          members: channel.members,
          created_at: channel.created_at,
          updated_at: channel.updated_at
        }
      });
    }
    
    // Create new DM channel
    const dmName = `DM: ${user1_name || user1} & ${user2_name || user2}`;
    const result = await pg.query(`
      INSERT INTO tenant_vutler.chat_channels 
      (name, description, type, members, created_by, workspace_id)
      VALUES ($1, $2, 'direct', $3, $4, $5)
      RETURNING id, name, description, type, members, created_by, created_at, updated_at
    `, [dmName, 'Direct message channel', [user1, user2], user1, workspaceId]);
    
    const channel = result.rows[0];
    
    res.json({
      success: true,
      channel: {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        type: channel.type,
        members: channel.members,
        created_by: channel.created_by,
        created_at: channel.created_at,
        updated_at: channel.updated_at
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating/finding DM channel:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create direct message channel',
      message: error.message
    });
  }
});

module.exports = router;