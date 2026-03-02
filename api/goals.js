/**
 * Goals API
 */
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ success: true, goals: [] });
});

module.exports = router;
