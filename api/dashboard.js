/**
 * Vutler Dashboard API (Sprint 8.1: workspace_id)
 */
const express = require('express');
const { MongoClient } = require('mongodb');
const vaultbrixPool = require('../lib/vaultbrix');

const router = express.Router();

let mongoDb = null;
async function getMongoDb() {
  if (mongoDb) return mongoDb;
  const mongoUrl = process.env.MONGO_URL || 'mongodb://mongo:27017/vutler?replicaSet=rs0';
  const client = new MongoClient(mongoUrl);
  await client.connect();
  mongoDb = client.db();
  return mongoDb;
}

router.get('/', async (req, res) => {
  try {
    const workspaceId = req.workspaceId;
    const [totalAgents, activeAgents, messagesToday, totalTokens, agents] = await Promise.all([
      getTotalAgents(),
      getActiveAgents(),
      getMessagesToday(),
      getTotalTokens(workspaceId),
      getAgentsList()
    ]);
    
    res.json({
      success: true,
      stats: { totalAgents, activeAgents, messagesToday, totalTokens },
      uptimeSeconds: Math.floor(process.uptime()),
      agents,
    });
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard data', message: error.message });
  }
});

async function getTotalAgents() {
  try {
    const db = await getMongoDb();
    return await db.collection('users').countDocuments({ type: 'bot' });
  } catch { return 0; }
}

async function getActiveAgents() {
  try {
    const db = await getMongoDb();
    return await db.collection('users').countDocuments({ type: 'bot', status: 'online' });
  } catch { return 0; }
}

async function getMessagesToday() {
  try {
    const db = await getMongoDb();
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    return await db.collection('rocketchat_message').countDocuments({ ts: { $gte: todayStart } });
  } catch { return 0; }
}

async function getTotalTokens(workspaceId) {
  try {
    const result = await vaultbrixPool.query(
      'SELECT COALESCE(SUM(input_tokens + output_tokens), 0)::bigint as total FROM token_usage WHERE workspace_id = $1',
      [workspaceId]
    );
    return parseInt(result.rows[0].total) || 0;
  } catch { return 0; }
}

async function getAgentsList() {
  try {
    const db = await getMongoDb();
    const bots = await db.collection('users')
      .find({ type: 'bot' }, { projection: { name: 1, username: 1, status: 1, type: 1, createdAt: 1, _updatedAt: 1 } })
      .sort({ createdAt: -1 }).limit(100).toArray();
    return bots.map(bot => ({
      id: bot._id, name: bot.name || bot.username, username: bot.username,
      status: bot.status || 'offline', type: bot.type, createdAt: bot.createdAt, updatedAt: bot._updatedAt,
    }));
  } catch { return []; }
}

module.exports = router;
