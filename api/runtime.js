/**
 * Runtime API
 * Agent runtime control
 */
const express = require("express");
const router = express.Router();

// POST /api/v1/agents/:id/start
router.post("/agents/:id/start", async (req, res) => {
  res.json({ success: true, status: "started" });
});

// POST /api/v1/agents/:id/stop
router.post("/agents/:id/stop", async (req, res) => {
  res.json({ success: true, status: "stopped" });
});

// GET /api/v1/agents/:id/status
router.get("/agents/:id/status", async (req, res) => {
  res.json({ success: true, status: "online" });
});

module.exports = router;
