// routes/calendar.js - CRUD calendar events (Sprint 8.1: workspace_id)
const express = require('express');
const router = express.Router();
const pool = require("../lib/vaultbrix");

// GET /api/v1/calendar/events
router.get('/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    const workspaceId = req.workspaceId;
    
    let query = 'SELECT * FROM calendar_events WHERE workspace_id = $1';
    const params = [workspaceId];
    let paramCount = 2;

    if (start) {
      query += ` AND start_time >= $${paramCount}`;
      params.push(start);
      paramCount++;
    }

    if (end) {
      query += ` AND start_time <= $${paramCount}`;
      params.push(end);
      paramCount++;
    }

    query += ' ORDER BY start_time ASC';
    const result = await pool.query(query, params);

    res.json({ success: true, count: result.rows.length, events: result.rows });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/calendar/events
router.post('/events', async (req, res) => {
  try {
    const { title, description, start_time, end_time, location, all_day = false, color = '#3b82f6' } = req.body;
    const workspaceId = req.workspaceId;

    if (!title || !start_time) {
      return res.status(400).json({ success: false, error: 'Title and start_time are required' });
    }

    const result = await pool.query(
      `INSERT INTO calendar_events (title, description, start_time, end_time, all_day, location, color, workspace_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, description, start_time, end_time || null, all_day || false, location, color, workspaceId]
    );

    res.status(201).json({ success: true, event: result.rows[0] });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/calendar/events/:id
router.put('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, start_time, end_time, location, all_day, color } = req.body;
    const workspaceId = req.workspaceId;

    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title !== undefined) { updates.push(`title = $${paramCount}`); params.push(title); paramCount++; }
    if (description !== undefined) { updates.push(`description = $${paramCount}`); params.push(description); paramCount++; }
    if (start_time !== undefined) { updates.push(`start_time = $${paramCount}`); params.push(start_time); paramCount++; }
    if (end_time !== undefined) { updates.push(`end_time = $${paramCount}`); params.push(end_time); paramCount++; }
    if (location !== undefined) { updates.push(`location = $${paramCount}`); params.push(location); paramCount++; }
    if (all_day !== undefined) { updates.push(`all_day = $${paramCount}`); params.push(all_day); paramCount++; }
    if (color !== undefined) { updates.push(`color = $${paramCount}`); params.push(color); paramCount++; }

    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    params.push(id, workspaceId);

    const query = `
      UPDATE calendar_events SET ${updates.join(', ')}
      WHERE id = $${paramCount} AND workspace_id = $${paramCount + 1}
      RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({ success: true, event: result.rows[0] });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const workspaceId = req.workspaceId;

    const result = await pool.query(
      'DELETE FROM calendar_events WHERE id = $1 AND workspace_id = $2 RETURNING *',
      [id, workspaceId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({ success: true, message: 'Event deleted', event: result.rows[0] });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
