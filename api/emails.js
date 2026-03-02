/**
 * Emails API (PG)
 */
const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ success: true, emails: [] });
});

module.exports = router;
