/**
 * Emails API - List emails + send via Postal
 */
const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require('../lib/vaultbrix');

const POSTAL_KEY = (process.env.POSTAL_API_KEY);
const POSTAL_ENDPOINT = 'https://mail.vutler.ai/api/v1/send/message';

// GET /api/v1/emails
router.get('/', async (req, res) => {
  try {
    const { agent_id, folder, limit } = req.query;
    let query = 'SELECT * FROM tenant_vutler.emails WHERE 1=1';
    const params = [];
    let idx = 1;
    if (agent_id) { query += ` AND agent_id = $${idx++}`; params.push(agent_id); }
    if (folder) { query += ` AND folder = $${idx++}`; params.push(folder); }
    query += ' ORDER BY created_at DESC';
    if (limit) { query += ` LIMIT $${idx++}`; params.push(parseInt(limit)); }
    const { rows } = await pool.query(query, params);
    res.json({ success: true, emails: rows });
  } catch (err) {
    console.error('[Emails] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/emails/send
router.post('/send', async (req, res) => {
  try {
    const { from, to, subject, body, html_body, agent_id } = req.body;
    if (!to || !subject) return res.status(400).json({ success: false, error: 'to and subject required' });

    const postalPayload = JSON.stringify({
      to: Array.isArray(to) ? to : [to],
      from: from || 'noreply@vutler.ai',
      subject,
      plain_body: body || '',
      html_body: html_body || ''
    });

    const postalResult = await new Promise((resolve, reject) => {
      const url = new URL(POSTAL_ENDPOINT);
      const options = {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Server-API-Key': POSTAL_KEY,
          'Content-Length': Buffer.byteLength(postalPayload)
        }
      };
      const r = https.request(options, (resp) => {
        let data = '';
        resp.on('data', c => data += c);
        resp.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { resolve({ raw: data }); }
        });
      });
      r.on('error', reject);
      r.write(postalPayload);
      r.end();
    });

    // Store in DB
    const toAddr = Array.isArray(to) ? to.join(', ') : to;
    await pool.query(
      `INSERT INTO tenant_vutler.emails (id, from_addr, to_addr, subject, body, html_body, is_read, folder, agent_id, created_at, workspace_id)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, true, 'sent', $6, NOW(), '00000000-0000-0000-0000-000000000001')`,
      [from || 'noreply@vutler.ai', toAddr, subject, body || '', html_body || '', agent_id || null]
    );

    res.json({ success: true, postal_response: postalResult });
  } catch (err) {
    console.error('[Emails] SEND error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
