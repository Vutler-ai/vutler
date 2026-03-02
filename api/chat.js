/**
 * Chat API
 * Rocket.Chat integration endpoints
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/chat/channels
router.get("/channels", async (req, res) => {
  res.json({ success: true, channels: [] });
});

// GET /api/v1/chat/messages
router.get("/messages", async (req, res) => {
  res.json({ success: true, messages: [] });
});

// POST /api/v1/chat/send
router.post("/send", async (req, res) => {
  res.json({ success: true, messageId: "msg-" + Date.now() });
});

module.exports = router;
