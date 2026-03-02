/**
 * Agent Sync API
 */
const express = require("express");
const router = express.Router();

router.post("/", async (req, res) => {
  res.json({ success: true, synced: true });
});

module.exports = router;
