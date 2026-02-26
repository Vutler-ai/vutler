/**
 * Chat API Tests
 */

const request = require('supertest');
const { MongoClient } = require('mongodb');

// const app = require('../index');

describe('Chat API', () => {
  let mongoClient;
  let db;
  
  beforeAll(async () => {
    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    db = mongoClient.db('rocketchat');
  });
  
  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });
  
  describe('GET /api/v1/chat/channels', () => {
    test('should return list of channels', async () => {
      const response = await request(app)
        .get('/api/v1/chat/channels')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('channels');
      expect(Array.isArray(response.body.channels)).toBe(true);
      expect(response.body).toHaveProperty('count');
    });
    
    test('channels should have correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/chat/channels')
        .expect(200);
      
      if (response.body.channels.length > 0) {
        const channel = response.body.channels[0];
        expect(channel).toHaveProperty('id');
        expect(channel).toHaveProperty('name');
        expect(channel).toHaveProperty('type');
        expect(channel).toHaveProperty('members');
      }
    });
    
    test('should support limit parameter', async () => {
      const response = await request(app)
        .get('/api/v1/chat/channels?limit=5')
        .expect(200);
      
      expect(response.body.channels.length).toBeLessThanOrEqual(5);
    });
  });
  
  describe('GET /api/v1/chat/messages', () => {
    test('should require channel_id parameter', async () => {
      const response = await request(app)
        .get('/api/v1/chat/messages')
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/channel_id/i);
    });
    
    test('should return 404 for non-existent channel', async () => {
      const response = await request(app)
        .get('/api/v1/chat/messages?channel_id=nonexistent')
        .expect(404);
      
      expect(response.body).toHaveProperty('success', false);
    });
    
    test('should return messages when channel exists', async () => {
      // Find a real channel first
      const channels = await db.collection('rocketchat_room')
        .findOne({ t: 'c' });
      
      if (!channels) {
        console.log('⚠️  No channels found, skipping test');
        return;
      }
      
      const response = await request(app)
        .get(`/api/v1/chat/messages?channel_id=${channels._id}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('messages');
      expect(Array.isArray(response.body.messages)).toBe(true);
      expect(response.body).toHaveProperty('channel');
    });
    
    test('messages should have correct structure', async () => {
      const channels = await db.collection('rocketchat_room')
        .findOne({ t: 'c' });
      
      if (!channels) return;
      
      const response = await request(app)
        .get(`/api/v1/chat/messages?channel_id=${channels._id}`)
        .expect(200);
      
      if (response.body.messages.length > 0) {
        const message = response.body.messages[0];
        expect(message).toHaveProperty('id');
        expect(message).toHaveProperty('text');
        expect(message).toHaveProperty('timestamp');
      }
    });
  });
});
