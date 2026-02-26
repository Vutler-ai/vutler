/**
 * Vutler Chat API
 * Access to RocketChat channels and messages
 * Migrated from app/custom/api/chat.js to standalone Express API
 */

const express = require('express');
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
    console.log('✅ MongoDB connected for chat');
  }
  return mongoClient.db('rocketchat');
}

/**
 * GET /api/v1/chat/channels
 * List available channels
 */
router.get('/channels', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '50');
    const type = req.query.type || 'c'; // c = channel, p = private group, d = direct message
    
    const db = await getMongoDb();
    const rooms = await db.collection('rocketchat_room')
      .find({ 
        t: type,
        archived: { $ne: true }
      })
      .limit(limit)
      .sort({ _updatedAt: -1 })
      .toArray();
    
    res.json({
      success: true,
      channels: rooms.map(room => ({
        id: room._id,
        name: room.name || room._id,
        type: room.t,
        members: room.usersCount || 0,
        description: room.description || null,
        topic: room.topic || null,
        createdAt: room.ts,
        updatedAt: room._updatedAt,
      })),
      count: rooms.length
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
 * GET /api/v1/chat/messages
 * Get messages from a channel
 */
router.get('/messages', async (req, res) => {
  try {
    const { channel_id, channel } = req.query;
    const channelId = channel_id || channel;
    const limit = parseInt(req.query.limit || '50');
    const skip = parseInt(req.query.skip || '0');
    
    if (!channelId) {
      return res.status(400).json({
        success: false,
        error: 'channel_id or channel parameter is required'
      });
    }
    
    const db = await getMongoDb();
    
    // Find the channel/room
    const room = await db.collection('rocketchat_room').findOne({
      $or: [
        { _id: channelId },
        { name: channelId }
      ]
    });
    
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Channel not found',
        channel_id: channelId,
      });
    }
    
    // Fetch messages
    const messages = await db.collection('rocketchat_message')
      .find({ rid: room._id })
      .sort({ ts: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    
    res.json({
      success: true,
      channel: {
        id: room._id,
        name: room.name || room._id
      },
      messages: messages.map(msg => ({
        id: msg._id,
        text: msg.msg || '',
        user: msg.u ? {
          id: msg.u._id,
          username: msg.u.username,
          name: msg.u.name
        } : null,
        timestamp: msg.ts,
        attachments: msg.attachments || [],
        reactions: msg.reactions || {},
      })),
      count: messages.length,
      skip,
      limit
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
 * POST /api/v1/chat/send
 * Send a message to a channel (future implementation)
 */
router.post('/send', async (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not implemented yet',
    message: 'POST /chat/send will be implemented in next sprint'
  });
});

/**
 * Graceful shutdown
 */
async function closeConnection() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    console.log('✅ Chat MongoDB connection closed');
  }
}

process.on('SIGTERM', closeConnection);
process.on('SIGINT', closeConnection);

module.exports = router;
