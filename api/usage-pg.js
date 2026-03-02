/**
 * Usage API — PostgreSQL
 * Token usage and billing
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/usage - Returns summary data
router.get("/", async (req, res) => {
  try {
    // Return usage summary
    res.json({ 
      success: true, 
      usage: {
        totalTokens: 0,
        totalCost: 0,
        requests: 0,
        period: "current_month"
      },
      history: []
    });
  } catch (err) {
    console.error("[USAGE] Error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/usage/summary
router.get("/summary", async (req, res) => {
  res.json({ 
    success: true, 
    usage: {
      totalTokens: 0,
      totalCost: 0,
      requests: 0
    }
  });
});

// GET /api/v1/usage/tiers
router.get("/tiers", async (req, res) => {
  res.json({ 
    success: true, 
    tiers: [
      { name: "free", maxTokens: 100000 },
      { name: "pro", maxTokens: 1000000 }
    ]
  });
});

module.exports = router;
