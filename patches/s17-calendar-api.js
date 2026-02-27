const express = require('express');
const router = express.Router();

const pool = require("../lib/vaultbrix");
const SCHEMA = "tenant_vutler";

// GET /api/v1/calendar/events/today — Agent tool: today's events
router.get('/events/today', async (req, res) => {
  try {
    
    const { user_id } = req.query;
    const today = new Date();
    const startOfDay = new Date(today.setHours(0,0,0,0)).toISOString();
    const endOfDay = new Date(today.setHours(23,59,59,999)).toISOString();
    
    let query = `SELECT e.*, COALESCE(json_agg(json_build_object('user_id', a.user_id, 'rsvp', a.rsvp)) FILTER (WHERE a.id IS NOT NULL), '[]') as attendees FROM ${SCHEMA}.calendar_events_v2 e LEFT JOIN ${SCHEMA}.event_attendees a ON e.id = a.event_id WHERE e.start_time >= $1 AND e.start_time <= $2`;
    const params = [startOfDay, endOfDay];
    let idx = 3;
    
    if (user_id) {
      query += ` AND EXISTS (SELECT 1 FROM ${SCHEMA}.event_attendees WHERE event_id = e.id AND user_id = $${idx++})`;
      params.push(user_id);
    }
    query += ` GROUP BY e.id ORDER BY e.start_time ASC`;
    
    const result = await pool.query(query, params);
    res.json({ events: result.rows, date: new Date().toISOString().split('T')[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/calendar/events — Create event
router.post('/events', async (req, res) => {
  try {
    
    const { title, description, start_time, end_time, all_day = false, location, recurrence_rule, recurrence_end, color = '#0066ff', attendees = [] } = req.body;
    if (!title || !start_time || !end_time) return res.status(400).json({ error: 'title, start_time, end_time required' });
    
    const created_by = req.user?.id || 'system';
    const result = await pool.query(
      `INSERT INTO ${SCHEMA}.calendar_events_v2 (title, description, start_time, end_time, all_day, location, recurrence_rule, recurrence_end, color, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description, start_time, end_time, all_day, location, recurrence_rule, recurrence_end, color, created_by]
    );
    
    const event = result.rows[0];
    
    // Add attendees
    for (const att of attendees) {
      await pool.query(
        `INSERT INTO ${SCHEMA}.event_attendees (event_id, user_id, user_type) VALUES ($1, $2, $3) ON CONFLICT (event_id, user_id) DO NOTHING`,
        [event.id, att.user_id, att.user_type || 'human']
      );
    }
    
    // Add default reminder (15 min)
    await pool.query(
      `INSERT INTO ${SCHEMA}.event_reminders (event_id, minutes_before) VALUES ($1, 15)`,
      [event.id]
    );
    
    const redis = req.app.get('redisClient');
    if (redis) redis.publish('agentBus', JSON.stringify({ type: 'event.created', data: event }));
    
    res.status(201).json(event);
  } catch (err) {
    console.error('[CALENDAR] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/calendar/events/:id — Update event
router.put('/events/:id', async (req, res) => {
  try {
    
    const { id } = req.params;
    const fields = ['title', 'description', 'start_time', 'end_time', 'all_day', 'location', 'status', 'recurrence_rule', 'recurrence_end', 'color'];
    const updates = [];
    const params = [];
    let idx = 1;
    
    for (const f of fields) {
      if (req.body[f] !== undefined) { updates.push(`${f} = $${idx++}`); params.push(req.body[f]); }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    
    updates.push('updated_at = NOW()');
    params.push(id);
    const result = await pool.query(`UPDATE ${SCHEMA}.calendar_events_v2 SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    
    // Update attendees if provided
    if (req.body.attendees) {
      await pool.query(`DELETE FROM ${SCHEMA}.event_attendees WHERE event_id = $1`, [id]);
      for (const att of req.body.attendees) {
        await pool.query(
          `INSERT INTO ${SCHEMA}.event_attendees (event_id, user_id, user_type) VALUES ($1, $2, $3)`,
          [id, att.user_id, att.user_type || 'human']
        );
      }
    }
    
    const redis = req.app.get('redisClient');
    if (redis) redis.publish('agentBus', JSON.stringify({ type: 'event.updated', data: result.rows[0] }));
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[CALENDAR] Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/v1/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    
    const result = await pool.query(`DELETE FROM ${SCHEMA}.calendar_events_v2 WHERE id = $1 RETURNING id`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ deleted: true, id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/calendar/events/:id/rsvp — Accept/Decline
router.post('/events/:id/rsvp', async (req, res) => {
  try {
    
    const { rsvp } = req.body;
    const user_id = req.user?.id || req.body.user_id;
    if (!rsvp || !['accepted', 'declined', 'maybe'].includes(rsvp)) return res.status(400).json({ error: 'rsvp must be accepted/declined/maybe' });
    if (!user_id) return res.status(400).json({ error: 'user_id required' });
    
    const result = await pool.query(
      `UPDATE ${SCHEMA}.event_attendees SET rsvp = $1 WHERE event_id = $2 AND user_id = $3 RETURNING *`,
      [rsvp, req.params.id, user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attendee not found for this event' });
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
