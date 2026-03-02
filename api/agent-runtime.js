/**
 * Agent Runtime API
 */
const express = require("express");
const router = express.Router();

router.get("/status", async (req, res) => {
  res.json({ success: true, status: "running" });
});

module.exports = router;
