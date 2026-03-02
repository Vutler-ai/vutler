/**
 * Tasks API
 */
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ success: true, tasks: [] });
});

module.exports = router;
