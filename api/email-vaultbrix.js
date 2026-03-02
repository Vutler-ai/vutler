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

module.exports = router;
