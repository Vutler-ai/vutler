/**
 * Vutler Chat API
 * Allows agents to post messages to chat channels
 * MongoDB refs removed - using PostgreSQL or stubs
 */

const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const { validateSendChatMessage, validatePagination } = require('../lib/validation');
const { requireCorePermission } = require('../lib/core-permissions');

const router = express.Router();

const JARVIS_USER_CANDIDATES = (process.env.VUTLER_JARVIS_IDENTIFIERS || 'jarvis,jarvis@vutler.com,jarvis@vutler.ai')
  .split(',')
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);

function buildDirectRoomName(a, b) {
  return [String(a), String(b)].sort().join('__');
}

async function ensureJarvisDirectRoom(pg, senderUser) {
  // Stub implementation - no MongoDB
  // In a real implementation, this would query PostgreSQL
  const roomId = 'dm_' + buildDirectRoomName(senderUser.id || 'user', 'jarvis');
  return {
    _id: roomId,
    t: 'd',
    name: buildDirectRoomName(senderUser.id || 'user', 'jarvis'),
    fname: `DM ${senderUser.username || 'user'} ↔ Jarvis`
  };
}

/**
 * POST /api/v1/chat/jarvis/bootstrap
 * Ensure Jarvis DM room exists for current user
 */
router.post('/chat/jarvis/bootstrap', authenticateAgent, requireCorePermission('chat.jarvisDm.bootstrap'), async (req, res) => {
  try {
    const pg = req.app.locals.pg;
    const sender = { id: req.agent.id, username: req.agent.name?.toLowerCase().replace(/\s+/g, '_') || 'user' };

    const room = await ensureJarvisDirectRoom(pg, sender);

    return res.json({
      success: true,
      room: {
        id: room._id,
        name: room.name,
        type: room.t
      }
    });
  } catch (error) {
    const status = error.code === 'JARVIS_USER_NOT_FOUND' ? 404 : 500;
    return res.status(status).json({
      success: false,
      error: status === 404 ? 'Jarvis user not found' : 'Failed to bootstrap Jarvis DM',
      details: error.message
    });
  }
});

/**
 * POST /api/v1/chat/send
 * Send a chat message as an agent
 */
router.post('/chat/send', authenticateAgent, requireCorePermission('chat.jarvisDm.send'), validateSendChatMessage, async (req, res) => {
  try {
    const { channel_id, text, agent_id, attachments, emoji } = req.body;
    const agent = req.agent;
    
    // Verify agent_id matches authenticated agent (or is not specified)
    const sendingAgentId = agent_id || agent.id;
    if (sendingAgentId !== agent.id && !agent.roles?.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        details: 'You can only send messages as yourself'
      });
    }
    
    // Find the sending agent
    const sendingAgent = {
      _id: agent.id,
      name: agent.name,
      username: agent.name?.toLowerCase().replace(/\s+/g, '_') || 'agent'
    };
    
    // Find the channel/room (supports Jarvis DM bootstrap shortcut)
    let room;
    if (String(channel_id).toLowerCase() === 'jarvis' || String(channel_id).toLowerCase() === 'jarvis_dm') {
      room = await ensureJarvisDirectRoom(req.app.locals.pg, sendingAgent);
    } else {
      room = { _id: channel_id, name: channel_id };
    }

    // Create message document
    const message = {
      _id: generateMessageId(),
      rid: room._id,
      msg: text,
      ts: new Date(),
      u: {
        _id: sendingAgent._id,
        username: sendingAgent.username,
        name: sendingAgent.name
      },
      _updatedAt: new Date(),
      mentions: [],
      channels: [],
      unread: false
    };
    
    // Add attachments if provided
    if (attachments && Array.isArray(attachments)) {
      message.attachments = attachments;
    }
    
    // Add emoji if provided
    if (emoji) {
      message.emoji = emoji;
    }
    
    // Note: Message is not persisted - MongoDB removed
    // In production, this should be stored in PostgreSQL
    
    res.status(201).json({
      success: true,
      message: {
        id: message._id,
        channel_id: room._id,
        channel_name: room.name,
        text: message.msg,
        agent: {
          id: sendingAgent._id,
          name: sendingAgent.name,
          username: sendingAgent.username
        },
        timestamp: message.ts
      }
    });
    
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send message',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/chat/channels
 * List available channels
 */
router.get('/chat/channels', authenticateAgent, validatePagination, async (req, res) => {
  try {
    // Return empty list - no MongoDB
    // In production, this should query PostgreSQL
    
    res.json({
      success: true,
      channels: [],
      count: 0,
      note: 'MongoDB removed - channels not available'
    });
    
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch channels',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/chat/messages
 * Get recent messages from a channel
 */
router.get('/chat/messages', authenticateAgent, validatePagination, async (req, res) => {
  try {
    const { channel_id } = req.query;
    const limit = parseInt(req.query.limit || '50');
    const skip = parseInt(req.query.skip || '0');
    
    if (!channel_id) {
      return res.status(400).json({
        success: false,
        error: 'channel_id is required'
      });
    }
    
    // Return empty messages - no MongoDB
    // In production, this should query PostgreSQL
    
    res.json({
      success: true,
      channel: {
        id: channel_id,
        name: channel_id
      },
      messages: [],
      count: 0,
      skip,
      limit,
      note: 'MongoDB removed - messages not available'
    });
    
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch messages',
      message: error.message
    });
  }
});

/**
 * Generate a unique message ID
 */
function generateMessageId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  return timestamp + random;
}

module.exports = router;
