/**
 * Templates API
 */
const express = require("express");
const router = express.Router();

router.get("/templates", async (req, res) => {
  res.json({ success: true, templates: [] });
});

module.exports = router;
