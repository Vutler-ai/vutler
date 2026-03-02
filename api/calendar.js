/**
 * Calendar API
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/calendar
router.get("/", async (req, res) => {
  res.json({ success: true, events: [] });
});

// GET /api/v1/calendar/events
router.get("/events", async (req, res) => {
  try {
    const { start, end } = req.query;
    // Return mock events for now
    const events = [
      {
        id: "evt-1",
        title: "Team Standup",
        start: new Date(Date.now() + 3600000).toISOString(),
        end: new Date(Date.now() + 7200000).toISOString(),
        allDay: false
      }
    ];
    res.json({ success: true, events });
  } catch (err) {
    console.error("[CALENDAR] Events error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/calendar/events
router.post("/events", async (req, res) => {
  try {
    const { title, start, end, allDay } = req.body;
    if (!title || !start) {
      return res.status(400).json({ success: false, error: "Title and start date required" });
    }
    const event = {
      id: "evt-" + Date.now(),
      title,
      start,
      end: end || start,
      allDay: allDay || false,
      createdAt: new Date().toISOString()
    };
    res.json({ success: true, event });
  } catch (err) {
    console.error("[CALENDAR] Create event error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/calendar/events/:id
router.put("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, start, end, allDay } = req.body;
    
    // Mock update
    const event = {
      id,
      title: title || 'Updated Event',
      start: start || new Date().toISOString(),
      end: end || start || new Date().toISOString(),
      allDay: allDay || false,
      updatedAt: new Date().toISOString()
    };
    
    res.json({ success: true, event });
  } catch (err) {
    console.error("[CALENDAR] Update event error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/v1/calendar/events/:id
router.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;
    res.json({ success: true, message: "Event deleted successfully", id });
  } catch (err) {
    console.error("[CALENDAR] Delete event error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
