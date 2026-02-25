// routes/calendar.js - CRUD calendar events in PostgreSQL
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  host: 'vutler-postgres',
  port: 5432,
  user: 'vaultbrix',
  password: 'vaultbrix',
  database: 'vaultbrix'
});

// Initialize events table
async function initEventsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ,
        location TEXT,
        attendees TEXT[],
        color TEXT DEFAULT '#3b82f6',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Events table initialized');
  } catch (error) {
    console.error('Error initializing events table:', error);
  }
}

// Run table initialization
initEventsTable();

// GET /api/v1/calendar/events - List events with optional date filters
router.get('/events', async (req, res) => {
  try {
    const { start, end } = req.query;
    
    let query = 'SELECT * FROM events WHERE 1=1';
    const params = [];
    let paramCount = 1;

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

    res.json({
      success: true,
      count: result.rows.length,
      events: result.rows
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/v1/calendar/events - Create new event
router.post('/events', async (req, res) => {
  try {
    const {
      title,
      description,
      start_time,
      end_time,
      location,
      attendees = [],
      color = '#3b82f6'
    } = req.body;

    if (!title || !start_time) {
      return res.status(400).json({
        success: false,
        error: 'Title and start_time are required'
      });
    }

    const result = await pool.query(
      `INSERT INTO events (title, description, start_time, end_time, location, attendees, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, description, start_time, end_time || null, location, attendees, color]
    );

    res.status(201).json({
      success: true,
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/v1/calendar/events/:id - Update event
router.put('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      start_time,
      end_time,
      location,
      attendees,
      color
    } = req.body;

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      params.push(title);
      paramCount++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      params.push(description);
      paramCount++;
    }
    if (start_time !== undefined) {
      updates.push(`start_time = $${paramCount}`);
      params.push(start_time);
      paramCount++;
    }
    if (end_time !== undefined) {
      updates.push(`end_time = $${paramCount}`);
      params.push(end_time);
      paramCount++;
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount}`);
      params.push(location);
      paramCount++;
    }
    if (attendees !== undefined) {
      updates.push(`attendees = $${paramCount}`);
      params.push(attendees);
      paramCount++;
    }
    if (color !== undefined) {
      updates.push(`color = $${paramCount}`);
      params.push(color);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    params.push(id);

    const query = `
      UPDATE events
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.json({
      success: true,
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DELETE /api/v1/calendar/events/:id - Delete event
router.delete('/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM events WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    res.json({
      success: true,
      message: 'Event deleted',
      event: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
