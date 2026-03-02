/**
 * LLM Validate API
 */
const express = require("express");
const router = express.Router();

router.post("/validate", async (req, res) => {
  res.json({ success: true, valid: true });
});

module.exports = router;
