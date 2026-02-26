/**
 * Agents API Tests
 */

const request = require('supertest');
const { MongoClient } = require('mongodb');

// const app = require('../index');

describe('Agents API', () => {
  let mongoClient;
  let db;
  let testAgentId;
  
  beforeAll(async () => {
    const mongoUrl = process.env.MONGO_URL || 'mongodb://localhost:27017';
    mongoClient = new MongoClient(mongoUrl);
    await mongoClient.connect();
    db = mongoClient.db('rocketchat');
  });
  
  afterAll(async () => {
    // Cleanup test agent
    if (testAgentId) {
      await db.collection('users').deleteOne({ _id: testAgentId });
    }
    if (mongoClient) await mongoClient.close();
  });
  
  describe('GET /api/v1/agents', () => {
    test('should return list of agents', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .expect('Content-Type', /json/)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('agents');
      expect(Array.isArray(response.body.agents)).toBe(true);
      expect(response.body).toHaveProperty('count');
    });
    
    test('agents should have correct structure', async () => {
      const response = await request(app)
        .get('/api/v1/agents')
        .expect(200);
      
      if (response.body.agents.length > 0) {
        const agent = response.body.agents[0];
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('username');
        expect(agent).toHaveProperty('type', 'bot');
        expect(agent).toHaveProperty('status');
      }
    });
    
    test('should support status filter', async () => {
      const response = await request(app)
        .get('/api/v1/agents?status=online')
        .expect(200);
      
      response.body.agents.forEach(agent => {
        expect(agent.status).toBe('online');
      });
    });
  });
  
  describe('POST /api/v1/agents', () => {
    test('should create a new agent', async () => {
      const newAgent = {
        name: 'Test Agent',
        email: `test-${Date.now()}@example.com`,
        description: 'Test agent for unit tests'
      };
      
      const response = await request(app)
        .post('/api/v1/agents')
        .send(newAgent)
        .expect('Content-Type', /json/)
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('agent');
      expect(response.body.agent).toHaveProperty('id');
      expect(response.body.agent).toHaveProperty('name', newAgent.name);
      expect(response.body.agent).toHaveProperty('email', newAgent.email);
      expect(response.body.agent).toHaveProperty('apiKey'); // Returned only on creation
      
      // Save for cleanup
      testAgentId = response.body.agent.id;
    });
    
    test('should require name field', async () => {
      const response = await request(app)
        .post('/api/v1/agents')
        .send({ email: 'test@example.com' })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/name/i);
    });
    
    test('should require valid email', async () => {
      const response = await request(app)
        .post('/api/v1/agents')
        .send({ name: 'Test', email: 'invalid-email' })
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/email/i);
    });
    
    test('should reject duplicate email', async () => {
      const agent = {
        name: 'Duplicate Test',
        email: `duplicate-${Date.now()}@example.com`
      };
      
      // Create first agent
      await request(app)
        .post('/api/v1/agents')
        .send(agent)
        .expect(201);
      
      // Try to create duplicate
      const response = await request(app)
        .post('/api/v1/agents')
        .send(agent)
        .expect(409);
      
      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toMatch(/exists/i);
    });
  });
  
  describe('GET /api/v1/agents/:id', () => {
    test('should return agent by id', async () => {
      // First create an agent
      const newAgent = {
        name: 'Get Test Agent',
        email: `get-test-${Date.now()}@example.com`
      };
      
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .send(newAgent)
        .expect(201);
      
      const agentId = createResponse.body.agent.id;
      
      const response = await request(app)
        .get(`/api/v1/agents/${agentId}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('agent');
      expect(response.body.agent.id).toBe(agentId);
      expect(response.body.agent.name).toBe(newAgent.name);
    });
    
    test('should return 404 for non-existent agent', async () => {
      const response = await request(app)
        .get('/api/v1/agents/nonexistent')
        .expect(404);
      
      expect(response.body).toHaveProperty('success', false);
    });
  });
  
  describe('PUT /api/v1/agents/:id', () => {
    test('should update agent', async () => {
      // Create agent first
      const newAgent = {
        name: 'Update Test Agent',
        email: `update-test-${Date.now()}@example.com`
      };
      
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .send(newAgent)
        .expect(201);
      
      const agentId = createResponse.body.agent.id;
      
      // Update the agent
      const updates = {
        name: 'Updated Agent Name',
        status: 'online',
        description: 'Updated description'
      };
      
      const response = await request(app)
        .put(`/api/v1/agents/${agentId}`)
        .send(updates)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.agent.name).toBe(updates.name);
      expect(response.body.agent.status).toBe(updates.status);
      expect(response.body.agent.description).toBe(updates.description);
    });
    
    test('should return 404 for non-existent agent', async () => {
      const response = await request(app)
        .put('/api/v1/agents/nonexistent')
        .send({ name: 'Test' })
        .expect(404);
      
      expect(response.body).toHaveProperty('success', false);
    });
    
    test('should require at least one field', async () => {
      const response = await request(app)
        .put('/api/v1/agents/test-id')
        .send({})
        .expect(400);
      
      expect(response.body).toHaveProperty('success', false);
    });
  });
  
  describe('DELETE /api/v1/agents/:id', () => {
    test('should soft delete agent by default', async () => {
      // Create agent
      const newAgent = {
        name: 'Delete Test Agent',
        email: `delete-test-${Date.now()}@example.com`
      };
      
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .send(newAgent)
        .expect(201);
      
      const agentId = createResponse.body.agent.id;
      
      // Soft delete
      const response = await request(app)
        .delete(`/api/v1/agents/${agentId}`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toMatch(/soft delete|deactivated/i);
      
      // Verify agent is marked inactive in DB
      const agent = await db.collection('users').findOne({ _id: agentId });
      expect(agent.active).toBe(false);
      expect(agent.status).toBe('offline');
    });
    
    test('should hard delete with ?hard=true', async () => {
      // Create agent
      const newAgent = {
        name: 'Hard Delete Test Agent',
        email: `hard-delete-${Date.now()}@example.com`
      };
      
      const createResponse = await request(app)
        .post('/api/v1/agents')
        .send(newAgent)
        .expect(201);
      
      const agentId = createResponse.body.agent.id;
      
      // Hard delete
      const response = await request(app)
        .delete(`/api/v1/agents/${agentId}?hard=true`)
        .expect(200);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body.message).toMatch(/permanently deleted/i);
      
      // Verify agent is gone from DB
      const agent = await db.collection('users').findOne({ _id: agentId });
      expect(agent).toBeNull();
    });
    
    test('should return 404 for non-existent agent', async () => {
      const response = await request(app)
        .delete('/api/v1/agents/nonexistent')
        .expect(404);
      
      expect(response.body).toHaveProperty('success', false);
    });
  });
});
