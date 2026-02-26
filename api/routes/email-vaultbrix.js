// Email API backed by Vaultbrix PostgreSQL
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');

// GET / — List emails (default: inbox)
router.get('/', async (req, res) => {
  try {
    const { folder = 'inbox', is_read, limit = 50, offset = 0 } = req.query;
    let query = 'SELECT * FROM emails WHERE folder = $1';
    const params = [folder];
    let paramCount = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramCount}`;
      params.push(is_read === 'true');
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    res.json({ success: true, emails: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Email API] GET / error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /sent — List sent emails
router.get('/sent', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await pool.query(
      'SELECT * FROM emails WHERE folder = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      ['sent', parseInt(limit), parseInt(offset)]
    );
    res.json({ success: true, emails: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('[Email API] GET /sent error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / — Create/send email
router.post('/', async (req, res) => {
  try {
    const { from_addr, to_addr, subject, body, html_body, folder = 'sent', agent_id } = req.body;
    if (!from_addr || !to_addr) {
      return res.status(400).json({ success: false, error: 'from_addr and to_addr are required' });
    }

    const result = await pool.query(
      `INSERT INTO emails (from_addr, to_addr, subject, body, html_body, folder, agent_id, is_read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [from_addr, to_addr, subject || '', body || '', html_body || null, folder, agent_id || null, folder === 'sent']
    );

    res.status(201).json({ success: true, email: result.rows[0] });
  } catch (error) {
    console.error('[Email API] POST / error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PATCH /:id/read — Mark as read
router.patch('/:id/read', async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE emails SET is_read = true WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }
    res.json({ success: true, email: result.rows[0] });
  } catch (error) {
    console.error('[Email API] PATCH /:id/read error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id — Delete email
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM emails WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Email not found' });
    }
    res.json({ success: true, deleted: req.params.id });
  } catch (error) {
    console.error('[Email API] DELETE /:id error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
