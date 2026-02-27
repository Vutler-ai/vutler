const express = require('express');
const router = express.Router();
const https = require('https');
const pool = require("../lib/vaultbrix");
const SCHEMA = "tenant_vutler";
const http = require('http');


// GET /api/v1/mail/inbox — List threads
router.get('/inbox', async (req, res) => {
  try {
    
    const { mailbox_id, label, search, archived = 'false', limit = 50, offset = 0 } = req.query;
    let query = `SELECT t.*, (SELECT json_build_object('from_address', m.from_address, 'from_name', m.from_name, 'body_text', LEFT(m.body_text, 200), 'created_at', m.created_at) FROM ${SCHEMA}.email_messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) as last_email FROM ${SCHEMA}.email_threads t WHERE t.is_archived = $1`;
    const params = [archived === 'true'];
    let idx = 2;

    if (mailbox_id) { query += ` AND t.mailbox_id = $${idx++}`; params.push(mailbox_id); }
    if (label) { query += ` AND $${idx++} = ANY(t.labels)`; params.push(label); }
    if (search) { query += ` AND t.subject ILIKE $${idx++}`; params.push(`%${search}%`); }

    query += ` ORDER BY t.last_message_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    const countResult = await pool.query(`SELECT COUNT(*) FROM ${SCHEMA}.email_threads WHERE is_archived = $1`, [archived === 'true']);

    res.json({ threads: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/v1/mail/threads/:id — Thread detail with messages
router.get('/threads/:id', async (req, res) => {
  try {
    
    const thread = await pool.query(`SELECT * FROM ${SCHEMA}.email_threads WHERE id = $1`, [req.params.id]);
    if (thread.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });

    const messages = await pool.query(
      `SELECT * FROM ${SCHEMA}.email_messages WHERE thread_id = $1 ORDER BY created_at ASC`,
      [req.params.id]
    );

    // Mark as read
    await pool.query(`UPDATE ${SCHEMA}.email_threads SET is_read = TRUE WHERE id = $1`, [req.params.id]);

    res.json({ thread: thread.rows[0], messages: messages.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/v1/mail/send — Send email via Postal
router.post('/send', async (req, res) => {
  try {
    
    const { to, cc, bcc, subject, body_text, body_html, from_address } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });

    const postalKey = process.env.POSTAL_API_KEY;
    if (!postalKey) return res.status(500).json({ error: 'POSTAL_API_KEY not configured' });

    const sender = from_address || 'noreply@vutler.ai';
    const toList = Array.isArray(to) ? to : [to];

    // Send via Postal API
    const postData = JSON.stringify({
      to: toList,
      cc: cc || [],
      bcc: bcc || [],
      from: sender,
      subject: subject,
      plain_body: body_text || '',
      html_body: body_html || body_text || ''
    });

    const postalResult = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'mail.vutler.ai',
        port: 443,
        path: '/api/v1/send/message',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Server-API-Key': postalKey,
          'Content-Length': Buffer.byteLength(postData)
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
      r.write(postData);
      r.end();
    });

    // Create thread + message in DB
    const threadResult = await pool.query(
      `INSERT INTO ${SCHEMA}.email_threads (subject, is_read, labels) VALUES ($1, TRUE, ARRAY['sent']) RETURNING *`,
      [subject]
    );

    const msgResult = await pool.query(
      `INSERT INTO ${SCHEMA}.email_messages (thread_id, from_address, to_addresses, cc_addresses, subject, body_text, body_html, direction, postal_message_id) VALUES ($1,$2,$3,$4,$5,$6,$7,'outbound',$8) RETURNING *`,
      [threadResult.rows[0].id, sender, JSON.stringify(toList), JSON.stringify(cc || []), subject, body_text, body_html, postalResult?.data?.message_id || null]
    );

    const redis = req.app.get('redisClient');
    if (redis) redis.publish('agentBus', JSON.stringify({ type: 'email.sent', data: { thread: threadResult.rows[0], message: msgResult.rows[0] } }));

    res.status(201).json({ thread: threadResult.rows[0], message: msgResult.rows[0], postal: postalResult });
  } catch (err) {
    console.error('[MAIL] Send error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/mail/reply/:threadId — Reply in thread
router.post('/reply/:threadId', async (req, res) => {
  try {
    
    const { threadId } = req.params;
    const { to, body_text, body_html, from_address } = req.body;

    const thread = await pool.query(`SELECT * FROM ${SCHEMA}.email_threads WHERE id = $1`, [threadId]);
    if (thread.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });

    // Get last message for In-Reply-To
    const lastMsg = await pool.query(
      `SELECT message_id_header, from_address FROM ${SCHEMA}.email_messages WHERE thread_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [threadId]
    );

    const sender = from_address || 'noreply@vutler.ai';
    const toList = Array.isArray(to) ? to : [to || lastMsg.rows[0]?.from_address];
    const subject = thread.rows[0].subject?.startsWith('Re:') ? thread.rows[0].subject : `Re: ${thread.rows[0].subject}`;

    // Send via Postal
    const postalKey = process.env.POSTAL_API_KEY;
    if (postalKey) {
      const postData = JSON.stringify({ to: toList, from: sender, subject, plain_body: body_text || '', html_body: body_html || body_text || '' });
      await new Promise((resolve, reject) => {
        const r = https.request({ hostname: 'mail.vutler.ai', port: 443, path: '/api/v1/send/message', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Server-API-Key': postalKey, 'Content-Length': Buffer.byteLength(postData) } }, resp => {
          let d = ''; resp.on('data', c => d += c); resp.on('end', () => resolve(d));
        });
        r.on('error', reject);
        r.write(postData);
        r.end();
      });
    }

    const msgResult = await pool.query(
      `INSERT INTO ${SCHEMA}.email_messages (thread_id, from_address, to_addresses, subject, body_text, body_html, direction, in_reply_to) VALUES ($1,$2,$3,$4,$5,$6,'outbound',$7) RETURNING *`,
      [threadId, sender, JSON.stringify(toList), subject, body_text, body_html, lastMsg.rows[0]?.message_id_header]
    );

    await pool.query(`UPDATE ${SCHEMA}.email_threads SET message_count = message_count + 1, last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [threadId]);

    res.status(201).json(msgResult.rows[0]);
  } catch (err) {
    console.error('[MAIL] Reply error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/mail/threads/:id/label — Add/remove label
router.put('/threads/:id/label', async (req, res) => {
  try {
    
    const { label, action = 'add' } = req.body;
    if (!label) return res.status(400).json({ error: 'label required' });

    let query;
    if (action === 'remove') {
      query = `UPDATE ${SCHEMA}.email_threads SET labels = array_remove(labels, $1), updated_at = NOW() WHERE id = $2 RETURNING *`;
    } else {
      query = `UPDATE ${SCHEMA}.email_threads SET labels = array_append(labels, $1), updated_at = NOW() WHERE id = $2 RETURNING *`;
    }
    const result = await pool.query(query, [label, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/v1/mail/threads/:id — Archive thread
router.delete('/threads/:id', async (req, res) => {
  try {
    
    const result = await pool.query(
      `UPDATE ${SCHEMA}.email_threads SET is_archived = TRUE, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Thread not found' });
    res.json({ archived: true, thread: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/v1/mail/webhook — Postal inbound webhook
router.post('/webhook', async (req, res) => {
  try {
    
    const payload = req.body;

    const from = payload.mail_from || payload.from;
    const to = payload.rcpt_to || payload.to;
    const subject = payload.subject || '(no subject)';
    const bodyText = payload.plain_body || payload.text || '';
    const bodyHtml = payload.html_body || payload.html || '';
    const messageId = payload.message_id;
    const inReplyTo = payload.in_reply_to;

    // Find existing thread by In-Reply-To or subject
    let threadId;
    if (inReplyTo) {
      const existing = await pool.query(
        `SELECT t.id FROM ${SCHEMA}.email_threads t JOIN ${SCHEMA}.email_messages m ON m.thread_id = t.id WHERE m.message_id_header = $1 LIMIT 1`,
        [inReplyTo]
      );
      if (existing.rows.length > 0) threadId = existing.rows[0].id;
    }

    if (!threadId) {
      // Try subject matching
      const cleanSubject = subject.replace(/^(Re|Fwd|Fw):\s*/gi, '').trim();
      const existing = await pool.query(
        `SELECT id FROM ${SCHEMA}.email_threads WHERE REPLACE(REPLACE(subject, 'Re: ', ''), 'Fwd: ', '') = $1 AND created_at > NOW() - INTERVAL '7 days' ORDER BY last_message_at DESC LIMIT 1`,
        [cleanSubject]
      );
      if (existing.rows.length > 0) threadId = existing.rows[0].id;
    }

    if (!threadId) {
      // Create new thread
      const tr = await pool.query(
        `INSERT INTO ${SCHEMA}.email_threads (subject) VALUES ($1) RETURNING id`,
        [subject]
      );
      threadId = tr.rows[0].id;
    } else {
      await pool.query(`UPDATE ${SCHEMA}.email_threads SET message_count = message_count + 1, last_message_at = NOW(), is_read = FALSE, updated_at = NOW() WHERE id = $1`, [threadId]);
    }

    // Insert email message
    await pool.query(
      `INSERT INTO ${SCHEMA}.email_messages (thread_id, message_id_header, in_reply_to, from_address, to_addresses, subject, body_text, body_html, direction) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'inbound')`,
      [threadId, messageId, inReplyTo, from, JSON.stringify(Array.isArray(to) ? to : [to]), subject, bodyText, bodyHtml]
    );

    // Apply routing rules
    const rules = await pool.query(
      `SELECT * FROM ${SCHEMA}.email_routing_rules WHERE enabled = TRUE ORDER BY priority DESC`
    );
    for (const rule of rules.rows) {
      let match = false;
      const val = rule.match_field === 'from' ? from : rule.match_field === 'to' ? (Array.isArray(to) ? to.join(',') : to) : subject;
      if (val && val.toLowerCase().includes(rule.match_pattern.toLowerCase())) match = true;
      if (match && rule.action === 'assign_agent' && rule.target_agent_id) {
        await pool.query(`UPDATE ${SCHEMA}.email_threads SET assigned_agent_id = $1 WHERE id = $2`, [rule.target_agent_id, threadId]);
        break;
      }
    }

    const redis = req.app.get('redisClient');
    if (redis) redis.publish('agentBus', JSON.stringify({ type: 'email.received', data: { threadId, from, subject } }));

    res.json({ status: 'ok', threadId });
  } catch (err) {
    console.error('[MAIL] Webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/mail/routing-rules
router.get('/routing-rules', async (req, res) => {
  try {
    
    const result = await pool.query(`SELECT * FROM ${SCHEMA}.email_routing_rules ORDER BY priority DESC`);
    res.json({ rules: result.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/v1/mail/routing-rules
router.post('/routing-rules', async (req, res) => {
  try {
    
    const { name, match_field, match_pattern, action = 'assign_agent', target_agent_id, priority = 0 } = req.body;
    if (!name || !match_field || !match_pattern) return res.status(400).json({ error: 'name, match_field, match_pattern required' });

    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.email_routing_rules (name, match_field, match_pattern, action, target_agent_id, priority) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name, match_field, match_pattern, action, target_agent_id, priority]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
