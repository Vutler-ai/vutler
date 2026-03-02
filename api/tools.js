/**
 * Agent Tools API
 */
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ success: true, tools: [] });
});

module.exports = router;
