/**
 * Vutler Connect — WhatsApp Bridge
 * Sprint 7.4
 * 
 * Partner registration, inbound webhook (Meta Cloud API),
 * outbound send (stub), channel mapping, message sync.
 */

const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');

const router = express.Router();

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.PG_HOST || 'vutler-postgres',
  port: parseInt(process.env.PG_PORT || '5432'),
  user: process.env.PG_USER || 'vaultbrix',
  password: process.env.PG_PASSWORD || 'vaultbrix',
  database: process.env.PG_DATABASE || 'vaultbrix',
});

// ─── Schema Init ────────────────────────────────────────────────

async function initConnectTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS connect_partners (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
        webhook_url TEXT,
        config JSONB DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS connect_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        partner_id UUID REFERENCES connect_partners(id) ON DELETE CASCADE,
        agent_id VARCHAR(255),
        direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
        channel VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_connect_partners_phone ON connect_partners(phone);
      CREATE INDEX IF NOT EXISTS idx_connect_partners_active ON connect_partners(is_active);
      CREATE INDEX IF NOT EXISTS idx_connect_messages_partner ON connect_messages(partner_id);
      CREATE INDEX IF NOT EXISTS idx_connect_messages_created ON connect_messages(created_at);
    `);
    console.log('✅ Connect tables initialized');
  } catch (err) {
    console.error('❌ Failed to init connect tables:', err.message);
  }
}

initConnectTables();

// ─── Helpers ────────────────────────────────────────────────────

async function findOrCreatePartner(phone, name) {
  let { rows } = await pool.query(
    'SELECT * FROM connect_partners WHERE phone = $1 LIMIT 1',
    [phone]
  );
  if (rows.length) return rows[0];

  const result = await pool.query(
    `INSERT INTO connect_partners (name, phone, channel)
     VALUES ($1, $2, 'whatsapp')
     RETURNING *`,
    [name || phone, phone]
  );
  return result.rows[0];
}

async function storeMessage({ partner_id, agent_id, direction, channel, content, metadata }) {
  const { rows } = await pool.query(
    `INSERT INTO connect_messages (partner_id, agent_id, direction, channel, content, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [partner_id, agent_id || null, direction, channel || 'whatsapp', content, JSON.stringify(metadata || {})]
  );
  return rows[0];
}

// ─── Partner Registration ───────────────────────────────────────

/**
 * POST /api/connect/partners
 * Register a new WhatsApp partner
 */
router.post('/partners', async (req, res) => {
  try {
    const { name, phone, webhook_url, config, channel } = req.body;
    if (!phone || !name) {
      return res.status(400).json({ success: false, error: 'name and phone are required' });
    }

    // Check duplicate
    const existing = await pool.query('SELECT id FROM connect_partners WHERE phone = $1', [phone]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, error: 'Partner with this phone already exists', id: existing.rows[0].id });
    }

    const { rows } = await pool.query(
      `INSERT INTO connect_partners (name, phone, channel, webhook_url, config)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, phone, channel || 'whatsapp', webhook_url || null, JSON.stringify(config || {})]
    );

    res.status(201).json({ success: true, partner: rows[0] });
  } catch (err) {
    console.error('❌ Error creating partner:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/connect/partners
 * List all partners
 */
router.get('/partners', async (req, res) => {
  try {
    const { active, channel } = req.query;
    let query = 'SELECT * FROM connect_partners WHERE 1=1';
    const params = [];

    if (active !== undefined) {
      params.push(active === 'true');
      query += ` AND is_active = $${params.length}`;
    }
    if (channel) {
      params.push(channel);
      query += ` AND channel = $${params.length}`;
    }

    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json({ success: true, partners: rows, count: rows.length });
  } catch (err) {
    console.error('❌ Error listing partners:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/connect/partners/:id
 * Update partner config
 */
router.put('/partners/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, webhook_url, config, is_active, channel } = req.body;

    const fields = [];
    const params = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); params.push(name); }
    if (phone !== undefined) { fields.push(`phone = $${idx++}`); params.push(phone); }
    if (webhook_url !== undefined) { fields.push(`webhook_url = $${idx++}`); params.push(webhook_url); }
    if (config !== undefined) { fields.push(`config = $${idx++}`); params.push(JSON.stringify(config)); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); params.push(is_active); }
    if (channel !== undefined) { fields.push(`channel = $${idx++}`); params.push(channel); }

    if (!fields.length) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    params.push(id);

    const { rows } = await pool.query(
      `UPDATE connect_partners SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Partner not found' });
    }

    res.json({ success: true, partner: rows[0] });
  } catch (err) {
    console.error('❌ Error updating partner:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Message History ────────────────────────────────────────────

/**
 * GET /api/connect/messages/:partner_id
 * Get message history for a partner
 */
router.get('/messages/:partner_id', async (req, res) => {
  try {
    const { partner_id } = req.params;
    const limit = parseInt(req.query.limit || '50');
    const offset = parseInt(req.query.offset || '0');

    const { rows } = await pool.query(
      `SELECT * FROM connect_messages
       WHERE partner_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [partner_id, limit, offset]
    );

    res.json({ success: true, messages: rows, count: rows.length });
  } catch (err) {
    console.error('❌ Error fetching messages:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── WhatsApp Webhook (Meta Cloud API) ──────────────────────────

/**
 * GET /api/connect/webhook/whatsapp
 * Meta Cloud API webhook verification (challenge)
 */
router.get('/webhook/whatsapp', (req, res) => {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'vutler-connect-verify';

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    return res.status(200).send(challenge);
  }

  res.status(403).json({ error: 'Verification failed' });
});

/**
 * POST /api/connect/webhook/whatsapp
 * Receive inbound WhatsApp messages (Meta Cloud API format)
 */
router.post('/webhook/whatsapp', async (req, res) => {
  try {
    // Always respond 200 quickly to Meta
    res.status(200).json({ status: 'ok' });

    const body = req.body;

    // Meta Cloud API structure: body.entry[].changes[].value.messages[]
    if (!body?.entry) return;

    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const value = change.value;
        if (!value?.messages) continue;

        const contact = value.contacts?.[0] || {};
        const phoneNumberId = value.metadata?.phone_number_id;

        for (const msg of value.messages) {
          const fromPhone = msg.from; // sender's WhatsApp number
          const senderName = contact.profile?.name || fromPhone;
          const content = msg.text?.body || msg.caption || '[media]';
          const msgType = msg.type; // text, image, document, etc.

          console.log(`📩 WhatsApp inbound from ${fromPhone}: ${content.substring(0, 80)}`);

          // Find or create partner
          const partner = await findOrCreatePartner(fromPhone, senderName);

          // Store message
          await storeMessage({
            partner_id: partner.id,
            agent_id: null,
            direction: 'in',
            channel: 'whatsapp',
            content,
            metadata: {
              wa_message_id: msg.id,
              message_type: msgType,
              phone_number_id: phoneNumberId,
              timestamp: msg.timestamp,
              contact_name: senderName,
              raw: msg,
            },
          });

          // TODO: Channel mapping — forward to Rocket.Chat channel
          // TODO: Trigger agent auto-reply if configured
        }
      }
    }
  } catch (err) {
    console.error('❌ WhatsApp webhook error:', err.message);
    // Already sent 200
  }
});

// ─── Outbound Send (Stub) ───────────────────────────────────────

/**
 * POST /api/connect/send
 * Send a message to a WhatsApp number (stub — logs + stores)
 */
router.post('/send', async (req, res) => {
  try {
    const { agent_id, to_phone, message, channel } = req.body;

    if (!to_phone || !message) {
      return res.status(400).json({ success: false, error: 'to_phone and message are required' });
    }

    // Find partner by phone
    const partner = await findOrCreatePartner(to_phone, null);

    // Store outbound message
    const stored = await storeMessage({
      partner_id: partner.id,
      agent_id: agent_id || 'system',
      direction: 'out',
      channel: channel || 'whatsapp',
      content: message,
      metadata: {
        to_phone,
        status: 'stub_logged',
        sent_at: new Date().toISOString(),
      },
    });

    console.log(`📤 [STUB] Outbound to ${to_phone}: ${message.substring(0, 80)}`);

    // TODO: Replace with actual Meta Cloud API / Twilio / 360dialog send
    // const result = await sendWhatsAppMessage(to_phone, message);

    res.json({
      success: true,
      message: stored,
      note: 'Message stored. Actual delivery not yet connected (stub).',
    });
  } catch (err) {
    console.error('❌ Error sending message:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
