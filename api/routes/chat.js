/**
 * Agent Chat Routes
 */
const express = require('express');
const router = express.Router();

// GET /api/v1/agents/:id/chat - Get chat history
router.get('/:id/chat', async (req, res) => {
  res.json({ success: true, messages: [] });
});

// POST /api/v1/agents/:id/chat - Send message to agent
router.post('/:id/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    res.json({ 
      success: true, 
      response: {
        content: `Echo: ${message}`,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
