/**
 * Calendar API — Vaultbrix PostgreSQL
 */
'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const SCHEMA = 'tenant_vutler';

// GET /api/v1/calendar
router.get('/', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = `SELECT * FROM ${SCHEMA}.calendar_events`;
    const params = [];
    const conditions = [];
    if (start) { params.push(start); conditions.push(`start_time >= $${params.length}`); }
    if (end) { params.push(end); conditions.push(`end_time <= $${params.length}`); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY start_time ASC LIMIT 200';
    const r = await pool.query(query, params);
    const events = r.rows.map(e => ({
      id: e.id, title: e.title, description: e.description,
      start: e.start_time, end: e.end_time, allDay: e.all_day || false,
      location: e.location, color: e.color,
      createdAt: e.created_at, updatedAt: e.updated_at
    }));
    res.json({ success: true, events });
  } catch (err) {
    console.error('[CALENDAR] List error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/calendar/events (alias)
router.get('/events', async (req, res) => {
  req.url = '/'; return router.handle(req, res);
});

// POST /api/v1/calendar/events
router.post('/events', async (req, res) => {
  try {
    const { title, start, end, allDay, description, location, color } = req.body;
    if (!title || !start) return res.status(400).json({ success: false, error: 'title and start required' });
    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.calendar_events (title, description, start_time, end_time, all_day, location, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [title, description||'', start, end||start, allDay||false, location||'', color||'#3b82f6']
    );
    const e = r.rows[0];
    res.json({ success: true, event: { id: e.id, title: e.title, start: e.start_time, end: e.end_time, allDay: e.all_day } });
  } catch (err) {
    console.error('[CALENDAR] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/calendar/events/:id
router.put('/events/:id', async (req, res) => {
  try {
    const { title, start, end, allDay, description, location, color } = req.body;
    const r = await pool.query(
      `UPDATE ${SCHEMA}.calendar_events SET title=COALESCE($2,title), description=COALESCE($3,description),
       start_time=COALESCE($4,start_time), end_time=COALESCE($5,end_time), all_day=COALESCE($6,all_day),
       location=COALESCE($7,location), color=COALESCE($8,color), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, title, description, start, end, allDay, location, color]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, event: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM ${SCHEMA}.calendar_events WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
