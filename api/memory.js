/**
 * Agent Memory API
 */
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ success: true, memories: [] });
});

module.exports = router;
