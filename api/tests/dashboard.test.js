/**
 * Dashboard API Tests
 * TDD: Write tests first, watch them fail, then implement
 */

const request = require('supertest');
const { MongoClient } = require('mongodb');
const { Client } = require('pg');

// We'll import the app after implementation
// const app = require('../index');

describe('Dashboard API', () => {
  let mongoClient;
  let pgClient;
  
  beforeAll(async () => {
    // Setup test database connections
    // In real tests, we'd use test databases
    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    
    pgClient = new Client({
      host: process.env.PG_HOST || 'localhost',
      user: process.env.PG_USER || 'vaultbrix',
      password: process.env.PG_PASSWORD || 'vaultbrix',
      database: process.env.PG_DATABASE || 'vaultbrix',
    });
    await pgClient.connect();
  });
  
  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
    if (pgClient) await pgClient.end();
  });
  
  describe('GET /api/v1/dashboard', () => {
    test('should return correct structure with stats object', async () => {
      // This test WILL FAIL until we implement the route
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toMatchObject({
        totalAgents: expect.any(Number),
        activeAgents: expect.any(Number),
        messagesToday: expect.any(Number),
        totalTokens: expect.any(Number),
      });
      expect(response.body).toHaveProperty('uptimeSeconds');
      expect(response.body).toHaveProperty('agents');
      expect(Array.isArray(response.body.agents)).toBe(true);
    });
    
    test('stats.totalAgents should count all bots', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);
      
      // Verify against database
      const db = mongoClient.db('rocketchat');
      const botCount = await db.collection('users').countDocuments({ type: 'bot' });
      
      expect(response.body.stats.totalAgents).toBe(botCount);
    });
    
    test('stats.activeAgents should count online bots', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);
      
      const db = mongoClient.db('rocketchat');
      const activeBotCount = await db.collection('users').countDocuments({
        type: 'bot',
        status: 'online'
      });
      
      expect(response.body.stats.activeAgents).toBe(activeBotCount);
    });
    
    test('stats.messagesToday should count messages since midnight UTC', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);
      
      const db = mongoClient.db('rocketchat');
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      
      const messageCount = await db.collection('rocketchat_message').countDocuments({
        ts: { $gte: todayStart }
      });
      
      expect(response.body.stats.messagesToday).toBe(messageCount);
    });
    
    test('stats.totalTokens should sum token usage from PostgreSQL', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);
      
      const result = await pgClient.query(
        'SELECT COALESCE(SUM(tokens), 0) as total FROM token_usage'
      );
      const expectedTokens = parseInt(result.rows[0].total);
      
      expect(response.body.stats.totalTokens).toBe(expectedTokens);
    });
    
    test('agents array should contain bot details', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);
      
      expect(Array.isArray(response.body.agents)).toBe(true);
      
      if (response.body.agents.length > 0) {
        const agent = response.body.agents[0];
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('username');
        expect(agent).toHaveProperty('status');
        expect(agent).toHaveProperty('type', 'bot');
      }
    });
    
    test('uptimeSeconds should be a positive number', async () => {
      const response = await request(app)
        .get('/api/v1/dashboard')
        .expect(200);
      
      expect(typeof response.body.uptimeSeconds).toBe('number');
      expect(response.body.uptimeSeconds).toBeGreaterThan(0);
    });
  });
});
