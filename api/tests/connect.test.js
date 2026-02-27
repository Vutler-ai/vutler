/**
 * Connect API Tests — Sprint 7.4
 */

const request = require('supertest');
const express = require('express');

// Mock pg Pool
const mockQuery = jest.fn();
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({ query: mockQuery })),
}));

const connectRouter = require('../routes/connect');

const app = express();
app.use(express.json());
app.use('/api/connect', connectRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

// ─── Partner Registration ───────────────────────────────────────

describe('POST /api/connect/partners', () => {
  test('should create a partner', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // duplicate check
      .mockResolvedValueOnce({
        rows: [{ id: 'uuid-1', name: 'Test', phone: '+41791234567', channel: 'whatsapp' }],
      });

    const res = await request(app)
      .post('/api/connect/partners')
      .send({ name: 'Test', phone: '+41791234567' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.partner.phone).toBe('+41791234567');
  });

  test('should reject missing fields', async () => {
    const res = await request(app)
      .post('/api/connect/partners')
      .send({ name: 'Test' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });

  test('should reject duplicate phone', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-id' }] });

    const res = await request(app)
      .post('/api/connect/partners')
      .send({ name: 'Test', phone: '+41791234567' })
      .expect(409);

    expect(res.body.success).toBe(false);
  });
});

// ─── List Partners ──────────────────────────────────────────────

describe('GET /api/connect/partners', () => {
  test('should list partners', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', name: 'Test', phone: '+41791234567' }],
    });

    const res = await request(app).get('/api/connect/partners').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.partners).toHaveLength(1);
  });
});

// ─── Update Partner ─────────────────────────────────────────────

describe('PUT /api/connect/partners/:id', () => {
  test('should update partner', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'uuid-1', name: 'Updated', phone: '+41791234567' }],
    });

    const res = await request(app)
      .put('/api/connect/partners/uuid-1')
      .send({ name: 'Updated' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.partner.name).toBe('Updated');
  });

  test('should reject empty update', async () => {
    const res = await request(app)
      .put('/api/connect/partners/uuid-1')
      .send({})
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});

// ─── Messages ───────────────────────────────────────────────────

describe('GET /api/connect/messages/:partner_id', () => {
  test('should return message history', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 'msg-1', content: 'Hello', direction: 'in' }],
    });

    const res = await request(app)
      .get('/api/connect/messages/uuid-1')
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.messages).toHaveLength(1);
  });
});

// ─── WhatsApp Webhook ───────────────────────────────────────────

describe('GET /api/connect/webhook/whatsapp', () => {
  test('should verify webhook challenge', async () => {
    const res = await request(app)
      .get('/api/connect/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'vutler-connect-verify',
        'hub.challenge': 'test-challenge-123',
      })
      .expect(200);

    expect(res.text).toBe('test-challenge-123');
  });

  test('should reject invalid verify token', async () => {
    await request(app)
      .get('/api/connect/webhook/whatsapp')
      .query({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong-token',
        'hub.challenge': 'test',
      })
      .expect(403);
  });
});

describe('POST /api/connect/webhook/whatsapp', () => {
  test('should accept Meta Cloud API message', async () => {
    // findOrCreatePartner SELECT + INSERT
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'partner-1', phone: '+41791234567' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'msg-1' }] }); // storeMessage

    const res = await request(app)
      .post('/api/connect/webhook/whatsapp')
      .send({
        entry: [{
          changes: [{
            value: {
              metadata: { phone_number_id: '123456' },
              contacts: [{ profile: { name: 'John' } }],
              messages: [{
                id: 'wamid.xxx',
                from: '+41791234567',
                timestamp: '1234567890',
                type: 'text',
                text: { body: 'Hello Vutler!' },
              }],
            },
          }],
        }],
      })
      .expect(200);

    expect(res.body.status).toBe('ok');
  });

  test('should handle empty entry gracefully', async () => {
    const res = await request(app)
      .post('/api/connect/webhook/whatsapp')
      .send({ object: 'whatsapp_business_account' })
      .expect(200);

    expect(res.body.status).toBe('ok');
  });
});

// ─── Outbound Send (Stub) ──────────────────────────────────────

describe('POST /api/connect/send', () => {
  test('should store outbound message (stub)', async () => {
    // findOrCreatePartner SELECT
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'partner-1', phone: '+41791234567' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'msg-1', content: 'Hello!', direction: 'out', channel: 'whatsapp' }],
      });

    const res = await request(app)
      .post('/api/connect/send')
      .send({ agent_id: 'agent-1', to_phone: '+41791234567', message: 'Hello!' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.note).toContain('stub');
  });

  test('should reject missing fields', async () => {
    const res = await request(app)
      .post('/api/connect/send')
      .send({ agent_id: 'agent-1' })
      .expect(400);

    expect(res.body.success).toBe(false);
  });
});
