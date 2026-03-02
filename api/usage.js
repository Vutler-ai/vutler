/**
 * Usage API (Legacy MongoDB - deprecated)
 * Use usage-pg.js instead
 */
const express = require("express");
const router = express.Router();

// Deprecated - redirects to pg implementation
router.get("/summary", async (req, res) => {
  res.redirect("/api/v1/usage/summary");
});

module.exports = router;
