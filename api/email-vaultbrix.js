/**
 * Email API — Vaultbrix PostgreSQL
 */
const express = require("express");
const router = express.Router();

// GET /api/v1/email/inbox
router.get("/inbox", async (req, res) => {
  res.json({ success: true, emails: [] });
});

// GET /api/v1/email/sent
router.get("/sent", async (req, res) => {
  res.json({ success: true, emails: [] });
});

// POST /api/v1/email/send
router.post("/send", async (req, res) => {
  res.json({ success: true, messageId: "email-" + Date.now() });
});

// PUT /api/v1/email/:uid/read
router.put("/:uid/read", async (req, res) => {
  try {
    const { uid } = req.params;
    // In production, mark email as read in database
    res.json({ success: true, uid, read: true });
  } catch (err) {
    console.error("[EMAIL] Mark read error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
