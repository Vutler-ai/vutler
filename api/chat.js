/**
 * Chat API
 * Rocket.Chat integration endpoints
 */
const express = require("express");
const router = express.Router();

// In-memory channels and messages
let channels = [
  { id: 'general', name: 'general', type: 'public', members: 5 },
  { id: 'random', name: 'random', type: 'public', members: 3 }
];
let messages = {};
let nextMessageId = 1;

// GET /api/v1/chat/channels
router.get("/channels", async (req, res) => {
  res.json({ success: true, channels });
});

// GET /api/v1/chat/channels/direct
router.get("/channels/direct", async (req, res) => {
  res.json({ success: true, channels: channels.filter(c => c.type === 'direct') });
});

// POST /api/v1/chat/channels
router.post("/channels", async (req, res) => {
  try {
    const { name, type = 'public' } = req.body;
    const channel = {
      id: 'channel-' + Date.now(),
      name,
      type,
      members: 1,
      createdAt: new Date().toISOString()
    };
    channels.push(channel);
    res.json({ success: true, channel });
  } catch (err) {
    console.error("[CHAT] Create channel error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/chat/channels/:id/messages
router.get("/channels/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50 } = req.query;
    const channelMessages = messages[id] || [];
    
    res.json({ 
      success: true, 
      messages: channelMessages.slice(-parseInt(limit))
    });
  } catch (err) {
    console.error("[CHAT] Get messages error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/chat/channels/:id/messages
router.post("/channels/:id/messages", async (req, res) => {
  try {
    const { id } = req.params;
    const { content, sender } = req.body;
    
    const message = {
      id: String(nextMessageId++),
      channelId: id,
      content,
      sender: sender || req.user?.name || 'Anonymous',
      createdAt: new Date().toISOString()
    };
    
    if (!messages[id]) {
      messages[id] = [];
    }
    messages[id].push(message);
    
    res.json({ success: true, message });
  } catch (err) {
    console.error("[CHAT] Send message error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
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
