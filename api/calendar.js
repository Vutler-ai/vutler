/**
 * Calendar API — Vaultbrix PostgreSQL
 * Supports manual events, agent-created events, and virtual events
 * (goals due dates, billing renewals) merged at query time.
 */
'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../lib/vaultbrix');
const SCHEMA = 'tenant_vutler';

/* ── Schema migration (safe to re-run) ──────────────────────────────────────── */
let _schemaReady = false;
async function ensureSchema() {
  if (_schemaReady) return;
  try {
    await pool.query(`
      ALTER TABLE ${SCHEMA}.calendar_events
        ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
        ADD COLUMN IF NOT EXISTS source_id TEXT,
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'
    `);
  } catch (_) { /* columns may already exist or table missing — handled per route */ }
  _schemaReady = true;
}

/* ── Virtual-event builders ─────────────────────────────────────────────────── */

async function fetchGoalEvents(start, end) {
  try {
    const conditions = ['due_date IS NOT NULL', "status = 'active'"];
    const params = [];
    if (start) { params.push(start); conditions.push(`due_date >= $${params.length}`); }
    if (end)   { params.push(end);   conditions.push(`due_date <= $${params.length}`); }
    const r = await pool.query(
      `SELECT id, title, due_date, status, description FROM ${SCHEMA}.goals WHERE ${conditions.join(' AND ')}`,
      params
    );
    return r.rows.map(g => ({
      id: `virtual-goal-${g.id}`,
      title: `🎯 ${g.title}`,
      description: g.description || `Goal "${g.title}" is due`,
      start: g.due_date,
      end: g.due_date,
      allDay: true,
      color: '#f59e0b',
      source: 'goal',
      sourceId: String(g.id),
      readOnly: true,
      metadata: { entityType: 'goal', status: g.status },
    }));
  } catch (_) { return []; }
}

async function fetchBillingEvents(start, end) {
  try {
    const conditions = ["status = 'active'"];
    const params = [];
    if (start) { params.push(start); conditions.push(`current_period_end >= $${params.length}`); }
    if (end)   { params.push(end);   conditions.push(`current_period_end <= $${params.length}`); }
    const r = await pool.query(
      `SELECT workspace_id, current_period_end, plan_id FROM ${SCHEMA}.workspace_subscriptions WHERE ${conditions.join(' AND ')}`,
      params
    );
    return r.rows.map(b => ({
      id: `virtual-billing-${b.workspace_id}`,
      title: '💳 Subscription renewal',
      description: `${b.plan_id || 'Current'} plan renews`,
      start: b.current_period_end,
      end: b.current_period_end,
      allDay: true,
      color: '#8b5cf6',
      source: 'billing',
      sourceId: String(b.workspace_id),
      readOnly: true,
      metadata: { entityType: 'billing', planId: b.plan_id },
    }));
  } catch (_) { return []; }
}

/* ── Routes ─────────────────────────────────────────────────────────────────── */

// GET /api/v1/calendar — merged stored + virtual events
router.get('/', async (req, res) => {
  try {
    await ensureSchema();
    const { start, end, source } = req.query;

    // Decide which sources to include
    const wantStored = !source || source === 'all' || source === 'manual' || source === 'agent' || (source && source.startsWith('agent'));
    const wantGoals  = !source || source === 'all' || source === 'goal';
    const wantBilling = !source || source === 'all' || source === 'billing';

    const promises = [];

    // 1. Stored events
    if (wantStored) {
      const storedPromise = (async () => {
        let query = `SELECT * FROM ${SCHEMA}.calendar_events`;
        const params = [];
        const conditions = [];
        if (start) { params.push(start); conditions.push(`start_time >= $${params.length}`); }
        if (end)   { params.push(end);   conditions.push(`end_time <= $${params.length}`); }
        if (source && source !== 'all') {
          if (source === 'agent') {
            conditions.push(`source LIKE 'agent%'`);
          } else {
            params.push(source); conditions.push(`source = $${params.length}`);
          }
        }
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY start_time ASC LIMIT 200';
        const r = await pool.query(query, params);
        return r.rows.map(e => ({
          id: e.id, title: e.title, description: e.description,
          start: e.start_time, end: e.end_time, allDay: e.all_day || false,
          location: e.location, color: e.color,
          source: e.source || 'manual',
          sourceId: e.source_id || null,
          readOnly: false,
          metadata: e.metadata || {},
          createdAt: e.created_at, updatedAt: e.updated_at,
        }));
      })();
      promises.push(storedPromise);
    }

    // 2. Virtual goal events
    if (wantGoals) promises.push(fetchGoalEvents(start, end));

    // 3. Virtual billing events
    if (wantBilling) promises.push(fetchBillingEvents(start, end));

    const results = await Promise.all(promises);
    const events = results.flat().sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 200);

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
    await ensureSchema();
    const { title, start, end, allDay, description, location, color, source, source_id, metadata } = req.body;
    if (!title || !start) return res.status(400).json({ success: false, error: 'title and start required' });
    const r = await pool.query(
      `INSERT INTO ${SCHEMA}.calendar_events (title, description, start_time, end_time, all_day, location, color, source, source_id, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title, description||'', start, end||start, allDay||false, location||'', color||'#3b82f6', source||'manual', source_id||null, JSON.stringify(metadata||{})]
    );
    const e = r.rows[0];
    res.json({ success: true, event: {
      id: e.id, title: e.title, start: e.start_time, end: e.end_time,
      allDay: e.all_day, description: e.description, location: e.location, color: e.color,
      source: e.source, sourceId: e.source_id, readOnly: false, metadata: e.metadata,
    }});
  } catch (err) {
    console.error('[CALENDAR] Create error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/calendar/events/:id
router.put('/events/:id', async (req, res) => {
  try {
    if (req.params.id.startsWith('virtual-')) {
      return res.status(403).json({ success: false, error: 'Virtual events are read-only. Edit the source entity directly.' });
    }
    await ensureSchema();
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
    if (req.params.id.startsWith('virtual-')) {
      return res.status(403).json({ success: false, error: 'Virtual events cannot be deleted. Edit the source entity directly.' });
    }
    await pool.query(`DELETE FROM ${SCHEMA}.calendar_events WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
