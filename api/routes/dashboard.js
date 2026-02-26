/**
 * Vutler Dashboard API
 * Provides dashboard statistics and agent overview
 * 
 * Returns proper format expected by frontend:
 * {
 *   success: true,
 *   stats: { totalAgents, activeAgents, messagesToday, totalTokens },
 *   uptimeSeconds: number,
 *   agents: [{ name, username, status, type }]
 * }
 */

const express = require('express');
const { MongoClient } = require('mongodb');
const { Client } = require('pg');

const router = express.Router();

// Database connections (initialized on first request)
let mongoClient = null;
let pgClient = null;

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
    console.log('✅ MongoDB connected for dashboard');
  }
  return mongoClient.db('rocketchat');
}

/**
 * Initialize PostgreSQL connection
 */
async function getPgClient() {
  if (!pgClient || pgClient._ending) {
    pgClient = new Client({
      host: process.env.PG_HOST || 'vutler-postgres',
      user: process.env.PG_USER || 'vaultbrix',
      password: process.env.PG_PASSWORD || 'vaultbrix',
      database: process.env.PG_DATABASE || 'vaultbrix',
      port: parseInt(process.env.PG_PORT || '5432'),
    });
    await pgClient.connect();
    console.log('✅ PostgreSQL connected for dashboard');
  }
  return pgClient;
}

/**
 * GET /api/v1/dashboard
 * Returns dashboard statistics and agent list
 */
router.get('/', async (req, res) => {
  try {
    // Parallel queries for performance
    const [
      totalAgents,
      activeAgents,
      messagesToday,
      totalTokens,
      agents
    ] = await Promise.all([
      getTotalAgents(),
      getActiveAgents(),
      getMessagesToday(),
      getTotalTokens(),
      getAgentsList()
    ]);
    
    res.json({
      success: true,
      stats: {
        totalAgents,
        activeAgents,
        messagesToday,
        totalTokens,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      agents,
    });
    
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
      message: error.message,
    });
  }
});

/**
 * Count total number of bots
 */
async function getTotalAgents() {
  try {
    const db = await getMongoDb();
    return await db.collection('users').countDocuments({
      type: 'bot'
    });
  } catch (error) {
    console.error('Error counting total agents:', error);
    return 0;
  }
}

/**
 * Count online bots
 */
async function getActiveAgents() {
  try {
    const db = await getMongoDb();
    return await db.collection('users').countDocuments({
      type: 'bot',
      status: 'online'
    });
  } catch (error) {
    console.error('Error counting active agents:', error);
    return 0;
  }
}

/**
 * Count messages since midnight UTC
 */
async function getMessagesToday() {
  try {
    const db = await getMongoDb();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    
    return await db.collection('rocketchat_message').countDocuments({
      ts: { $gte: todayStart }
    });
  } catch (error) {
    console.error('Error counting messages today:', error);
    return 0;
  }
}

/**
 * Sum total tokens from PostgreSQL
 */
async function getTotalTokens() {
  try {
    const pg = await getPgClient();
    const result = await pg.query(
      'SELECT COALESCE(SUM(tokens), 0)::bigint as total FROM token_usage'
    );
    return parseInt(result.rows[0].total) || 0;
  } catch (error) {
    console.error('Error summing total tokens:', error);
    // If table doesn't exist, return 0 gracefully
    if (error.code === '42P01') {
      console.warn('⚠️  token_usage table does not exist');
    }
    return 0;
  }
}

/**
 * Get list of all agents with details
 */
async function getAgentsList() {
  try {
    const db = await getMongoDb();
    const bots = await db.collection('users')
      .find(
        { type: 'bot' },
        {
          projection: {
            name: 1,
            username: 1,
            status: 1,
            type: 1,
            createdAt: 1,
            _updatedAt: 1,
          }
        }
      )
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    
    return bots.map(bot => ({
      id: bot._id,
      name: bot.name || bot.username,
      username: bot.username,
      status: bot.status || 'offline',
      type: bot.type,
      createdAt: bot.createdAt,
      updatedAt: bot._updatedAt,
    }));
  } catch (error) {
    console.error('Error fetching agents list:', error);
    return [];
  }
}

/**
 * Graceful shutdown handler
 */
async function closeConnections() {
  console.log('🛑 Closing dashboard database connections...');
  
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
  }
  
  if (pgClient && !pgClient._ending) {
    await pgClient.end();
    pgClient = null;
  }
  
  console.log('✅ Dashboard connections closed');
}

// Cleanup on process termination
process.on('SIGTERM', closeConnections);
process.on('SIGINT', closeConnections);

module.exports = router;
