/**
 * JWT Auth Routes
 */
const express = require("express");
const router = express.Router();

// JWT auth placeholder
router.post("/verify", async (req, res) => {
  res.json({ success: true, valid: true });
});

module.exports = router;
