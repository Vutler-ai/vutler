const express = require('express');
const { authenticateAgent } = require('../lib/auth');
const { mirrorWhatsAppMessage, isMirrorEnabled } = require('../services/whatsappMirror');

const router = express.Router();

/**
 * POST /api/v1/whatsapp/mirror
 * Mirrors inbound/outbound WhatsApp messages into Vutler chat room.
 * Note: MongoDB removed - service returns stub response
 */
router.post('/whatsapp/mirror', authenticateAgent, async (req, res) => {
  try {
    const { direction, text, timestamp, conversation_label, message_id } = req.body || {};

    if (!isMirrorEnabled()) {
      return res.status(202).json({
        success: true,
        mirrored: false,
        reason: 'disabled'
      });
    }

    if (!direction || !['inbound', 'outbound'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'direction must be one of: inbound, outbound'
      });
    }

    if (!conversation_label || typeof conversation_label !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'conversation_label is required (string)'
      });
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'text is required (non-empty string)'
      });
    }

    // MongoDB removed - return stub response
    return res.status(200).json({
      success: true,
      mirrored: false,
      reason: 'mongodb_removed',
      message: 'WhatsApp mirror service is disabled - MongoDB dependency removed'
    });
  } catch (error) {
    console.error('whatsapp mirror endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to mirror WhatsApp message',
      message: error.message
    });
  }
});

module.exports = router;
